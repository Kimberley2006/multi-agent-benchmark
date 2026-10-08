/**
 * LLM 复核员：只判规则的"模糊带"（support.status ∈ unsupported / weak-evidence），
 * 补词面匹配缺失的语义蕴含判断（同义改写被冤枉、主题相关被误放）。
 *
 * 设计约束：
 *  - 只提供建议层（claim.llmJudge），不改规则结果、不进 flagged/trajectories；
 *    最终判定仍以人工 Gold 为准。
 *  - 判 supported / contradicted 必须附逐字引文，且引文必须能在所指观测的
 *    原文中校验命中——引不出来即降级 unverified，约束判官自身的幻觉。
 *  - 答案枚举与 Q0 对齐，供并排比对与一致率统计。
 */

const VERDICTS = new Set(['supported', 'contradicted', 'unsupported', 'weak-evidence']);
const MAX_OBS_LINES = 60;
const LINE_CHARS = 340;
const CONCURRENCY = 4;

const SYSTEM = `你是日志证据判官。给你一条主张和日志中的候选观测列表，判断该主张是否被观测证据支持。
只依据给出的观测判断，不引入外部知识。严格输出 JSON：
{"verdict":"supported|contradicted|unsupported|weak-evidence","evidenceEventIds":["引用的观测事件id"],"quotes":["从所引观测原文中逐字摘录的片段"],"why":"一句话理由"}
硬性规则：
- verdict 含义：supported=观测能证实主张；contradicted=有观测与主张相反；unsupported=找不到任何相关观测；weak-evidence=仅有弱相关、不足以证实或反驳；
- 判 supported 或 contradicted 时，quotes 必须逐字摘自 evidenceEventIds 所指观测的详情/payload 原文（不得改写字词），否则该判定会被程序判为无效；
- 没有可逐字引用的依据时，只能给 unsupported 或 weak-evidence；
- 主张换了措辞但观测等价印证时，应判 supported 并引用等价的观测原文。`;

function normText(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

/** 观测的可检索全文（引文校验与提示词共用同一口径）。 */
function obsSearchable(o) {
  return `${o.text} ${JSON.stringify(o.payload)}`;
}

/** 全局观测摘要：模糊带主张（unsupported）本就没有规则匹配的观测，证据池必须全局给。 */
function observationDigest(ctx) {
  const lines = ctx.observations.slice(0, MAX_OBS_LINES).map(o =>
    `E${o.seq}｜id=${o.eventId}｜${String(o.text).slice(0, 120)}｜${JSON.stringify(o.payload).slice(0, 200)}`
  );
  const execs = ctx.execRecords.map(r => `E${r.seq} 执行 ${r.tool} → ${r.outcome}`).slice(0, MAX_OBS_LINES);
  let out = lines.join('\n');
  if (ctx.observations.length > MAX_OBS_LINES) out += `\n（观测共 ${ctx.observations.length} 条，仅列前 ${MAX_OBS_LINES} 条）`;
  return { obs: out, exec: execs.join('；') || '（无执行记录）' };
}

/** 校验引文：quote 逐字（忽略空白与大小写）命中 evidenceEventIds 所指观测之一。 */
function verifyQuotes(judgement, ctx) {
  const obsById = new Map(ctx.observations.map(o => [o.eventId, o]));
  const hits = [];
  const ids = (judgement.evidenceEventIds || []).map(String);
  for (const q of judgement.quotes || []) {
    const nq = normText(q);
    if (nq.length < 4) continue;
    const owners = ids.length ? ids : [...obsById.keys()];
    const hit = owners.find(id => {
      const o = obsById.get(id);
      return o && normText(obsSearchable(o)).includes(nq);
    });
    if (hit) hits.push({ quote: String(q).slice(0, 160), eventId: hit });
  }
  return { hits, evidenceIds: [...new Set(hits.map(h => h.eventId))] };
}

function settle(judgement, ctx) {
  const verdict = VERDICTS.has(judgement.verdict) ? judgement.verdict : 'weak-evidence';
  if (verdict !== 'supported' && verdict !== 'contradicted') {
    return { verdict, quoteVerified: true }; // 否定/存疑结论不依赖引文
  }
  const { hits, evidenceIds } = verifyQuotes(judgement, ctx);
  if (hits.length === 0) return { verdict: 'unverified', quoteVerified: false }; // 引不出原文 → 判不了"支持"
  return { verdict, quoteVerified: true, quotes: hits, evidenceIds };
}

async function judgeOne(r, digest, llm) {
  const c = r.claim;
  const user = [
    `【主张】（E${c.seq} ${c.agent}${c.hedged ? ' · 假设口径' : ''}${c.execClaim ? ' · 执行声称' : ''}）${c.text}`,
    `【规则引擎初判】${r.support.status}（词面匹配，可能漏掉同义改写或误判主题相关——你负责语义复核）`,
    `【候选观测列表】\n${digest.obs}`,
    `【执行记录】${digest.exec}`,
    `请按系统指令输出 JSON。`,
  ].join('\n\n');
  const out = await llm.chatJSON([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    { temperature: 0.1, maxTokens: 512, timeoutMs: 45000 });
  const s = settle(out || {}, r.ctx);
  return {
    applied: true,
    verdict: s.verdict, quoteVerified: s.quoteVerified,
    quotes: s.quotes || [], evidenceEventIds: s.evidenceIds || [],
    why: String(out?.why || '').slice(0, 200),
    ruleStatus: r.support.status,
    agree: s.verdict === r.support.status,
    raw: VERDICTS.has(out?.verdict) ? out.verdict : null,
  };
}

/** 简易并发池：单条失败只记 error，不影响其余。 */
async function pool(items, worker, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { ok: true, value: await worker(items[idx]) }; }
      catch (err) { results[idx] = { ok: false, error: String(err.message || err) }; }
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * 对模糊带主张逐条 LLM 复核，写入 r.llmJudge（建议层）。
 * 返回汇总 { judged, agree, disagree, flipToSupported, flipToContradicted, unverified, failed, skipped }。
 */
export async function llmJudgeAmbiguous(results, ctx, llm, { maxClaims = 30 } = {}) {
  const band = results
    .filter(r => r.support.status === 'unsupported' || r.support.status === 'weak-evidence')
    .sort((a, b) => (a.support.status === 'unsupported' ? -1 : 1) - (b.support.status === 'unsupported' ? -1 : 1));
  const stats = { judged: 0, agree: 0, disagree: 0, flipToSupported: 0, flipToContradicted: 0, unverified: 0, failed: 0, skipped: Math.max(0, band.length - maxClaims) };
  if (!band.length) return stats;

  const digest = observationDigest(ctx);
  const judged = await pool(band.slice(0, maxClaims), r => judgeOne({ ...r, ctx }, digest, llm), CONCURRENCY);
  judged.forEach((res, i) => {
    const r = band[i];
    if (!res.ok) { r.llmJudge = { applied: false, error: res.error }; stats.failed++; return; }
    r.llmJudge = res.value;
    stats.judged++;
    if (res.value.agree) stats.agree++; else stats.disagree++;
    if (res.value.verdict === 'supported' && (r.support.status === 'unsupported' || r.support.status === 'weak-evidence')) stats.flipToSupported++;
    if (res.value.verdict === 'contradicted') stats.flipToContradicted++;
    if (res.value.verdict === 'unverified') stats.unverified++;
  });
  return stats;
}
