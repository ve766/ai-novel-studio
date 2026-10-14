const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const store = require('./store.cjs');
const settings = require('./settings.cjs');
const { buildPrompt, parseSkillMarkdown } = require('./prompt.cjs');
const { generateText, testModelConnection } = require('./model.cjs');

app.setName('AI 小说创作平台');

let mainWindow;
let cachedDataRoot;
const activeGenerations = new Map();
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

function dataRoot() {
  if (cachedDataRoot) return cachedDataRoot;
  if (process.platform === 'win32' && fs.existsSync('F:' + path.sep)) {
    const preferred = 'F:' + path.sep + path.join('ai小说', 'data');
    try {
      store.ensureLayout(preferred);
      cachedDataRoot = preferred;
      return cachedDataRoot;
    } catch {}
  }
  const fallback = path.join(app.getPath('userData'), 'library');
  store.ensureLayout(fallback);
  cachedDataRoot = fallback;
  return cachedDataRoot;
}

function currentWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function requireId(value, label = '编号') {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error(`${label}无效。`);
  return id;
}

function validateRequestText(value, label, max = 20_000, required = false) {
  const text = String(value ?? '');
  if (text.length > max) throw new Error(`${label}不能超过 ${max.toLocaleString()} 字符。`);
  if (required && !text.trim()) throw new Error(`${label}不能为空。`);
  return text;
}

function contextOptions(project, input) {
  const base = project.contextSettings || {};
  const source = input && typeof input === 'object' ? input : base;
  return {
    characters: source.characters !== false,
    worldRules: source.worldRules !== false,
    places: source.places !== false,
    factions: source.factions !== false,
    outline: source.outline !== false,
    timeline: source.timeline !== false,
    clues: source.clues !== false,
    summaries: source.summaries !== false,
    recentChapters: Math.max(0, Math.min(5, Math.round(Number(source.recentChapters) || 0))),
    maxContextChars: Math.max(4_000, Math.min(60_000, Math.round(Number(source.maxContextChars) || 24_000)))
  };
}

function collectSkillFiles(folderPath) {
  const root = fs.realpathSync(folderPath);
  if (!fs.statSync(root).isDirectory()) throw new Error('请选择 Skill 文件夹。');
  const skippedFolders = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.venv', '__pycache__', 'target']);
  const walk = skillOnly => {
    const found = [];
    const visit = (directory, depth) => {
      if (depth > 7 || found.length > 100) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!skippedFolders.has(entry.name.toLowerCase())) visit(file, depth + 1);
        } else if (entry.isFile() && (skillOnly ? entry.name.toLowerCase() === 'skill.md' : /\.(md|markdown)$/i.test(entry.name))) {
          found.push(file);
          if (found.length > 100) return;
        }
      }
    };
    visit(root, 0);
    return found;
  };
  let files = walk(true);
  if (!files.length) files = walk(false);
  if (!files.length) throw new Error('文件夹中没有找到 SKILL.md 或 Markdown 文件。');
  if (files.length > 100) throw new Error('一次最多导入 100 个 Skill，请分批选择文件夹。');
  let totalBytes = 0;
  const skills = files.map(filename => {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > 512_000) throw new Error(`Skill 文件超过 500 KB 或无效：${path.relative(root, filename)}`);
    totalBytes += stat.size;
    if (totalBytes > 20 * 1024 * 1024) throw new Error('Skill 文件夹合计超过 20 MB，请分批导入。');
    try {
      const parsed = parseSkillMarkdown(fs.readFileSync(filename, 'utf8'), path.basename(filename));
      return { ...parsed, sourceName: path.relative(root, filename).split(path.sep).join('/') };
    } catch (error) {
      throw new Error(`无法读取 ${path.relative(root, filename)}：${error.message}`);
    }
  });
  return skills;
}

function composePrompt(payload = {}) {
  const projectId = requireId(payload.projectId, '项目编号');
  const chapterId = requireId(payload.chapterId, '章节编号');
  const bundle = store.loadProject(dataRoot(), projectId);
  const chapter = bundle.chapters.find(item => item.id === chapterId);
  if (!chapter) throw new Error('找不到所选章节。');
  const selectedSkillIds = Array.isArray(payload.selectedSkillIds) ? [...new Set(payload.selectedSkillIds.map(id => requireId(id, 'Skill 编号')))] : [];
  if (selectedSkillIds.length > 30) throw new Error('一次最多启用 30 个写作 Skill。');
  const linked = new Set(bundle.project.projectSkillIds || []);
  const skillMap = new Map(bundle.skills.map(skill => [skill.id, skill]));
  const skills = selectedSkillIds.map(id => {
    if (!linked.has(id)) throw new Error('该 Skill 未关联到当前项目，请先在项目 Skill 库中添加。');
    const skill = skillMap.get(id);
    if (!skill || !skill.enabled) throw new Error('某个已选 Skill 已停用，请取消选择或重新启用。');
    return skill;
  });
  const previousChapters = bundle.chapters
    .filter(item => !item.archivedAt && item.order < chapter.order)
    .map(item => ({ ...item, finalText: item.body }));
  const prompt = buildPrompt({
    project: bundle.project,
    chapter,
    chapters: previousChapters,
    task: payload.task,
    request: validateRequestText(payload.request, '本次要求', 20_000, true),
    selectedText: validateRequestText(payload.selectedText, '待改写片段', 80_000),
    skills,
    contextOptions: contextOptions(bundle.project, payload.contextOptions)
  });
  return { prompt, projectId, chapterId, selectedSkillIds };
}

