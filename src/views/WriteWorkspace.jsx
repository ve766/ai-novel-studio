import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownToLine, ArrowRight, BookOpen, BookText, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, Copy, FileClock, FileText, History, Lightbulb, LoaderCircle, MessageSquareText, MoreHorizontal, PanelRightClose, PanelRightOpen, Pause, PenLine, Plus, RotateCcw, Save, ScrollText, Settings2, Sparkles, Square, WandSparkles, X } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, Pill, Select, Tabs, Textarea, Toggle } from '../components.jsx';

const api = window.novelApp;
const TASKS = [
  { value: 'continue', label: '续写章节', icon: PenLine, hint: '接着当前正式正文往下写' },
  { value: 'rewrite', label: '改写选段', icon: WandSparkles, hint: '只改写你指定的文字' },
  { value: 'outline', label: '整理大纲', icon: ScrollText, hint: '生成一份可审阅的大纲建议' },
  { value: 'analysis', label: '一致性检查', icon: CheckCheck, hint: '检查当前所选资料中的潜在冲突' },
  { value: 'summary', label: '生成摘要', icon: FileText, hint: '只总结当前正式正文已发生的内容' }
];
const CONTEXT_FIELDS = [
  ['characters', '人物资料'], ['worldRules', '世界规则'], ['places', '地点资料'], ['factions', '势力资料'],
  ['outline', '剧情大纲'], ['timeline', '时间线'], ['clues', '伏笔'], ['summaries', '已完成章节摘要']
];

const countWords = value => String(value || '').replace(/\s/g, '').length;
const timeLabel = value => value ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '未保存';

function CandidateCard({ candidate, onApply, onReject, onCopy, busy }) {
  const label = candidate.kind === 'analysis' ? '一致性分析' : candidate.kind === 'summary' ? '章节摘要' : candidate.kind === 'outline' ? '大纲建议' : '写作候选';
  return <article className={`candidate-card ${candidate.status !== 'candidate' ? 'candidate-card-processed' : ''}`}>
    <div className="candidate-card-head"><div><Pill tone={candidate.status === 'accepted' ? 'sage' : candidate.status === 'rejected' ? 'neutral' : 'coral'}>{candidate.status === 'accepted' ? '已采纳' : candidate.status === 'rejected' ? '已略过' : label}</Pill><small>{candidate.modelName || '模型候选'} · {timeLabel(candidate.createdAt)}</small></div><IconButton label="复制候选内容" onClick={() => onCopy(candidate)}><Copy size={14} /></IconButton></div>
    {candidate.truncated && <div className="truncation-warning"><span>!</span>模型提示输出可能被截断；请检查末尾并继续生成。</div>}
    <pre className="candidate-text">{candidate.text}</pre>
    {candidate.status === 'candidate' && <div className="candidate-actions">
      {candidate.kind === 'write' && <Button size="sm" onClick={() => onApply(candidate, 'draft')} disabled={busy}><ArrowDownToLine size={14} />导入为草稿</Button>}
      {candidate.kind === 'summary' && <Button size="sm" onClick={() => onApply(candidate, 'summary')} disabled={busy}><Check size={14} />保存摘要</Button>}
      {candidate.kind === 'outline' && <Button size="sm" onClick={() => onApply(candidate, 'outline')} disabled={busy}><Plus size={14} />加入剧情大纲</Button>}
      <Button size="sm" variant="ghost" onClick={() => onReject(candidate)} disabled={busy}>略过</Button>
    </div>}
  </article>;
}

function PromptPreview({ data, onClose }) {
  const [tab, setTab] = useState('system');
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const text = tab === 'system' ? data.system : data.user;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  };
  return <Modal open={Boolean(data)} onClose={onClose} title="本次提示词预览" eyebrow="发送前检查" width="wide" footer={<><span className="preview-token-count">约 {data.estimatedTokens?.toLocaleString()} tokens · {data.promptChars?.toLocaleString()} 字符</span><Button variant="ghost" onClick={onClose}>关闭</Button></>}>
    {data.warnings?.length > 0 && <div className="warning-list">{data.warnings.map((warning, index) => <p key={index}>! {warning}</p>)}</div>}
    <div className="preview-metadata">本次将使用 {data.skillNames?.length || 0} 个 Skill：{data.skillNames?.join('、') || '无'} · 上下文附入 {data.contextIncluded?.length || 0} 个部分</div>
    <Tabs value={tab} onChange={setTab} items={[{ value: 'system', label: '规则、项目资料与 Skill' }, { value: 'user', label: '本次任务' }]} />
    <pre className="prompt-preview-text">{text}</pre>
    <Button variant="secondary" size="sm" onClick={copy}><Copy size={14} />{copied ? '已复制' : '复制这一部分'}</Button>
  </Modal>;
}

