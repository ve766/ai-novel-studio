const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SETTINGS_FILE = 'model-settings.json';

function safeId(value) {
  const id = String(value || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('模型配置编号无效。');
  return id;
}

function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try { fs.renameSync(temp, file); }
  catch (error) { try { fs.rmSync(temp, { force: true }); } catch {} throw error; }
}

function defaults() {
  return {
    version: 1,
    activeProfileId: 'ollama-default',
    profiles: [{
      id: 'ollama-default',
      name: 'Ollama 本地模型',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
      temperature: 0.7,
      maxOutputTokens: 4096,
      timeoutSeconds: 180,
      allowNoKey: true
    }]
  };
}

function readSettings(dataRoot) {
  const file = path.join(dataRoot, SETTINGS_FILE);
  if (!fs.existsSync(file)) return defaults();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || !Array.isArray(data.profiles)) throw new Error('模型配置文件格式有误；原文件已保留，请检查设置。');
  const ids = new Set();
  for (const item of data.profiles) {
    safeId(item.id);
    if (ids.has(item.id)) throw new Error('模型配置文件含有重复编号；原文件已保留。');
    ids.add(item.id);
  }
  return { version: 1, activeProfileId: data.activeProfileId || data.profiles[0]?.id || '', profiles: data.profiles };
}

function publicSettings(dataRoot) {
  const data = readSettings(dataRoot);
  return {
    activeProfileId: data.activeProfileId,
    profiles: data.profiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      temperature: profile.temperature,
      maxOutputTokens: profile.maxOutputTokens,
      timeoutSeconds: profile.timeoutSeconds,
      allowNoKey: Boolean(profile.allowNoKey),
      hasApiKey: Boolean(profile.apiKeyCiphertext)
    }))
  };
}

function cleanBaseUrl(value, provider) {
  const input = String(value || '').trim();
  if (provider === 'ollama' && !input) return 'http://localhost:11434';
  let url;
  try { url = new URL(input); }
  catch { throw new Error('请填写完整的 HTTP/HTTPS 模型服务地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型服务地址只支持不含账号密码的 HTTP/HTTPS URL。');
  if (url.search) throw new Error('不要把密钥或参数放在服务地址中；请将 API Key 填入独立密钥栏。');
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function encryptKey(safeStorage, value) {
  if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('系统密钥加密不可用，因此没有保存 API Key。请在可用的系统密钥库中运行，或使用不需要密钥的本地模型。');
  const backend = safeStorage.getSelectedStorageBackend?.();
  if (backend === 'basic_text') throw new Error('系统当前没有安全密钥库（仅基础文本后端），因此 API Key 未保存。请启用系统密钥库后重试。');
  return safeStorage.encryptString(value).toString('base64');
}

function saveSettings(dataRoot, input, safeStorage) {
  if (!input || !Array.isArray(input.profiles)) throw new Error('模型配置内容无效。');
  if (input.profiles.length > 25) throw new Error('最多可保存 25 个模型配置。');
  const old = readSettings(dataRoot);
  const previous = new Map(old.profiles.map(profile => [profile.id, profile]));
  const seen = new Set();
  const profiles = input.profiles.map(profile => {
    const id = safeId(profile.id);
    if (seen.has(id)) throw new Error('模型配置编号重复。');
    seen.add(id);
    const provider = profile.provider === 'ollama' ? 'ollama' : profile.provider === 'openai-compatible' ? 'openai-compatible' : '';
    if (!provider) throw new Error('只支持 Ollama 和 OpenAI 兼容服务。');
    const name = String(profile.name || '').trim().slice(0, 100);
    const model = String(profile.model || '').trim().slice(0, 200);
    if (!name) throw new Error('模型配置名称不能为空。');
    if (!model) throw new Error('模型名称不能为空。');
    const prior = previous.get(id);
    const result = {
      id,
      name,
      provider,
      baseUrl: cleanBaseUrl(profile.baseUrl, provider),
      model,
      temperature: Math.max(0, Math.min(2, Number(profile.temperature) || 0)),
      maxOutputTokens: Math.max(128, Math.min(32768, Math.round(Number(profile.maxOutputTokens) || 4096))),
      timeoutSeconds: Math.max(5, Math.min(600, Math.round(Number(profile.timeoutSeconds) || 180))),
      allowNoKey: provider === 'ollama' || Boolean(profile.allowNoKey)
    };
    if (provider === 'openai-compatible') {
      const enteredKey = String(profile.apiKey || '').trim();
      if (enteredKey.length > 4096) throw new Error('API Key 长度异常。');
      if (enteredKey) result.apiKeyCiphertext = encryptKey(safeStorage, enteredKey);
      else if (prior?.apiKeyCiphertext && !profile.clearApiKey) result.apiKeyCiphertext = prior.apiKeyCiphertext;
      if (!result.apiKeyCiphertext && !result.allowNoKey) throw new Error(`“${name}”需要 API Key；请填写密钥，或明确勾选服务无需密钥。`);
    }
    return result;
  });
  if (!profiles.length) throw new Error('至少保留一个模型配置。');
  const activeProfileId = profiles.some(profile => profile.id === input.activeProfileId) ? input.activeProfileId : profiles[0].id;
  const data = { version: 1, activeProfileId, profiles };
  writeJSON(path.join(dataRoot, SETTINGS_FILE), data);
  return publicSettings(dataRoot);
}

function getInternalProfile(dataRoot, profileId, safeStorage) {
  const data = readSettings(dataRoot);
  const id = safeId(profileId || data.activeProfileId);
  const profile = data.profiles.find(item => item.id === id);
  if (!profile) throw new Error('找不到所选模型配置。');
  const internal = { ...profile };
  if (profile.apiKeyCiphertext) {
    if (!safeStorage?.isEncryptionAvailable?.()) throw new Error('系统密钥加密不可用，无法读取已保存的 API Key。');
    try { internal.apiKey = safeStorage.decryptString(Buffer.from(profile.apiKeyCiphertext, 'base64')); }
    catch { throw new Error('已保存的 API Key 无法解密；请重新输入并保存。'); }
  }
  delete internal.apiKeyCiphertext;
  return internal;
}

module.exports = { defaults, readSettings, publicSettings, saveSettings, getInternalProfile, cleanBaseUrl };
