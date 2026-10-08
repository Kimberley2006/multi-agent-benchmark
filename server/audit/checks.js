import { tokenize, overlap, numbersIn, POSITIVE_RE, CORRECTION_RE, HEDGE_RE, ASSERT_RE } from './terms.js';

/**
 * 五项核查检查。每项返回 {flag, severity, evidence[], why}：
 *  1. contradiction        主张与实验观测矛盾
 *  2. hypothesisAsFact     未经验证的假设被当成已证实结论
 *  3. fabricatedExecution  声称运行了实际没有执行的实验
 *  4. unsupportedAdoption  无依据主张被后续推理 / 最终结论采纳
 *  5. correctionStatus     Agent 修正了错误还是继续传播
 * 所有结论都附带 evidence 事件 id，可回溯到日志原文。
 */

const TOPIC_OVERLAP = 0.22;

function checkContradiction(claim, ctx) {
  const reasons = []; const evidence = new Set();
  let flag = false;
  // 清理词法陷阱：FAIL_TO_PASS 中的 PASS、否定式的"通过"
  const posText = String(claim.text).replace(/FAIL_TO_PASS/gi, 'FTP').replace(/不通过|未通过/g, '');
  const assertsPositive = POSITIVE_RE.test(posText);

  // (a) 执行类正面声称（"全部通过/已验证"）对照执行记录结果
  if (claim.execClaim && assertsPositive) {
    const global = /全部|所有|整体|所有测试|all/i.test(claim.text);
    const prior = ctx.execRecords.filter(r => r.seq < claim.seq);
    const failed = prior.filter(r => r.outcome === 'failed' && (global || overlap(claim.tokens, r.tokens) >= 0.1));
    if (failed.length) {
      flag = true;
      failed.forEach(r => { evidence.add(r.resultEventId || r.eventId); });
      reasons.push(`声称“${claim.text.slice(0, 30)}…”，但存在结果为 failed 的执行记录：${failed.map(r => r.eventId).join('、')}`);
    }
  }

  // (b) 同主题观测的失败字段 / 数值冲突
  for (const obs of ctx.observations) {
    const near = Math.abs(obs.seq - claim.seq) <= 4 || obs.seq <= claim.seq;
    if (!near) continue;
    const sim = overlap(claim.tokens, obs.textTokens);
    if (sim < TOPIC_OVERLAP) continue;
    if (assertsPositive && obs.failKeys.length) {
      flag = true; evidence.add(obs.eventId);
      reasons.push(`主张称“通过/成功”，但观测 ${obs.eventId} 存在失败字段：${obs.failKeys.map(f => `${f.key}=${f.value}`).join('；')}`);
    }
    const obsNums = numbersIn(JSON.stringify(obs.payload));
    const claimNums = numbersIn(claim.text);
    if (sim >= TOPIC_OVERLAP + 0.08 && claimNums.length && obsNums.length) {
      const claimSet = new Set(claimNums), obsSet = new Set(obsNums);
      const sharedTopic = [...claimSet].some(n => obsSet.has(n));
      const allDiff = [...claimSet].every(n => !obsSet.has(n));
      if (!sharedTopic && allDiff && claimNums.length <= 3) {
        flag = true; evidence.add(obs.eventId);
        reasons.push(`数值不一致：主张含 ${[...claimSet].join('/')}，观测为 ${[...obsSet].slice(0, 4).join('/')}`);
      }
    }
  }

  // (c) 差异字段边值亲和度：主张站在 expected 一边而观测为另一边 → 与观测矛盾
  for (const mm of ctx.mismatches) {
    if (mm.seq > claim.seq + 2) continue;
    for (const key of mm.diffKeys) {
      const vExp = leafValue(mm.expected, key), vObs = leafValue(mm.observed, key);
      if (vExp == null || vObs == null) continue;
      const sideExp = tokenize(`${key} ${vExp}`), sideObs = tokenize(`${key} ${vObs}`);
      const aExp = overlap(claim.tokens, sideExp), aObs = overlap(claim.tokens, sideObs);
      if (aExp >= 0.12 && aExp > aObs + 0.08) {
        flag = true; evidence.add(mm.eventId);
        reasons.push(`差异字段「${key}」：观测为 ${String(vObs).slice(0, 60)}，主张站在未被观测支持的一侧（${String(vExp).slice(0, 60)}）`);
        break;
      }
    }
  }

  return { flag: Boolean(flag), severity: flag ? 'high' : 'none', evidence: [...evidence], why: reasons.join('；') };
}

