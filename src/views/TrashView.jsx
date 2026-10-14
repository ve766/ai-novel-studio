import { useEffect } from 'react';
import { Archive, BookOpen, BookText, RotateCcw, Trash2 } from 'lucide-react';
import { Button, EmptyState, SectionHeading } from '../components.jsx';

const dateLabel = value => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '日期未知';

export function TrashView({ trash, onRefresh, onRestoreProject, onRestoreChapter, onNotice }) {
  useEffect(() => { onRefresh?.(); }, []);
  const projects = trash?.projects || [];
  const chapters = trash?.chapters || [];
  const restoreChapter = async item => {
    try { await onRestoreChapter(item); }
    catch (error) { onNotice(error.message || '恢复章节失败。', 'error'); }
  };
  return <div className="trash-page">
    <SectionHeading kicker="RECOVERY" title="回收站" description="移入回收站的项目和章节仍保留全部内容；恢复时不会覆盖其他项目。" />
    {projects.length + chapters.length ? <div className="trash-list">
      {projects.map(item => <article className="trash-row" key={`project-${item.id}`}>
        <span className="trash-row-icon"><BookOpen size={17} /></span>
        <span className="trash-row-main"><b>{item.title}</b><small>小说项目 · 移入于 {dateLabel(item.archivedAt)}</small></span>
        <Button size="sm" variant="secondary" onClick={() => onRestoreProject(item.id)}><RotateCcw size={14} />恢复项目</Button>
      </article>)}
      {chapters.map(item => <article className="trash-row" key={`chapter-${item.id}`}>
        <span className="trash-row-icon"><BookText size={17} /></span>
        <span className="trash-row-main"><b>{item.title}</b><small>《{item.projectTitle}》 · 章节 · 移入于 {dateLabel(item.archivedAt)}</small></span>
        <Button size="sm" variant="secondary" onClick={() => restoreChapter(item)}><RotateCcw size={14} />恢复章节</Button>
      </article>)}
      <div className="trash-footnote"><Archive size={14} />回收站不会自动清空；当前版本不提供永久删除，以免误删后无法找回。</div>
    </div> : <EmptyState icon={<Trash2 size={23} />} eyebrow="RECOVERY" title="回收站是空的" description="被归档的章节或项目会出现在这里。" />}
  </div>;
}
