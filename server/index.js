import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PORT, HOST, loadConfig, configPublicShape } from './config.js';
import { createLLM } from './llm.js';
import { RunManager } from './runs/manager.js';
import { saveRun, loadRun, listRuns, runSummary, deleteRun } from './store.js';
import { architectureCatalog, probeAvailability, executeRun } from './adapters/index.js';
import { getDatasets, getDataset, getTask, publicTask } from './datasets/index.js';
import { auditRun } from './audit/index.js';
import { aggregatePhenomena } from './audit/phenomena.js';

const cfg = loadConfig();
const llm = createLLM(cfg.llm);
const manager = new RunManager();

// ---------- 可用性探测（缓存 60s） ----------
let probeCache = { at: 0, data: null };
async function availability(force = false) {
  if (!force && probeCache.data && Date.now() - probeCache.at < 60000) return probeCache.data;
  const data = await probeAvailability(cfg);
  probeCache = { at: Date.now(), data };
  return data;
}

// ---------- 运行执行 ----------
async function startRun({ architecture, dataset, taskId, mode, model, speed, autoAudit = true }) {
  for (const [field, value] of Object.entries({ architecture, dataset, taskId: taskId ?? null, mode })) {
    if (!value) throw httpError(400, `缺少必填字段 ${field}（需要 architecture / dataset / taskId / mode；JSON 请求体可能未送达）`);
  }
  const ds = getDataset(dataset);
  if (!ds) throw httpError(400, `未知数据集: ${dataset}`);
  const task = getTask(dataset, taskId);
  if (!task) throw httpError(400, `未知任务: ${taskId}`);
  const catalog = architectureCatalog().find(a => a.id === architecture);
  if (!catalog) throw httpError(400, `未知架构: ${architecture}`);
  if (!catalog.modes.includes(mode)) throw httpError(400, `架构 ${architecture} 不支持模式 ${mode}`);
  if (mode === 'builtin' && !llm.configured) throw httpError(400, 'builtin 模式需要配置模型 API Key（server/data/config.json → llm，或环境变量 TRACELAB_LLM_API_KEY）');
  if (mode === 'external') {
    const av = (await availability(true))[architecture];
    if (!av?.available) throw httpError(400, `external 模式不可用：${av?.reason || '未配置'}`);
  }

  const run = manager.create({
    architecture, archName: catalog.name, mode, dataset, datasetName: ds.name,
    taskId: task.id, taskTitle: task.title, model: mode === 'builtin' ? (model || cfg.llm.model) : null,
  });
  const runId = run.id;

  // 异步执行；完成后自动核查
  (async () => {
    try {
      await executeRun({ manager, run, mode, dataset: ds, task, cfg, llm, model, speed });
      manager.finish(run);
    } catch (err) {
      manager.finish(run, { error: err });
    }
    if (autoAudit && (run.status === 'completed') && run.events.length) {
      try {
        const report = await auditRun(run, task, { llm, cfg });
        manager.attachAudit(run, report);
        applySignals(run, report);
        console.log(`[audit] ${run.id}: ${report.summary.flaggedClaims}/${report.summary.totalClaims} 条主张被标记`);
      } catch (err) { console.error(`[audit] ${run.id} 失败:`, err.message); }
    }
  })();

  return run;
}

function applySignals(run, report) {
  for (const [eventId, signal] of Object.entries(report.eventSignals || {})) {
    const ev = run.events.find(e => e.id === eventId);
    if (ev && !ev.signal) ev.signal = signal;
  }
  saveRun(run);
}

// ---------- run → 前端 trace 视图 ----------
function toTrace(run) {
  const agents = [...new Set(run.events.map(e => e.agent))];
  const toolCalls = run.events.filter(e => e.kind === 'action' && e.tool).length;
  const a = run.audit?.summary;
  return {
    id: run.id, runId: run.id,
    system: `${run.archName} · ${run.mode}`,
    sourceType: 'Run',
    mode: run.mode, architecture: run.architecture, dataset: run.dataset, taskId: run.taskId,
    task: run.taskTitle, status: run.status,
    startedAt: run.startedAt, endedAt: run.endedAt,
    duration: run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—',
    agents,
    metrics: {
      affectedF1: 0, grounding: 0, progress: 0,
      cost: toolCalls || agents.length,
      recovery: a ? (a.corrected > 0 ? 1 : 0) : 0,
      spread: a ? a.propagated : 0,
      autoFlagged: a ? a.flaggedClaims : null,
      autoTotal: a ? a.totalClaims : null,
    },
    events: run.events,
    finalAnswer: run.finalAnswer,
    audit: run.audit || null,
    error: run.error || null,
  };
}