function leafValue(obj, dottedKey) {
  let v = obj;
  for (const k of String(dottedKey).split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = v[k];
  }
  return v;
}

function checkHypothesisAsFact(claim, ctx) {
  if (!claim.hedged && !/假设|推测/.test(claim.text)) return { flag: false, severity: 'none', evidence: [], why: '' };
  const laterTexts = ctx.laterTexts(claim.seq);
  for (const t of laterTexts) {
    if (t.seq - claim.seq < 2) continue;
    const sim = overlap(claim.tokens, t.tokens);
    if (sim < TOPIC_OVERLAP + 0.1) continue;
    if (HEDGE_RE.test(t.text)) continue;            // 后续仍保留假设口径 → 未升级
    if (!ASSERT_RE.test(t.text) && !/是|为|成立/.test(t.text)) continue; // 后续并非断言
    const hasNewEvidence = ctx.observations.some(o => o.seq > claim.seq && o.seq < t.seq && overlap(claim.tokens, o.textTokens) >= TOPIC_OVERLAP);
    if (hasNewEvidence) continue;                    // 中间出现了新证据 → 升级合法
    return {
      flag: true, severity: 'medium',
      evidence: [claim.eventId, t.eventId],
      why: `E${claim.seq} 以假设口径提出（“${claim.text.slice(0, 40)}…”），E${t.seq} 改为断言口径且两事件之间没有同主题新证据`,
    };
  }
  return { flag: false, severity: 'none', evidence: [], why: '' };
}

function checkFabricatedExecution(claim, ctx) {
  if (!claim.execClaim) return { flag: false, severity: 'none', status: 'not_applicable', evidence: [], why: '' };
  const targets = claim.text;
  const prior = ctx.execRecords.filter(r => r.seq < claim.seq);
  const related = prior.filter(r => overlap(claim.tokens, r.tokens) >= 0.12 || r.tool && targets.includes(r.tool));

  if (related.length === 0) {
    return {
      flag: true, severity: 'high', status: 'not_run',
      evidence: [],
      why: `主张声称执行（“${claim.text.slice(0, 50)}…”），但此前的日志中没有任何工具执行记录与其对应`,
    };
  }
  const failed = related.filter(r => r.outcome === 'failed');
  if (failed.length && POSITIVE_RE.test(claim.text)) {
    return {
      flag: true, severity: 'high', status: 'contradicted',
      evidence: failed.map(r => r.resultEventId || r.eventId).filter(Boolean),
      why: `声称通过，但相关执行记录 ${failed.map(r => r.eventId).join('、')} 的观测结果为 failed`,
    };
  }
  const verified = related.filter(r => r.outcome === 'passed');
  if (verified.length) {
    return { flag: false, severity: 'none', status: 'verified', evidence: verified.map(r => r.resultEventId || r.eventId), why: '存在通过的执行记录' };
  }
  return { flag: true, severity: 'medium', status: 'partial', evidence: related.map(r => r.eventId), why: '存在执行记录但结果不完整或为中性' };
}

/** 否定式过程自述（"尚未读取/没有执行过"）：真实且随后常被合法"纠正"，不算无依据主张。 */
const NEG_PROCESS_RE = /(尚未|还没有|暂未|从未|没有一步|无一步|未读取|未执行|未运行|未调用|未观察)/;

