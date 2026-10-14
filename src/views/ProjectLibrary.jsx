import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, BookOpen, CirclePlus, Clock3, FilePlus2, Lightbulb, MapPin, Pencil, Plus, Search, Trash2, Users, Waypoints, X } from 'lucide-react';
import { Button, EmptyState, Field, IconButton, Input, Modal, Pill, SectionHeading, Select, Tabs, Textarea } from '../components.jsx';

const ENTITY_SECTIONS = [
  { key: 'characters', label: '人物', icon: Users, title: '人物卡', fields: [['name', '人物姓名', 'input'], ['identity', '身份与角色', 'input'], ['goal', '眼前目标', 'input'], ['motivation', '深层动机', 'textarea'], ['fear', '恐惧或弱点', 'textarea'], ['relationships', '重要关系', 'textarea'], ['arc', '人物变化', 'textarea'], ['status', '当前状态', 'input']] },
  { key: 'worldRules', label: '世界规则', icon: BookOpen, title: '世界规则', fields: [['title', '规则名称', 'input'], ['category', '类别', 'input'], ['content', '规则内容', 'textarea'], ['details', '例外与边界', 'textarea']] },
  { key: 'places', label: '地点', icon: MapPin, title: '地点资料', fields: [['name', '地点名称', 'input'], ['category', '类别', 'input'], ['description', '环境与氛围', 'textarea'], ['state', '当前状态', 'textarea']] },
  { key: 'factions', label: '势力', icon: Waypoints, title: '势力资料', fields: [['name', '势力名称', 'input'], ['role', '公开身份', 'input'], ['goal', '目标', 'textarea'], ['members', '关键成员', 'textarea'], ['relationships', '与其他势力的关系', 'textarea'], ['status', '当前状态', 'input']] }
];

const PLOT_SECTIONS = [
  { key: 'outline', label: '大纲', icon: BookOpen, title: '剧情大纲', fields: [['title', '情节标题', 'input'], ['goal', '本段目标', 'textarea'], ['conflict', '阻碍与冲突', 'textarea'], ['turningPoint', '转折或选择', 'textarea'], ['outcome', '后果', 'textarea'], ['status', '进度状态', 'input']] },
  { key: 'timeline', label: '时间线', icon: Clock3, title: '时间线事件', fields: [['time', '发生时间', 'input'], ['title', '事件', 'input'], ['participants', '相关人物', 'textarea'], ['cause', '起因', 'textarea'], ['effect', '结果与影响', 'textarea'], ['chapterId', '关联章节', 'chapter']] },
  { key: 'clues', label: '伏笔', icon: Lightbulb, title: '伏笔记录', fields: [['title', '伏笔名称', 'input'], ['planting', '埋设位置或方式', 'textarea'], ['payoff', '计划回收', 'textarea'], ['status', '状态', 'input'], ['chapterId', '关联章节', 'chapter'], ['notes', '补充备注', 'textarea']] }
];

function labelFor(config, item) {
  return item?.[config.fields[0][0]] || config.title;
}

function prettyValue(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join('、');
  return String(value).trim();
}

function DetailCard({ config, item, onEdit, onDelete }) {
  const label = labelFor(config, item);
  const details = config.fields.slice(1).map(([key, name]) => [name, prettyValue(item[key])]).filter(([, value]) => value);
  const summary = details.slice(0, 2).map(([name, value]) => `${name}：${value}`).join(' · ');
  return <article className="library-card">
    <div className="library-card-top"><span className="library-card-icon"><config.icon size={16} /></span><div className="library-card-actions"><IconButton label="编辑" onClick={onEdit}><Pencil size={15} /></IconButton><IconButton label="删除" onClick={onDelete} className="icon-danger"><Trash2 size={15} /></IconButton></div></div>
    <div className="library-card-category">{config.label}</div>
    <h3>{label}</h3>
    <p>{summary || '尚未补充细节。'}</p>
    {details.length > 2 && <span className="library-card-more">另有 {details.length - 2} 项资料</span>}
  </article>;
}

