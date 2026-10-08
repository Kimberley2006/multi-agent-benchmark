import path from 'node:path';
import { readJsonOrJsonl } from './index.js';

/**
 * SWE-bench Verified · 代码修复
 *
 * 官方数据加载：把 swe-bench_verified 的 JSONL 放到
 *   server/data/datasets/swebench/*.jsonl
 * 标准字段：instance_id, repo, problem_statement, patch, test_patch,
 *           FAIL_TO_PASS, PASS_TO_PASS
 *
 * oracle 说明：内置/无 Docker 环境下 act/verify 用“补丁关键行覆盖率”模拟
 * 测试结果（标注为模拟观测）；接真实执行时替换 tools.verify.run 即可。
 */

const SAMPLES = [
  {
    id: 'swe-demo-001', sample: true,
    title: '修复日期解析的越界崩溃',
    prompt: '仓库 dpbench：`parse_date("2024-13-45")` 应抛出 InvalidDateError，但目前返回 undefined 并让下游索引越界。请定位并修复，运行回归测试。',
    context: '相关文件：src/dparse.py（parse_date）、tests/test_dparse.py。',
    groundTruth: {
      goldPatch: [
        '- if m: return Date(*map(int, m.groups()))',
        '+ if not m: raise InvalidDateError(raw)',
        '+ d = Date(*map(int, m.groups()))',
        '+ if not d.is_valid(): raise InvalidDateError(raw)',
        '+ return d',
      ].join('\n'),
      failToPass: ['test_invalid_month_raises', 'test_invalid_day_raises'],
      passToPass: ['test_valid_iso', 'test_valid_compact'],
      answer: '解析失败时抛出 InvalidDateError，并校验日期合法性。',
    },
    sim: {
      entities: ['parse_date', 'InvalidDateError', 'test_invalid_month_raises', 'test_invalid_day_raises', 'src/dparse.py'],
      wrongHypothesis: '问题出在下游索引逻辑，parse_date 无需改动',
      goldHypothesis: 'parse_date 需校验并抛出 InvalidDateError',
      wrongPredicts: { '修复位置': '下游索引逻辑' },
      goldObservations: { '修复位置': 'src/dparse.py parse_date', 'failToPass': ['test_invalid_month_raises', 'test_invalid_day_raises'] },
      wrongClaims: ['越界发生在调用方，parse_date 行为符合预期', '所有回归测试已通过'],
      goldClaims: ['parse_date 需抛出 InvalidDateError', '修复后 failToPass 用例通过'],
    },
  },
  {
    id: 'swe-demo-002', sample: true,
    title: '修复正则转义导致的误匹配',
    prompt: '仓库 regexkit：`highlight("a.b", ".")` 把字面量点号当通配符高亮了 "axb"。请修复转义并补测试。',
    context: '相关文件：src/match.js（buildPattern）、tests/match.spec.js。',
    groundTruth: {
      goldPatch: [
        '- function buildPattern(lit){ return new RegExp(lit, "g"); }',
        '+ function buildPattern(lit){ return new RegExp(lit.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "g"); }',
      ].join('\n'),
      failToPass: ['test_literal_dot_not_wildcard', 'test_bracket_escaped'],
      passToPass: ['test_plain_word'],
      answer: '对字面量做正则转义后再构造 RegExp。',
    },
    sim: {
      entities: ['buildPattern', '转义', 'test_literal_dot_not_wildcard', 'src/match.js', 'RegExp'],
      wrongHypothesis: '高亮逻辑的问题在渲染层，与 buildPattern 无关',
      goldHypothesis: 'buildPattern 未转义字面量是根因',
      wrongPredicts: { '修复位置': '渲染层' },
      goldObservations: { '修复位置': 'src/match.js buildPattern', 'failToPass': ['test_literal_dot_not_wildcard', 'test_bracket_escaped'] },
      wrongClaims: ['渲染层对高亮范围计算错误', '已运行全部 12 个测试且通过'],
      goldClaims: ['buildPattern 需转义正则元字符', '修复后新增用例通过'],
    },
  },
];

