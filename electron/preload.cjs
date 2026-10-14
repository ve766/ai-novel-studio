const { contextBridge, ipcRenderer } = require('electron');

const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('novelApp', Object.freeze({
  appVersion: '1.0.0',
  getAppInfo: invoke('app:info'),
  listProjects: invoke('projects:list'),
  createProject: invoke('projects:create'),
  loadProject: invoke('projects:load'),
  updateProject: invoke('projects:update'),
  setProjectSkills: invoke('projects:set-skills'),
  archiveProject: invoke('projects:archive'),
  listTrash: invoke('projects:trash-list'),
  restoreProject: invoke('projects:restore'),
  exportProject: invoke('projects:export'),
  importProject: invoke('projects:import'),
  openDataFolder: invoke('app:open-data-folder'),
  createChapter: invoke('chapters:create'),
  updateChapter: invoke('chapters:update'),
  saveDraft: invoke('chapters:save-draft'),
  persistEditorState: (projectId, chapterId, state) => ipcRenderer.sendSync('chapters:persist-editor-state', projectId, chapterId, state),
  saveFinal: invoke('chapters:save-final'),
  archiveChapter: invoke('chapters:archive'),
  restoreChapter: invoke('chapters:restore'),
  listVersions: invoke('chapters:versions'),
  restoreVersion: invoke('chapters:restore-version'),
  listCandidates: invoke('candidates:list'),
  applyCandidate: invoke('candidates:apply'),
  listSkills: invoke('skills:list'),
  importSkill: invoke('skills:import'),
  importSkillFolder: invoke('skills:import-folder'),
  createSkill: invoke('skills:create'),
  updateSkill: invoke('skills:update'),
  getModels: invoke('models:get'),
  saveModels: invoke('models:save'),
  modelNeedsConsent: invoke('models:needs-consent'),
  testModel: invoke('models:test'),
  previewPrompt: invoke('prompts:preview'),
  generate: invoke('generation:run'),
  cancelGeneration: invoke('generation:cancel'),
  onGenerationDelta(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('generation:delta', listener);
    return () => ipcRenderer.removeListener('generation:delta', listener);
  }
}));
