import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const store = require('../electron/store.cjs');
let dataDir;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-store-'));
  store.ensureLayout(dataDir);
});

afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

function newProject(title = '雾港来信') {
  return store.createProject(dataDir, { title, synopsis: '一封迟来的信。' });
}

describe('project data isolation and manuscript safety', () => {
  it('keeps projects, official text and drafts isolated', () => {
    const first = newProject('项目甲');
    const second = newProject('项目乙');
    const chapter = store.createChapter(dataDir, first.id, { title: '第一章' });

    store.saveFinal(dataDir, first.id, chapter.id, '正式正文');
    store.saveDraft(dataDir, first.id, chapter.id, '独立草稿');

    expect(store.loadProject(dataDir, first.id).chapters[0]).toMatchObject({ body: '正式正文', draftText: '独立草稿' });
    expect(store.loadProject(dataDir, second.id).chapters).toHaveLength(0);
  });

  it('backs up official text before replacement and restores without losing the replacement', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    store.saveFinal(dataDir, project.id, chapter.id, '旧版正文');
    store.saveFinal(dataDir, project.id, chapter.id, '新版正文');
    const oldVersion = store.listVersions(dataDir, project.id, chapter.id)[0];

    expect(oldVersion.preview).toBe('旧版正文');
    store.restoreVersion(dataDir, project.id, chapter.id, oldVersion.id);

    expect(store.loadProject(dataDir, project.id).chapters[0].body).toBe('旧版正文');
    expect(store.listVersions(dataDir, project.id, chapter.id).some(item => item.preview === '新版正文')).toBe(true);
  });

  it('keeps AI candidates separate until an explicit, safe action is taken', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    store.saveFinal(dataDir, project.id, chapter.id, '已确认的正文');
    store.saveDraft(dataDir, project.id, chapter.id, '作者的草稿');
    const candidate = store.createCandidate(dataDir, project.id, { chapterId: chapter.id, text: 'AI 建议稿' });

    expect(store.loadProject(dataDir, project.id).chapters[0].body).toBe('已确认的正文');
    expect(() => store.applyCandidate(dataDir, project.id, candidate.id, 'draft')).toThrow(/草稿已有内容/);
    store.applyCandidate(dataDir, project.id, candidate.id, 'draft', { replaceDraft: true });

    const updated = store.loadProject(dataDir, project.id).chapters[0];
    expect(updated.body).toBe('已确认的正文');
    expect(updated.draftText).toBe('AI 建议稿');
    expect(store.listCandidates(dataDir, project.id)[0].status).toBe('accepted');
  });

  it('persists unsaved editor buffers without changing the official manuscript', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    store.saveFinal(dataDir, project.id, chapter.id, '确定版');
    store.persistEditorState(dataDir, project.id, chapter.id, {
      formalEditText: '尚未确认的新正文',
      summary: '本章刚发生的事情',
      contextSettings: { timeline: false, recentChapters: 4, maxContextChars: 40000 }
    });
    const saved = store.loadProject(dataDir, project.id);

    expect(saved.chapters[0]).toMatchObject({ body: '确定版', formalEditText: '尚未确认的新正文', summary: '本章刚发生的事情' });
    expect(saved.project.contextSettings).toMatchObject({ timeline: false, recentChapters: 4, maxContextChars: 40000 });
  });

  it('appends an outline candidate under a readable title', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    const candidate = store.createCandidate(dataDir, project.id, { chapterId: chapter.id, kind: 'outline', text: '# 第一幕\n主角收到一封迟来的信。' });

    store.applyCandidate(dataDir, project.id, candidate.id, 'outline');

    expect(store.loadProject(dataDir, project.id).project.outline[0]).toMatchObject({ title: '第一幕', goal: candidate.text });
  });

  it('moves projects to the recycle bin and restores all project data', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    store.saveDraft(dataDir, project.id, chapter.id, '待恢复草稿');
    store.archiveProject(dataDir, project.id);

    expect(store.listProjects(dataDir)).toHaveLength(0);
    expect(store.listTrash(dataDir).projects[0].id).toBe(project.id);
    const restored = store.restoreProject(dataDir, project.id);
    expect(restored.chapters[0].draftText).toBe('待恢复草稿');
  });

  it('archives chapters separately and allows restoration', () => {
    const project = newProject();
    const chapter = store.createChapter(dataDir, project.id);
    store.saveDraft(dataDir, project.id, chapter.id, '仍需保留');
    store.setChapterArchived(dataDir, project.id, chapter.id, true);

    expect(store.loadProject(dataDir, project.id).chapters).toHaveLength(0);
    expect(store.loadProject(dataDir, project.id).archivedChapters[0].draftText).toBe('仍需保留');
    expect(store.listTrash(dataDir).chapters[0].id).toBe(chapter.id);
    store.setChapterArchived(dataDir, project.id, chapter.id, false);
    expect(store.loadProject(dataDir, project.id).chapters[0].id).toBe(chapter.id);
  });
});