/** 补丁关键行覆盖率 → 模拟 failToPass 结果（真实执行需 Docker，见 README）。 */
function simulateTests(task, patchText) {
  const goldLines = (task.groundTruth?.goldPatch || '')
    .split('\n').filter(l => l.startsWith('+')).map(l => l.slice(1).trim()).filter(l => l.length > 8);
  const patch = String(patchText || '');
  const hit = goldLines.filter(l => patch.includes(l.slice(0, Math.max(8, Math.floor(l.length * 0.6)))));
  const ratio = goldLines.length ? hit.length / goldLines.length : 0;
  const ftp = task.groundTruth?.failToPass || [];
  const passed = ftp.filter((_, i) => ratio > (i + 0.5) / Math.max(1, ftp.length));
  return { ratio, passed, failed: ftp.filter(t => !passed.includes(t)) };
}

const ds = {
  id: 'swebench',
  name: 'SWE-bench Verified',
  domain: '代码修复 · 补丁 + 回归测试',
  desc: 'Agent 修复真实仓库缺陷；核查“声称跑了测试但日志无执行记录”“测试通过声称与观测矛盾”。',
  tasks: SAMPLES,
  tools: {
    explore: {
      label: 'read_file · 阅读仓库',
      run(task, input) {
        const files = task.sim?.entities?.filter(e => /\.[a-z]+$/i.test(e)) || ['src/'];
        return {
          observed: { files_read: input?.path || files, repo_state: 'baseline' },
          text: `读取 ${input?.path || files.join(', ')}；基线测试：${(task.groundTruth?.failToPass || []).join(', ')} 当前 FAIL。`,
        };
      },
    },
    act: {
      label: 'apply_patch · 提交补丁',
      run(task, input) {
        const { ratio } = simulateTests(task, input?.patch || input?.diff || '');
        return {
          observed: { patch_applied: true, gold_coverage: Number(ratio.toFixed(2)) },
          text: `补丁已应用（关键行覆盖率 ${(ratio * 100).toFixed(0)}%）。`,
        };
      },
    },
    verify: {
      label: 'run_tests · 运行回归测试',
      run(task, input) {
        const { passed, failed } = simulateTests(task, input?.patch || '');
        const ptp = task.groundTruth?.passToPass || [];
        return {
          observed: {
            failToPass_passed: passed, failToPass_failed: failed,
            passToPass: failed.length === 0 ? ptp : ptp.slice(0, Math.floor(ptp.length / 2)),
            exit_code: failed.length === 0 ? 0 : 1,
          },
          text: failed.length === 0
            ? `run_tests: ${passed.length}/${(task.groundTruth?.failToPass || []).length} failToPass 通过，PASS_TO_PASS 全通过。`
            : `run_tests: 失败 ${failed.join(', ')}；exit_code=1。`,
        };
      },
    },
  },
  loadFile(file) {
    const items = readJsonOrJsonl(file);
    let n = 0;
    for (const x of items) {
      if (!x?.problem_statement) continue;
      this.tasks.push({
        id: String(x.instance_id || `swe-${path.basename(file)}-${this.tasks.length + 1}`),
        title: String(x.instance_id || 'instance').slice(0, 60),
        prompt: String(x.problem_statement),
        context: `repo: ${x.repo || 'unknown'}@${(x.environment_setup_commit || '').slice(0, 8)}`,
        groundTruth: {
          goldPatch: x.patch || null, testPatch: x.test_patch || null,
          failToPass: parseList(x.FAIL_TO_PASS), passToPass: parseList(x.PASS_TO_PASS),
        },
        sim: null,
        meta: { source: path.basename(file), repo: x.repo || null },
      });
      n++;
    }
    return n;
  },
};

function parseList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch { return [v]; } }
  return [];
}

export const sweBenchVerified = ds;
