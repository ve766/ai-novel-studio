const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_TEXT_CHARS = 2_000_000;
const MAX_JSON_BYTES = 24 * 1024 * 1024;
const PROJECT_ARRAY_FIELDS = ['characters', 'worldRules', 'places', 'factions', 'outline', 'timeline', 'clues', 'notes', 'projectSkillIds'];

function id(value) {
  const result = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(result)) throw new Error('项目编号无效。');
  return result;
}

function ensureLayout(dataDir) {
  for (const folder of ['projects', 'skills', 'trash/projects']) fs.mkdirSync(path.join(dataDir, folder), { recursive: true });
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    if (error instanceof SyntaxError) throw new Error(`数据文件无法解析，原文件已保留：${path.basename(file)}`);
    throw error;
  }
}

function writeJSON(file, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(content, 'utf8') > MAX_JSON_BYTES) throw new Error('单个资料文件超过 24 MB 限制，请拆分内容后再保存。');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, content, { encoding: 'utf8', mode: 0o600 });
  try { fs.renameSync(temp, file); }
  catch (error) { try { fs.rmSync(temp, { force: true }); } catch {} throw error; }
}

function projectDir(dataDir, projectId) { return path.join(dataDir, 'projects', id(projectId)); }
function projectFile(dataDir, projectId) { return path.join(projectDir(dataDir, projectId), 'project.json'); }
function chapterFile(dataDir, projectId, chapterId) { return path.join(projectDir(dataDir, projectId), 'chapters', `${id(chapterId)}.json`); }
function candidateFile(dataDir, projectId, candidateId) { return path.join(projectDir(dataDir, projectId), 'candidates', `${id(candidateId)}.json`); }
function skillFile(dataDir, skillId) { return path.join(dataDir, 'skills', `${id(skillId)}.json`); }

function requireProject(dataDir, projectId) {
  const project = readJSON(projectFile(dataDir, projectId), null);
  if (!project) throw new Error('找不到小说项目。');
  return project;
}

function requireChapter(dataDir, projectId, chapterId) {
  const chapter = readJSON(chapterFile(dataDir, projectId, chapterId), null);
  if (!chapter) throw new Error('找不到章节。');
  return chapter;
}

function validateText(value, label, max = MAX_TEXT_CHARS) {
  if (typeof value !== 'string') throw new Error(`${label}必须是文字。`);
  if (value.length > max) throw new Error(`${label}超过 ${max.toLocaleString()} 字符限制。`);
  return value;
}

function createProject(dataDir, input = {}) {
  ensureLayout(dataDir);
  const title = String(input.title || '').trim().slice(0, 200);
  if (!title) throw new Error('项目名称不能为空。');
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    title,
    genre: String(input.genre || '').trim().slice(0, 100),
    synopsis: String(input.synopsis || '').slice(0, 10_000),
    tone: String(input.tone || '').slice(0, 4_000),
    styleGuide: String(input.styleGuide || '').slice(0, 12_000),
    characters: [],
    worldRules: [],
    places: [],
    factions: [],
    outline: [],
    timeline: [],
    clues: [],
    notes: [],
    projectSkillIds: [],
    contextSettings: { characters: true, worldRules: true, places: true, factions: true, outline: true, timeline: true, clues: true, summaries: true, recentChapters: 1, maxContextChars: 24000 },
    createdAt: now,
    updatedAt: now
  };
  writeJSON(projectFile(dataDir, project.id), project);
  return project;
}

