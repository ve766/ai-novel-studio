import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, BookText, BrainCircuit, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Cloud, Download, FilePlus2, FolderOpen, Home, Library, LoaderCircle, MessageSquareText, PenLine, Plus, ScrollText, Settings2, Sparkles, Trash2, Upload, Users, Waypoints } from 'lucide-react';
import { Button, EmptyState, IconButton, Modal, Pill, Select, Textarea, Input } from './components.jsx';
import { Overview } from './views/Overview.jsx';
import { WriteWorkspace } from './views/WriteWorkspace.jsx';
import { EntityLibrary, PlotLibrary, NotesLibrary } from './views/ProjectLibrary.jsx';
import { SkillsLibrary } from './views/SkillsLibrary.jsx';
import { ModelsSettings } from './views/ModelsSettings.jsx';
import { TrashView } from './views/TrashView.jsx';

const api = window.novelApp;
const NAV = [
  { id: 'overview', label: '项目首页', icon: Home, group: '书稿' },
  { id: 'write', label: '章节写作', icon: PenLine, group: '书稿' },
  { id: 'characters', label: '人物与世界', icon: Users, group: '资料库' },
  { id: 'plot', label: '剧情与伏笔', icon: Waypoints, group: '资料库' },
  { id: 'notes', label: '灵感笔记', icon: MessageSquareText, group: '资料库' },
  { id: 'skills', label: '写作 Skill', icon: BrainCircuit, group: '创作工具' },
  { id: 'models', label: '模型设置', icon: Settings2, group: '创作工具' },
  { id: 'trash', label: '回收站', icon: Trash2, group: '管理' }
];

