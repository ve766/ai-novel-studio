import { useEffect, useMemo, useState } from 'react';
import { BookMarked, BrainCircuit, Check, CircleHelp, Download, Eye, FilePlus2, FolderOpen, Link2, Plus, Power, Search, Sparkles, Upload } from 'lucide-react';
import { Button, EmptyState, Field, IconButton, Input, Modal, Pill, SectionHeading, Textarea, Toggle } from '../components.jsx';

const api = window.novelApp;

function SkillEditor({ open, initial, onClose, onSave, saving }) {
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  useEffect(() => {
    if (open) setForm({ name: initial?.name || '', description: initial?.description || '', content: initial?.content || '' });
  }, [open, initial?.id]);
  const change = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Modal open={open} onClose={onClose} title={initial ? '编辑写作 Skill' : '新建写作 Skill'} eyebrow="WRITING METHOD" width="wide" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={() => onSave(form)} disabled={saving || !form.name.trim() || !form.content.trim()}>{saving ? '保存中…' : '保存 Skill'}</Button></>}>
    <div className="form-grid">
      <Field label="Skill 名称" className="field-span-2"><Input value={form.name} onChange={change('name')} maxLength={200} placeholder="例如：悬疑线索递进" /></Field>
      <Field label="用途说明" className="field-span-2"><Textarea value={form.description} onChange={change('description')} rows={2} maxLength={2000} placeholder="这套方法适用于什么任务？" /></Field>
      <Field label="Skill 正文" hint="本次生成时才注入；不会默认启用，也不会自动修改章节。" className="field-span-2"><Textarea value={form.content} onChange={change('content')} rows={15} maxLength={500000} placeholder="写作步骤、检查清单、语气规范和输出要求…" className="skill-content-input" /></Field>
    </div>
  </Modal>;
}

function SkillCard({ skill, attached, onToggleEnabled, onAttach, onEdit, onPreview }) {
  return <article className={`skill-card ${!skill.enabled ? 'skill-disabled' : ''}`}>
    <div className="skill-card-top"><div className="skill-card-icon"><BrainCircuit size={17} /></div><div className="skill-card-actions"><IconButton label="预览 Skill" onClick={onPreview}><Eye size={15} /></IconButton><IconButton label="编辑 Skill" onClick={onEdit}><BookMarked size={15} /></IconButton></div></div>
    <div className="skill-card-tags"><Pill tone={skill.enabled ? 'sage' : 'neutral'}>{skill.enabled ? '已启用' : '已停用'}</Pill>{attached && <Pill tone="coral"><Link2 size={11} />当前项目已关联</Pill>}</div>
    <h3>{skill.name}</h3>
    <p>{skill.description || '尚未填写用途说明。'}</p>
    <div className="skill-card-meta"><span>{skill.sourceName || '手动创建'}</span><span>{(skill.content || '').length.toLocaleString()} 字符</span></div>
    <div className="skill-card-footer">
      <label className="skill-switch"><input type="checkbox" checked={Boolean(skill.enabled)} onChange={event => onToggleEnabled(event.target.checked)} /><span><Power size={13} />{skill.enabled ? '停用' : '启用'}</span></label>
      <Button size="sm" variant={attached ? 'secondary' : 'primary'} onClick={onAttach} disabled={!skill.enabled}>{attached ? <><Check size={14} />已关联</> : <><Plus size={14} />关联到项目</>}</Button>
    </div>
  </article>;
}

