import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, BookOpen, BookText, CalendarDays, CirclePlus, Download, FileText, MoreHorizontal, PenLine, Plus, Settings2, Sparkles, Users, Waypoints } from 'lucide-react';
import { Button, EmptyState, Field, IconButton, Input, Modal, SectionHeading, StatCard, Textarea } from '../components.jsx';

const dateLabel = value => {
  if (!value) return '尚未记录';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
};

function ProjectDetails({ project, open, onClose, onSave, onNotice }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && project) setForm({ title: project.title || '', genre: project.genre || '', synopsis: project.synopsis || '', tone: project.tone || '', styleGuide: project.styleGuide || '' }); }, [open, project]);
  const field = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); onNotice('项目资料已保存。', 'success'); }
    catch (error) { onNotice(error.message || '保存失败。', 'error'); }
    finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title="项目资料" eyebrow="故事的基底" size="lg" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={save} disabled={!form.title?.trim() || saving}>{saving ? '保存中…' : '保存资料'}</Button></>}>
    <div className="form-grid">
      <Field label="项目名称" required><Input value={form.title || ''} onChange={field('title')} maxLength={200} /></Field>
      <Field label="题材"><Input value={form.genre || ''} onChange={field('genre')} maxLength={100} placeholder="奇幻 · 悬疑 · 都市" /></Field>
      <Field label="故事简介" className="field-span-2"><Textarea value={form.synopsis || ''} onChange={field('synopsis')} rows={4} maxLength={10000} placeholder="故事主线、主角目标和关键矛盾" /></Field>
      <Field label="整体风格"><Textarea value={form.tone || ''} onChange={field('tone')} rows={3} maxLength={4000} placeholder="叙事气质、节奏和氛围" /></Field>
      <Field label="写作指南"><Textarea value={form.styleGuide || ''} onChange={field('styleGuide')} rows={3} maxLength={12000} placeholder="视角、时态、语言偏好、禁忌" /></Field>
    </div>
    <div className="modal-note">项目资料会用于已确认的 AI 创作请求；只有你选择的 Skill 和上下文会被附加。</div>
  </Modal>;
}

