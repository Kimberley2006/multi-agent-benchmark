/** 中英混合词项匹配：CJK 二元组 + 拉丁/数字 token，供核查引擎做可解释的相似度。 */

const STOP = new Set(['的', '了', '在', '是', '和', '与', '并', '对', '为', '有', '不', '这', '那', '我们', '已经', '可以', '进行', 'the', 'a', 'an', 'is', 'are', 'was', 'we', 'have', 'has', 'and', 'or', 'to', 'of', 'in', 'it', 'that', 'this']);

export function tokenize(text) {
  const s = String(text || '');
  const tokens = new Set();
  // 拉丁与数字 token（保留 80211、k=0.018 这类可核对项）
  for (const m of s.matchAll(/[a-zA-Z_][a-zA-Z0-9_.\-]{1,}|\d+(?:\.\d+)?/g)) {
    const t = m[0].toLowerCase();
    if (!STOP.has(t) && t.length > 1) tokens.add(t);
  }
  // CJK 二元组
  const cjk = [...s.matchAll(/[\u4e00-\u9fff]{2,}/g)].map(m => m[0]);
  for (const seg of cjk) {
    for (let i = 0; i < seg.length; i++) {
      const bi = seg.slice(i, i + 2);
      if (bi.length === 2 && !STOP.has(bi)) tokens.add(bi);
      if (seg[i].length) { /* 单字跳过 */ }
    }
  }
  return tokens;
}

export function overlap(aTokens, bTokens) {
  if (!aTokens.size || !bTokens.size) return 0;
  let inter = 0;
  for (const t of aTokens) if (bTokens.has(t)) inter++;
  return inter / Math.min(aTokens.size, bTokens.size);
}

export function bestOverlap(needle, hayTokensList) {
  let best = { score: 0, index: -1 };
  hayTokensList.forEach((tokens, i) => {
    const s = overlap(needle, tokens);
    if (s > best.score) best = { score: s, index: i };
  });
  return best;
}

export const HEDGE_RE = /(可能|或许|大概|也许|疑似|初步|倾向|推测|假设|猜想|尚未|待验证|不确定|hypothes|speculat|might|may be|probabl|preliminar|tentative|suspect)/i;
export const ASSERT_RE = /(已经|已|确认|证实|证明|断定|成立|通过|成功|表明|显然|可以断定|无疑|confirmed|proven|verified|clearly|definitely|established)/i;
/** 执行声称：需要"完成时态/第一人称执行"标记，仅提及测试/实验不算 */
export const EXEC_RE = /(已经|已|刚|此前|此前已)?(运行|执行|跑)(了|过)|跑(通|过)了|(全部|所有|新旧)?测试(全部|均已|已经)?通过|通过(了)?(全部|所有)?测试|验证通过|编译通过|复现(了|成功)|试过|我(们)?(运行|执行|跑了)|ran\b|have (run|executed|tested)|tested\b|executed\b|passed\b/i;
export const POSITIVE_RE = /(通过|成功|pass|ok|succeed|一致|全部|均已|all.*(pass|ok))/i;
export const NEGATIVE_VALUE_RE = /(fail|失败|错误|error|不一致|未通过|false|异常)/i;
export const CORRECTION_RE = /(撤销|修正|纠正|改为|更正|重新|有误|不应|错误在于|放弃|revise|corrected|retract|instead|withdraw|actually|should be)/i;

export function numbersIn(text) {
  return [...String(text || '').matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]);
}
