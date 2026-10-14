function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function endpoint(profile) {
  const base = String(profile.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('请填写模型服务地址。');
  const parsed = new URL(base);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('模型服务地址必须使用 HTTP 或 HTTPS。');
  if (profile.provider === 'ollama') return `${base}/api/chat`;
  return /\/chat\/completions$/i.test(base) ? base : `${base.replace(/\/v1$/i, '')}/v1/chat/completions`;
}

function requestBody(profile, messages, stream) {
  const model = String(profile.model || '').trim();
  if (!model) throw new Error('请填写模型名称。');
  if (profile.provider === 'ollama') {
    return {
      model,
      messages,
      stream,
      options: {
        temperature: clamp(profile.temperature, 0, 2, 0.7),
        num_predict: clamp(profile.maxOutputTokens, 128, 32768, 4096)
      }
    };
  }
  return {
    model,
    messages,
    stream,
    temperature: clamp(profile.temperature, 0, 2, 0.7),
    max_tokens: clamp(profile.maxOutputTokens, 128, 32768, 4096)
  };
}

function messageOf(payload, provider) {
  if (provider === 'ollama') return payload?.message?.content || '';
  const content = payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content ?? '';
  if (Array.isArray(content)) return content.map(part => part?.text || '').join('');
  return typeof content === 'string' ? content : '';
}

function friendlyFailure(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new Error('模型请求超时或已取消。请检查模型是否仍在运行，或调高配置中的超时。');
  if (error?.name === 'TypeError' && /fetch|network|connect|socket/i.test(String(error.message))) {
    return new Error('无法连接到模型服务。请确认服务已启动、地址正确，并检查网络或本地端口。');
  }
  return error instanceof Error ? error : new Error('模型服务返回了无法识别的错误。');
}

async function readError(response) {
  let body = '';
  try { body = await response.text(); } catch {}
  let message = '';
  try {
    const data = JSON.parse(body);
    message = data?.error?.message || data?.error || data?.message || '';
  } catch {
    message = body;
  }
  message = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  return new Error(message ? `模型服务错误（${response.status}）：${message}` : `模型服务错误（HTTP ${response.status}）。请检查地址、模型名称和 API Key。`);
}

function unpackLine(line, provider, onDelta, state) {
  let value = String(line || '').trim();
  if (!value) return;
  if (value.startsWith('data:')) value = value.slice(5).trim();
  if (!value || value === '[DONE]') return;
  let payload;
  try { payload = JSON.parse(value); }
  catch { throw new Error('模型服务返回了格式不正确的数据流。'); }
  const error = payload?.error?.message || payload?.error;
  if (error) throw new Error(`模型服务错误：${String(error).slice(0, 800)}`);
  const delta = messageOf(payload, provider);
  if (delta) {
    state.text += delta;
    onDelta?.(delta);
  }
  const finishReason = payload?.choices?.[0]?.finish_reason || payload?.done_reason || '';
  if (finishReason) state.finishReason = finishReason;
  if (finishReason === 'length' || finishReason === 'max_tokens') state.truncated = true;
}

async function consumeStream(response, provider, onDelta) {
  if (!response.body?.getReader) {
    const payload = await response.json();
    const text = messageOf(payload, provider);
    if (!text) throw new Error('模型返回了空内容；请尝试其他模型或检查请求格式。');
    onDelta?.(text);
    const finishReason = payload?.choices?.[0]?.finish_reason || payload?.done_reason || '';
    return { text, truncated: finishReason === 'length' || finishReason === 'max_tokens', finishReason };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { text: '', truncated: false };
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) unpackLine(line, provider, onDelta, state);
    }
    buffer += decoder.decode();
    if (buffer.trim()) unpackLine(buffer, provider, onDelta, state);
  } catch (error) {
    try { await reader.cancel(); } catch {}
    throw error;
  }
  if (!state.text.trim()) throw new Error('模型返回了空内容；请尝试其他模型或检查请求格式。');
  return state;
}

async function callModel(profile, messages, { timeoutMs, stream = false, onDelta, signal: externalSignal } = {}) {
  if (!profile || !['ollama', 'openai-compatible'].includes(profile.provider)) throw new Error('请选择受支持的模型服务类型。');
  const timeout = clamp(timeoutMs ?? profile.timeoutSeconds * 1000, 5000, 600000, 180000);
  const headers = { 'content-type': 'application/json', 'accept': stream ? 'text/event-stream, application/x-ndjson, application/json' : 'application/json' };
  if (profile.provider !== 'ollama') {
    if (profile.apiKey) headers.authorization = `Bearer ${profile.apiKey}`;
    else if (!profile.allowNoKey) throw new Error('该模型服务需要 API Key，请先在模型设置中填写并保存。');
  }
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(endpoint(profile), {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody(profile, messages, stream)),
      signal: controller.signal
    });
    if (!response.ok) throw await readError(response);
    if (stream) return await consumeStream(response, profile.provider, onDelta);
    const payload = await response.json();
    if (payload?.error) throw new Error(`模型服务错误：${String(payload.error?.message || payload.error).slice(0, 800)}`);
    const text = messageOf(payload, profile.provider).trim();
    if (!text) throw new Error('模型返回了空内容；请尝试其他模型或检查请求格式。');
    const finishReason = payload?.choices?.[0]?.finish_reason || payload?.done_reason || '';
    return { text, truncated: finishReason === 'length' || finishReason === 'max_tokens', finishReason };
  } catch (error) {
    throw friendlyFailure(error, controller.signal);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

async function testModelConnection(profile) {
  const started = Date.now();
  const result = await callModel(profile, [{ role: 'user', content: '请只回复：连接正常' }], { timeoutMs: 15000, stream: false });
  return { ok: true, latencyMs: Date.now() - started, preview: result.text.slice(0, 160), model: profile.model };
}

async function generateText(profile, prompt, onDelta, signal) {
  const result = await callModel(profile, [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ], { stream: true, onDelta, signal });
  return { ...result, model: profile.model, provider: profile.provider };
}

module.exports = { endpoint, requestBody, messageOf, callModel, testModelConnection, generateText };