function listProjectChapters(dataDir, projectId, { includeArchived = false } = {}) {
  const folder = path.join(projectDir(dataDir, projectId), 'chapters');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => readJSON(path.join(folder, name), null)).filter(Boolean)
    .filter(chapter => includeArchived || !chapter.archivedAt)
    .sort((a, b) => (Number(a.order) - Number(b.order)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function listProjects(dataDir) {
  ensureLayout(dataDir);
  return fs.readdirSync(path.join(dataDir, 'projects'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const project = readJSON(path.join(dataDir, 'projects', entry.name, 'project.json'), null);
    if (!project || project.archivedAt) return null;
    const chapters = listProjectChapters(dataDir, project.id);
    return { ...project, chapterCount: chapters.length, wordCount: chapters.reduce((sum, item) => sum + (item.body || '').length, 0) };
  }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function updateProject(dataDir, projectId, patch = {}) {
  const project = requireProject(dataDir, projectId);
  const simpleFields = { title: 200, genre: 100, synopsis: 10_000, tone: 4_000, styleGuide: 12_000 };
  for (const [key, limit] of Object.entries(simpleFields)) {
    if (Object.hasOwn(patch, key)) {
      const value = String(patch[key] ?? '').slice(0, limit);
      if (key === 'title' && !value.trim()) throw new Error('项目名称不能为空。');
      project[key] = key === 'title' || key === 'genre' ? value.trim() : value;
    }
  }
  for (const key of PROJECT_ARRAY_FIELDS) {
    if (!Object.hasOwn(patch, key) || key === 'projectSkillIds') continue;
    const value = patch[key];
    if (!Array.isArray(value) || value.length > 1000) throw new Error(`「${key}」资料格式无效。`);
    project[key] = value;
  }
  if (Object.hasOwn(patch, 'contextSettings')) {
    if (!patch.contextSettings || typeof patch.contextSettings !== 'object' || Array.isArray(patch.contextSettings)) throw new Error('上下文设置格式无效。');
    project.contextSettings = { ...project.contextSettings, ...patch.contextSettings };
    project.contextSettings.recentChapters = Math.max(0, Math.min(5, Number(project.contextSettings.recentChapters) || 0));
    project.contextSettings.maxContextChars = Math.max(4_000, Math.min(60_000, Math.round(Number(project.contextSettings.maxContextChars) || 24_000)));
  }
  project.updatedAt = new Date().toISOString();
  writeJSON(projectFile(dataDir, projectId), project);
  return project;
}

function setProjectSkills(dataDir, projectId, skillIds) {
  if (!Array.isArray(skillIds) || skillIds.length > 100) throw new Error('每个项目最多关联 100 个 Skill。');
  const skills = new Set(listSkills(dataDir).map(skill => skill.id));
  const project = requireProject(dataDir, projectId);
  const unique = [...new Set(skillIds.map(id))];
  if (unique.some(skillId => !skills.has(skillId))) throw new Error('只能关联已存在的 Skill。');
  project.projectSkillIds = unique;
  project.updatedAt = new Date().toISOString();
  writeJSON(projectFile(dataDir, projectId), project);
  return project;
}

function updateCandidateStatus(dataDir, projectId, candidate, status) {
  candidate.status = status;
  candidate.updatedAt = new Date().toISOString();
  writeJSON(candidateFile(dataDir, projectId, candidate.id), candidate);
  return candidate;
}

function createChapter(dataDir, projectId, input = {}) {
  const project = requireProject(dataDir, projectId);
  const chapters = listProjectChapters(dataDir, projectId, { includeArchived: true });
  const now = new Date().toISOString();
  const chapter = {
    id: crypto.randomUUID(),
    projectId: project.id,
    title: String(input.title || `第 ${chapters.length + 1} 章`).trim().slice(0, 200),
    order: chapters.length,
    body: '',
    draftText: '',
    formalEditText: '',
    summary: '',
    notes: '',
    createdAt: now,
    updatedAt: now
  };
  writeJSON(chapterFile(dataDir, projectId, chapter.id), chapter);
  project.updatedAt = now;
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function updateChapter(dataDir, projectId, chapterId, patch = {}) {
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  if (Object.hasOwn(patch, 'title')) {
    const title = String(patch.title || '').trim().slice(0, 200);
    if (!title) throw new Error('章节名称不能为空。');
    chapter.title = title;
  }
  if (Object.hasOwn(patch, 'summary')) chapter.summary = validateText(patch.summary, '章节摘要', 20_000);
  if (Object.hasOwn(patch, 'formalEditText')) chapter.formalEditText = validateText(patch.formalEditText, '正式正文编辑缓冲');
  if (Object.hasOwn(patch, 'notes')) chapter.notes = validateText(patch.notes, '章节备注', 50_000);
  if (Object.hasOwn(patch, 'order')) chapter.order = Math.max(0, Math.min(100_000, Math.round(Number(patch.order) || 0)));
  chapter.updatedAt = new Date().toISOString();
  project.updatedAt = chapter.updatedAt;
  writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function saveDraft(dataDir, projectId, chapterId, text) {
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  chapter.draftText = validateText(text, '草稿');
  chapter.updatedAt = new Date().toISOString();
  project.updatedAt = chapter.updatedAt;
  writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function persistEditorState(dataDir, projectId, chapterId, state = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('编辑缓冲格式无效。');
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  let chapterChanged = false;
  for (const [key, label, limit] of [['draftText', '草稿', MAX_TEXT_CHARS], ['formalEditText', '正式正文编辑缓冲', MAX_TEXT_CHARS], ['summary', '章节摘要', 20_000]]) {
    if (Object.hasOwn(state, key)) {
      chapter[key] = validateText(state[key], label, limit);
      chapterChanged = true;
    }
  }
  if (Object.hasOwn(state, 'contextSettings')) {
    const incoming = state.contextSettings;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('上下文设置格式无效。');
    const boolKeys = ['characters', 'worldRules', 'places', 'factions', 'outline', 'timeline', 'clues', 'summaries'];
    const contextSettings = { ...project.contextSettings };
    for (const key of boolKeys) if (Object.hasOwn(incoming, key)) contextSettings[key] = incoming[key] !== false;
    contextSettings.recentChapters = Math.max(0, Math.min(5, Number(incoming.recentChapters ?? contextSettings.recentChapters) || 0));
    contextSettings.maxContextChars = Math.max(4_000, Math.min(60_000, Math.round(Number(incoming.maxContextChars ?? contextSettings.maxContextChars) || 24_000)));
    project.contextSettings = contextSettings;
  }
  if (!chapterChanged && !Object.hasOwn(state, 'contextSettings')) return { saved: false };
  const now = new Date().toISOString();
  if (chapterChanged) {
    chapter.updatedAt = now;
    writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  }
  project.updatedAt = now;
  writeJSON(projectFile(dataDir, projectId), project);
  return { saved: true };
}

function createVersion(dataDir, projectId, chapter, body, reason = 'save') {
  if (!body) return null;
  const version = { id: crypto.randomUUID(), projectId, chapterId: chapter.id, reason, body, createdAt: new Date().toISOString() };
  writeJSON(path.join(projectDir(dataDir, projectId), 'versions', chapter.id, `${version.id}.json`), version);
  return version;
}

function saveFinal(dataDir, projectId, chapterId, text, options = {}) {
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  const nextText = validateText(text, '正式正文');
  if (!nextText.trim() && chapter.body.trim() && options.allowEmpty !== true) throw new Error('正式正文不可被空内容覆盖；如确实要清空，请先在界面确认。');
  if (chapter.body !== nextText) createVersion(dataDir, projectId, chapter, chapter.body, options.reason || '保存前自动备份');
  chapter.body = nextText;
  chapter.formalEditText = '';
  chapter.updatedAt = new Date().toISOString();
  project.updatedAt = chapter.updatedAt;
  writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function setChapterArchived(dataDir, projectId, chapterId, archived) {
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  if (archived) chapter.archivedAt = new Date().toISOString();
  else delete chapter.archivedAt;
  chapter.updatedAt = new Date().toISOString();
  project.updatedAt = chapter.updatedAt;
  writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function listVersions(dataDir, projectId, chapterId) {
  const folder = path.join(projectDir(dataDir, projectId), 'versions', id(chapterId));
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => readJSON(path.join(folder, name), null)).filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(version => ({ id: version.id, createdAt: version.createdAt, reason: version.reason, charCount: version.body.length, preview: version.body.replace(/\s+/g, ' ').slice(0, 140) }));
}

function restoreVersion(dataDir, projectId, chapterId, versionId) {
  const project = requireProject(dataDir, projectId);
  const chapter = requireChapter(dataDir, projectId, chapterId);
  const version = readJSON(path.join(projectDir(dataDir, projectId), 'versions', id(chapterId), `${id(versionId)}.json`), null);
  if (!version || version.projectId !== projectId || version.chapterId !== chapterId) throw new Error('找不到正文历史版本。');
  createVersion(dataDir, projectId, chapter, chapter.body, '恢复前自动备份');
  chapter.body = version.body;
  chapter.formalEditText = '';
  chapter.updatedAt = new Date().toISOString();
  project.updatedAt = chapter.updatedAt;
  writeJSON(chapterFile(dataDir, projectId, chapterId), chapter);
  writeJSON(projectFile(dataDir, projectId), project);
  return chapter;
}

function createCandidate(dataDir, projectId, input = {}) {
  requireProject(dataDir, projectId);
  if (input.chapterId) requireChapter(dataDir, projectId, input.chapterId);
  const candidate = {
    id: crypto.randomUUID(),
    projectId,
    chapterId: input.chapterId || '',
    kind: ['write', 'outline', 'analysis', 'summary'].includes(input.kind) ? input.kind : 'write',
    status: ['candidate', 'accepted', 'rejected'].includes(input.status) ? input.status : 'candidate',
    text: validateText(input.text, '模型候选内容'),
    request: String(input.request || '').slice(0, 10_000),
    skillIds: Array.isArray(input.skillIds) ? input.skillIds.map(id).slice(0, 100) : [],
    modelName: String(input.modelName || '').slice(0, 200),
    truncated: input.truncated === true,
    finishReason: String(input.finishReason || '').slice(0, 80),
    createdAt: new Date().toISOString()
  };
  writeJSON(candidateFile(dataDir, projectId, candidate.id), candidate);
  return candidate;
}

function listCandidates(dataDir, projectId, chapterId) {
  requireProject(dataDir, projectId);
  const folder = path.join(projectDir(dataDir, projectId), 'candidates');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => readJSON(path.join(folder, name), null)).filter(Boolean)
    .filter(item => !chapterId || item.chapterId === chapterId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function applyCandidate(dataDir, projectId, candidateId, action, options = {}) {
  const candidate = readJSON(candidateFile(dataDir, projectId, candidateId), null);
  if (!candidate || candidate.projectId !== projectId) throw new Error('找不到候选内容。');
  if (!candidate.chapterId && action !== 'copy') throw new Error('此候选内容未绑定章节，不能写入章节。');
  if (action === 'draft') {
    const chapter = requireChapter(dataDir, projectId, candidate.chapterId);
    if (chapter.draftText.trim() && chapter.draftText !== candidate.text && options.replaceDraft !== true) throw new Error('当前草稿已有内容；请先保存，或明确确认替换。');
    const updated = saveDraft(dataDir, projectId, candidate.chapterId, candidate.text);
    candidate.status = 'accepted';
    candidate.updatedAt = new Date().toISOString();
    writeJSON(candidateFile(dataDir, projectId, candidateId), candidate);
    return { candidate, chapter: updated };
  }
  if (action === 'body') {
    const chapter = saveFinal(dataDir, projectId, candidate.chapterId, candidate.text, { reason: '采纳 AI 候选前自动备份', allowEmpty: options.allowEmpty === true });
    candidate.status = 'accepted';
    candidate.updatedAt = new Date().toISOString();
    writeJSON(candidateFile(dataDir, projectId, candidateId), candidate);
    return { candidate, chapter };
  }
  if (action === 'summary') {
    const chapter = updateChapter(dataDir, projectId, candidate.chapterId, { summary: candidate.text });
    updateCandidateStatus(dataDir, projectId, candidate, 'accepted');
    return { candidate, chapter };
  }
  if (action === 'outline') {
    const project = requireProject(dataDir, projectId);
    const title = candidate.text.split(/\r?\n/).map(line => line.replace(/^#+\s*/, '').trim()).find(Boolean)?.slice(0, 200) || 'AI 大纲建议';
    const record = { id: crypto.randomUUID(), title, goal: candidate.text, status: '建议', sourceCandidateId: candidate.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const updatedProject = updateProject(dataDir, projectId, { outline: [...project.outline, record] });
    updateCandidateStatus(dataDir, projectId, candidate, 'accepted');
    return { candidate, project: updatedProject, record };
  }
  if (action === 'reject') {
    updateCandidateStatus(dataDir, projectId, candidate, 'rejected');
    return { candidate };
  }
  throw new Error('候选操作无效。');
}

function listSkills(dataDir) {
  const folder = path.join(dataDir, 'skills');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(name => name.endsWith('.json')).map(name => readJSON(path.join(folder, name), null)).filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans'));
}

function getSkill(dataDir, skillId) {
  const skill = readJSON(skillFile(dataDir, skillId), null);
  if (!skill) throw new Error('找不到写作 Skill。');
  return skill;
}

function createSkill(dataDir, input = {}) {
  const skills = listSkills(dataDir);
  if (skills.length >= 500) throw new Error('写作 Skill 库最多保存 500 个。');
  const content = validateText(input.content, 'Skill 内容', 500_000).trim();
  if (!content) throw new Error('Skill 内容不能为空。');
  const skill = {
    id: crypto.randomUUID(),
    name: String(input.name || '').trim().slice(0, 200) || '未命名 Skill',
    description: String(input.description || '').trim().slice(0, 2_000),
    content,
    sourceName: String(input.sourceName || '').trim().slice(0, 240),
    enabled: input.enabled !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  writeJSON(skillFile(dataDir, skill.id), skill);
  return skill;
}

function createSkillsBatch(dataDir, inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('没有可导入的写作 Skill。');
  if (inputs.length > 100) throw new Error('一次最多导入 100 个写作 Skill。');
  if (listSkills(dataDir).length + inputs.length > 500) throw new Error('写作 Skill 库最多保存 500 个。');
  const created = [];
  try {
    for (const input of inputs) created.push(createSkill(dataDir, input));
    return created;
  } catch (error) {
    for (const skill of created) {
      try { fs.rmSync(skillFile(dataDir, skill.id), { force: true }); } catch {}
    }
    throw error;
  }
}

function updateSkill(dataDir, skillId, patch = {}) {
  const skill = getSkill(dataDir, skillId);
  if (Object.hasOwn(patch, 'name')) {
    const name = String(patch.name || '').trim().slice(0, 200);
    if (!name) throw new Error('Skill 名称不能为空。');
    skill.name = name;
  }
  if (Object.hasOwn(patch, 'description')) skill.description = String(patch.description || '').slice(0, 2_000);
  if (Object.hasOwn(patch, 'content')) skill.content = validateText(patch.content, 'Skill 内容', 500_000).trim();
  if (Object.hasOwn(patch, 'enabled')) skill.enabled = patch.enabled === true;
  skill.updatedAt = new Date().toISOString();
  writeJSON(skillFile(dataDir, skillId), skill);
  return skill;
}

function bundleForProject(dataDir, projectId) {
  const project = requireProject(dataDir, projectId);
  const chapters = listProjectChapters(dataDir, projectId, { includeArchived: true });
  const skills = project.projectSkillIds.map(skillId => {
    try { return getSkill(dataDir, skillId); } catch { return null; }
  }).filter(Boolean);
  const candidates = listCandidates(dataDir, projectId);
  const versions = [];
  const versionRoot = path.join(projectDir(dataDir, projectId), 'versions');
  if (fs.existsSync(versionRoot)) {
    for (const chapterId of fs.readdirSync(versionRoot)) {
      const folder = path.join(versionRoot, chapterId);
      if (!fs.statSync(folder).isDirectory()) continue;
      for (const file of fs.readdirSync(folder).filter(name => name.endsWith('.json'))) {
        const version = readJSON(path.join(folder, file), null);
        if (version) versions.push(version);
      }
    }
  }
  return { project, chapters, skills, candidates, versions };
}

function loadProject(dataDir, projectId) {
  const bundle = bundleForProject(dataDir, projectId);
  return {
    project: bundle.project,
    chapters: bundle.chapters.filter(chapter => !chapter.archivedAt),
    archivedChapters: bundle.chapters.filter(chapter => chapter.archivedAt),
    skills: listSkills(dataDir),
    candidates: bundle.candidates
  };
}

function exportProject(dataDir, projectId) {
  const bundle = bundleForProject(dataDir, projectId);
  return { format: 'ai-novel-studio-project', version: 1, exportedAt: new Date().toISOString(), ...bundle };
}

function remapChapterReferences(value, chapterMap) {
  if (Array.isArray(value)) return value.map(item => remapChapterReferences(item, chapterMap));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['chapterId', 'linkedChapterId', 'sourceChapterId', 'targetChapterId', 'fromChapterId', 'toChapterId'].includes(key) && typeof item === 'string') result[key] = chapterMap.get(item) || '';
    else if (key === 'chapterIds' && Array.isArray(item)) result[key] = item.map(chapterId => chapterMap.get(chapterId)).filter(Boolean);
    else result[key] = remapChapterReferences(item, chapterMap);
  }
  return result;
}

function importProject(dataDir, payload) {
  if (!payload || payload.format !== 'ai-novel-studio-project' || payload.version !== 1 || !payload.project || typeof payload.project !== 'object' || Array.isArray(payload.project) || !Array.isArray(payload.chapters)) throw new Error('这不是可识别的 AI 小说创作平台备份文件。');
  for (const key of ['skills', 'candidates', 'versions']) if (payload[key] !== undefined && !Array.isArray(payload[key])) throw new Error(`备份中的「${key}」资料格式无效。`);
  if (payload.chapters.length > 10_000 || (payload.skills || []).length > 500 || (payload.candidates || []).length > 50_000 || (payload.versions || []).length > 100_000) throw new Error('备份内容数量超过安全导入上限。');
  const originalProject = payload.project;
  const project = createProject(dataDir, {
    title: `${String(originalProject.title || '导入项目').slice(0, 180)}（导入）`,
    genre: originalProject.genre,
    synopsis: originalProject.synopsis,
    tone: originalProject.tone,
    styleGuide: originalProject.styleGuide
  });
  const importedSkillIds = [];
  try {
    const skillMap = new Map();
    for (const oldSkill of Array.isArray(payload.skills) ? payload.skills : []) {
      if (!oldSkill || typeof oldSkill !== 'object' || typeof oldSkill.id !== 'string') continue;
      const skill = createSkill(dataDir, { ...oldSkill, enabled: oldSkill.enabled !== false });
      skillMap.set(oldSkill.id, skill.id);
      importedSkillIds.push(skill.id);
    }
    const chapterMap = new Map();
    for (const oldChapter of payload.chapters) {
      if (!oldChapter || typeof oldChapter !== 'object' || typeof oldChapter.id !== 'string') continue;
      const created = createChapter(dataDir, project.id, { title: oldChapter.title });
      chapterMap.set(oldChapter.id, created.id);
      const target = requireChapter(dataDir, project.id, created.id);
      target.body = validateText(oldChapter.body || '', '导入章节正文');
      target.draftText = validateText(oldChapter.draftText || '', '导入草稿');
      target.formalEditText = validateText(oldChapter.formalEditText || '', '导入正文编辑缓冲');
      target.summary = validateText(oldChapter.summary || '', '导入章节摘要', 20_000);
      target.notes = validateText(oldChapter.notes || '', '导入章节备注', 50_000);
      target.order = Number(oldChapter.order) || 0;
      if (oldChapter.archivedAt) target.archivedAt = oldChapter.archivedAt;
      writeJSON(chapterFile(dataDir, project.id, created.id), target);
    }
    const arrays = {};
    for (const key of PROJECT_ARRAY_FIELDS) {
      if (key === 'projectSkillIds') arrays[key] = (Array.isArray(originalProject.projectSkillIds) ? originalProject.projectSkillIds : []).map(oldId => skillMap.get(oldId)).filter(Boolean);
      else arrays[key] = remapChapterReferences(Array.isArray(originalProject[key]) ? originalProject[key] : [], chapterMap);
    }
    updateProject(dataDir, project.id, { ...arrays, contextSettings: originalProject.contextSettings || project.contextSettings });
    if (arrays.projectSkillIds.length) setProjectSkills(dataDir, project.id, arrays.projectSkillIds);
    for (const version of Array.isArray(payload.versions) ? payload.versions : []) {
      if (!version || typeof version !== 'object') continue;
      const chapterId = chapterMap.get(version.chapterId);
      if (!chapterId) continue;
      const imported = { ...version, id: crypto.randomUUID(), projectId: project.id, chapterId };
      imported.body = validateText(imported.body || '', '历史版本正文');
      writeJSON(path.join(projectDir(dataDir, project.id), 'versions', chapterId, `${imported.id}.json`), imported);
    }
    for (const candidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
      if (!candidate || typeof candidate !== 'object') continue;
      const chapterId = chapterMap.get(candidate.chapterId) || '';
      const remappedSkills = Array.isArray(candidate.skillIds) ? candidate.skillIds.map(oldId => skillMap.get(oldId)).filter(Boolean) : [];
      createCandidate(dataDir, project.id, { ...candidate, chapterId, skillIds: remappedSkills });
    }
    return loadProject(dataDir, project.id);
  } catch (error) {
    try { fs.rmSync(projectDir(dataDir, project.id), { recursive: true, force: true }); } catch {}
    for (const skillId of importedSkillIds) {
      try { fs.rmSync(skillFile(dataDir, skillId), { force: true }); } catch {}
    }
    throw new Error(`导入失败，临时资料已回滚：${error.message}`);
  }
}

function archiveProject(dataDir, projectId) {
  const project = requireProject(dataDir, projectId);
  const source = projectDir(dataDir, projectId);
  const destination = path.join(dataDir, 'trash', 'projects', `${project.id}-${Date.now()}`);
  project.archivedAt = new Date().toISOString();
  writeJSON(projectFile(dataDir, projectId), project);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(source, destination);
  return { id: project.id, title: project.title, archivedAt: project.archivedAt };
}

function findTrashedProject(dataDir, projectId) {
  const folder = path.join(dataDir, 'trash', 'projects');
  if (!fs.existsSync(folder)) return null;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(folder, entry.name, 'project.json');
    const project = readJSON(file, null);
    if (project?.id === projectId) return { directory: path.dirname(file), project };
  }
  return null;
}

function restoreProject(dataDir, projectId) {
  const idValue = id(projectId);
  if (fs.existsSync(projectFile(dataDir, idValue))) throw new Error('此项目已经存在，不能覆盖恢复。');
  const found = findTrashedProject(dataDir, idValue);
  if (!found) throw new Error('回收区中找不到此项目。');
  delete found.project.archivedAt;
  found.project.updatedAt = new Date().toISOString();
  writeJSON(path.join(found.directory, 'project.json'), found.project);
  fs.renameSync(found.directory, projectDir(dataDir, idValue));
  return loadProject(dataDir, idValue);
}

function listTrash(dataDir) {
  ensureLayout(dataDir);
  const projectsFolder = path.join(dataDir, 'trash', 'projects');
  const projects = fs.readdirSync(projectsFolder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => readJSON(path.join(projectsFolder, entry.name, 'project.json'), null)).filter(Boolean)
    .map(project => ({ id: project.id, title: project.title, archivedAt: project.archivedAt }));
  const chapters = [];
  for (const projectEntry of fs.readdirSync(path.join(dataDir, 'projects'), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    const project = readJSON(path.join(dataDir, 'projects', projectEntry.name, 'project.json'), null);
    if (!project || project.archivedAt) continue;
    for (const chapter of listProjectChapters(dataDir, project.id, { includeArchived: true }).filter(item => item.archivedAt)) chapters.push({ id: chapter.id, projectId: project.id, projectTitle: project.title, title: chapter.title, archivedAt: chapter.archivedAt });
  }
  return { projects, chapters };
}

module.exports = {
  ensureLayout, createProject, listProjects, updateProject, setProjectSkills, createChapter,
  updateChapter, saveDraft, persistEditorState, saveFinal, listProjectChapters, setChapterArchived, listVersions,
  restoreVersion, createCandidate, listCandidates, applyCandidate, listSkills, getSkill, createSkill, createSkillsBatch,
  updateSkill, loadProject, exportProject, importProject, archiveProject, restoreProject, listTrash
};
