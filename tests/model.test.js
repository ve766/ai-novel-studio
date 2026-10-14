import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { endpoint, requestBody, callModel, generateText } = require('../electron/model.cjs');

afterEach(() => vi.unstubAllGlobals());

const localProfile = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  temperature: 0.7,
  maxOutputTokens: 2048,
  timeoutSeconds: 5,
  allowNoKey: true
};

function streamResponse(lines) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('model adapter', () => {
  it('builds native Ollama and OpenAI-compatible endpoints and bodies', () => {
    expect(endpoint(localProfile)).toBe('http://localhost:11434/api/chat');
    expect(endpoint({ ...localProfile, provider: 'openai-compatible', baseUrl: 'https://example.test/v1' })).toBe('https://example.test/v1/chat/completions');
    expect(requestBody(localProfile, [{ role: 'user', content: 'test' }], true)).toMatchObject({ model: 'qwen3:8b', stream: true, options: { num_predict: 2048 } });
  });

  it('streams generated text, reports truncation and keeps deltas in order', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"风从"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"海面吹来"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n'
    ];
    vi.stubGlobal('fetch', vi.fn(async () => streamResponse(chunks)));
    const deltas = [];
    const result = await generateText({ ...localProfile, provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', allowNoKey: true }, {
      system: '保持视角连续。', user: '写下一段。'
    }, delta => deltas.push(delta));

    expect(result.text).toBe('风从海面吹来');
    expect(result.truncated).toBe(true);
    expect(result.finishReason).toBe('length');
    expect(deltas).toEqual(['风从', '海面吹来']);
  });

  it('rejects empty, malformed and failed responses with actionable errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":{"content":""}}', { status: 200, headers: { 'content-type': 'application/json' } })));
    await expect(callModel(localProfile, [{ role: 'user', content: 'test' }], { stream: false })).rejects.toThrow(/空内容/);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"model not found"}}', { status: 404, headers: { 'content-type': 'application/json' } })));
    await expect(callModel(localProfile, [{ role: 'user', content: 'test' }], { stream: false })).rejects.toThrow(/404.*model not found/);
  });

  it('honors caller cancellation without invoking external services', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response('{}');
    }));

    await expect(callModel(localProfile, [{ role: 'user', content: 'test' }], { signal: controller.signal })).rejects.toThrow(/已取消/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toContain('localhost');
  });
});
