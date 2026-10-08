import { extractClaims, extractObservations, extractExecRecords, extractMismatches } from './extract.js';
import { runChecks } from './checks.js';
import { tokenize } from './terms.js';
import { buildQA, claimToQuestion } from './questions.js';
import { phenomenaOfRun } from './phenomena.js';
import { llmJudgeAmbiguous } from './judge.js';

/**
 * 审计管线：run + task → 逐主张核查报告 + 幻觉传播轨迹 + 事件级 signal。
 * 引擎为确定性规则（可解释、可复现）；配置 llmAssist 后叠加模型辅助提取，
 * 配置 llmJudge 后叠加模糊带（unsupported/weak-evidence）LLM 语义复核——
 * 两者均为建议层，不改规则结论；最终判定以人工 Gold 标注为准。
 */

export async function auditRun(run, task, { llm = null, cfg = null } = {}) {
  const llmAssist = Boolean(cfg?.audit?.llmAssist && llm?.configured);
  const llmJudge = Boolean(cfg?.audit?.llmJudge && llm?.configured);
  const events = run.events || [];

  const observations = extractObservations(run);
  const mismatches = extractMismatches(run);
  const execRecords = extractExecRecords(run);
  let claims = extractClaims(run);

  if (llmAssist) {
    try { claims = mergeLLMClaims(claims, await llmClaimAssist(run, llm)); }
    catch (err) { console.warn('[audit] LLM 辅助提取失败，仅用规则结果:', err.message); }
  }

  const textEntries = events.map(ev => ({
    eventId: ev.id, seq: ev.seq, agent: ev.agent, kind: ev.kind, isSelf: false,
    text: `${ev.title}。${ev.detail} ${(ev.claims || []).map(c => c.text).join(' ')}`,
    tokens: tokenize(`${ev.title} ${ev.detail} ${(ev.claims || []).map(c => c.text).join(' ')}`),
  }));
  if (run.finalAnswer) {
    textEntries.push({ eventId: 'final-answer', seq: events.length + 1, agent: 'FINAL', kind: 'complete', isSelf: false, text: run.finalAnswer, tokens: tokenize(run.finalAnswer) });
  }
  const ctx = {
    observations, mismatches, execRecords, events, finalAnswer: run.finalAnswer,
    finalEventId: run.finalAnswer ? 'final-answer' : events.at(-1)?.id,
    laterTexts: (seq) => textEntries.filter(t => t.seq > seq),
    // 上游通信文本：转述判定用
    messageTexts: textEntries.filter(t => ['message', 'reason'].includes(t.kind)),
  };

  const results = runChecks(claims, ctx);

  // LLM 复核：只进模糊带（unsupported / weak-evidence），失败降级为纯规则
  let llmJudgeStats = null;
  if (llmJudge) {
    try {
      const stats = await llmJudgeAmbiguous(results, ctx, llm, { maxClaims: cfg.audit.llmJudgeMaxClaims || 30 });
      if (stats.judged > 0) llmJudgeStats = stats; // 全军覆没时按纯规则报告
      else console.warn('[audit] LLM 复核全部失败，本次报告按纯规则生成');
    } catch (err) {
      console.warn('[audit] LLM 复核失败，仅用规则结果:', err.message);
    }
  }

  results.forEach(r => { r.qa = buildQA(r, ctx); });

  // ---- 汇总为报告 ----
  const reportClaims = results.map(r => toReportClaim(r));
  const flagged = results.filter(r => r.contradiction.flag || r.fabrication.flag || r.hypothesis.flag || (r.support.status === 'unsupported' && r.adoption.flag));

  const trajectories = flagged.map(r => ({
    claimId: r.claim.claimId,
    text: r.claim.text,
    origin: { eventId: r.claim.eventId, seq: r.claim.seq, agent: r.claim.agent },
    triggers: [
      r.contradiction.flag && 'contradiction',
      r.hypothesis.flag && 'hypothesisAsFact',
      (r.fabrication.flag) && 'fabricatedExecution',
      (r.support.status === 'unsupported' && r.adoption.flag) && 'unsupportedAdoption',
    ].filter(Boolean),
    hops: r.adoption.hops || [],
    resolution: r.correction.status === 'corrected' ? 'corrected'
      : (r.adoption.hops || []).some(h => h.kind === 'final-answer') ? 'propagated-to-final'
      : (r.adoption.hops || []).length ? 'propagated'
      : 'dropped',
  }));

  // ---- 事件级 signal（供前端错误路径可视化；不写 goldStatus，人工 Gold 仍由人判定）----
  const eventSignals = {};
  let originSet = false;
  for (const r of flagged) {
    if (!originSet) { eventSignals[r.claim.eventId] = 'origin'; originSet = true; }
    for (const hop of r.adoption.hops || []) {
      if (hop.eventId === 'final-answer') continue;
      const ev = events.find(e => e.id === hop.eventId);
      if (!ev) continue;
      eventSignals[hop.eventId] = ev.kind === 'message' ? 'propagated' : 'accepted';
    }
    if (r.correction.correctionEventId) eventSignals[r.correction.correctionEventId] = 'corrected';
  }

  const summary = {
    totalClaims: results.length,
    flaggedClaims: flagged.length,
    contradicted: results.filter(r => r.contradiction.flag).length,
    hypothesisAsFact: results.filter(r => r.hypothesis.flag).length,
    fabricatedExecution: results.filter(r => r.fabrication.flag).length,
    unsupportedAdopted: results.filter(r => r.support.status === 'unsupported' && r.adoption.flag).length,
    corrected: trajectories.filter(t => t.resolution === 'corrected').length,
    propagated: trajectories.filter(t => t.resolution.startsWith('propagated')).length,
    reachedFinal: trajectories.filter(t => t.resolution === 'propagated-to-final').length,
    eventsAffected: Object.keys(eventSignals).length,
  };

  const reportBase = {
    runId: run.id,
    generatedAt: new Date().toISOString(),
    engine: `rule-v1${llmAssist ? '+llm-assist' : ''}${llmJudge && llmJudgeStats ? '+llm-judge' : ''}`,
    dataset: run.dataset, taskId: run.taskId, architecture: run.architecture,
    claims: reportClaims,
    trajectories,
    eventSignals,
    summary: llmJudgeStats ? { ...summary, llmJudge: llmJudgeStats } : summary,
    disclaimer: '自动核查结果仅为线索（rules/LLM 均可能误报），最终判定以人工 Gold 标注为准。',
  };
  reportBase.phenomena = phenomenaOfRun(reportBase);
  return reportBase;
}