export function SkillsLibrary({ bundle, onRefresh, onNotice }) {
  const [skills, setSkills] = useState(bundle?.skills || []);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSkills(bundle?.skills || []); }, [bundle?.skills]);

  const refresh = async () => {
    const next = await api.listSkills();
    setSkills(next);
    await onRefresh?.();
  };
  const linkedIds = new Set(bundle?.project?.projectSkillIds || []);
  const filtered = useMemo(() => skills.filter(skill => `${skill.name} ${skill.description} ${skill.sourceName}`.toLowerCase().includes(query.toLowerCase())), [skills, query]);

  const importFile = async () => {
    try {
      const result = await api.importSkill();
      if (!result.canceled) { await refresh(); onNotice(`已导入「${result.skill.name}」。`, 'success'); }
    } catch (error) { onNotice(error.message || 'Skill 导入失败。', 'error'); }
  };
  const importFolder = async () => {
    try {
      const result = await api.importSkillFolder();
      if (!result.canceled) { await refresh(); onNotice(`已从文件夹导入 ${result.skills.length} 个 Skill。`, 'success'); }
    } catch (error) { onNotice(error.message || 'Skill 文件夹导入失败。', 'error'); }
  };
  const saveSkill = async form => {
    setSaving(true);
    try {
      if (editor?.id) await api.updateSkill(editor.id, form);
      else await api.createSkill(form);
      await refresh();
      setEditor(null);
      onNotice('写作 Skill 已保存。', 'success');
    } catch (error) { onNotice(error.message || '保存 Skill 失败。', 'error'); }
    finally { setSaving(false); }
  };
  const toggleEnabled = async (skill, enabled) => {
    try { await api.updateSkill(skill.id, { enabled }); await refresh(); onNotice(enabled ? 'Skill 已启用。' : 'Skill 已停用。', 'success'); }
    catch (error) { onNotice(error.message || '更新 Skill 失败。', 'error'); }
  };
  const attach = async skill => {
    if (!bundle?.project) { onNotice('请先创建或选择一个小说项目，再关联 Skill。', 'info'); return; }
    const next = linkedIds.has(skill.id) ? [...linkedIds].filter(id => id !== skill.id) : [...linkedIds, skill.id];
    try { await api.setProjectSkills(bundle.project.id, next); await refresh(); onNotice(linkedIds.has(skill.id) ? '已从当前项目移除 Skill。' : 'Skill 已关联到当前项目。', 'success'); }
    catch (error) { onNotice(error.message || '关联 Skill 失败。', 'error'); }
  };

  return <div className="skills-page">
    <SectionHeading kicker="WRITING SKILLS" title="写作 Skill" description="Skill 是可选的写作方法。先导入或编辑，再关联到项目；每次生成时还要单独勾选。" action={<><Button variant="secondary" onClick={importFile}><Upload size={15} /> 导入 .md</Button><Button variant="secondary" onClick={importFolder}><FolderOpen size={15} /> 导入文件夹</Button><Button onClick={() => setEditor({ id: '', name: '', description: '', content: '' })}><Plus size={16} /> 新建 Skill</Button></>} />
    {!bundle?.project && <div className="inline-callout"><CircleHelp size={16} /><span>目前没有打开的项目。可以先整理 Skill 库；创建项目后再逐个关联。</span></div>}
    <div className="skills-toolbar"><div><span className="skills-count">{skills.length}</span><span>个方法已保存</span><i /> <span>{[...linkedIds].length} 个关联当前项目</span></div><label className="search-field"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索 Skill 名称或用途…" /></label></div>
    {filtered.length ? <div className="skills-grid">{filtered.map(skill => <SkillCard key={skill.id} skill={skill} attached={linkedIds.has(skill.id)} onToggleEnabled={enabled => toggleEnabled(skill, enabled)} onAttach={() => attach(skill)} onEdit={() => setEditor(skill)} onPreview={() => setPreview(skill)} />)}</div> : <EmptyState icon={<BrainCircuit size={22} />} eyebrow="METHODS, NOT MAGIC" title={query ? '没有找到匹配 Skill' : '还没有写作 Skill'} description={query ? '换个关键词试试。' : '可导入符合 Markdown 格式的 .md 文件，或新建自己的写作规范。'} action={!query && <Button onClick={importFile}><Upload size={15} /> 导入第一个 Skill</Button>} />}
    <div className="skill-principle"><Sparkles size={16} /><p><b>Skill 不会自动执行。</b>平台只会把你当前项目关联并在本次生成中勾选的 Skill 注入提示词。未采纳的草稿和候选不会成为后续章节的正史。</p></div>
    <SkillEditor open={Boolean(editor)} initial={editor?.id ? editor : null} onClose={() => setEditor(null)} onSave={saveSkill} saving={saving} />
    <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name || 'Skill 预览'} eyebrow={preview?.sourceName || 'WRITING SKILL'} width="wide"><div className="skill-preview-description">{preview?.description || '无用途说明'}</div><pre className="skill-preview-content">{preview?.content}</pre></Modal>
  </div>;
}
