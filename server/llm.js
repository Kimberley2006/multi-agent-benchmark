/** 极简 OpenAI 兼容 Chat Completions 客户端（零依赖）。密钥仅存在服务端。 */

export function createLLM(cfg) {
  const { baseUrl, apiKey, model, temperature, maxTokens, timeoutMs } = cfg;

  async function chat(messages, opts = {}) {
    if (!apiKey) {
      const err = new Error('未配置模型 API Key（server/data/config.json → llm.apiKey 或 TRACELAB_LLM_API_KEY）');
      err.code = 'NO_KEY';
      throw err;
    }
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions';
    const body = {
      model: opts.model || model,
      messages,
      temperature: opts.temperature ?? temperature,
      max_tokens: opts.maxTokens ?? maxTokens,
      stream: false,
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timer);
    }
  }

  /** 要求模型输出 JSON 并稳健解析（容忍 ```json 包裹与尾随文本）。 */
  async function chatJSON(messages, opts = {}) {
    const raw = await chat(messages, { ...opts, json: true });
    return parseJSONLoose(raw);
  }

  return { chat, chatJSON, configured: Boolean(apiKey) };
}

export function parseJSONLoose(raw) {
  if (raw == null) throw new Error('LLM 返回为空');
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  try { return JSON.parse(text); } catch { /* continue */ }
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch { /* fallthrough */ }
  }
  const fa = text.indexOf('['), la = text.lastIndexOf(']');
  if (fa >= 0 && la > fa) {
    try { return JSON.parse(text.slice(fa, la + 1)); } catch { /* fallthrough */ }
  }
  throw new Error('LLM 未返回可解析的 JSON');
}