function toReportClaim(r) {
  const c = r.claim;
  let verdict = 'unverified', note = [];
  if (r.contradiction.flag) { verdict = 'contradicted'; note.push('与观测矛盾：' + r.contradiction.why); }
  else if (r.fabrication.status === 'contradicted') { verdict = 'contradicted'; note.push('执行记录与声称不符：' + r.fabrication.why); }
  else if (r.fabrication.status === 'not_run') { verdict = 'unsupported'; note.push('声称执行但无运行记录：' + r.fabrication.why); }
  else if (r.hypothesis.flag) { verdict = 'unsupported'; note.push('假设被当事实：' + r.hypothesis.why); }
  else if (r.support.status === 'supported') { verdict = 'supported'; note.push('存在同主题且无失败信号的观测支持'); }
  else if (r.support.status === 'weak-evidence') { verdict = 'unverified'; note.push('仅有弱相关证据，不足以支持或反驳'); }

  const evidenceRefs = [...new Set([
    ...(r.contradiction.evidence || []),
    ...(r.fabrication.evidence || []),
    ...r.support.evidenceObs,
  ])];

  return {
    claimId: c.claimId, eventId: c.eventId, seq: c.seq, agent: c.agent,
    text: c.text, source: c.source, hedged: c.hedged, execClaim: c.execClaim,
    question: claimToQuestion(c),
    qa: r.qa || [],
    llmJudge: r.llmJudge?.applied ? {
      verdict: r.llmJudge.verdict, quoteVerified: r.llmJudge.quoteVerified,
      why: r.llmJudge.why, evidenceEventIds: r.llmJudge.evidenceEventIds,
      quotes: (r.llmJudge.quotes || []).slice(0, 3),
      ruleStatus: r.llmJudge.ruleStatus, agree: r.llmJudge.agree,
    } : r.llmJudge ? { applied: false, error: r.llmJudge.error } : undefined,
    checks: {
      contradiction: r.contradiction,
      hypothesisAsFact: r.hypothesis,
      fabricatedExecution: { status: r.fabrication.status, ...r.fabrication },
      unsupportedAdoption: { flag: r.adoption.flag, hops: r.adoption.hops, why: r.adoption.why },
      correction: r.correction,
    },
    suggested: {
      verdict,
      experimentExecution: r.fabrication.status || 'not_applicable',
      evidenceRefs,
      adoptedBy: (r.adoption.hops || []).map(h => h.eventId),
      fate: r.correction.status === 'corrected' ? 'corrected' : r.adoption.flag ? 'adopted' : 'unresolved',
      note: note.join('；').slice(0, 500),
    },
  };
}

/** LLM 辅助：从事件文本补充规则未覆盖的主张（source: 'llm'）。 */
async function llmClaimAssist(run, llm) {
  const digest = run.events.slice(0, 40).map(e => `E${e.seq} ${e.agent}(${e.kind}): ${e.title}｜${String(e.detail).slice(0, 200)}`).join('\n');
  const out = await llm.chatJSON([
    { role: 'system', content: '你是日志审计助手。输出 JSON：{"claims":[{"eventSeq":1,"text":"可核查的事实性主张"}]}。只抽事实断言（可对照日志/实验核查），不要计划、问题、转述。' },
    { role: 'user', content: digest },
  ], { temperature: 0.1 });
  return (out.claims || []).filter(c => c?.text && c?.eventSeq).slice(0, 40);
}

function mergeLLMClaims(claims, extra) {
  const merged = [...claims];
  for (const x of extra) {
    const ev = claims.length ? x : null;
    const dup = merged.some(m => m.seq === Number(x.eventSeq) && normContains(m.text, x.text));
    if (dup) continue;
    const n = merged.length + 1;
    merged.push({
      claimId: `ac-${String(n).padStart(3, '0')}`,
      eventId: `__seq_${x.eventSeq}`, seq: Number(x.eventSeq), agent: 'llm-extracted',
      text: String(x.text).slice(0, 400), tokens: tokenize(x.text),
      hedged: /可能|或许|假设|推测|hypothes|might/i.test(x.text),
      execClaim: /运行|执行|测试|通过|编译|ran|tested|passed/i.test(x.text),
      source: 'llm', declared: false,
    });
  }
  return merged;
}
function normContains(a, b) {
  const na = String(a).replace(/[\s，。；]/g, ''), nb = String(b).replace(/[\s，。；]/g, '');
  return na.includes(nb) || nb.includes(na);
}