function RecordEditor({ open, config, record, chapters, onClose, onSave, saving }) {
  const [form, setForm] = useState({});
  const fields = config?.fields || [];
  useEffect(() => {
    if (open) setForm(Object.fromEntries(fields.map(([key]) => [key, record?.[key] || ''])));
  }, [open, record?.id, config?.key]);
  if (!config) return null;
  const update = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const submit = event => { event.preventDefault(); onSave(form); };
  return <Modal open={open} onClose={onClose} title={record ? `编辑${config.label}` : `新增${config.label}`} eyebrow={config.title} size="lg" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={() => onSave(form)} disabled={saving || !String(form[fields[0][0]] || '').trim()}>{saving ? '保存中…' : '保存资料'}</Button></>}>
    <form onSubmit={submit} className="form-grid">
      {fields.map(([key, label, type]) => <Field key={key} label={label} required={key === fields[0][0]} className={type === 'textarea' || type === 'chapter' ? 'field-span-2' : ''}>
        {type === 'textarea' ? <Textarea value={form[key] || ''} onChange={update(key)} rows={key === 'content' || key === 'motivation' ? 4 : 3} maxLength={20000} placeholder={`记录${label}…`} /> : type === 'chapter' ? <Select value={form[key] || ''} onChange={update(key)}><option value="">暂不关联章节</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</Select> : <Input value={form[key] || ''} onChange={update(key)} maxLength={2000} placeholder={`填写${label}`} />}
      </Field>)}
    </form>
    <div className="modal-note">这些资料仅属于当前小说项目；需要时才会被选入 AI 创作上下文。</div>
  </Modal>;
}

function CollectionPage({ bundle, onUpdate, onNotice, configs, heading, description, collectionLabel }) {
  const [activeKey, setActiveKey] = useState(configs[0].key);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const project = bundle.project;
  const active = configs.find(config => config.key === activeKey) || configs[0];
  const all = Array.isArray(project[active.key]) ? project[active.key] : [];
  const filtered = useMemo(() => all.filter(item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase())), [all, query]);
  const startNew = () => setEditor({ config: active, record: null });
  const startEdit = item => setEditor({ config: active, record: item });
  const saveRecord = async values => {
    setSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const next = editor.record
        ? all.map(item => item.id === editor.record.id ? { ...item, ...values, updatedAt: timestamp } : item)
        : [...all, { id: globalThis.crypto?.randomUUID?.() || `record-${Date.now()}`, ...values, createdAt: timestamp, updatedAt: timestamp }];
      await onUpdate({ [active.key]: next });
      setEditor(null);
      onNotice(`${active.label}资料已保存。`, 'success');
    } catch (error) { onNotice(error.message || '保存失败。', 'error'); }
    finally { setSaving(false); }
  };
  const deleteRecord = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await onUpdate({ [active.key]: all.filter(item => item.id !== deleteTarget.id) });
      onNotice('资料已删除。', 'success');
      setDeleteTarget(null);
    } catch (error) { onNotice(error.message || '删除失败。', 'error'); }
    finally { setSaving(false); }
  };
  return <div className="library-page">
    <SectionHeading kicker={collectionLabel} title={heading} description={description} action={<Button onClick={startNew}><Plus size={16} /> 新增{active.label}</Button>} />
    <div className="collection-toolbar"><Tabs items={configs.map(config => ({ value: config.key, label: config.label }))} value={activeKey} onChange={key => { setActiveKey(key); setQuery(''); }} /><label className="search-field"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索资料…" /><kbd>⌘ K</kbd></label></div>
    <div className="collection-info"><span>{active.title}</span><span>{filtered.length} 条 · 只属于「{project.title}」</span></div>
    {filtered.length ? <div className="library-grid">{filtered.map(item => <DetailCard key={item.id} config={active} item={item} onEdit={() => startEdit(item)} onDelete={() => setDeleteTarget(item)} />)}</div> : <EmptyState icon={<active.icon size={22} />} eyebrow={collectionLabel} title={query ? '没有找到匹配资料' : `${active.label}资料还是空的`} description={query ? '试试其他关键词。' : '先记录确定的信息；模糊想法可以留在灵感笔记。'} action={!query && <Button size="sm" onClick={startNew}><Plus size={15} />新增{active.label}</Button>} />}
    <RecordEditor open={Boolean(editor)} config={editor?.config} record={editor?.record} chapters={bundle.chapters || []} onClose={() => setEditor(null)} onSave={saveRecord} saving={saving} />
    <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除这条资料？" eyebrow="不可直接撤销" size="sm" footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>保留</Button><Button variant="danger" onClick={deleteRecord} disabled={saving}>删除资料</Button></>}><p className="confirm-copy">“{deleteTarget ? labelFor(active, deleteTarget) : ''}”会从当前项目资料中删除。完整项目备份可保留删除前的数据。</p></Modal>
  </div>;
}