const PAGE_TITLES = Object.fromEntries(NAV.map(item => [item.id, item.label]));

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.tone || 'info'}`} role="status">
    <span>{toast.text}</span><button onClick={onClose} aria-label="关闭提示">×</button>
  </div>;
}

function Welcome({ onCreate, onImport }) {
  return <div className="welcome-screen">
    <div className="welcome-copy">
      <div className="welcome-mark"><BookOpen size={25} strokeWidth={1.7} /></div>
      <div className="eyebrow">一个安静、完整的写作空间</div>
      <h1>把故事写下去。<br /><i>把决定留给你。</i></h1>
      <p>项目资料、章节正文、独立草稿和 AI 候选各自分明。你选择模型和 Skill；平台替你整理上下文，但不会擅自改写正式正文。</p>
      <div className="welcome-actions"><Button onClick={onCreate}><Plus size={16} /> 创建小说项目</Button><Button variant="secondary" onClick={onImport}><Upload size={16} /> 导入备份</Button></div>
      <div className="welcome-footnote"><span className="status-dot" />资料保存在这台电脑 · 默认使用本机 Ollama</div>
    </div>
    <div className="welcome-art" aria-hidden="true">
      <div className="book-shadow" />
      <div className="book-page page-back"><span>01</span><div className="page-lines" /></div>
      <div className="book-page page-front"><div className="page-spark">✳</div><small>故事，从这里开始</small><strong>一盏灯<br />照见未写的<br />章节。</strong><div className="page-rule" /><span>写作工作台 · 01</span></div>
      <div className="floating-note"><Sparkles size={14} /><span>灵感 · 设定 · 正文<br /><b>各有归处</b></span></div>
    </div>
  </div>;
}

function CreateProjectModal({ open, onClose, onCreate, busy }) {
  const [form, setForm] = useState({ title: '', genre: '', synopsis: '', tone: '', styleGuide: '' });
  useEffect(() => { if (open) setForm({ title: '', genre: '', synopsis: '', tone: '', styleGuide: '' }); }, [open]);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Modal open={open} onClose={onClose} title="新建小说项目" eyebrow="从一个故事开始" size="lg" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={() => onCreate(form)} disabled={busy || !form.title.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />} 创建项目</Button></>}>
    <div className="form-grid">
      <label className="field field-span-2"><span className="field-label">项目名称 <em>*</em></span><Input autoFocus value={form.title} onChange={set('title')} placeholder="例如：雾港来信" maxLength={200} /></label>
      <label className="field field-span-2"><span className="field-label">题材</span><Input value={form.genre} onChange={set('genre')} placeholder="例如：悬疑、奇幻、都市" maxLength={100} /></label>
      <label className="field field-span-2"><span className="field-label">故事简介</span><Textarea value={form.synopsis} onChange={set('synopsis')} placeholder="故事从哪里开始？主角想得到什么？" rows={3} maxLength={10000} /></label>
      <label className="field"><span className="field-label">整体风格</span><Textarea value={form.tone} onChange={set('tone')} placeholder="例如：克制、温暖、节奏明快" rows={3} maxLength={4000} /></label>
      <label className="field"><span className="field-label">写作指南</span><Textarea value={form.styleGuide} onChange={set('styleGuide')} placeholder="叙事视角、语言偏好、需要避免的写法" rows={3} maxLength={12000} /></label>
    </div>
    <div className="modal-note"><CircleHelp size={15} />这些资料随项目单独保存；之后可以在项目首页修改。</div>
  </Modal>;
}

function TopBar({ page, project, models, onModelChange, onOpenModels, onExport, onImport, onOpenFolder, onCreateChapter, busy }) {
  const profile = models?.profiles?.find(item => item.id === models.activeProfileId);
  const quickActions = page === 'overview' ? <>
    <Button variant="secondary" size="sm" onClick={onExport} disabled={!project}><Download size={15} /> 导出</Button>
    <Button variant="secondary" size="sm" onClick={onImport}><Upload size={15} /> 导入</Button>
    <Button size="sm" onClick={onCreateChapter} disabled={!project}><Plus size={15} /> 新建章节</Button>
  </> : page === 'write' ? <Button size="sm" onClick={onCreateChapter} disabled={!project}><Plus size={15} /> 新建章节</Button> : null;
  return <header className="topbar">
    <div className="topbar-left">
      <div className="breadcrumb"><span>{project?.title || '个人创作空间'}</span><ChevronRight size={14} /><strong>{PAGE_TITLES[page] || '项目首页'}</strong></div>
      {project && <div className="topbar-project-title">{project.title}</div>}
    </div>
    <div className="topbar-actions">
      {quickActions}
      <div className="model-quick-select" title="本次使用的模型">
        {profile?.provider === 'ollama' ? <span className="local-dot" /> : <Cloud size={14} />}
        <Select aria-label="当前模型" value={models?.activeProfileId || ''} onChange={event => onModelChange(event.target.value)} disabled={!models?.profiles?.length || busy}>
          {models?.profiles?.map(item => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}
        </Select>
        <button className="model-settings-link" onClick={onOpenModels} aria-label="打开模型设置"><Settings2 size={15} /></button>
      </div>
      <IconButton label="打开本地资料目录" onClick={onOpenFolder}><FolderOpen size={17} /></IconButton>
    </div>
  </header>;
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [bundle, setBundle] = useState(null);
  const [initialChapterId, setInitialChapterId] = useState('');
  const [models, setModels] = useState(null);
  const [trash, setTrash] = useState({ projects: [], chapters: [] });
  const [page, setPage] = useState('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const project = bundle?.project || projects.find(item => item.id === projectId) || null;
  const activeProfile = useMemo(() => models?.profiles?.find(item => item.id === models.activeProfileId) || models?.profiles?.[0] || null, [models]);
  const showToast = useCallback((text, tone = 'info') => {
    setToast({ text, tone });
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const reloadProjects = useCallback(async (selectId) => {
    const next = await api.listProjects();
    setProjects(next);
    const chosen = selectId === undefined ? projectId : selectId;
    const nextId = next.some(item => item.id === chosen) ? chosen : next[0]?.id || '';
    setProjectId(nextId);
    if (nextId) setBundle(await api.loadProject(nextId));
    else setBundle(null);
    return next;
  }, [projectId]);

  const reloadBundle = useCallback(async (targetId = projectId) => {
    if (!targetId) return null;
    const next = await api.loadProject(targetId);
    setBundle(next);
    setProjects(await api.listProjects());
    return next;
  }, [projectId]);

  const reloadTrash = useCallback(async () => setTrash(await api.listTrash()), []);

  useEffect(() => {
    let active = true;
    Promise.all([api.listProjects(), api.getModels(), api.listTrash()]).then(([projectList, modelData, trashData]) => {
      if (!active) return;
      setProjects(projectList);
      setModels(modelData);
      setTrash(trashData);
      const nextId = projectList[0]?.id || '';
      setProjectId(nextId);
      if (nextId) return api.loadProject(nextId).then(nextBundle => { if (active) setBundle(nextBundle); });
      setBundle(null);
    }).catch(problem => { if (active) setError(problem.message || '无法读取本地资料。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const chooseProject = async id => {
    setProjectId(id);
    setError('');
    if (!id) { setBundle(null); setPage('overview'); return; }
    try { setBundle(await api.loadProject(id)); setPage('overview'); }
    catch (problem) { setError(problem.message || '无法打开项目。'); }
  };

  const createProject = async form => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const created = await api.createProject(form);
      setProjectId(created.id);
      setBundle(await api.loadProject(created.id));
      setProjects(await api.listProjects());
      setCreateOpen(false);
      setPage('overview');
      showToast('项目已创建。', 'success');
    } catch (problem) { showToast(problem.message || '创建项目失败。', 'error'); }
    finally { setCreating(false); }
  };

  const updateProject = async patch => {
    if (!projectId) return null;
    const updated = await api.updateProject(projectId, patch);
    setBundle(current => current ? { ...current, project: updated } : current);
    setProjects(current => current.map(item => item.id === updated.id ? { ...item, ...updated } : item));
    return updated;
  };

  const createChapter = async () => {
    if (!projectId) return;
    const chapter = await api.createChapter(projectId, { title: `第 ${(bundle?.chapters?.length || 0) + 1} 章` });
    setInitialChapterId(chapter.id);
    await reloadBundle(projectId);
    setPage('write');
    showToast('新章节已创建。', 'success');
    return chapter;
  };

  const handleExport = async () => {
    if (!projectId) return;
    try {
      const result = await api.exportProject(projectId);
      if (!result.canceled) showToast(`项目备份已导出：${result.filePath}`, 'success');
    } catch (problem) { showToast(problem.message || '导出失败。', 'error'); }
  };

  const handleImport = async () => {
    try {
      const result = await api.importProject();
      if (result.canceled) return;
      const imported = result.project.project;
      setProjectId(imported.id);
      setBundle(result.project);
      setProjects(await api.listProjects());
      setPage('overview');
      showToast(`“${imported.title}”已导入。`, 'success');
    } catch (problem) { showToast(problem.message || '导入失败；现有项目没有被覆盖。', 'error'); }
  };

  const handleModelChange = async id => {
    if (!models || id === models.activeProfileId) return;
    const next = { ...models, activeProfileId: id };
    try { setModels(await api.saveModels(next)); showToast('默认模型已切换。', 'success'); }
    catch (problem) { showToast(problem.message || '模型设置保存失败。', 'error'); }
  };

  const openDataFolder = async () => {
    try { await api.openDataFolder(); }
    catch (problem) { showToast(problem.message || '无法打开本地资料目录。', 'error'); }
  };

  const archiveProject = async () => {
    if (!projectId) return;
    if (!window.confirm(`将“${project.title}”移入回收站？项目、章节、草稿和备份都会保留，可随时恢复。`)) return;
    try {
      await api.archiveProject(projectId);
      await reloadTrash();
      const next = await reloadProjects('');
      setPage(next.length ? 'overview' : 'overview');
      showToast('项目已移入回收站。', 'success');
    } catch (problem) { showToast(problem.message || '无法归档项目。', 'error'); }
  };

  const restoreProject = async id => {
    try {
      const restored = await api.restoreProject(id);
      setProjectId(restored.project.id);
      setBundle(restored);
      setProjects(await api.listProjects());
      await reloadTrash();
      setPage('overview');
      showToast('项目已恢复。', 'success');
    } catch (problem) { showToast(problem.message || '恢复项目失败。', 'error'); }
  };

  const openPage = id => {
    setError('');
    if (id === 'write' && !projectId) { setCreateOpen(true); return; }
    setPage(id);
  };
  const openWrite = chapterId => {
    setInitialChapterId(chapterId || '');
    openPage('write');
  };

  if (loading) return <div className="loading-screen"><div className="brand-mark"><BookOpen size={19} /></div><span>正在整理你的写作空间</span><LoaderCircle className="spin" size={18} /></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></div><div className="brand-name"><b>纸间</b><span>AI NOVEL STUDIO</span></div><span className="version-tag">PC</span></div>
      <div className="workspace-label"><span>我的书架</span><button onClick={() => setCreateOpen(true)} aria-label="新建项目" title="新建项目"><Plus size={15} /></button></div>
      <div className="project-switcher-wrap">
        <div className="project-switcher-icon"><BookText size={16} /></div>
        <Select value={projectId} onChange={event => chooseProject(event.target.value)} aria-label="选择小说项目">
          {!projects.length && <option value="">还没有项目</option>}
          {projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
        <ChevronDown size={14} className="project-switcher-chevron" />
      </div>
      <div className="sidebar-nav">
        {['书稿', '资料库', '创作工具', '管理'].map(group => <div className="nav-group" key={group}>
          <div className="nav-group-label">{group}</div>
          {NAV.filter(item => item.group === group).map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-link ${page === item.id ? 'nav-link-active' : ''}`} onClick={() => openPage(item.id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.id === 'trash' && trash.projects.length + trash.chapters.length > 0 && <small>{trash.projects.length + trash.chapters.length}</small>}
            </button>;
          })}
        </div>)}
      </div>
      <div className="sidebar-bottom">
        <div className="local-library-card"><span className="local-card-icon"><Archive size={15} /></span><div><b>本机资料库</b><small>只在这台电脑保存</small></div><span className="local-indicator" /></div>
        <button className="sidebar-foot-button" onClick={openDataFolder}><FolderOpen size={15} />打开资料文件夹</button>
        <div className="sidebar-foot-meta">版本 {window.novelApp?.appVersion || '1.0.0'} <span>·</span> 离线优先</div>
      </div>
    </aside>

    <main className="main-shell">
      <TopBar page={page} project={project} models={models} onModelChange={handleModelChange} onOpenModels={() => openPage('models')} onExport={handleExport} onImport={handleImport} onOpenFolder={openDataFolder} onCreateChapter={createChapter} busy={busy} />
      <div className="page-body" key={`${page}-${projectId}`}>
        {error && <div className="load-error"><CircleHelp size={18} /><span>{error}</span><Button size="sm" variant="secondary" onClick={() => window.location.reload()}>重试</Button></div>}
        {!project && page !== 'models' && page !== 'skills' && page !== 'trash' ? <Welcome onCreate={() => setCreateOpen(true)} onImport={handleImport} /> : null}
        {project && page === 'overview' && <Overview bundle={bundle} onUpdateProject={updateProject} onOpenWrite={openWrite} onCreateChapter={createChapter} onArchiveProject={archiveProject} onExport={handleExport} onRefresh={() => reloadBundle(projectId)} onNotice={showToast} onNavigate={openPage} />}
        {project && page === 'write' && <WriteWorkspace bundle={bundle} models={models} onRefresh={() => reloadBundle(projectId)} onOpenModels={() => openPage('models')} onOpenSkills={() => openPage('skills')} onNotice={showToast} onBusy={setBusy} initialChapterId={initialChapterId} onInitialChapterUsed={() => setInitialChapterId('')} />}
        {project && page === 'characters' && <EntityLibrary bundle={bundle} onUpdate={updateProject} onNotice={showToast} />}
        {project && page === 'plot' && <PlotLibrary bundle={bundle} onUpdate={updateProject} onNotice={showToast} />}
        {project && page === 'notes' && <NotesLibrary bundle={bundle} onUpdate={updateProject} onNotice={showToast} />}
        {page === 'skills' && <SkillsLibrary bundle={bundle} onRefresh={() => reloadBundle(projectId)} onNotice={showToast} />}
        {page === 'models' && <ModelsSettings models={models} setModels={setModels} onNotice={showToast} />}
        {page === 'trash' && <TrashView trash={trash} onRefresh={reloadTrash} onRestoreProject={restoreProject} onRestoreChapter={async item => {
          await api.restoreChapter(item.projectId, item.id);
          await reloadTrash();
          if (item.projectId === projectId) await reloadBundle(item.projectId);
          else {
            setProjectId(item.projectId);
            setBundle(await api.loadProject(item.projectId));
            setProjects(await api.listProjects());
          }
          setInitialChapterId(item.id);
          setPage('write');
          showToast('章节已恢复，并已打开该章节。', 'success');
        }} onNotice={showToast} />}
      </div>
    </main>
    <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} onCreate={createProject} busy={creating} />
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