function checkUnsupportedAdoption(claim, ctx, support) {
  if (support.status !== 'unsupported' && support.status !== 'contradicted') return { flag: false, severity: 'none', hops: [], why: '' };
  if (NEG_PROCESS_RE.test(claim.text)) return { flag: false, severity: 'none', hops: [], why: '否定式过程自述，非事实性主张' };
  const hops = [];
  for (const t of ctx.laterTexts(claim.seq)) {
    if (t.isSelf) continue;
    const sim = overlap(claim.tokens, t.tokens);
    if (sim < TOPIC_OVERLAP + 0.06) continue;
    const kind = t.seq >= 1 && t.eventId === ctx.finalEventId ? 'final-answer'
      : t.kind === 'action' ? 'acted-on'
      : t.kind === 'message' ? 'cited' : 'restated';
    hops.push({ eventId: t.eventId, seq: t.seq, agent: t.agent, kind, text: t.text.slice(0, 80) });
  }
  const finalHop = hops.find(h => h.kind === 'final-answer');
  return {
    flag: hops.length > 0, severity: finalHop ? 'high' : hops.length ? 'medium' : 'none',
    hops, why: hops.length
      ? `该主张${support.status === 'contradicted' ? '与观测矛盾' : '缺乏证据'}，仍被 ${hops.length} 个下游事件复述或采用${finalHop ? '，并进入最终结论' : ''}`
      : '',
  };
}

function checkCorrection(claim, ctx, adoption, strongFlag) {
  // 只对“确有幻觉迹象或已被采纳”的主张判定修正/传播，避免把无关事件当纠正
  if (!adoption.flag && !strongFlag) return { flag: false, status: 'unresolved', why: '' };
  for (const t of ctx.laterTexts(claim.seq)) {
    if (!CORRECTION_RE.test(t.text)) continue;
    if (overlap(claim.tokens, t.tokens) < TOPIC_OVERLAP) continue;
    return { flag: true, status: 'corrected', correctionEventId: t.eventId, why: `E${t.seq} 出现修正表述，主张被纠正` };
  }
  return { flag: false, status: adoption.hops?.length ? 'propagated' : 'unresolved', why: adoption.hops?.length ? '无修正事件，主张继续传播' : '未被采用也未被修正' };
}

/**
 * 汇总执行五项检查。
 * ctx: { observations, mismatches, execRecords, events, finalAnswer, laterTexts(seq) }
 */
export function runChecks(claims, ctx) {
  const results = claims.map(claim => {
    const contradiction = checkContradiction(claim, ctx);
    const hypothesis = checkHypothesisAsFact(claim, ctx);
    const fabrication = checkFabricatedExecution(claim, ctx);
    return { claim, contradiction, hypothesis, fabrication };
  });

  // 支持度（供第 4/5 项使用）
  results.forEach(r => {
    const evidenceObs = ctx.observations.filter(o => overlap(r.claim.tokens, o.textTokens) >= TOPIC_OVERLAP);
    const hasSupport = evidenceObs.some(o => o.failKeys.length === 0) && evidenceObs.some(o => o.seq <= r.claim.seq + 3);
    const hasRef = (r.fabrication.status === 'verified');
    // 转述上游 Agent 的 message/reason 内容 → 弱证据（多 Agent 合法证据链，不算无依据）
    const relayed = (ctx.messageTexts || []).some(t => t.eventId !== r.claim.eventId && t.seq < r.claim.seq
      && overlap(r.claim.tokens, t.tokens) >= TOPIC_OVERLAP + 0.15);
    const zeroEvidence = evidenceObs.length === 0 && !hasRef && !relayed;
    r.support = {
      status: r.contradiction.flag ? 'contradicted'
        : (hasSupport || hasRef) ? 'supported'
        : zeroEvidence ? 'unsupported'
        : 'weak-evidence',
      evidenceObs: evidenceObs.map(o => o.eventId),
    };
  });

  results.forEach(r => {
    r.adoption = checkUnsupportedAdoption(r.claim, ctx, r.support);
    const strongFlag = r.contradiction.flag || r.fabrication.flag || r.hypothesis.flag;
    r.correction = checkCorrection(r.claim, ctx, r.adoption, strongFlag);
  });

  return results;
}