function ModelTransferDialog({ open, profile, onClose, onConfirm }) {
  return <ConfirmDialog open={open} title="确认发送创作资料？" confirmText="仅本次发送" onClose={onClose} onConfirm={onConfirm}>
    <div className="transfer-warning"><div className="transfer-icon"><ArrowRight size={18} /></div><p><b>{profile?.name || '所选模型'}</b> 的服务地址不在本机。点击继续后，本次提示词会发送至 <code>{profile?.baseUrl || '配置的模型服务'}</code>，其中可能包含你选中的项目设定、正式章节摘要、正文片段和 Skill 内容。</p><small>平台不会在后台发起模型请求。你可以取消，或到“模型设置”改用本机服务。</small></div>
  </ConfirmDialog>;
}

function ChapterHistory({ open, projectId, chapter, onClose, onRestored, onNotice }) {
  const [versions, setVersions] = useState([]);
  const [busyId, setBusyId] = useState('');
  useEffect(() => {
    let active = true;
    if (open && chapter) api.listVersions(projectId, chapter.id).then(items => { if (active) setVersions(items); }).catch(error => onNotice(error.message || '无法读取正文历史。', 'error'));
    return () => { active = false; };
  }, [open, projectId, chapter?.id]);
  const restore = async version => {
    if (!window.confirm(`恢复这个正式正文版本？当前正文会先自动备份。`)) return;
    setBusyId(version.id);
    try { await api.restoreVersion(projectId, chapter.id, version.id); await onRestored(); onClose(); onNotice('已恢复正文版本；恢复前正文也已备份。', 'success'); }
    catch (error) { onNotice(error.message || '恢复失败。', 'error'); }
    finally { setBusyId(''); }
  };
  return <Modal open={open} onClose={onClose} title="正式正文历史" eyebrow={chapter?.title || '版本记录'} width="wide">
    {!versions.length ? <EmptyState icon={<History size={22} />} title="还没有历史版本" description="每次修改正式正文前，平台会自动保存旧正文。" /> : <div className="version-list">{versions.map(version => <div className="version-row" key={version.id}><div className="version-icon"><FileClock size={16} /></div><div className="version-main"><b>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(version.createdAt))}</b><small>{version.reason} · {version.charCount.toLocaleString()} 字</small><p>{version.preview || '（空正文）'}</p></div><Button size="sm" variant="secondary" onClick={() => restore(version)} disabled={Boolean(busyId)}>{busyId === version.id ? '恢复中…' : '恢复此版本'}</Button></div>)}</div>}
  </Modal>;
}

