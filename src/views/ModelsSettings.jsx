import { useEffect, useState } from 'react';
import { AlertCircle, Check, Cloud, Eye, EyeOff, Fingerprint, FlaskConical, KeyRound, Laptop, LoaderCircle, Plus, Server, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { Button, ConfirmDialog, Field, IconButton, Input, Modal, Pill, SectionHeading, Select, Toggle } from '../components.jsx';

const api = window.novelApp;

function freshProfile() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `model-${Date.now()}`,
    name: '新模型配置',
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: '',
    temperature: 0.7,
    maxOutputTokens: 4096,
    timeoutSeconds: 180,
    allowNoKey: true,
    apiKey: '',
    clearApiKey: false,
    hasApiKey: false
  };
}

function ProfileEditor({ open, profile, onClose, onSave, saving }) {
  const [form, setForm] = useState(freshProfile);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (open) setForm(profile ? { ...profile, apiKey: '', clearApiKey: false } : freshProfile());
    setShowKey(false);
  }, [open, profile?.id]);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const cloud = form.provider === 'openai-compatible';
  return <Modal open={open} onClose={onClose} title={profile ? '编辑模型配置' : '添加模型配置'} eyebrow="MODEL CONNECTION" width="wide" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button onClick={() => onSave(form)} disabled={saving || !form.name.trim() || !form.model.trim() || !form.baseUrl.trim()}>{saving ? '保存中…' : '保存模型配置'}</Button></>}>
    <div className="form-grid model-form-grid">
      <Field label="配置名称"><Input value={form.name} onChange={set('name')} maxLength={100} placeholder="例如：本机 Qwen" /></Field>
      <Field label="服务类型"><Select value={form.provider} onChange={set('provider')}><option value="ollama">Ollama（本机）</option><option value="openai-compatible">OpenAI 兼容接口</option></Select></Field>
      <Field label="服务地址" className="field-span-2" hint={cloud ? '可填服务商地址或本地兼容服务，例如 http://localhost:1234/v1。' : '填写 Ollama 服务根地址；默认 http://localhost:11434。'}><Input value={form.baseUrl} onChange={set('baseUrl')} spellCheck="false" placeholder={cloud ? 'https://api.example.com/v1' : 'http://localhost:11434'} /></Field>
      <Field label="模型名称" className="field-span-2" hint="按所选服务端已配置的名称填写；平台不会下载模型。"><Input value={form.model} onChange={set('model')} spellCheck="false" placeholder={cloud ? '填写服务端支持的模型名称' : '例如：qwen3:8b'} /></Field>
      {cloud && <Field label="API Key" className="field-span-2" hint={form.hasApiKey && !form.clearApiKey ? '已保存加密密钥；留空会保留现有密钥。' : '密钥只在主进程中加密保存，不会发送到界面或写入日志。'}>
        <div className="secret-input-wrap"><Input type={showKey ? 'text' : 'password'} autoComplete="new-password" value={form.apiKey} onChange={set('apiKey')} placeholder={form.hasApiKey && !form.clearApiKey ? '已保存 · 留空保留' : '粘贴 API Key'} maxLength={4096} /><IconButton label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(value => !value)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</IconButton></div>
        {form.hasApiKey && <button type="button" className="remove-secret" onClick={() => setForm(current => ({ ...current, apiKey: '', clearApiKey: !current.clearApiKey }))}>{form.clearApiKey ? '保留已保存密钥' : '移除此配置的已保存密钥'}</button>}
      </Field>}
      {cloud && <div className="field-span-2"><Toggle checked={Boolean(form.allowNoKey)} onChange={value => setForm(current => ({ ...current, allowNoKey: value }))} label="此服务不需要 API Key" hint="只对明确不需要密钥的本地兼容服务开启；云端服务一般需要密钥。" /></div>}
      <Field label={`温度：${Number(form.temperature).toFixed(1)}`}><input className="range-control" type="range" min="0" max="2" step="0.1" value={form.temperature} onChange={set('temperature')} /></Field>
      <Field label="输出上限（tokens）"><Input type="number" min="128" max="32768" step="256" value={form.maxOutputTokens} onChange={set('maxOutputTokens')} /></Field>
      <Field label="超时（秒）"><Input type="number" min="5" max="600" step="5" value={form.timeoutSeconds} onChange={set('timeoutSeconds')} /></Field>
    </div>
    <div className="model-form-safety"><ShieldCheck size={15} /><span>模型 API Key 会使用操作系统安全存储加密。没有系统密钥库时，平台会拒绝保存密钥，而不是降级为明文。</span></div>
  </Modal>;
}

