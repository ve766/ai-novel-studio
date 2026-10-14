import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildContext, buildPrompt, parseSkillMarkdown } = require('../electron/prompt.cjs');

const project = {
  title: '雾港来信',
  synopsis: '一名侦探收到一封来自未来的信。',
  characters: [{ name: '林岚', goal: '找出寄信人' }],
  worldRules: [{ title: '回信规则', content: '信件不能直接预言死者身份。' }],
  places: [], factions: [], outline: [], timeline: [], clues: []
};

describe('prompt assembly', () => {
  it('uses official text and selected Skills, never drafts or unselected Skills', () => {
    const prompt = buildPrompt({
      project,
      chapter: { id: 'current', title: '第一章', body: '正式正文片段。', draftText: '私人草稿，不是正史。' },
      chapters: [{ id: 'previous', order: 0, title: '序章', finalText: '前一章正式正文。', draftText: '前一章未采纳草稿。' }],
      request: '让主角发现信封上的日期不可能成立。',
      skills: [{ id: 'skill-a', name: '悬疑推进', content: '每条线索都要改变人物判断。' }],
      contextOptions: { recentChapters: 1, maxContextChars: 12000 }
    });

    expect(prompt.system).toContain('正式正文片段。');
    expect(prompt.system).toContain('前一章正式正文。');
    expect(prompt.system).toContain('每条线索都要改变人物判断。');
    expect(prompt.system).not.toContain('私人草稿，不是正史。');
    expect(prompt.system).not.toContain('前一章未采纳草稿。');
    expect(prompt.skillNames).toEqual(['悬疑推进']);
    expect(prompt.contextIncluded.length).toBeGreaterThan(0);
  });

  it('rejects rewrites without a selected passage and labels rewrites precisely', () => {
    expect(() => buildPrompt({ project, chapter: { title: '第一章', body: '' }, request: '更冷静一些。', task: 'rewrite' })).toThrow(/改写任务需要/);
    const prompt = buildPrompt({
      project, chapter: { title: '第一章', body: '' }, request: '语言收敛一些。',
      selectedText: '她走进房间。', task: 'rewrite'
    });
    expect(prompt.user).toContain('她走进房间。');
    expect(prompt.system).toContain('只输出改写后的选段');
  });

  it('truncates context to the configured budget and reports the affected section', () => {
    const largeProject = { ...project, styleGuide: '语气规范'.repeat(2500) };
    const context = buildContext(largeProject, [], { maxContextChars: 4000 });
    expect(context.some(section => section.label === '项目设定')).toBe(true);
    const prompt = buildPrompt({
      project: largeProject, chapter: { title: '第一章', body: '' }, request: '继续写。',
      contextOptions: { maxContextChars: 4000 }
    });
    expect(prompt.contextIncluded.reduce((sum, item) => sum + item.chars, 0)).toBeLessThanOrEqual(4000);
    expect(prompt.warnings.length).toBeGreaterThan(0);
  });

  it('parses portable SKILL.md frontmatter while preserving its writing instructions', () => {
    const skill = parseSkillMarkdown('---\nname: Clue Escalation\ndescription: Increase tension one reveal at a time\n---\n# Method\n\nEvery clue changes a decision.', 'SKILL.md');
    expect(skill).toEqual({
      name: 'Clue Escalation',
      description: 'Increase tension one reveal at a time',
      content: '# Method\n\nEvery clue changes a decision.'
    });
  });
});