describe('backup import and recovery', () => {
  it('round-trips project links, chapters, Skill, versions and candidates with new IDs', () => {
    const project = newProject();
    const skill = store.createSkill(dataDir, { name: '悬疑节奏', description: '逐步升级线索', content: '每个线索都要改变人物判断。' });
    store.setProjectSkills(dataDir, project.id, [skill.id]);
    const chapter = store.createChapter(dataDir, project.id, { title: '序章' });
    store.saveFinal(dataDir, project.id, chapter.id, '旧正文');
    store.saveFinal(dataDir, project.id, chapter.id, '正式正文');
    store.saveDraft(dataDir, project.id, chapter.id, '未完成草稿');
    store.updateProject(dataDir, project.id, {
      characters: [{ id: 'detective', name: '林岚', linkedChapterId: chapter.id }],
      contextSettings: { recentChapters: 2, maxContextChars: 32000 }
    });
    const candidate = store.createCandidate(dataDir, project.id, { chapterId: chapter.id, text: '候选正文', skillIds: [skill.id] });
    const backup = store.exportProject(dataDir, project.id);
    const imported = store.importProject(dataDir, backup);
    const importedChapter = imported.chapters[0];
    const importedSkill = imported.skills.find(item => item.id === imported.project.projectSkillIds[0]);

    expect(imported.project.id).not.toBe(project.id);
    expect(imported.project.projectSkillIds).toEqual([importedSkill.id]);
    expect(importedChapter.id).not.toBe(chapter.id);
    expect(importedChapter).toMatchObject({ title: '序章', body: '正式正文', draftText: '未完成草稿' });
    expect(imported.project.characters[0].linkedChapterId).toBe(importedChapter.id);
    expect(imported.candidates[0]).toMatchObject({ text: '候选正文', chapterId: importedChapter.id, skillIds: [importedSkill.id] });
    expect(store.exportProject(dataDir, imported.project.id).versions.some(item => item.body === '旧正文')).toBe(true);
  });

  it('rolls back partial Skill imports and keeps existing projects intact on invalid backups', () => {
    const existing = newProject();
    const baselineSkills = store.listSkills(dataDir).length;
    const malformed = {
      format: 'ai-novel-studio-project', version: 1,
      project: { title: '损坏备份' }, chapters: [],
      skills: [{ id: 'old-skill', name: '临时 Skill', content: '可回滚' }],
      candidates: [{ text: null }]
    };

    expect(() => store.importProject(dataDir, malformed)).toThrow(/导入失败/);
    expect(store.listProjects(dataDir).map(item => item.id)).toContain(existing.id);
    expect(store.listSkills(dataDir)).toHaveLength(baselineSkills);
    expect(store.listTrash(dataDir).projects).toHaveLength(0);
  });

  it('imports Skill batches atomically', () => {
    expect(() => store.createSkillsBatch(dataDir, [
      { name: '有效 Skill', content: '步骤一。' },
      { name: '无效 Skill', content: '' }
    ])).toThrow(/不能为空/);
    expect(store.listSkills(dataDir)).toHaveLength(0);
  });
});
