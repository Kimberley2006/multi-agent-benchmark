import { spawn } from 'node:child_process';

/**
 * external 模式：把任务交给真实的外部 Agent CLI（dsh / claude / deer-flow），
 * 捕获其输出流并归一化为 TraceLab 事件。可用性通过探测命令判断。
 */

/** 执行命令（shell），超时/退出码控制；返回 {code, stdout, stderr}。 */
export function shell(cmd, { timeoutMs = 15000, cwd, input, env } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const child = spawn(cmd, { shell: '/bin/bash', cwd, env: { ...process.env, ...(env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { if (!done) { done = true; child.kill('SIGKILL'); resolve({ code: 124, stdout, stderr, timedOut: true }); } }, timeoutMs);
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', err => { if (!done) { done = true; clearTimeout(timer); resolve({ code: 127, stdout, stderr: String(err.message) }); } });
    child.on('close', code => { if (!done) { done = true; clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); } });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function probeExternal(entry) {
  if (!entry?.command) return { available: false, reason: '未配置探测命令' };
  const res = await shell(entry.command, { timeoutMs: 20000, cwd: entry.cwd || undefined });
  if (res.code === 0) return { available: true, detail: res.stdout.trim().split('\n')[0].slice(0, 120) };
  return { available: false, reason: `探测失败(code=${res.code}): ${String(res.stderr || res.stdout).trim().slice(0, 160)}` };
}

/** 归一化外部 JSON/JSONL 行为 TraceLab 事件（与前端导入同构的宽容映射）。 */
export function normalizeExternalEvent(x, seq, runId) {
  if (!x || typeof x !== 'object') return null;
  const rawType = String(x.type || x.kind || x.event || x.event_type || x.subtype || 'log');
  const agent = x.agent || x.actor || x.sender || x.role || x.source?.role || x.session?.agent || 'external';
  const detail = x.detail || x.message || x.content || x.text || x.summary || x.result || x.output || x.data || '';
  const isToolUse = /tool_use|tool.call|function/i.test(rawType) || Boolean(x.tool_name || x.name && x.input);
  const isToolResult = /tool_result|tool.result|observation|user/i.test(rawType) && (x.content || x.result);
  const kind = isToolResult ? 'observation' : isToolUse ? 'action' : /assistant|say|message/i.test(rawType) ? 'message' : /plan/i.test(rawType) ? 'plan' : 'event';
  return {
    id: String(x.id || x.uuid || x.event_id || `${runId}-x${seq}`),
    seq,
    time: x.time || x.timestamp || `00:${String(Math.floor(seq / 60)).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}`,
    agent: String(agent),
    kind,
    title: String(x.title || x.action || x.tool_name || x.name || rawType).slice(0, 80),
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
    tool: x.tool_name || x.name || null,
    observed: isToolResult && typeof (x.content ?? x.result) !== 'string' ? (x.content ?? x.result) : null,
    to: x.to || x.recipient || null,
    relation: x.relation || null,
    claims: [],
  };
}

/**
 * 运行外部 CLI：替换 {task} 占位符；按行解析 stdout 中的 JSON 对象作为事件；
 * 无法解析时把输出切块为少量合成事件（保证日志仍可导入分析）。
 */
export async function runExternal({ entry, task, run, manager, label }) {
  if (!entry?.runTemplate) throw new Error(`${label}: 未配置 runTemplate（server/data/config.json → external.${label}.runTemplate）`);
  const cmd = entry.runTemplate.replace('{task}', String(task.prompt).replace(/"/g, '\\"').replace(/[$`\\]/g, m => '\\' + m));
  const probe = { ...run, events: [] };
  manager.push(run, { agent: 'system', kind: 'message', title: `启动外部进程`, detail: `${label} external 模式：${cmd.slice(0, 200)}`, phase: 'spawn' });

  const res = await shell(cmd, { timeoutMs: 15 * 60 * 1000, cwd: entry.cwd || undefined });
  const lines = res.stdout.split(/\r?\n/).filter(Boolean);
  let parsed = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }
    if (Array.isArray(obj)) continue;
    const ev = normalizeExternalEvent(obj, run.events.length + 1, run.id);
    if (ev) { manager.push(run, ev); parsed++; }
  }
  if (parsed === 0) {
    const chunks = res.stdout.match(/[\s\S]{1,900}/g) || [res.stdout || res.stderr || '（无输出）'];
    chunks.slice(0, 8).forEach((chunk, i) => {
      manager.push(run, { agent: label, kind: i === 0 ? 'plan' : 'message', title: `外部输出片段 ${i + 1}`, detail: chunk });
    });
  }
  if (res.code !== 0 && !parsed) throw new Error(`${label} 退出码 ${res.code}: ${String(res.stderr).slice(0, 300)}`);
  return { finalAnswer: run.events.at(-1)?.detail || '' };
}