export function Overview({ bundle, onUpdateProject, onOpenWrite, onCreateChapter, onArchiveProject, onExport, onRefresh, onNotice, onNavigate }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const project = bundle.project;
  const chapters = bundle.chapters || [];
  const current = chapters.filter(chapter => !chapter.archivedAt);
  const words = useMemo(() => current.reduce((sum, chapter) => sum + String(chapter.body || '').replace(/\s/g, '').length, 0), [current]);
  const draftCount = current.filter(chapter => chapter.draftText?.trim()).length;
  const summaries = current.filter(chapter => chapter.summary?.trim()).length;
  const recent = [...current].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 4);
  const completeness = project.synopsis?.trim() ? 1 : 0;
  const recentLabel = value => value ? new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)) : '—';

  return <div className="overview-page">
    <section className="project-hero">
      <div className="project-hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" />正在写作</div>
        <div className="project-title-row"><h1>{project.title}</h1><IconButton label="编辑项目资料" onClick={() => setDetailsOpen(true)}><Settings2 size={17} /></IconButton></div>
        <div className="project-meta"><span>{project.genre || '未设题材'}</span><i />{project.tone || '风格待定'}<i /><span>创建于 {dateLabel(project.createdAt)}</span></div>
        <p className="project-synopsis">{project.synopsis || '故事简介还空着。先留下一句核心设想，后续创作会更容易保持方向。'}</p>
        <div className="hero-actions"><Button onClick={chapters.length ? onOpenWrite : onCreateChapter}><PenLine size={16} />{chapters.length ? '继续写作' : '创建第一章'}<ArrowRight size={15} /></Button><Button variant="secondary" onClick={onCreateChapter}><CirclePlus size={16} /> 新建章节</Button></div>
      </div>
      <div className="project-hero-art" aria-hidden="true">
        <div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" />
        <div className="hero-emblem"><BookOpen size={51} strokeWidth={1.2} /><span>✳</span></div>
        <div className="hero-stamp">{String(project.title || '故事').slice(0, 2)}<small>书稿 · 01</small></div>
        <div className="hero-quote">“{project.tone ? project.tone.split(/[，,。；;]/)[0].slice(0, 14) : '写下第一句'}”</div>
      </div>
    </section>

    <div className="overview-grid">
      <div className="overview-main-column">
        <div className="stats-grid">
          <StatCard label="正式正文" value={words.toLocaleString()} detail="字 · 只统计已保存正文" icon={<BookText size={16} />} />
          <StatCard label="章节" value={current.length} detail={`${draftCount} 个章节有未采纳草稿`} icon={<FileText size={16} />} />
          <StatCard label="人物设定" value={project.characters?.length || 0} detail={`${project.worldRules?.length || 0} 条世界规则`} icon={<Users size={16} />} />
          <StatCard label="剧情资料" value={(project.outline?.length || 0) + (project.clues?.length || 0)} detail={`${summaries} 章已有摘要`} icon={<Waypoints size={16} />} />
        </div>

        <section className="overview-section recent-section">
          <SectionHeading kicker="MANUSCRIPT" title="最近章节" description="草稿和正式正文分开保存，采纳时自动保留旧版本。" action={<Button variant="ghost" size="sm" onClick={onOpenWrite}>打开章节列表 <ArrowRight size={14} /></Button>} />
          {recent.length ? <div className="recent-chapters">
            {recent.map((chapter, index) => <button className="recent-chapter" key={chapter.id} onClick={() => onOpenWrite(chapter.id)}>
              <span className={`chapter-index ${index === 0 ? 'chapter-index-current' : ''}`}>{String(chapter.order + 1).padStart(2, '0')}</span>
              <span className="recent-chapter-main"><b>{chapter.title || `第 ${chapter.order + 1} 章`}</b><small>{chapter.summary?.trim() || (chapter.body?.trim() ? chapter.body.replace(/\s+/g, ' ').slice(0, 96) : '正文还是空白，写下第一段吧。')}</small></span>
              <span className="recent-chapter-status">{chapter.draftText?.trim() && <i className="draft-dot" title="有草稿" />}<span>{recentLabel(chapter.updatedAt)}</span><ArrowRight size={14} /></span>
            </button>)}
          </div> : <EmptyState icon={<BookText size={22} />} eyebrow="CHAPTERS" title="第一章还在等你" description="先建一个章节，正式正文、草稿和 AI 候选会分别保存。" action={<Button size="sm" onClick={onCreateChapter}><Plus size={15} /> 新建章节</Button>} />}
        </section>
      </div>

      <aside className="overview-side-column">
        <section className="side-card setup-card">
          <div className="side-card-heading"><div><div className="eyebrow">FOUNDATION</div><h3>创作基础</h3></div><Sparkles size={17} /></div>
          <p>用结构化资料保持长篇创作的连续性。</p>
          <div className="setup-row"><span className={`setup-check ${completeness ? 'setup-done' : ''}`}>{completeness ? '✓' : '1'}</span><div><b>故事简介</b><small>{completeness ? '已记录项目主线' : '补充核心设想与主要矛盾'}</small></div><button onClick={() => setDetailsOpen(true)}>{completeness ? '编辑' : '添加'}</button></div>
          <div className="setup-row"><span className={`setup-check ${project.characters?.length ? 'setup-done' : ''}`}>{project.characters?.length ? '✓' : '2'}</span><div><b>人物卡</b><small>{project.characters?.length ? `${project.characters.length} 位人物` : '记录人物目标与关系'}</small></div><button onClick={() => onNotice?.('在左侧“人物与世界”中维护人物卡。', 'info')}>{project.characters?.length ? '查看' : '添加'}</button></div>
          <div className="setup-row"><span className={`setup-check ${bundle.skills?.length ? 'setup-done' : ''}`}>{bundle.skills?.length ? '✓' : '3'}</span><div><b>写作 Skill</b><small>{bundle.skills?.length ? `${bundle.skills.length} 个 Skill 已关联` : '逐个项目选择写作规范'}</small></div><button onClick={() => onNotice?.('打开左侧“写作 Skill”，在项目中显式关联。', 'info')}>{bundle.skills?.length ? '查看' : '添加'}</button></div>
        </section>
        <section className="side-card quick-card">
          <div className="side-card-heading"><div><div className="eyebrow">QUICK ACCESS</div><h3>创作资料</h3></div><MoreHorizontal size={17} /></div>
          <button className="quick-link" onClick={() => onNavigate?.('characters')}><span className="quick-link-icon quick-ink"><Users size={16} /></span><span><b>人物与世界</b><small>人物、规则、地点与势力</small></span><ArrowRight size={14} /></button>
          <button className="quick-link" onClick={() => onNavigate?.('plot')}><span className="quick-link-icon quick-coral"><Waypoints size={16} /></span><span><b>剧情与伏笔</b><small>大纲、时间线、待回收线索</small></span><ArrowRight size={14} /></button>
          <button className="quick-link" onClick={() => onNavigate?.('notes')}><span className="quick-link-icon quick-gold"><MessageIcon /></span><span><b>灵感笔记</b><small>暂存未定稿的想法</small></span><ArrowRight size={14} /></button>
        </section>
        <section className="side-card project-actions-card">
          <div className="side-card-heading"><div><div className="eyebrow">PROJECT</div><h3>项目管理</h3></div><Archive size={16} /></div>
          <button onClick={onExport}><DownloadIcon />导出完整备份</button>
          <button className="danger-quiet" onClick={onArchiveProject}><Archive size={15} />移入回收站</button>
        </section>
      </aside>
    </div>
    <ProjectDetails project={project} open={detailsOpen} onClose={() => setDetailsOpen(false)} onSave={onUpdateProject} onNotice={onNotice} />
  </div>;
}

function MessageIcon() { return <CalendarDays size={16} />; }
function DownloadIcon() { return <Download size={15} />; }