function needsTransferConsent(profile) {
  try {
    const host = new URL(profile.baseUrl).hostname.toLowerCase();
    const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '[::1]' || host === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(host);
    return !loopback;
  } catch {
    return true;
  }
}

function publicModelSettings() {
  return settings.publicSettings(dataRoot());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1510,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: 'AI 小说创作平台',
    backgroundColor: '#f3f1ea',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function registerHandlers() {
  const root = dataRoot();
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, dataPath: root, usesFDrive: process.platform === 'win32' && path.parse(root).root.toLowerCase() === 'f:' + path.sep.toLowerCase() }));
  ipcMain.handle('app:open-data-folder', async () => {
    const error = await shell.openPath(root);
    if (error) throw new Error(`无法打开本地资料目录：${error}`);
    return { opened: true };
  });


  ipcMain.handle('projects:list', () => store.listProjects(root));
  ipcMain.handle('projects:create', (_event, input) => store.createProject(root, input));
  ipcMain.handle('projects:load', (_event, projectId) => store.loadProject(root, projectId));
  ipcMain.handle('projects:update', (_event, projectId, patch) => store.updateProject(root, requireId(projectId, '项目编号'), patch));
  ipcMain.handle('projects:set-skills', (_event, projectId, skillIds) => store.setProjectSkills(root, requireId(projectId, '项目编号'), skillIds));
  ipcMain.handle('projects:archive', (_event, projectId) => store.archiveProject(root, requireId(projectId, '项目编号')));
  ipcMain.handle('projects:trash-list', () => store.listTrash(root));
  ipcMain.handle('projects:restore', (_event, projectId) => store.restoreProject(root, requireId(projectId, '项目编号')));

  ipcMain.handle('projects:export', async (_event, projectId) => {
    const project = store.loadProject(root, requireId(projectId, '项目编号')).project;
    const chosen = await dialog.showSaveDialog(currentWindow(), {
      title: '导出小说项目备份',
      defaultPath: `${project.title.replace(/[\\/:*?"<>|]/g, '_')}.ainovel`,
      filters: [{ name: 'AI 小说项目备份', extensions: ['ainovel', 'json'] }]
    });
    if (chosen.canceled || !chosen.filePath) return { canceled: true };
    const payload = store.exportProject(root, projectId);
    const temporary = `${chosen.filePath}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try { fs.renameSync(temporary, chosen.filePath); }
    catch (error) { try { fs.rmSync(temporary, { force: true }); } catch {} throw error; }
    return { canceled: false, filePath: chosen.filePath };
  });

  ipcMain.handle('projects:import', async () => {
    const chosen = await dialog.showOpenDialog(currentWindow(), {
      title: '导入小说项目备份',
      properties: ['openFile'],
      filters: [{ name: 'AI 小说项目备份', extensions: ['ainovel', 'json'] }]
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { canceled: true };
    const file = chosen.filePaths[0];
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_IMPORT_BYTES) throw new Error('备份文件无效或超过 100 MB。');
    let payload;
    try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('备份文件不是有效的 JSON；原有项目未更改。'); }
    return { canceled: false, project: store.importProject(root, payload) };
  });

  ipcMain.handle('chapters:create', (_event, projectId, input) => store.createChapter(root, requireId(projectId, '项目编号'), input));
  ipcMain.handle('chapters:update', (_event, projectId, chapterId, patch) => store.updateChapter(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), patch));
  ipcMain.handle('chapters:save-draft', (_event, projectId, chapterId, text) => store.saveDraft(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), text));
  ipcMain.on('chapters:persist-editor-state', (event, projectId, chapterId, state) => {
    try {
      const result = store.persistEditorState(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), state);
      event.returnValue = { ok: true, saved: result.saved };
    } catch (error) {
      event.returnValue = { ok: false, error: error.message || '编辑缓冲保存失败。' };
    }
  });
  ipcMain.handle('chapters:save-final', (_event, projectId, chapterId, text, options) => store.saveFinal(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), text, options));
  ipcMain.handle('chapters:archive', (_event, projectId, chapterId) => store.setChapterArchived(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), true));
  ipcMain.handle('chapters:restore', (_event, projectId, chapterId) => store.setChapterArchived(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), false));
  ipcMain.handle('chapters:versions', (_event, projectId, chapterId) => store.listVersions(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号')));
  ipcMain.handle('chapters:restore-version', (_event, projectId, chapterId, versionId) => store.restoreVersion(root, requireId(projectId, '项目编号'), requireId(chapterId, '章节编号'), requireId(versionId, '版本编号')));

  ipcMain.handle('candidates:list', (_event, projectId, chapterId) => store.listCandidates(root, requireId(projectId, '项目编号'), chapterId ? requireId(chapterId, '章节编号') : undefined));
  ipcMain.handle('candidates:apply', (_event, projectId, candidateId, action, options) => store.applyCandidate(root, requireId(projectId, '项目编号'), requireId(candidateId, '候选编号'), action, options));

  ipcMain.handle('skills:list', () => store.listSkills(root));
  ipcMain.handle('skills:import', async () => {
    const chosen = await dialog.showOpenDialog(currentWindow(), {
      title: '导入写作 Skill',
      properties: ['openFile'],
      filters: [{ name: 'Skill / Markdown 文件', extensions: ['md', 'markdown', 'txt'] }]
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { canceled: true };
    const filename = chosen.filePaths[0];
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > 512_000) throw new Error('Skill 文件无效或超过 500 KB。');
    const parsed = parseSkillMarkdown(fs.readFileSync(filename, 'utf8'), path.basename(filename));
    return { canceled: false, skill: store.createSkill(root, { ...parsed, sourceName: path.basename(filename) }) };
  });
  ipcMain.handle('skills:create', (_event, input) => store.createSkill(root, input));
  ipcMain.handle('skills:import-folder', async () => {
    const chosen = await dialog.showOpenDialog(currentWindow(), {
      title: '导入 Skill 文件夹',
      properties: ['openDirectory']
    });
    if (chosen.canceled || !chosen.filePaths[0]) return { canceled: true };
    const inputs = collectSkillFiles(chosen.filePaths[0]);
    const skills = store.createSkillsBatch(root, inputs);
    return { canceled: false, skills };
  });

  ipcMain.handle('skills:update', (_event, skillId, patch) => store.updateSkill(root, requireId(skillId, 'Skill 编号'), patch));

  ipcMain.handle('models:get', () => publicModelSettings());
  ipcMain.handle('models:save', (_event, input) => settings.saveSettings(root, input, safeStorage));
  ipcMain.handle('models:needs-consent', (_event, profileId) => needsTransferConsent(settings.getInternalProfile(root, profileId, safeStorage)));
  ipcMain.handle('models:test', async (_event, profileId, confirmedDataTransfer) => {
    const profile = settings.getInternalProfile(root, profileId, safeStorage);
    if (needsTransferConsent(profile) && confirmedDataTransfer !== true) throw new Error('连接位于本机之外；请先确认测试内容会发送到该服务。');
    return testModelConnection(profile);
  });

  ipcMain.handle('prompts:preview', (_event, payload) => {
    const result = composePrompt(payload);
    return { ...result.prompt, skillNames: result.prompt.skillNames, projectId: result.projectId, chapterId: result.chapterId };
  });

  ipcMain.handle('generation:cancel', (_event, requestId) => {
    const id = requireId(requestId, '生成任务编号');
    const controller = activeGenerations.get(id);
    if (!controller) return false;
    controller.abort();
    return true;
  });

  ipcMain.handle('generation:run', async (_event, payload = {}) => {
    const requestId = requireId(payload.requestId, '生成任务编号');
    if (activeGenerations.has(requestId)) throw new Error('该生成任务正在运行。');
    const composed = composePrompt(payload);
    const profileId = requireId(payload.profileId, '模型配置编号');
    const profile = settings.getInternalProfile(root, profileId, safeStorage);
    if (needsTransferConsent(profile) && payload.confirmedDataTransfer !== true) throw new Error('所选模型服务位于本机之外；请先确认本次创作资料会发送到该服务。');
    const controller = new AbortController();
    activeGenerations.set(requestId, controller);
    try {
      const result = await generateText(profile, composed.prompt, delta => {
        const window = currentWindow();
        if (window) window.webContents.send('generation:delta', { requestId, delta });
      }, controller.signal);
      const candidate = store.createCandidate(root, composed.projectId, {
        chapterId: composed.chapterId,
        kind: composed.prompt.task === 'continue' || composed.prompt.task === 'rewrite' ? 'write' : composed.prompt.task,
        text: result.text,
        request: validateRequestText(payload.request, '本次要求', 20_000, true),
        skillIds: composed.selectedSkillIds,
        modelName: `${profile.name} / ${result.model}`,
        truncated: result.truncated,
        finishReason: result.finishReason
      });
      return { candidate, promptMeta: { warnings: composed.prompt.warnings, contextIncluded: composed.prompt.contextIncluded, estimatedTokens: composed.prompt.estimatedTokens } };
    } finally {
      activeGenerations.delete(requestId);
    }
  });
}

app.whenReady().then(() => {
  dataRoot();
  registerHandlers();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const controller of activeGenerations.values()) controller.abort();
  if (process.platform !== 'darwin') app.quit();
});
