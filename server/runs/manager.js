import { EventEmitter } from 'node:events';
import { saveRun, loadRun } from '../store.js';

let counter = 0;
export function newRunId() {
  counter = (counter + 1) % 10000;
  return `r-${Date.now().toString(36)}-${String(counter).padStart(4, '0')}`;
}

/** 相对时间戳：与前端轨迹排序兼容的 mm:ss.s 格式。 */
export function relTime(ms) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/**
 * 运行管理器：维护内存中的活跃 run、事件广播（SSE 订阅）、持久化。
 * run.events 同时是 TraceLab 前端 trace 的事件数组。
 */
export class RunManager extends EventEmitter {
  constructor() { super(); this.active = new Map(); }

  create(meta) {
    const run = {
      id: meta.id || newRunId(),
      status: 'running',
      architecture: meta.architecture,
      archName: meta.archName || meta.architecture,
      mode: meta.mode,
      dataset: meta.dataset,
      datasetName: meta.datasetName || meta.dataset,
      taskId: meta.taskId,
      taskTitle: meta.taskTitle || meta.taskId,
      model: meta.model || null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      events: [],
      finalAnswer: null,
      error: null,
      audit: null,
    };
    this.active.set(run.id, run);
    saveRun(run);
    this.emit('update', run);
    return run;
  }

  /** 归一化并追加事件；返回归一化后的事件。 */
  push(run, raw) {
    const seq = run.events.length + 1;
    const t = Date.now() - this._startOf(run);
    const ev = {
      id: String(raw.id || `${run.id}-e${seq}`),
      seq,
      t,
      time: relTime(t),
      agent: String(raw.agent || 'agent'),
      kind: String(raw.kind || raw.type || 'event'),
      title: String(raw.title || raw.action || `Event ${seq}`),
      detail: String(raw.detail ?? raw.message ?? raw.content ?? ''),
      expected: raw.expected ?? null,
      observed: raw.observed ?? null,
      stateChange: raw.stateChange ?? null,
      to: raw.to ?? null,
      relation: raw.relation ?? null,
      evidence: raw.evidence ?? null,
      signal: raw.signal ?? null,
      motif: raw.motif ?? null,
      sessionId: raw.sessionId ?? null,
      parentSessionId: raw.parentSessionId ?? null,
      childSessionId: raw.childSessionId ?? null,
      parallelGroup: raw.parallelGroup ?? null,
      dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : (raw.dependsOn ? [String(raw.dependsOn)] : []),
      claims: raw.claims ?? [],
      tool: raw.tool ?? null,
      finalAnswerStep: Boolean(raw.finalAnswerStep),
    };
    run.events.push(ev);
    if (ev.finalAnswerStep && ev.detail) run.finalAnswer = ev.detail;
    this.emit('event', run, ev);
    if (run.events.length % 10 === 0) saveRun(run); // 增量落盘
    return ev;
  }

  finish(run, { error = null } = {}) {
    run.status = error ? 'failed' : 'completed';
    run.endedAt = new Date().toISOString();
    run.durationMs = Date.now() - this._startOf(run);
    if (error) run.error = String(error.message || error);
    this.active.delete(run.id);
    saveRun(run);
    this.emit('update', run);
  }

  stop(runId) {
    const run = this.active.get(runId) || loadRun(runId);
    if (!run) return false;
    if (this.active.has(runId)) {
      run.status = 'stopped';
      run.endedAt = new Date().toISOString();
      this.active.delete(runId);
      saveRun(run);
      this.emit('update', run);
    }
    return true;
  }

  attachAudit(run, report) {
    run.audit = report;
    // 自动核查结果回填到事件 claims（source:'auto'），前端主张核查面板可直接预填
    for (const c of report.claims) {
      const ev = run.events.find(e => e.id === c.eventId);
      if (!ev) continue;
      ev.claims = ev.claims || [];
      let claim = ev.claims.find(x => x.id === c.claimId);
      if (!claim) { claim = { id: c.claimId, text: c.text }; ev.claims.push(claim); }
      claim.text = claim.text || c.text;
      claim.verdict = claim.verdict || c.suggested.verdict;
      claim.experimentExecution = claim.experimentExecution || c.suggested.experimentExecution;
      if (c.suggested.evidenceRefs?.length && !(claim.evidenceRefs || []).length) claim.evidenceRefs = c.suggested.evidenceRefs;
      if (c.suggested.adoptedBy?.length && !(claim.adoptedBy || []).length) claim.adoptedBy = c.suggested.adoptedBy;
      claim.fate = claim.fate || c.suggested.fate;
      claim.note = claim.note || c.suggested.note;
      claim.autoChecks = c.checks;
      claim.source = claim.source || 'auto';
    }
    saveRun(run);
  }

  _startOf(run) {
    if (!this._starts) this._starts = new Map();
    if (!this._starts.has(run.id)) {
      this._starts.set(run.id, Date.parse(run.startedAt) || Date.now());
    }
    return this._starts.get(run.id);
  }
}
