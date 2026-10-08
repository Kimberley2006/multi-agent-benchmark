/**
 * TraceLab 后端客户端。同源 /api（开发模式经 vite 代理，生产由 server/index.js 同进程托管）。
 * 后端不可达时页面自动退回纯前端离线模式（导入/标注功能不受影响）。
 */

async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  status: (refresh = false) => req(`/status${refresh ? '?refresh=1' : ''}`),
  architectures: () => req('/architectures'),
  datasets: () => req('/datasets'),
  tasks: (datasetId) => req(`/datasets/${datasetId}/tasks`),
  runs: () => req('/runs'),
  run: (id) => req(`/runs/${id}`),
  audit: (id) => req(`/runs/${id}/audit`),
  phenomena: () => req('/phenomena'),
  startRun: (body) => req('/runs', { method: 'POST', body }),
  rerunAudit: (id) => req(`/runs/${id}/audit`, { method: 'POST' }),
  stopRun: (id) => req(`/runs/${id}/stop`, { method: 'POST' }),
  deleteRun: (id) => req(`/runs/${id}`, { method: 'DELETE' }),

  /** 订阅运行事件流（SSE）。返回关闭函数。 */
  subscribe(runId, { onEvent, onStatus } = {}) {
    const es = new EventSource(`/api/runs/${runId}/stream`);
    es.addEventListener('event', e => { try { onEvent?.(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener('status', e => { try { onStatus?.(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener('snapshot', e => { try { onStatus?.(JSON.parse(e.data)); } catch { /* ignore */ } });
    return () => es.close();
  },
};

export async function probeBackend() {
  try {
    const status = await api.status();
    return status.ok ? status : null;
  } catch { return null; }
}