function ModelTransferConfirm({ profile, onClose, onConfirm }) {
  return <ConfirmDialog open={Boolean(profile)} title="确认连接外部模型？" confirmText="仅测试一次" onClose={onClose} onConfirm={onConfirm}>
    <div className="transfer-warning"><div className="transfer-icon"><Cloud size={18} /></div><p>测试请求会发送到 <b>{profile?.name}</b>（<code>{profile?.baseUrl}</code>），只包含一条简短的连接测试文字，不会发送小说资料。</p><small>后续创作任务仍会在每次调用前单独询问。</small></div>
  </ConfirmDialog>;
}

export function ModelsSettings({ models, setModels, onNotice }) {
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState('');
  const [testResults, setTestResults] = useState({});
  const [pendingTest, setPendingTest] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => { api.getAppInfo?.().then(setAppInfo).catch(() => {}); }, []);

  const profiles = models?.profiles || [];
  const activeId = models?.activeProfileId || profiles[0]?.id || '';
  const saveProfiles = async (nextProfiles, nextActiveId = activeId) => {
    setSaving(true);
    try {
      const saved = await api.saveModels({ profiles: nextProfiles, activeProfileId: nextActiveId });
      setModels(saved);
      return saved;
    } finally { setSaving(false); }
  };
  const saveProfile = async form => {
    const exists = profiles.some(item => item.id === form.id);
    const next = exists ? profiles.map(item => item.id === form.id ? { ...item, ...form } : item) : [...profiles, form];
    const nextActiveId = activeId || form.id;
    try { await saveProfiles(next, nextActiveId); setEditor(null); onNotice(exists ? '模型配置已更新。' : '模型配置已添加。', 'success'); }
    catch (error) { onNotice(error.message || '无法保存模型配置。', 'error'); }
  };
  const setActive = async id => {
    if (id === activeId) return;
    try { await saveProfiles(profiles, id); onNotice('默认模型已切换。', 'success'); }
    catch (error) { onNotice(error.message || '无法切换默认模型。', 'error'); }
  };
  const removeProfile = async () => {
    if (!removeTarget) return;
    if (profiles.length <= 1) { onNotice('至少保留一个模型配置。', 'error'); setRemoveTarget(null); return; }
    const next = profiles.filter(item => item.id !== removeTarget.id);
    const nextActiveId = activeId === removeTarget.id ? next[0].id : activeId;
    try { await saveProfiles(next, nextActiveId); setRemoveTarget(null); onNotice('模型配置已移除。', 'success'); }
    catch (error) { onNotice(error.message || '无法移除模型配置。', 'error'); }
  };
  const runTest = async (profileId, confirmed) => {
    setPendingTest(null);
    setTestingId(profileId);
    setTestResults(current => ({ ...current, [profileId]: null }));
    try {
      const result = await api.testModel(profileId, confirmed);
      setTestResults(current => ({ ...current, [profileId]: { ok: true, text: `连接正常 · ${result.latencyMs} ms · ${result.preview}` } }));
    } catch (error) { setTestResults(current => ({ ...current, [profileId]: { ok: false, text: error.message || '模型连接失败。' } })); }
    finally { setTestingId(''); }
  };
  const testProfile = async profile => {
    try {
      if (await api.modelNeedsConsent(profile.id)) setPendingTest(profile);
      else await runTest(profile.id, false);
    } catch (error) { setTestResults(current => ({ ...current, [profile.id]: { ok: false, text: error.message || '无法检查模型地址。' } })); }
  };

  return <div className="models-page">
    <SectionHeading kicker="MODEL CONNECTIONS" title="模型设置" description="自由配置 Ollama 或 OpenAI 兼容服务。切换模型不会改动小说项目、Skill 或已保存的正文。" action={<Button onClick={() => setEditor({ ...freshProfile(), name: '新模型配置' })}><Plus size={16} /> 添加模型</Button>} />
    <div className="model-callout"><span className="model-callout-icon"><Laptop size={17} /></span><div><b>默认使用本机 Ollama，不会自动下载模型</b><p>默认地址为 <code>http://localhost:11434</code>。填写你本机已运行的 Ollama 模型名称即可。云端或局域网地址只有在你主动测试或生成并确认后才会收到请求。</p></div></div>
    <div className="model-profile-list">{profiles.map(profile => {
      const isActive = profile.id === activeId;
      const result = testResults[profile.id];
      return <article className={`model-profile-card ${isActive ? 'model-profile-active' : ''}`} key={profile.id}>
        <div className="model-profile-icon">{profile.provider === 'ollama' ? <Laptop size={17} /> : <Cloud size={17} />}</div>
        <div className="model-profile-main"><div className="model-profile-title"><h3>{profile.name}</h3>{isActive && <Pill tone="sage"><Check size={11} />默认模型</Pill>}{profile.provider === 'ollama' ? <Pill tone="neutral">本机 Ollama</Pill> : <Pill tone="gold">OpenAI 兼容</Pill>}</div><div className="model-profile-meta"><span><Server size={12} /><code>{profile.model}</code></span><span className="model-profile-url" title={profile.baseUrl}><Wifi size={12} /><code>{profile.baseUrl}</code></span>{profile.hasApiKey && <span><KeyRound size={12} />密钥已加密</span>}</div>{result && <div className={`model-test-result ${result.ok ? 'test-ok' : 'test-error'}`}>{result.ok ? <Check size={13} /> : <AlertCircle size={13} />}{result.text}</div>}</div>
        <div className="model-profile-actions"><Button size="sm" variant="secondary" onClick={() => testProfile(profile)} disabled={Boolean(testingId)}>{testingId === profile.id ? <LoaderCircle size={14} className="spin" /> : <FlaskConical size={14} />}测试</Button><Button size="sm" variant={isActive ? 'ghost' : 'secondary'} onClick={() => setActive(profile.id)} disabled={saving || isActive}>{isActive ? '当前使用' : '设为默认'}</Button><IconButton label="编辑配置" onClick={() => setEditor(profile)}><Fingerprint size={15} /></IconButton><IconButton label="删除配置" className="icon-danger" onClick={() => setRemoveTarget(profile)}><Trash2 size={15} /></IconButton></div>
      </article>;
    })}</div>
    {!profiles.length && <div className="models-empty"><Server size={23} /><b>还没有模型配置</b><span>添加本机 Ollama 或兼容服务后开始写作。</span><Button onClick={() => setEditor(freshProfile())}><Plus size={15} />添加模型</Button></div>}
    <div className="model-help-grid"><article><span><Laptop size={15} /></span><h3>本机 Ollama</h3><p>填写本机 Ollama 服务地址和已存在的模型名。测试按钮只发送一条连接测试文字，不会下载模型。</p></article><article><span><Cloud size={15} /></span><h3>兼容服务</h3><p>可连接本地兼容服务或外部 API。外部地址每次使用前都会显示数据发送确认。</p></article><article><span><ShieldCheck size={15} /></span><h3>密钥保护</h3><p>API Key 只在桌面主进程中处理，使用系统安全存储加密；不会出现在导出的小说备份里。</p></article></div>
    <div className="model-active-foot"><span className="status-dot" />本机资料目录：<b>{appInfo?.dataPath || '启动后自动选择本机资料目录'}</b>{appInfo?.usesFDrive ? <Pill tone="sage">F 盘</Pill> : null}</div>
    <ProfileEditor open={Boolean(editor)} profile={editor?.id && profiles.some(item => item.id === editor.id) ? editor : null} onClose={() => setEditor(null)} onSave={saveProfile} saving={saving} />
    <ModelTransferConfirm profile={pendingTest} onClose={() => setPendingTest(null)} onConfirm={() => runTest(pendingTest.id, true)} />
    <ConfirmDialog open={Boolean(removeTarget)} title="移除模型配置？" confirmText="移除配置" destructive onClose={() => setRemoveTarget(null)} onConfirm={removeProfile}><p>“{removeTarget?.name}”会从配置列表中移除。项目资料、Skill 和章节正文不受影响。</p></ConfirmDialog>
  </div>;
}
