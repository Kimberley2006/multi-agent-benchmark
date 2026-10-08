/**
 * LLM 复核层端到端测试（mock LLM，不发起真实网络调用）。运行：node server/audit/__judge_test.mjs
 * 覆盖：开关关闭 / 模糊带选取 / 引文逐字校验 / 一致率统计 / Q6 / 全失败降级。
 */
import { auditRun } from './index.js';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function fakeRun() {
  const ev = (id, seq, agent, kind, title, detail, extra = {}) =>
    ({ id, seq, agent, kind, title, detail, ...extra });
  return {
    id: 'r-test', dataset: 'test', taskId: 't1', architecture: 'single',
    finalAnswer: '完成。',
    events: [
      ev('e1', 1, 'A', 'message', '陈述结论', '会话已终止。',
        { claims: [{ id: 'c1', text: '会话已终止。' }] }),
      ev('e2', 2, 'A', 'observation', '工具返回', '接口调用完成。',
        { observed: { session: 'terminated', status: 200 } }),
      ev('e3', 3, 'B', 'message', '汇报测试', '测试套件全部通过，共 12 个用例。',
        { claims: [{ id: 'c2', text: '测试套件全部通过，共 12 个用例。' }] }),
      ev('e4', 4, 'B', 'message', '汇报检索', '检索结果显示存在权威来源。',
        { claims: [{ id: 'c3', text: '检索结果显示存在权威来源。' }] }),
      ev('e5', 5, 'A', 'message', '读取状态', '接口返回 status=200，session 已结束。',
        { claims: [{ id: 'c4', text: '接口返回 status=200。' }] }),
    ],
  };
}

/** mock LLM：按主张文本查表返回裁决；记录调用次数与被问及的主张。 */
function mockLLM(table, { throwAll = false } = {}) {
  const calls = [];
  return {
    calls,
    configured: true,
    async chatJSON(messages) {
      if (throwAll) throw new Error('mock 网络故障');
      const user = messages.find(m => m.role === 'user')?.content || '';
      const entry = Object.entries(table).find(([claimText]) => user.includes(claimText));
      if (!entry) throw new Error(`mock 未预期的主张: ${user.slice(0, 60)}`);
      calls.push(entry[0]);
      return entry[1];
    },
  };
}

const TABLE = {
  '会话已终止': { verdict: 'supported', evidenceEventIds: ['e2'], quotes: ['terminated'], why: '观测 session=terminated 等价印证' },
  '测试套件全部通过': { verdict: 'unsupported', evidenceEventIds: [], quotes: [], why: '日志无测试执行观测' },
  '检索结果显示存在权威来源': { verdict: 'supported', evidenceEventIds: ['e2'], quotes: ['官方权威认证机构确认'], why: '捏造的引文' },
  '接口返回 status=200': { verdict: 'supported', evidenceEventIds: ['e2'], quotes: ['200'], why: '不应被调用' },
};

console.log('场景 1：llmJudge 关闭');
{
  const report = await auditRun(fakeRun(), {}, { llm: mockLLM(TABLE), cfg: { audit: { llmJudge: false } } });
  assert(report.engine === 'rule-v1', `engine 为 rule-v1（实际 ${report.engine}）`);
  assert(report.claims.every(c => !c.llmJudge), '所有主张无 llmJudge 字段');
  assert(report.claims.every(c => !(c.qa || []).some(q => q.key === 'Q6')), '无 Q6');
  assert(!report.summary.llmJudge, 'summary 无 llmJudge');
}

console.log('场景 2：正常复核（含引文校验失败）');
{
  const llm = mockLLM(TABLE);
  const report = await auditRun(fakeRun(), {}, { llm, cfg: { audit: { llmJudge: true } } });
  const byText = t => report.claims.find(c => c.text.includes(t));
  assert(report.engine === 'rule-v1+llm-judge', `engine 为 rule-v1+llm-judge（实际 ${report.engine}）`);
  assert(llm.calls.length === 3, `只复核模糊带 3 条（实际 ${llm.calls.length}：${llm.calls.join(' | ')}）`);
  assert(!llm.calls.some(c => c.includes('status=200')), '支持带主张（c4）未被复核');
  const j1 = byText('会话已终止').llmJudge;
  assert(j1?.verdict === 'supported' && j1.quoteVerified, 'c1 同义改写被纠正为 supported（引文校验通过）');
  assert((j1.evidenceEventIds || []).includes('e2'), 'c1 证据指向 e2');
  assert(j1.agree === false, 'c1 与规则不一致（规则判 unsupported）');
  const q6 = (byText('会话已终止').qa || []).find(q => q.key === 'Q6');
  assert(q6 && q6.answer === '是', `c1 的 Q6 答案为 是（实际 ${q6?.answer}）`);
  const j3 = byText('权威来源').llmJudge;
  assert(j3?.verdict === 'unverified' && !j3.quoteVerified, 'c3 捏造引文 → unverified');
  const q6c3 = (byText('权威来源').qa || []).find(q => q.key === 'Q6');
  assert(q6c3 && q6c3.answer === '证据不足' && /不采信/.test(q6c3.why), 'c3 的 Q6 答案为 证据不足 且说明不采信');
  const st = report.summary.llmJudge;
  assert(st && st.judged === 3, `judged=3（实际 ${st?.judged}）`);
  assert(st.agree === 1 && st.disagree === 2, `一致 1 / 不一致 2（实际 ${st?.agree}/${st?.disagree}）`);
  assert(st.flipToSupported === 1, `flipToSupported=1（实际 ${st?.flipToSupported}）`);
  assert(st.unverified === 1, `unverified=1（实际 ${st?.unverified}）`);
}

console.log('场景 3：判官整体故障 → 降级纯规则');
{
  const report = await auditRun(fakeRun(), {}, {
    llm: mockLLM(TABLE, { throwAll: true }),
    cfg: { audit: { llmJudge: true } },
  });
  assert(report.engine === 'rule-v1', `降级后 engine 为 rule-v1（实际 ${report.engine}）`);
  assert(!report.summary.llmJudge, 'summary 无 llmJudge');
  assert(report.claims.length > 0, '报告仍正常产出');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed ? 1 : 0);