// ---------- HTTP 基础设施 ----------
function httpError(code, message) { const e = new Error(message); e.statusCode = code; return e; }

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, '请求体不是合法 JSON'); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function serveStatic(res, urlPath) {
  const distDir = path.join(ROOT, 'dist');
  let file = path.join(distDir, decodeURIComponent(urlPath.split('?')[0]));
  if (!file.startsWith(distDir)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('dist/ 未构建'); return; }
  const ext = path.extname(file);
  res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

// ---------- SSE ----------
function sse(req, res, runId) {
  res.writeHead(200, {
    'content-type': 'text/event-stream', 'cache-control': 'no-store',
    connection: 'keep-alive', 'x-accel-buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

  const run = loadRun(runId);
  send('snapshot', { status: run?.status, eventCount: run?.events?.length || 0 });

  const onEvent = (r, ev) => { if (r.id === runId) send('event', ev); };
  const onUpdate = (r) => { if (r.id === runId) send('status', runSummary(r)); };
  manager.on('event', onEvent);
  manager.on('update', onUpdate);

  const hb = setInterval(() => res.write(':hb\n\n'), 15000);
  req.on('close', () => { clearInterval(hb); manager.off('event', onEvent); manager.off('update', onUpdate); });
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      // 健康与目录
      if (req.method === 'GET' && p === '/api/status') {
        return json(res, 200, {
          ok: true, service: 'tracelab-server', version: '2.0.0',
          llm: configPublicShape(cfg),
          external: await availability(url.searchParams.get('refresh') === '1'),
          datasetCount: getDatasets().length, runCount: listRuns(9999).length,
        });
      }
      if (req.method === 'GET' && p === '/api/architectures') return json(res, 200, architectureCatalog());
      if (req.method === 'GET' && p === '/api/datasets') return json(res, 200, getDatasets());

      let m;
      if (req.method === 'GET' && (m = p.match(/^\/api\/datasets\/([a-z]+)\/tasks$/))) {
        const ds = getDataset(m[1]);
        if (!ds) throw httpError(404, '数据集不存在');
        return json(res, 200, ds.tasks.map(publicTask));
      }
      if (req.method === 'GET' && (m = p.match(/^\/api\/datasets\/([a-z]+)\/tasks\/([^/]+)$/))) {
        const t = getTask(m[1], m[2]);
        if (!t) throw httpError(404, '任务不存在');
        return json(res, 200, publicTask(t));
      }

      // 运行
      if (req.method === 'POST' && p === '/api/runs') {
        const body = await readBody(req);
        const run = await startRun(body);
        return json(res, 201, runSummary(run));
      }
      if (req.method === 'GET' && p === '/api/runs') return json(res, 200, listRuns());
      if (req.method === 'GET' && p === '/api/phenomena') {
        const runs = listRuns(9999).filter(r => r.audited)
          .map(meta => ({ meta, report: loadRun(meta.id)?.audit }))
          .filter(x => x.report);
        return json(res, 200, aggregatePhenomena(runs));
      }
      if (req.method === 'GET' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)\/stream$/))) return sse(req, res, m[1]);
      if (req.method === 'GET' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)\/audit$/))) {
        const run = loadRun(m[1]);
        if (!run) throw httpError(404, '运行不存在');
        if (!run.audit) throw httpError(404, '尚未核查');
        return json(res, 200, run.audit);
      }
      if (req.method === 'POST' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)\/audit$/))) {
        const run = loadRun(m[1]);
        if (!run) throw httpError(404, '运行不存在');
        if (manager.active.has(run.id)) throw httpError(409, '运行尚未结束');
        const task = getTask(run.dataset, run.taskId);
        const report = await auditRun(run, task, { llm, cfg });
        manager.attachAudit(run, report);
        applySignals(run, report);
        return json(res, 200, report);
      }
      if (req.method === 'POST' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)\/stop$/))) {
        if (!manager.stop(m[1])) throw httpError(404, '运行不存在');
        return json(res, 200, { stopped: true });
      }
      if (req.method === 'DELETE' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)$/))) {
        const run = loadRun(m[1]);
        if (!run) throw httpError(404, '运行不存在');
        if (manager.active.has(run.id)) throw httpError(409, '运行进行中，先停止');
        deleteRun(m[1]);
        return json(res, 200, { deleted: true });
      }
      if (req.method === 'GET' && (m = p.match(/^\/api\/runs\/([a-z0-9-]+)$/))) {
        const run = loadRun(m[1]);
        if (!run) throw httpError(404, '运行不存在');
        return json(res, 200, toTrace(run));
      }

      throw httpError(404, `无此路由: ${req.method} ${p}`);
    }

    // 静态站点（dist 构建产物）
    return serveStatic(res, p);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.error('[server]', err);
    return json(res, code, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[tracelab] API+静态服务 http://${HOST}:${PORT}  (dist: ${fs.existsSync(path.join(ROOT, 'dist')) ? '已构建' : '未构建'})`);
  console.log(`[tracelab] 数据目录: ${process.env.TRACELAB_DATA_DIR || path.join(import.meta.dirname, 'data')} · 模型: ${llm.configured ? cfg.llm.model : '未配置(scripted 模式可用)'}`);
});

export { server };
