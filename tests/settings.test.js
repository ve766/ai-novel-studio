import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const settings = require('../electron/settings.cjs');
let dataDir;
const safeStorage = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'test-keychain',
  encryptString: value => Buffer.from(`sealed:${value}`),
  decryptString: value => String(value).replace(/^sealed:/, '')
};

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-novel-settings-'));
});

afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('model settings and secret storage', () => {
  it('stores API keys only as encrypted data and omits them from renderer settings', () => {
    const result = settings.saveSettings(dataDir, {
      activeProfileId: 'cloud-test',
      profiles: [{
        id: 'cloud-test', name: '兼容接口测试', provider: 'openai-compatible',
        baseUrl: 'https://models.example.test/v1', model: 'fiction-model',
        temperature: 0.6, maxOutputTokens: 2048, timeoutSeconds: 45,
        allowNoKey: false, apiKey: 'never-store-plaintext-test'
      }]
    }, safeStorage);
    const raw = fs.readFileSync(path.join(dataDir, 'model-settings.json'), 'utf8');
    const internal = settings.getInternalProfile(dataDir, 'cloud-test', safeStorage);

    expect(result.profiles[0].hasApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain('never-store-plaintext-test');
    expect(raw).not.toContain('never-store-plaintext-test');
    expect(Buffer.from(JSON.parse(raw).profiles[0].apiKeyCiphertext, 'base64').toString()).toBe('sealed:never-store-plaintext-test');
    expect(internal.apiKey).toBe('never-store-plaintext-test');
  });

  it('preserves a saved key when profile settings are edited without re-entering it', () => {
    settings.saveSettings(dataDir, {
      activeProfileId: 'cloud-test',
      profiles: [{ id: 'cloud-test', name: '接口', provider: 'openai-compatible', baseUrl: 'https://models.example.test/v1', model: 'model', allowNoKey: false, apiKey: 'key-value' }]
    }, safeStorage);
    settings.saveSettings(dataDir, {
      activeProfileId: 'cloud-test',
      profiles: [{ id: 'cloud-test', name: '更新名称', provider: 'openai-compatible', baseUrl: 'https://models.example.test/v1', model: 'model', allowNoKey: false, apiKey: '', hasApiKey: true }]
    }, safeStorage);

    expect(settings.getInternalProfile(dataDir, 'cloud-test', safeStorage).apiKey).toBe('key-value');
  });

  it('rejects insecure plaintext fallback and ambiguous URL credentials', () => {
    const noEncryption = { ...safeStorage, getSelectedStorageBackend: () => 'basic_text' };
    expect(() => settings.saveSettings(dataDir, {
      profiles: [{ id: 'cloud-test', name: '接口', provider: 'openai-compatible', baseUrl: 'https://models.example.test/v1', model: 'model', allowNoKey: false, apiKey: 'secret' }]
    }, noEncryption)).toThrow(/没有安全密钥库/);
    expect(() => settings.cleanBaseUrl('https://user:password@example.test/v1', 'openai-compatible')).toThrow(/不含账号密码/);
    expect(() => settings.cleanBaseUrl('https://example.test/v1?key=secret', 'openai-compatible')).toThrow(/不要把密钥或参数放在服务地址/);
    expect(fs.existsSync(path.join(dataDir, 'model-settings.json'))).toBe(false);
  });
});