export function WriteWorkspace({ bundle, models, onRefresh, onOpenModels, onOpenSkills, onNotice, onBusy, initialChapterId, onInitialChapterUsed }) {
  const chapters = bundle.chapters || [];
  const project = bundle.project;
  const [selectedId, setSelectedId] = useState(initialChapterId || chapters.at(-1)?.id || '');
  const [tab, setTab] = useState('draft');
  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [editingFinal, setEditingFinal] = useState(false);
  const [task, setTask] = useState('continue');
  const [request, setRequest] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [context, setContext] = useState(project.contextSettings || { characters: true, worldRules: true, places: true, factions: true, outline: true, timeline: true, clues: true, summaries: true, recentChapters: 1, maxContextChars: 24000 });
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [generating, setGenerating] = useState(false);
  const cancelRequested = useRef(false);
  const [liveText, setLiveText] = useState('');
  const [requestError, setRequestError] = useState('');
  const [lastMeta, setLastMeta] = useState(null);
  const [promptPreview, setPromptPreview] = useState(null);
  const [transferPending, setTransferPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryDirty, setSummaryDirty] = useState(false);
  const [contextDirty, setContextDirty] = useState(false);
  const generationId = useRef('');
  const textRef = useRef(text);
  const saveTimer = useRef(null);
  const contextTimer = useRef(null);
  const snapshotRef = useRef(null);
  const allChapters = [...chapters, ...(bundle.archivedChapters || [])];
  const chapter = allChapters.find(item => item.id === selectedId) || chapters.at(-1) || null;
  const profile = models?.profiles?.find(item => item.id === models.activeProfileId) || models?.profiles?.[0] || null;
  const attachedSkills = useMemo(() => (bundle.skills || []).filter(skill => (project.projectSkillIds || []).includes(skill.id)), [bundle.skills, project.projectSkillIds]);
  const candidateList = useMemo(() => (bundle.candidates || []).filter(item => item.chapterId === chapter?.id).slice(0, 8), [bundle.candidates, chapter?.id]);
  const visibleChapters = showArchived ? allChapters : chapters;
  snapshotRef.current = { projectId: project.id, chapterId: chapter?.id, tab, editingFinal, dirty, text, summary, summaryDirty, context, contextDirty };

  const persistSnapshot = () => {
    const current = snapshotRef.current;
    if (!current?.chapterId || typeof api.persistEditorState !== 'function') return;
    const state = {};
    if (current.dirty && current.tab === 'draft') state.draftText = current.text;
    if (current.dirty && current.tab === 'body' && current.editingFinal) state.formalEditText = current.text;
    if (current.summaryDirty) state.summary = current.summary;
    if (current.contextDirty) state.contextSettings = current.context;
    if (!Object.keys(state).length) return;
    try {
      const result = api.persistEditorState(current.projectId, current.chapterId, state);
      if (!result?.ok) console.error(result?.error || 'Editor buffer persistence failed.');
    } catch (error) { console.error(error?.message || 'Editor buffer persistence failed.'); }
  };

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => {
    if (initialChapterId && chapters.some(item => item.id === initialChapterId)) {
      setSelectedId(initialChapterId);
      onInitialChapterUsed?.();
    } else if (!chapters.some(item => item.id === selectedId)) setSelectedId(chapters.at(-1)?.id || '');
  }, [initialChapterId, chapters.map(item => item.id).join('|')]);
  useEffect(() => { setContext(project.contextSettings || {}); setContextDirty(false); }, [project.id]);
  useEffect(() => {
    if (!chapter) { setText(''); setSummary(''); return; }
    setText(tab === 'draft' ? chapter.draftText || '' : chapter.body || '');
    setDirty(false);
    setSaveState('saved');
    setEditingFinal(false);
    setSummary(chapter.summary || '');
    setSummaryDirty(false);
  }, [chapter?.id, tab]);
  useEffect(() => {
    if (!chapter || !dirty || !(tab === 'draft' || (tab === 'body' && editingFinal))) return undefined;
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = window.setTimeout(async () => {
      const targetText = textRef.current;
      const state = tab === 'draft' ? { draftText: targetText } : { formalEditText: targetText };
      try {
        const result = api.persistEditorState(project.id, chapter.id, state);
        if (!result?.ok) throw new Error(result?.error || '编辑缓冲自动保存失败。');
        if (textRef.current === targetText) { setDirty(false); setSaveState('saved'); }
        await onRefresh();
      } catch (error) { setSaveState('error'); onNotice(error.message || '编辑缓冲自动保存失败。', 'error'); }
    }, 800);
    return () => window.clearTimeout(saveTimer.current);
  }, [text, dirty, tab, editingFinal, chapter?.id, project.id]);
  useEffect(() => {
    if (!summaryDirty || !chapter) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        const result = api.persistEditorState(project.id, chapter.id, { summary });
        if (!result?.ok) throw new Error(result?.error || '摘要保存失败。');
        await onRefresh();
        setSummaryDirty(false);
      } catch (error) { onNotice(error.message || '摘要保存失败。', 'error'); }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [summary, summaryDirty, chapter?.id, project.id]);
  useEffect(() => {
    if (!contextDirty || !chapter) return undefined;
    window.clearTimeout(contextTimer.current);
    contextTimer.current = window.setTimeout(async () => {
      try {
        const result = api.persistEditorState(project.id, chapter.id, { contextSettings: context });
        if (!result?.ok) throw new Error(result?.error || '上下文设置保存失败。');
        setContextDirty(false);
        await onRefresh();
      } catch (error) { onNotice(error.message || '上下文设置保存失败。', 'error'); }
    }, 500);
    return () => window.clearTimeout(contextTimer.current);
  }, [context, contextDirty, chapter?.id, project.id]);
  useEffect(() => {
    const flush = () => persistSnapshot();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(contextTimer.current);
      flush();
      if (generationId.current) api.cancelGeneration(generationId.current).catch(() => {});
    };
  }, [project.id]);

  const persistCurrentEditor = async () => {
    if (!chapter) return;
    const state = {};
    if (dirty && tab === 'draft') state.draftText = text;
    if (dirty && tab === 'body' && editingFinal) state.formalEditText = text;
    if (summaryDirty) state.summary = summary;
    if (contextDirty) state.contextSettings = context;
    if (!Object.keys(state).length) return;
    const result = api.persistEditorState(project.id, chapter.id, state);
    if (!result?.ok) throw new Error(result?.error || '编辑缓冲保存失败。');
    setDirty(false);
    setSaveState('saved');
    setSummaryDirty(false);
    setContextDirty(false);
    await onRefresh();
  };
  const selectChapter = async chapterId => {
    try {
      await persistCurrentEditor();
      setSelectedId(chapterId);
      setTab('draft');
    } catch (error) { onNotice(error.message || '切换章节前保存失败；当前内容仍保留。', 'error'); }
  };
  const setDraftText = value => { setText(value); setDirty(true); setSaveState('unsaved'); };
  const contextOptions = context;
  const payload = { projectId: project.id, chapterId: chapter?.id, task, request, selectedText, selectedSkillIds: selectedSkills, contextOptions };
  const startPreview = async () => {
    try { setPromptPreview(await api.previewPrompt(payload)); }
    catch (error) { onNotice(error.message || '无法预览提示词。', 'error'); }
  };
  const startGeneration = async confirmedDataTransfer => {
    if (!chapter || !profile) { onNotice('请先创建章节并选择模型。', 'error'); return; }
    setTransferPending(false);
    setGenerating(true);
    onBusy?.(true);
    setRequestError('');
    setLiveText('');
    setLastMeta(null);
    cancelRequested.current = false;
    const requestId = globalThis.crypto?.randomUUID?.() || `gen-${Date.now()}`;
    generationId.current = requestId;
    const unsubscribe = api.onGenerationDelta(payload => { if (payload.requestId === requestId) setLiveText(current => current + payload.delta); });
    try {
      const result = await api.generate({ ...payload, profileId: profile.id, requestId, confirmedDataTransfer });
      setLiveText(result.candidate.text);
      setLastMeta(result.promptMeta);
      await onRefresh();
      onNotice(result.candidate.truncated ? '候选已保存，但模型报告输出可能被截断。' : '模型候选已保存；正式正文没有改动。', result.candidate.truncated ? 'warning' : 'success');
    } catch (error) {
      setRequestError(cancelRequested.current ? '已取消生成；没有保存候选。' : error.message || '模型请求失败；没有保存候选。');
    } finally {
      unsubscribe?.();
      generationId.current = '';
      setGenerating(false);
      onBusy?.(false);
      cancelRequested.current = false;
    }
  };
  const askBeforeGeneration = async () => {
    try {
      if (await api.needsTransferConsent(profile?.id)) { setTransferPending(true); return; }
      await startGeneration(false);
    } catch (error) { onNotice(error.message || '无法检查模型连接设置。', 'error'); }
  };
  const stopGeneration = async () => {
    if (!generationId.current) return;
    cancelRequested.current = true;
    try { await api.cancelGeneration(generationId.current); } catch {}
  };
  const saveDraftNow = async () => {
    if (!chapter) return;
    setBusyAction(true);
    try { await persistCurrentEditor(); setDirty(false); setSaveState('saved'); await onRefresh(); onNotice('草稿已保存。', 'success'); }
    catch (error) { onNotice(error.message || '草稿保存失败。', 'error'); }
    finally { setBusyAction(false); }
  };
  const saveFinal = async () => {
    if (!chapter) return;
    if (!text.trim() && chapter.body?.trim() && !window.confirm('这会清空当前正式正文。旧正文会先保存为历史版本；确定继续吗？')) return;
    if (chapter.body?.trim() && chapter.body !== text && !window.confirm('保存前会自动备份当前正式正文。草稿不会被覆盖。确定保存为正式正文吗？')) return;
    setBusyAction(true);
    try {
      await persistCurrentEditor();
      await api.saveFinal(project.id, chapter.id, text, { allowEmpty: !text.trim() });
      setEditingFinal(false);
      setDirty(false);
      await onRefresh();
      onNotice('正式正文已保存，旧版本可在历史记录中恢复。', 'success');
    } catch (error) { onNotice(error.message || '正式正文保存失败。', 'error'); }
    finally { setBusyAction(false); }
  };
  const adoptDraft = async () => {
    if (!chapter || !text.trim()) return;
    const question = chapter.body?.trim() ? '采纳后会把当前正式正文备份到历史记录，并以草稿替换正文。确定继续吗？' : '将这份草稿设为正式正文？草稿本身会保留，之后可独立编辑。';
    if (!window.confirm(question)) return;
    setBusyAction(true);
    try { await persistCurrentEditor(); await api.saveFinal(project.id, chapter.id, text); setTab('body'); setEditingFinal(false); setDirty(false); await onRefresh(); onNotice('草稿已采纳为正式正文。', 'success'); }
    catch (error) { onNotice(error.message || '无法采纳草稿。', 'error'); }
    finally { setBusyAction(false); }
  };
  const editFinal = () => { setText(chapter?.formalEditText || chapter?.body || ''); setDirty(false); setEditingFinal(true); };
  const cancelFinalEdit = async () => {
    if (!chapter) return;
    if ((text !== chapter.body || chapter.formalEditText) && !window.confirm('放弃暂存的正式正文修改？正式正文不会被改动。')) return;
    try {
      const result = api.persistEditorState(project.id, chapter.id, { formalEditText: '' });
      if (!result?.ok) throw new Error(result?.error || '无法清除正式正文编辑缓冲。');
      setText(chapter.body || '');
      setDirty(false);
      setEditingFinal(false);
      await onRefresh();
      onNotice('编辑缓冲已清除，正式正文未改动。', 'info');
    } catch (error) { onNotice(error.message || '取消修改失败。', 'error'); }
  };
  const applyCandidate = async (candidate, action) => {
    let replaceDraft = false;
    try { await persistCurrentEditor(); }
    catch (error) { onNotice(error.message || '采纳候选前保存失败；当前内容仍保留。', 'error'); return; }
    const currentDraft = tab === 'draft' ? text : chapter?.draftText || '';
    const currentSummary = summaryDirty ? summary : chapter?.summary || '';
    if (action === 'draft' && currentDraft.trim() && currentDraft !== candidate.text) {
      if (!window.confirm('当前草稿已有内容。导入会替换这份草稿，但不会改动正式正文。继续吗？')) return;
      replaceDraft = true;
    } else if (action === 'outline' && !window.confirm('将这段大纲建议保存为一条新的剧情大纲资料？原有大纲不会被覆盖。')) return;
    else if (action === 'summary' && currentSummary.trim() && !window.confirm('用这条 AI 摘要替换当前章节摘要？')) return;
    setBusyAction(true);
    try {
      await api.applyCandidate(project.id, candidate.id, action, { replaceDraft });
      if (action === 'draft') { setTab('draft'); setText(candidate.text); setDirty(false); }
      await onRefresh();
      onNotice(action === 'draft' ? '候选已导入草稿。' : action === 'summary' ? '章节摘要已保存。' : '大纲建议已加入剧情资料。', 'success');
    } catch (error) { onNotice(error.message || '采纳候选失败。', 'error'); }
    finally { setBusyAction(false); }
  };
  const rejectCandidate = async candidate => {
    try { await api.applyCandidate(project.id, candidate.id, 'reject'); await onRefresh(); onNotice('候选已标记为略过。', 'success'); }
    catch (error) { onNotice(error.message || '更新候选失败。', 'error'); }
  };
  const copyCandidate = async candidate => {
    try { await navigator.clipboard.writeText(candidate.text); onNotice('候选内容已复制。', 'success'); }
    catch { onNotice('无法访问剪贴板；请手动选择候选文本复制。', 'error'); }
  };
  const archiveChapter = async () => {
    if (!chapter || !window.confirm(`将“${chapter.title}”移入回收站？正式正文、草稿和历史版本都会保留。`)) return;
    try { await persistCurrentEditor(); await api.archiveChapter(project.id, chapter.id); await onRefresh(); setSelectedId(chapters.find(item => item.id !== chapter.id)?.id || ''); onNotice('章节已移入回收站。', 'success'); }
    catch (error) { onNotice(error.message || '无法归档章节。', 'error'); }
  };
  const updateTitle = async event => {
    const title = event.target.value.trim();
    if (!title || title === chapter?.title) return;
    try { await api.updateChapter(project.id, chapter.id, { title }); await onRefresh(); }
    catch (error) { onNotice(error.message || '章节名称保存失败。', 'error'); }
  };
  const updateSummary = value => { setSummary(value); setSummaryDirty(true); };
  const changeContext = update => {
    setContext(current => typeof update === 'function' ? update(current) : { ...current, ...update });
    setContextDirty(true);
  };
  const setContextFlag = (key, value) => changeContext(current => ({ ...current, [key]: value }));
  const toggleSkill = id => setSelectedSkills(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const setTaskValue = value => { setTask(value); setRequest(''); setSelectedText(''); setRequestError(''); };
  const activeTask = TASKS.find(item => item.value === task) || TASKS[0];
  const ActiveTaskIcon = activeTask.icon;
  const saveLabel = saveState === 'saving' ? '自动保存中…' : saveState === 'error' ? '自动保存失败' : saveState === 'unsaved' ? '有未保存修改' : `已保存 · ${timeLabel(chapter?.updatedAt)}`;

  if (!chapter) return <div className="write-empty"><EmptyState icon={<BookOpen size={24} />} eyebrow="MANUSCRIPT" title="还没有章节" description="创建第一章后，就可以写草稿、整理上下文并生成独立候选。" action={<Button onClick={async () => { const next = await api.createChapter(project.id, { title: '第一章' }); await onRefresh(); setSelectedId(next.id); }}><Plus size={15} />创建第一章</Button>} /></div>;

  return <div className={`write-workspace ${rightOpen ? '' : 'assistant-collapsed'}`}>
    <aside className="chapter-rail">
      <div className="chapter-rail-header"><div><span className="eyebrow">MANUSCRIPT</span><h2>章节</h2></div><IconButton label="新建章节" onClick={async () => { try { await persistCurrentEditor(); const item = await api.createChapter(project.id, { title: `第 ${chapters.length + 1} 章` }); await onRefresh(); setSelectedId(item.id); setTab('draft'); } catch (error) { onNotice(error.message || '新建章节失败；当前内容仍保留。', 'error'); } }}><Plus size={16} /></IconButton></div>
      <div className="chapter-rail-meta"><span>{chapters.length} 章 · 正式正文 {chapters.reduce((sum, item) => sum + countWords(item.body), 0).toLocaleString()} 字</span><button onClick={() => setShowArchived(value => !value)}>{showArchived ? '隐藏已归档' : '已归档'}</button></div>
      <div className="chapter-list">{visibleChapters.map((item, index) => <button key={item.id} className={`chapter-list-item ${selectedId === item.id ? 'chapter-item-active' : ''} ${item.archivedAt ? 'chapter-item-archived' : ''}`} onClick={() => selectChapter(item.id)}>
        <span className="chapter-list-index">{String(item.order + 1).padStart(2, '0')}</span><span className="chapter-list-copy"><b>{item.title || `第 ${index + 1} 章`}</b><small>{item.archivedAt ? '已归档' : item.body?.trim() ? `${countWords(item.body).toLocaleString()} 字` : '正文待写'}{item.draftText?.trim() ? ' · 有草稿' : ''}</small></span>{selectedId === item.id && <span className="chapter-active-mark" />}
      </button>)}</div>
      <div className="chapter-rail-footer"><div className="rail-stat"><span className="rail-stat-icon"><BookText size={14} /></span><span><b>{countWords(chapter.body).toLocaleString()}</b><small>正式正文</small></span></div><div className="rail-stat"><span className="rail-stat-icon rail-stat-draft"><PenLine size={14} /></span><span><b>{countWords(chapter.draftText).toLocaleString()}</b><small>独立草稿</small></span></div></div>
    </aside>

    <section className="editor-column">
      <div className="editor-header"><div className="editor-title-area"><div className="editor-title-row"><Input className="chapter-title-input" aria-label="章节标题" defaultValue={chapter.title} key={chapter.id} onBlur={updateTitle} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><IconButton label="正文历史版本" onClick={() => setHistoryOpen(true)}><History size={16} /></IconButton><IconButton label="归档章节" onClick={archiveChapter} className="icon-danger"><Archive size={16} /></IconButton></div><span className="editor-subtitle">{chapter.body?.trim() ? `${countWords(chapter.body).toLocaleString()} 字正式正文` : '此章还没有正式正文'}</span></div><div className="editor-actions"><span className={`save-indicator save-${saveState}`}><i />{tab === 'draft' ? saveLabel : editingFinal ? (dirty ? '正文有未保存修改' : '编辑中') : '正式正文只读'}</span></div></div>
      <div className="editor-tabs-row"><Tabs value={tab} onChange={async value => { if (value === tab) return; if (editingFinal && dirty && !window.confirm('切换后会先把修改保存为独立编辑缓冲，不会改动正式正文。继续？')) return; try { await persistCurrentEditor(); setTab(value); } catch (error) { onNotice(error.message || '切换前保存失败；当前内容仍保留。', 'error'); } }} items={[{ value: 'body', label: <><BookOpen size={14} />正式正文</> }, { value: 'draft', label: <><PenLine size={14} />工作草稿{chapter.draftText?.trim() ? <i className="tab-dot" /> : null}</> }]} /><div className="editor-toolbar">{tab === 'draft' ? <><span className="word-count">{countWords(text).toLocaleString()} 字</span><Button variant="secondary" size="sm" onClick={saveDraftNow} disabled={busyAction || !dirty}><Save size={14} />保存草稿</Button><Button size="sm" onClick={adoptDraft} disabled={busyAction || !text.trim()}><Check size={14} />采纳为正文</Button></> : editingFinal ? <><Button variant="ghost" size="sm" onClick={cancelFinalEdit}>取消修改</Button><Button size="sm" onClick={saveFinal} disabled={busyAction || text === chapter.body}><Save size={14} />保存正式正文</Button></> : <Button variant="secondary" size="sm" onClick={editFinal}><PenLine size={14} />编辑正式正文</Button>}</div></div>
      <div className={`editor-paper ${tab === 'body' && !editingFinal ? 'editor-paper-readonly' : ''}`}>
        <div className="paper-watermark" aria-hidden="true">{tab === 'draft' ? 'DRAFT' : 'MANUSCRIPT'}</div>
        <Textarea className="manuscript-textarea" aria-label={tab === 'draft' ? '工作草稿' : '正式正文'} value={text} onChange={event => setDraftText(event.target.value)} readOnly={tab === 'body' && !editingFinal} placeholder={tab === 'draft' ? '在这里写下本章草稿。\n\n可以自己写，也可以让 AI 先生成独立候选；只有你明确采纳，内容才会进入正式正文。' : '本章正式正文为空。切换到“工作草稿”开始写作，或点击“编辑正式正文”。'} spellCheck="true" />
        {tab === 'body' && !editingFinal && <div className="readonly-note"><BookOpen size={14} />正式正文与草稿分开保存；AI 候选不会自动写入这里。</div>}
      </div>
      <div className="editor-bottom"><div className="summary-editor"><div className="summary-label"><span><FileText size={14} />章节摘要</span><small>只记录已发生内容；生成摘要后需手动保存</small></div><Textarea value={summary} onChange={event => updateSummary(event.target.value)} rows={2} placeholder="简要记录本章事件、人物选择与状态变化…" /><span className="summary-save-state">{summaryDirty ? '摘要修改会自动保存' : '摘要属于本项目创作资料'}</span></div></div>
    </section>

    <aside className="assistant-column">
      <div className="assistant-header"><div><span className="eyebrow">AI WRITING DESK</span><h2><Sparkles size={17} />创作助手</h2></div><div className="assistant-header-actions"><IconButton label="打开模型设置" onClick={onOpenModels}><Settings2 size={15} /></IconButton><IconButton label={rightOpen ? '收起助手' : '展开助手'} onClick={() => setRightOpen(!rightOpen)}>{rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</IconButton></div></div>
      <div className="assistant-scroll">
        <label className="field assistant-task-field"><span className="field-label">本次任务</span><Select value={task} onChange={event => setTaskValue(event.target.value)}>{TASKS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</Select><small className="field-hint">{activeTask.hint}</small></label>
        <Field label="写作要求" hint="尽量说明目标、情节推进和希望避免的内容。"><Textarea value={request} onChange={event => setRequest(event.target.value)} rows={5} maxLength={20000} placeholder="例如：让主角发现信件上的日期早于失踪案，但先不要揭晓寄信人身份。" /></Field>
        {task === 'rewrite' && <Field label="待改写片段" hint="只会改写这段文字，不会改动正式正文。"><Textarea value={selectedText} onChange={event => setSelectedText(event.target.value)} rows={4} maxLength={80000} placeholder="粘贴要改写的片段…" /></Field>}
        <div className="assistant-section-head"><span>项目 Skill</span><small>本次显式勾选</small></div>
        {attachedSkills.length ? <div className="assistant-skills">{attachedSkills.map(skill => <label className={`skill-choice ${!skill.enabled ? 'skill-choice-disabled' : ''}`} key={skill.id}><input type="checkbox" checked={selectedSkills.includes(skill.id)} disabled={!skill.enabled} onChange={() => toggleSkill(skill.id)} /><span className="skill-choice-check"><Check size={11} /></span><span><b>{skill.name}</b><small>{skill.enabled ? skill.description || '写作方法' : '此 Skill 已停用'}</small></span></label>)}</div> : <div className="assistant-empty-skills">当前项目没有关联 Skill。<button onClick={onOpenSkills}>管理 Skill</button>不需要 Skill 也可以写作。</div>}
        <button className="context-disclosure" onClick={() => setContextOpen(value => !value)}><span><BookText size={15} />本次上下文</span><span>{context.maxContextChars?.toLocaleString() || '24,000'} 字符 · {contextOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span></button>
        {contextOpen && <div className="context-controls"><div className="context-grid">{CONTEXT_FIELDS.map(([key, label]) => <label key={key} className="context-check"><input type="checkbox" checked={context[key] !== false} onChange={event => setContextFlag(key, event.target.checked)} /><span>{label}</span></label>)}</div><Field label="额外带入最近正式正文" hint="草稿和未采纳候选不会作为正史。"><Select value={context.recentChapters || 0} onChange={event => changeContext(current => ({ ...current, recentChapters: Number(event.target.value) }))}><option value="0">不附正文，只用摘要</option>{[1, 2, 3, 4, 5].map(value => <option value={value} key={value}>最近 {value} 章</option>)}</Select></Field><Field label={`上下文长度上限：${(context.maxContextChars || 24000).toLocaleString()} 字符`}><input className="range-control" type="range" min="4000" max="60000" step="4000" value={context.maxContextChars || 24000} onChange={event => changeContext(current => ({ ...current, maxContextChars: Number(event.target.value) }))} /></Field></div>}
        <div className="assistant-actions"><Button variant="secondary" size="sm" onClick={startPreview} disabled={!request.trim()}><EyeIcon />预览提示词</Button><Button size="sm" className="generate-button" onClick={askBeforeGeneration} disabled={generating || !request.trim() || !profile}>{generating ? <><LoaderCircle size={15} className="spin" />生成中</> : <><Sparkles size={15} />生成候选</>}</Button></div>
        {generating && <Button variant="ghost" size="sm" className="cancel-generation" onClick={stopGeneration}><Square size={12} fill="currentColor" />停止生成</Button>}
        {requestError && <div className="generation-error"><CircleHelp size={15} />{requestError}</div>}
        {liveText && <div className="live-result"><div className="live-result-head"><span><LoaderCircle size={13} className={generating ? 'spin' : ''} />{generating ? '模型正在生成…' : '最近一次生成'}</span>{!generating && lastMeta && <small>上下文 {lastMeta.contextIncluded?.length || 0} 项</small>}</div><pre>{liveText}</pre>{lastMeta?.warnings?.map((warning, index) => <small className="inline-warning" key={index}>! {warning}</small>)}</div>}
        <div className="candidate-history-head"><span><History size={14} />候选记录</span><small>{candidateList.length} 条</small></div>
        {candidateList.length ? <div className="candidate-list">{candidateList.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} onApply={applyCandidate} onReject={rejectCandidate} onCopy={copyCandidate} busy={busyAction} />)}</div> : <div className="candidate-empty"><MessageSquareText size={17} /><span>生成的建议会先出现在这里，不会自动改动正文。</span></div>}
      </div>
    </aside>
    <PromptPreview data={promptPreview} onClose={() => setPromptPreview(null)} />
    <ModelTransferDialog open={transferPending} profile={profile} onClose={() => setTransferPending(false)} onConfirm={() => startGeneration(true)} />
    <ChapterHistory open={historyOpen} projectId={project.id} chapter={chapter} onClose={() => setHistoryOpen(false)} onRestored={onRefresh} onNotice={onNotice} />
  </div>;
}

function EyeIcon() { return <FileClock size={14} />; }