export function EntityLibrary({ bundle, onUpdate, onNotice }) {
  return <CollectionPage bundle={bundle} onUpdate={onUpdate} onNotice={onNotice} configs={ENTITY_SECTIONS} heading="人物与世界" description="把确定的设定放进项目资料；AI 只会使用本次选入的资料。" collectionLabel="STORY BIBLE" />;
}

export function PlotLibrary({ bundle, onUpdate, onNotice }) {
  return <CollectionPage bundle={bundle} onUpdate={onUpdate} onNotice={onNotice} configs={PLOT_SECTIONS} heading="剧情与伏笔" description="按因果记录剧情进展，让时间线和待回收线索有迹可循。" collectionLabel="PLOT & CONTINUITY" />;
}

const NOTE_CONFIG = { key: 'notes', label: '笔记', title: '灵感笔记', icon: Lightbulb, fields: [['title', '笔记标题', 'input'], ['category', '分类', 'input'], ['content', '笔记内容', 'textarea']] };

export function NotesLibrary({ bundle, onUpdate, onNotice }) {
  const project = bundle.project;
  const notes = project.notes || [];
  const [editor, setEditor] = useState(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const filtered = notes.filter(note => JSON.stringify(note).toLowerCase().includes(query.toLowerCase()));
  const save = async values => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const next = editor?.record ? notes.map(note => note.id === editor.record.id ? { ...note, ...values, updatedAt: now } : note) : [...notes, { id: globalThis.crypto?.randomUUID?.() || `note-${Date.now()}`, ...values, createdAt: now, updatedAt: now }];
      await onUpdate({ notes: next });
      setEditor(null);
      onNotice('灵感笔记已保存。', 'success');
    } catch (error) { onNotice(error.message || '保存失败。', 'error'); }
    finally { setSaving(false); }
  };
  const remove = async note => {
    if (!window.confirm(`删除笔记“${note.title || '未命名'}”？`)) return;
    try { await onUpdate({ notes: notes.filter(item => item.id !== note.id) }); onNotice('笔记已删除。', 'success'); }
    catch (error) { onNotice(error.message || '删除失败。', 'error'); }
  };
  return <div className="library-page">
    <SectionHeading kicker="IDEAS & SCRAPS" title="灵感笔记" description="先放下想法，不把尚未确定的灵感误当成小说正史。" action={<Button onClick={() => setEditor({ config: NOTE_CONFIG, record: null })}><Plus size={16} /> 新建笔记</Button>} />
    <div className="notes-toolbar"><span><Lightbulb size={15} />{notes.length} 条笔记 · 当前项目</span><label className="search-field"><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索笔记…" /></label></div>
    {filtered.length ? <div className="notes-grid">{filtered.map(note => <article className="note-card" key={note.id}><div className="note-card-top"><Pill tone="gold">{note.category || '灵感'}</Pill><div><IconButton label="编辑笔记" onClick={() => setEditor({ config: NOTE_CONFIG, record: note })}><Pencil size={15} /></IconButton><IconButton label="删除笔记" className="icon-danger" onClick={() => remove(note)}><Trash2 size={15} /></IconButton></div></div><h3>{note.title}</h3><p>{note.content}</p><small>{note.updatedAt ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt)) : ''}</small></article>)}</div> : <EmptyState icon={<Lightbulb size={22} />} title={query ? '没有找到笔记' : '把灵感暂存在这里'} description="人物对白、画面、疑问和暂时不确定的设想，都可以先记下。" action={!query && <Button size="sm" onClick={() => setEditor({ config: NOTE_CONFIG, record: null })}><Plus size={15} /> 新建笔记</Button>} />}
    <RecordEditor open={Boolean(editor)} config={NOTE_CONFIG} record={editor?.record} chapters={bundle.chapters || []} onClose={() => setEditor(null)} onSave={save} saving={saving} />
  </div>;
}
