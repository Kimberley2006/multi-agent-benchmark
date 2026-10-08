import { tokenize, HEDGE_RE, ASSERT_RE, EXEC_RE } from './terms.js';

/** 剥离否定语境（"没有任何一步实际执行过"），避免否定句被当成执行声称。 */
function stripNegation(s) {
  return String(s)
    .replace(/(没有|从未|尚未|并无|无)[^，。；,.;]{0,12}(执行|运行|跑|测试|编译|复现|验证)/g, ' ')
    .replace(/FAIL_TO_PASS/gi, 'FTP');
}

/**
 * 主张提取与观测/执行登记。
 *  - 声明式主张：事件自带 claims[]（模型自报 / 剧本 / 导入）
 *  - 启发式主张：从 detail 句子中抽取事实断言（执行类 / 事实类），标记 hedged
 *  - 观测登记：observed 非空的事件（工具返回）
 *  - 执行登记：action + tool 事件，及其紧随的 observation 结果
 */

function sentences(text) {
  return String(text || '')
    .split(/(?<=[。；;！？!?\n])|(?<=\.)\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 6);
}

function isPlanish(s) {
  return /^(计划|打算|将|准备|接下来|下一步|先|目标|plan|next|we will|todo)/i.test(s);
}

function isQuestionish(s) {
  return /[?？]$/.test(s) || /^(是否|为什么|怎么|疑问)/.test(s);
}

export function extractClaims(run) {
  const claims = [];
  let n = 0;
  const push = (ev, text, source, hedged, execClaim) => {
    n++;
    claims.push({
      claimId: `ac-${String(n).padStart(3, '0')}`,
      eventId: ev.id, seq: ev.seq, agent: ev.agent,
      text: String(text).trim().slice(0, 400),
      tokens: tokenize(text),
      hedged, execClaim, source, // declared | heuristic
      declared: source === 'declared',
    });
  };

  for (const ev of run.events) {
    // 1) 声明式主张
    for (const c of ev.claims || []) {
      if (!c?.text) continue;
      push(ev, c.text, 'declared', HEDGE_RE.test(c.text), EXEC_RE.test(stripNegation(c.text)));
    }
    // 2) 启发式主张：只从 Agent 的陈述类事件抽取（观测/工具动作是环境输出，不是主张）
    const declaredNorms = (ev.claims || []).map(c => norm(c.text));
    if (!['observation', 'action'].includes(ev.kind)) {
      for (const s of sentences(ev.detail)) {
        if (isPlanish(s) || isQuestionish(s)) continue;
        const hedged = HEDGE_RE.test(s);
        const asserty = ASSERT_RE.test(s) || /[是=]|属于|导致|因为/.test(s);
        const execClaim = EXEC_RE.test(stripNegation(s));
        if (!hedged && !asserty && !execClaim) continue;
        if (declaredNorms.some(d => normOverlap(d, norm(s)))) continue; // 声明式已覆盖
        push(ev, s, 'heuristic', hedged, execClaim);
      }
    }
  }
  // 去重（近似包含）
  const kept = [];
  for (const c of claims) {
    const dup = kept.find(k => k.agent === c.agent && normOverlap(norm(k.text), norm(c.text)) > 0.8);
    if (!dup) kept.push(c);
  }
  return kept;
}

function norm(s) { return String(s || '').toLowerCase().replace(/[\s，。；、！？“”‘’"':;,.!?()\[\]（）]/g, ''); }
function normOverlap(a, b) {
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const A = tokenize(a), B = tokenize(b);
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(1, Math.min(A.size, B.size));
}

export function extractObservations(run) {
  const obs = [];
  for (const ev of run.events) {
    if (ev.observed != null && typeof ev.observed === 'object') {
      obs.push({
        eventId: ev.id, seq: ev.seq, agent: ev.agent,
        payload: ev.observed, text: ev.detail || '',
        textTokens: tokenize(`${ev.title} ${ev.detail} ${JSON.stringify(ev.observed)}`),
        failKeys: failSignals(ev.observed),
      });
    }
  }
  return obs;
}

/** 从观测 payload 提取失败/矛盾信号（key:value 扁平化）。 */
export function failSignals(payload, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(payload || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...failSignals(v, key));
    else {
      const s = Array.isArray(v) ? v.join(',') : String(v);
      if (/fail|失败|错误|error|false|不一致|未通过|异常/i.test(s) || /^exit_code$/.test(k) && Number(s) !== 0) {
        out.push({ key, value: s });
      }
    }
  }
  return out;
}

export function extractExecRecords(run) {
  const records = [];
  for (let i = 0; i < run.events.length; i++) {
    const ev = run.events[i];
    if (ev.kind !== 'action' || !ev.tool) continue;
    // 找紧随其后的 observation（同 agent）
    let result = null;
    for (let j = i + 1; j < Math.min(i + 3, run.events.length); j++) {
      if (run.events[j].kind === 'observation' && run.events[j].agent === ev.agent) { result = run.events[j]; break; }
      if (run.events[j].kind === 'action') break;
    }
    records.push({
      eventId: ev.id, seq: ev.seq, agent: ev.agent, tool: ev.tool,
      inputText: `${ev.title} ${ev.detail}`,
      tokens: tokenize(`${ev.tool} ${ev.title} ${ev.detail}`),
      resultEventId: result?.id || null,
      resultSeq: result?.seq ?? null,
      outcome: outcomeOf(result),
    });
  }
  return records;
}

function outcomeOf(result) {
  if (!result) return 'unknown';
  const signals = failSignals(result.observed || {});
  const exit = result.observed?.exit_code;
  if (signals.length || (exit != null && Number(exit) !== 0)) return 'failed';
  if (POS(result)) return 'passed';
  return 'neutral';
}
function POS(result) {
  const s = `${result.title} ${result.detail} ${JSON.stringify(result.observed || {})}`;
  return /(通过|pass|ok|一致|成功)/i.test(s) && !/fail|失败/i.test(s);
}

/** expected ≠ observed 的字段级差异事件（矛盾证据来源之一）。 */
export function extractMismatches(run) {
  const sortObj = v => Array.isArray(v) ? [...v].sort().map(sortObj) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortObj(v[k]), o), {}) : v;
  const out = [];
  for (const ev of run.events) {
    if (ev.expected == null || ev.observed == null) continue;
    const e = sortObj(ev.expected), o = sortObj(ev.observed);
    if (JSON.stringify(e) === JSON.stringify(o)) continue;
    const keys = diffKeys(e, o);
    out.push({ eventId: ev.id, seq: ev.seq, agent: ev.agent, expected: e, observed: o, diffKeys: keys, tokens: tokenize(`${ev.title} ${ev.detail} ${keys.join(' ')} ${JSON.stringify(e)} ${JSON.stringify(o)}`) });
  }
  return out;
}

function diffKeys(a, b, prefix = '') {
  const keys = [];
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const key = prefix ? `${prefix}.${k}` : k;
    const va = sortClone(a?.[k]), vb = sortClone(b?.[k]);
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      if (va && typeof va === 'object' || vb && typeof vb === 'object') keys.push(...diffKeys(va, vb, key));
      else keys.push(key);
    }
  }
  return keys;
}
function sortClone(v) { return Array.isArray(v) ? [...v].sort() : v; }
