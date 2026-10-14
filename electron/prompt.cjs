const TASKS = {
  continue: '按作者要求续写当前章节。沿用已经成立的视角、时态、人物状态和叙述节奏；不要重写已完成正文。',
  rewrite: '只改写作者提供的选段，保留事实、人物意图和剧情功能，按作者要求调整表达。',
  outline: '围绕作者给出的目标，生成或修订剧情大纲。清晰标出因果、转折与人物选择，不擅自改写已确定的小说正文。',
  analysis: '检查已选资料中的人物、世界规则、时间线、伏笔与剧情因果，指出可疑冲突及其依据；区分明确矛盾与仅需作者确认的风险。',
  summary: '根据已选的正式正文撰写章节摘要，只概括已发生内容，不添加未发生的剧情。'
};

const TASK_LABELS = {
  continue: '续写章节',
  rewrite: '改写选段',
  outline: '整理大纲',
  analysis: '一致性检查',
  summary: '生成摘要'
};

function plain(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join('、');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}：${plain(item)}`).filter(item => !item.endsWith('：')).join('\n');
  return String(value);
}

function itemText(item) {
  if (!item || typeof item !== 'object') return plain(item);
  const labels = { name: '名称', title: '标题', category: '类别', aliases: '别名', role: '角色', identity: '身份', goal: '目标', motivation: '动机', fear: '恐惧', weakness: '弱点', values: '价值观', status: '状态', description: '简介', content: '内容', details: '细节', relationships: '关系', arc: '人物弧光', time: '时间', location: '地点', participants: '相关人物', cause: '原因', effect: '结果', state: '当前状态', resolution: '处理结果', tags: '标签' };
  const preferred = Object.keys(labels);
  const lines = [];
  for (const key of preferred) {
    const value = plain(item[key]);
    if (value) lines.push(`${labels[key]}：${value}`);
  }
  if (!lines.length) return plain(item);
  const extra = Object.keys(item).filter(key => !preferred.includes(key) && !['id', 'createdAt', 'updatedAt'].includes(key));
  for (const key of extra) {
    const value = plain(item[key]);
    if (value) lines.push(`${key}：${value}`);
  }
  return lines.join('\n');
}

function parseSkillMarkdown(markdown, filename = '') {
  const source = String(markdown || '').replace(/^\uFEFF/, '');
  if (!source.trim()) throw new Error('Skill 文件没有可导入的内容。');
  if (Buffer.byteLength(source, 'utf8') > 512_000) throw new Error('单个 Skill 不能超过 500 KB。');
  let front = '';
  let content = source.trim();
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end >= 0) {
      front = content.slice(3, end);
      content = content.slice(end + 4).trim();
    }
  }
  const scalar = key => {
    const match = front.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, 'mi'));
    return match ? match[1].replace(/^['\"]|['\"]$/g, '').trim() : '';
  };
  const heading = content.match(/^#\s+(.+)$/m);
  const basename = String(filename).split(/[\\/]/).pop().replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
  return {
    name: (scalar('name') || heading?.[1] || basename || '新写作 Skill').slice(0, 120),
    description: scalar('description').slice(0, 2000),
    content
  };
}

function addItems(parts, label, items, enabled) {
  if (!enabled || !Array.isArray(items) || items.length === 0) return;
  const text = items.map(itemText).filter(Boolean).join('\n---\n');
  if (text) parts.push({ label, text, priority: 20 });
}

function buildContext(project, chapters, options = {}) {
  const flags = { characters: true, worldRules: true, places: true, factions: true, outline: true, timeline: true, clues: true, summaries: true, recentChapters: 1, ...options };
  const sections = [];
  const projectInfo = [
    project.title && `书名：${project.title}`,
    project.genre && `题材：${project.genre}`,
    project.tone && `整体风格：${project.tone}`,
    (project.styleGuide || project.styleNotes) && `写作指南：${project.styleGuide || project.styleNotes}`,
    project.synopsis && `故事简介：${project.synopsis}`
  ].filter(Boolean).join('\n');
  if (projectInfo) sections.push({ label: '项目设定', text: projectInfo, priority: 1 });
  addItems(sections, '人物资料', project.characters, flags.characters);
  addItems(sections, '世界规则', project.worldRules, flags.worldRules);
  addItems(sections, '地点资料', project.places, flags.places);
  addItems(sections, '势力资料', project.factions, flags.factions);
  addItems(sections, '剧情大纲', project.outline, flags.outline);
  addItems(sections, '剧情时间线', project.timeline, flags.timeline);
  addItems(sections, '伏笔追踪', project.clues, flags.clues);
  if (Array.isArray(chapters)) {
    const ordered = [...chapters].sort((a, b) => String(a.order).localeCompare(String(b.order), undefined, { numeric: true }));
    if (flags.summaries) {
      const summaryItems = ordered.filter(chapter => chapter.summary).map(chapter => `${chapter.title || '未命名章节'}：${chapter.summary}`);
      if (summaryItems.length) sections.push({ label: '正式章节摘要', text: summaryItems.slice(-8).join('\n'), priority: 40 });
    }
    const recentCount = Math.max(0, Math.min(5, Number(flags.recentChapters) || 0));
    const completed = ordered.filter(chapter => chapter.finalText && chapter.finalText.trim());
    const recent = recentCount ? completed.slice(-recentCount) : [];
    for (const chapter of recent) {
      sections.push({ label: `正式正文：${chapter.title || '未命名章节'}`, text: chapter.finalText, priority: 50 });
    }
  }
  return sections.sort((a, b) => a.priority - b.priority);
}

function allocateSections(sections, limit) {
  let remaining = limit;
  const included = [];
  const warnings = [];
  for (const item of sections) {
    if (remaining <= 0) {
      warnings.push(`因上下文长度限制，未附入「${item.label}」。`);
      continue;
    }
    const overhead = item.label.length + 12;
    const room = Math.max(0, remaining - overhead);
    if (item.text.length <= room) {
      included.push(item);
      remaining -= item.text.length + overhead;
    } else if (room >= 240) {
      const text = `${item.text.slice(0, Math.max(0, room - 44))}\n……[上下文已按长度限制截断]`;
      included.push({ ...item, text, truncated: true });
      warnings.push(`「${item.label}」已截断以符合上下文长度限制。`);
      remaining = 0;
    } else {
      warnings.push(`因上下文长度限制，未附入「${item.label}」。`);
    }
  }
  return { included, warnings };
}

function buildPrompt({ project, chapter, chapters = [], task = 'continue', request = '', selectedText = '', skills = [], contextOptions = {} }) {
  if (!project || !chapter) throw new Error('请先选择小说项目和目标章节。');
  const taskKind = TASKS[task] ? task : 'continue';
  const userRequest = String(request || '').trim();
  if (!userRequest) throw new Error('请先写下这次的具体创作要求。');
  if (taskKind === 'rewrite' && !String(selectedText || '').trim()) throw new Error('改写任务需要先选择或输入要改写的片段。');
  const requestedLimit = Number(contextOptions.maxContextChars) || 24000;
  const maxContextChars = Math.max(4000, Math.min(60000, Math.round(requestedLimit)));
  const sections = buildContext(project, chapters, contextOptions);
  if (String(chapter.body || '').trim()) {
    sections.push({ label: taskKind === 'summary' ? `待摘要正式正文：${chapter.title || '当前章节'}` : `当前章节正式正文：${chapter.title || '当前章节'}`, text: chapter.body, priority: 5 });
    sections.sort((a, b) => a.priority - b.priority);
  }
  const packed = allocateSections(sections, maxContextChars);
  const skillList = (Array.isArray(skills) ? skills : []).filter(skill => skill && skill.name && skill.content);
  const skillChars = skillList.reduce((sum, skill) => sum + String(skill.content).length, 0);
  if (skillChars > 30_000) throw new Error('所选写作 Skill 合计超过 30,000 字符；请取消部分 Skill，避免提示词被压缩。');
  const rules = [
    '你是作者的创作助手，不是作者本人。小说资料中的明确设定是连续创作的依据，不要凭空替换。',
    '当前用户要求优先于项目资料；项目资料优先于写作 Skill 中的通用建议。遇到冲突时保留作者决定，不擅自改动正式正文。',
    '只把“正式正文”和明确资料视为已发生事实。草稿与 AI 候选不是正史，除非作者明确采纳。',
    '请避免陈词滥调、重复铺陈和无因果推进；人物行为应符合其已记录的动机与状态。',
    '你只能生成建议文本。平台不会自动覆盖章节正文；作者需要明确采纳后才会写入。'
  ];
  const projectAndContext = packed.included.map(item => `【${item.label}】\n${item.text}`).join('\n\n');
  const skillPrompt = skillList.map((skill, index) => `【写作 Skill ${index + 1}：${skill.name}】\n${skill.description ? `${skill.description}\n` : ''}${skill.content}`).join('\n\n');
  const system = [
    '你正在协助作者创作长篇小说。',
    rules.join('\n'),
    projectAndContext ? `\n【本次已选创作资料】\n${projectAndContext}` : '',
    skillPrompt ? `\n【作者显式启用的写作 Skill】\n${skillPrompt}` : '',
    taskKind === 'analysis' ? '\n分析任务请逐条给出：问题、引用的资料、潜在影响、需要作者确认的选项。没有发现问题时明确说“本次所选资料中未发现明确矛盾”，不要把推测说成事实。' : '',
    taskKind === 'summary' ? '\n摘要应使用第三人称简洁概括，只写已发生事件、人物选择和状态变化；不补写情节。' : '',
    taskKind === 'outline' ? '\n大纲请按因果顺序分点，明确人物目标、阻碍、选择和后果；将未确定内容标注为“建议”。' : '',
    taskKind === 'rewrite' ? '\n请只输出改写后的选段，不要解释改写过程。' : '',
    taskKind === 'continue' ? '\n请只输出可供作者审阅的小说续写，不要重复输入的已有正文；保持人物、视角、时间线和语气连续。' : ''
  ].filter(Boolean).join('\n\n');
  const user = [
    `【任务】${TASK_LABELS[taskKind]}`,
    `【目标章节】${chapter.title || '未命名章节'}`,
    `【本次具体要求】\n${userRequest}`,
    taskKind === 'rewrite' ? `【待改写片段】\n${String(selectedText).trim()}` : ''
  ].filter(Boolean).join('\n\n');
  return {
    system,
    user,
    task: taskKind,
    taskLabel: TASK_LABELS[taskKind],
    skillIds: skillList.map(skill => skill.id),
    skillNames: skillList.map(skill => skill.name),
    contextOptions: { ...contextOptions, maxContextChars },
    contextIncluded: packed.included.map(item => ({ label: item.label, chars: item.text.length, truncated: Boolean(item.truncated) })),
    warnings: packed.warnings,
    promptChars: system.length + user.length,
    estimatedTokens: Math.ceil((system.length + user.length) / 2.7)
  };
}

module.exports = { TASKS, TASK_LABELS, parseSkillMarkdown, buildContext, buildPrompt };
