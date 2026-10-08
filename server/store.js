import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR } from './config.js';

function runFile(id) { return path.join(RUNS_DIR, `${id}.json`); }

export function saveRun(run) {
  const tmp = runFile(run.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(run));
  fs.renameSync(tmp, runFile(run.id));
}

export function loadRun(id) {
  // 防 path traversal：id 只允许 [a-z0-9-]
  if (!/^[a-z0-9-]+$/i.test(id)) return null;
  const f = runFile(id);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function listRuns(limit = 60) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'));
        return {
          id: r.id, status: r.status, architecture: r.architecture, archName: r.archName,
          mode: r.mode, dataset: r.dataset, taskId: r.taskId, taskTitle: r.taskTitle,
          startedAt: r.startedAt, endedAt: r.endedAt, eventCount: (r.events || []).length,
          audited: Boolean(r.audit), model: r.model || null,
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit);
}

export function deleteRun(id) {
  if (!/^[a-z0-9-]+$/i.test(id)) return false;
  const f = runFile(id);
  if (!fs.existsSync(f)) return false;
  fs.unlinkSync(f);
  return true;
}

export function runSummary(run) {
  return {
    id: run.id, status: run.status, architecture: run.architecture, archName: run.archName,
    mode: run.mode, dataset: run.dataset, taskId: run.taskId, taskTitle: run.taskTitle,
    startedAt: run.startedAt, endedAt: run.endedAt, eventCount: (run.events || []).length,
    audited: Boolean(run.audit), model: run.model || null, error: run.error || null,
  };
}
