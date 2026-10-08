import { tokenize, overlap } from './terms.js';

/**
 * 主张 → 是非问 + 证据 裁决形式（模仿 SAFE 式原子事实核查）。
 *
 * 每条主张生成：
 *  - 主问题 Q0：该主张是否有日志/观测证据支持？
 *  - 五项检查子问题 Q1-Q5（每题答案 必须附带证据事件/观测字段）
 * 答案枚举：是 / 否 / 证据不足 / 不适用。
 */

const ANSWET = { yes: '是', no: '否', insufficient: '证据不足', na: '不适用' };

/** 由主张文本生成主是非问（保留关键实体与数值）。 */
export function claimToQuestion(claim) {
  const text = String(claim.text || '').trim().replace(/^（假设）/, '');
  return `「${text.slice(0, 80)}${text.length > 80 ? '…' : ''}」是否被日志或观测证据支持？`;
}

/**
 * 将检查结果转为 QA 数组。r 为 runChecks 的单个结果（含 contradiction/hypothesis/fabrication/support/adoption/correction）。
 * evidence 解析：检查自带的 evidence 事件 id；support 的观测 id。
 */
export function buildQA(r, ctx) {
  const qa = [];

  qa.push({
    key: 'Q0', label: '证据支持',
    question: claimToQuestion(r.claim),
    answer: ({
      supported: ANSWET.yes,
      contradicted: ANSWET.no,
      unsupported: ANSWET.no,
      'weak-evidence': ANSWET.insufficient,
    })[r.support.status] || ANSWET.insufficient,
    evidence: r.support.evidenceObs || [],
    why: r.support.status === 'supported' ? '存在同主题且无失败信号的观测'
      : r.support.status === 'contradicted' ? '存在与主张矛盾的观测'
      : r.support.status === 'unsupported' ? '未找到任何同主题观测或执行记录'
      : '仅有弱相关证据，不足以支持或反驳',
  });

  qa.push({
    key: 'Q1', label: '观测矛盾',
    question: '该主张是否与实验/工具观测相矛盾？',
    answer: r.contradiction.flag ? ANSWET.yes : ANSWET.no,
    evidence: r.contradiction.evidence || [],
    why: r.contradiction.why || '未发现同主题的失败字段、差异字段或数值冲突',
  });

  qa.push({
    key: 'Q2', label: '假设升级',
    question: '该主张是否在“无新证据”的情况下由假设口径升级为结论口径？',
    answer: r.hypothesis.flag ? ANSWET.yes : ANSWET.no,
    evidence: r.hypothesis.evidence || [],
    why: r.hypothesis.why || '未发现假设→断言的口径漂移，或升级之间存在新证据',
  });

  qa.push({
    key: 'Q3', label: '执行记录',
    question: '该主张声称的执行（测试/实验/编译）在日志中是否有对应记录？',
    answer: ({ verified: ANSWET.no, partial: ANSWET.insufficient, not_run: ANSWET.yes, contradicted: ANSWET.yes, not_applicable: ANSWET.na })[r.fabrication.status] || ANSWET.na,
    evidence: r.fabrication.evidence || [],
    why: r.fabrication.why || ({ verified: '存在通过的执行记录', partial: '存在执行记录但结果不完整', not_applicable: '该主张不涉及执行声称' }[r.fabrication.status] || ''),
  });
  // Q3 语义校准：问题问"是否有记录"——有记录=否(不构成失败)，无记录=是(构成失败)

  qa.push({
    key: 'Q4', label: '无据采纳',
    question: '该主张在缺乏证据时是否被下游事件或最终结论采纳？',
    answer: r.adoption.flag ? ANSWET.yes : ANSWET.no,
    evidence: (r.adoption.hops || []).map(h => h.eventId).filter(id => id !== 'final-answer'),
    why: r.adoption.why || '未被下游采纳，或本身有证据支持',
  });

  qa.push({
    key: 'Q5', label: '修正传播',
    question: '该可疑主张最终是否被修正（而非继续传播）？',
    answer: r.correction.status === 'corrected' ? ANSWET.yes
      : r.correction.status === 'propagated' ? ANSWET.no
      : ANSWET.insufficient,
    evidence: r.correction.correctionEventId ? [r.correction.correctionEventId] : [],
    why: r.correction.why || (r.correction.status === 'unresolved' ? '无修正事件，也未观察到下游采纳' : ''),
  });

  // Q6：LLM 复核（建议层，仅模糊带主张存在）。与 Q0 同题异判，供人工比对；
  // 引文未通过逐字校验时结论不采信（unverified → 证据不足 + 说明）。
  const j = r.llmJudge;
  if (j?.applied) {
    qa.push({
      key: 'Q6', label: 'LLM 复核',
      question: '（LLM 语义复核）该主张是否被日志或观测证据支持？',
      answer: ({
        supported: ANSWET.yes,
        contradicted: ANSWET.no,
        unsupported: ANSWET.no,
        'weak-evidence': ANSWET.insufficient,
        unverified: ANSWET.insufficient,
      })[j.verdict] || ANSWET.insufficient,
      evidence: j.evidenceEventIds || [],
      why: (j.quoteVerified ? '' : '引文未通过逐字校验，复核结论不采信。')
        + (j.why || '')
        + (j.agree === false ? `（与规则初判「${j.ruleStatus}」不一致，建议人工重点复核）` : '（与规则初判一致）'),
    });
  }

  return qa;
}
