import path from 'node:path';
import { readJsonOrJsonl } from './index.js';

/**
 * PowerPlan · 多时段经济调度约束核查。
 * 当前版本明确限定为无网损、无启停成本、无爬坡耦合的线性经济调度，
 * 以可复核的约束检查和精确 merit-order oracle 评估数值计划。
 */
const SAMPLES = [
  {
    id: 'powerplan-demo-001', sample: true,
    title: '三时段常规机组经济调度',
    prompt: '为 3 个时段制定发电计划。每个时段必须满足负荷平衡、机组出力上下限和备用要求；在满足约束的计划中使总燃料成本最低。请列出每台机组的 MW 出力、各时段成本和总成本，并说明本题不包含的电网约束。',
    context: '时段：T1、T2、T3，每个时段 1 小时。负荷分别为 150、180、130 MW；每时段备用要求 30 MW。机组数据：Coal，最小 20 MW，最大 100 MW，成本 22 元/MWh；Gas，最小 10 MW，最大 80 MW，成本 55 元/MWh；Hydro，最小 0 MW，最大出力依次为 30、40、20 MW，成本 38 元/MWh。忽略网损、启停成本、爬坡约束和输电线路约束。',
    groundTruth: {
      periods: [
        { id: 'T1', durationHours: 1, demandMw: 150, reserveMw: 30, maxMw: { Coal: 100, Gas: 80, Hydro: 30 } },
        { id: 'T2', durationHours: 1, demandMw: 180, reserveMw: 30, maxMw: { Coal: 100, Gas: 80, Hydro: 40 } },
        { id: 'T3', durationHours: 1, demandMw: 130, reserveMw: 30, maxMw: { Coal: 100, Gas: 80, Hydro: 20 } },
      ],
      generators: [
        { id: 'Coal', minMw: 20, maxMw: 100, costPerMwh: 22 },
        { id: 'Gas', minMw: 10, maxMw: 80, costPerMwh: 55 },
        { id: 'Hydro', minMw: 0, maxMw: 40, costPerMwh: 38 },
      ],
      optimalDispatch: { T1: { Coal: 100, Gas: 20, Hydro: 30 }, T2: { Coal: 100, Gas: 40, Hydro: 40 }, T3: { Coal: 100, Gas: 10, Hydro: 20 } },
      optimalCost: 13870,
      answer: '最优计划成本 10390 元；该结论只针对题面列明的线性经济调度模型。',
    },
    sim: {
      entities: ['负荷平衡', '机组出力上下限', '备用要求', '总燃料成本'],
      wrongHypothesis: '只满足负荷平衡就足以构成可行计划',
      goldHypothesis: '计划需要同时满足出力上下限、负荷平衡与备用约束，并比较总成本',
      wrongPredicts: { '计划可行性': '只检查负荷平衡' },
      goldObservations: { 'T1负荷': '150 MW', 'T2负荷': '180 MW', 'T3负荷': '130 MW', '备用要求': '每时段至少 30 MW', '成本模型': '线性边际成本' },
      wrongClaims: ['满足负荷平衡即可证明计划可行且最优'],
      goldClaims: ['每个时段都需检查负荷平衡、机组出力上下限和备用要求', '最优性仅对题目定义的简化模型成立'],
    },
  },
  {
    id: 'powerplan-demo-002', sample: true,
    title: '水电可用量变化下的经济调度',
    prompt: '根据各时段水电可用出力，为三时段制定满足负荷、机组出力和备用约束的最低成本计划。列出逐机组出力、逐时段成本、总成本及检查结果。',
    context: '时段：T1、T2、T3，每个时段 1 小时。负荷分别为 100、160、120 MW；每时段备用要求 20 MW。机组：Coal 最小 20、最大 90 MW，成本 30 元/MWh；Gas 最小 0、最大 100 MW，成本 72 元/MWh；Hydro 最小 0 MW，最大出力依次为 20、10、30 MW，成本 15 元/MWh。忽略网损、启停成本、爬坡约束和输电线路约束。',
    groundTruth: {
      periods: [
        { id: 'T1', durationHours: 1, demandMw: 100, reserveMw: 20, maxMw: { Coal: 90, Gas: 100, Hydro: 20 } },
        { id: 'T2', durationHours: 1, demandMw: 160, reserveMw: 20, maxMw: { Coal: 90, Gas: 100, Hydro: 10 } },
        { id: 'T3', durationHours: 1, demandMw: 120, reserveMw: 20, maxMw: { Coal: 90, Gas: 100, Hydro: 30 } },
      ],
      generators: [
        { id: 'Coal', minMw: 20, maxMw: 90, costPerMwh: 30 },
        { id: 'Gas', minMw: 0, maxMw: 100, costPerMwh: 72 },
        { id: 'Hydro', minMw: 0, maxMw: 30, costPerMwh: 15 },
      ],
      optimalDispatch: { T1: { Coal: 80, Gas: 0, Hydro: 20 }, T2: { Coal: 90, Gas: 60, Hydro: 10 }, T3: { Coal: 90, Gas: 0, Hydro: 30 } },
      optimalCost: 13020,
      answer: '最优计划成本 12570 元；该结论只针对题面列明的线性经济调度模型。',
    },
    sim: {
      entities: ['水电可用出力', '负荷平衡', '备用要求', '边际成本'],
      wrongHypothesis: '水电低成本意味着每个时段都应按最大值安排且无需复核备用',
      goldHypothesis: '水电按可用上限参与经济调度，同时仍需验证负荷与备用约束',
      wrongPredicts: { '备用检查': '不需要' },
      goldObservations: { 'T1水电上限': '20 MW', 'T2水电上限': '10 MW', 'T3水电上限': '30 MW', '备用要求': '每时段至少 20 MW' },
      wrongClaims: ['水电成本最低，所以水电满发后计划必然满足全部约束'],
      goldClaims: ['水电出力不能超过各时段可用上限', '低成本计划仍需逐时段检查功率平衡和备用'],
    },
  },
];

function optimalForPeriod(task, period) {
  const gens = task.groundTruth.generators.map(g => ({
    ...g,
    max: Math.min(g.maxMw, period.maxMw?.[g.id] ?? g.maxMw),
  }));
  const minimumTotal = gens.reduce((sum, g) => sum + g.minMw, 0);
  const maximumTotal = gens.reduce((sum, g) => sum + g.max, 0);
  const dispatch = Object.fromEntries(gens.map(g => [g.id, g.minMw]));
  let remaining = period.demandMw - minimumTotal;
  for (const g of [...gens].sort((a, b) => a.costPerMwh - b.costPerMwh)) {
    const amount = Math.min(Math.max(0, remaining), g.max - g.minMw);
    dispatch[g.id] += amount;
    remaining -= amount;
  }
  return { dispatch, feasible: period.demandMw >= minimumTotal - 1e-6 && period.demandMw <= maximumTotal + 1e-6 && remaining <= 1e-6 };
}

function evaluateDispatch(task, rawDispatch) {
  const truth = task.groundTruth;
  const dispatch = rawDispatch && typeof rawDispatch === 'object' ? rawDispatch : null;
  if (!dispatch) return { status: 'unverified', reason: '未提交结构化 dispatch 计划；不能检查可行性或最优性。', constraints: [], periods: [], totalCost: null };
  const checks = [], periodResults = [];
  let totalCost = 0;
  for (const p of truth.periods) {
    const plan = dispatch[p.id];
    if (!plan || typeof plan !== 'object') {
      checks.push({ id: `${p.id}:dispatch-present`, ok: false, detail: `缺少 ${p.id} 出力计划` });
      continue;
    }
    const values = Object.fromEntries(truth.generators.map(g => [g.id, Number(plan[g.id]) ]));
    const hasAll = Object.values(values).every(Number.isFinite);
    checks.push({ id: `${p.id}:dispatch-complete`, ok: hasAll, detail: hasAll ? '所有机组均有数值出力' : '存在缺失或非数值机组出力' });
    if (!hasAll) continue;
    let sum = 0, cost = 0, headroom = 0;
    for (const g of truth.generators) {
      const output = values[g.id], max = Math.min(g.maxMw, p.maxMw?.[g.id] ?? g.maxMw);
      const minOk = output >= g.minMw - 1e-6, maxOk = output <= max + 1e-6;
      checks.push({ id: `${p.id}:${g.id}:min`, ok: minOk, detail: `${g.id}=${output} MW；下限 ${g.minMw} MW` });
      checks.push({ id: `${p.id}:${g.id}:max`, ok: maxOk, detail: `${g.id}=${output} MW；上限 ${max} MW` });
      sum += output; cost += output * g.costPerMwh * (p.durationHours ?? 1); headroom += max - output;
    }
    const balanceOk = Math.abs(sum - p.demandMw) <= 1e-6;
    const reserveOk = headroom + 1e-6 >= p.reserveMw;
    checks.push({ id: `${p.id}:balance`, ok: balanceOk, detail: `出力合计 ${sum} MW；负荷 ${p.demandMw} MW` });
    checks.push({ id: `${p.id}:reserve`, ok: reserveOk, detail: `可用备用 ${headroom} MW；要求 ${p.reserveMw} MW` });
    const optimum = optimalForPeriod(task, p);
    const optimalCost = truth.generators.reduce((s, g) => s + optimum.dispatch[g.id] * g.costPerMwh * (p.durationHours ?? 1), 0);
    const optimalOk = optimum.feasible && Math.abs(cost - optimalCost) <= 1e-6;
    checks.push({ id: `${p.id}:optimality`, ok: optimalOk, detail: `计划成本 ${cost} 元；模型最优值 ${optimalCost} 元` });
    totalCost += cost;
    periodResults.push({ period: p.id, dispatch: values, totalMw: sum, demandMw: p.demandMw, reserveAvailableMw: headroom, reserveRequiredMw: p.reserveMw, cost, optimalCost, optimal: optimalOk });
  }
  const allFeasible = periodResults.length === truth.periods.length && checks.filter(c => !c.id.endsWith(':optimality')).every(c => c.ok);
  const allOptimal = allFeasible && checks.filter(c => c.id.endsWith(':optimality')).every(c => c.ok);
  return {
    status: allOptimal ? 'verified-optimal' : allFeasible ? 'feasible-not-optimal' : 'infeasible-or-incomplete',
    reason: allOptimal ? '全部已编码约束通过，且各时段成本等于该简化模型的精确最优值。' : allFeasible ? '计划满足已编码可行性约束，但未达到该模型的最优成本。' : '至少一项约束失败或计划不完整。',
    constraints: checks, periods: periodResults, totalCost,
    scope: '仅覆盖题面显式编码的线性出力、负荷平衡、备用与成本约束；不覆盖网损、爬坡、启停、网络安全及未建模事实。',
  };
}

function extractPlan(input) {
  return input?.dispatch || input?.schedule || input?.plan?.dispatch || input?.plan || null;
}

const ds = {
  id: 'powerplan',
  name: 'PowerPlan 电力生产计划',
  domain: '运筹优化 · 多时段经济调度',
  desc: '以数据集约束核查多 Agent 数学分析：负荷平衡、机组出力、备用和线性成本；检查可行性与模型内最优性。',
  tasks: SAMPLES,
  tools: {
    explore: {
      label: 'read_dispatch_data · 读取约束',
      run(task) {
        const { periods, generators } = task.groundTruth;
        const observed = { periods, generators, assumptions: ['忽略网损', '忽略启停成本', '忽略爬坡约束', '忽略输电线路约束'] };
        return { observed, text: `读取 ${periods.length} 个时段、${generators.length} 台机组的调度数据。约束含功率平衡、出力上下限、备用和线性成本；未建模网络与机组动态约束。` };
      },
    },
    act: {
      label: 'submit_dispatch · 提交计划',
      run(task, input) {
        const result = evaluateDispatch(task, extractPlan(input));
        return { observed: result, text: `计划检查：${result.status}。${result.reason}` };
      },
    },
    verify: {
      label: 'verify_dispatch · 复核计划',
      run(task, input) {
        const result = evaluateDispatch(task, extractPlan(input));
        return { observed: result, text: `独立复核：${result.status}。${result.reason}` };
      },
    },
  },
  loadFile(file) {
    const items = readJsonOrJsonl(file); let n = 0;
    for (const x of items) {
      const periods = x.periods || x.data?.periods;
      const generators = x.generators || x.data?.generators;
      if (!Array.isArray(periods) || !Array.isArray(generators)) continue;
      const prompt = x.prompt || x.task || x.question || '制定满足所有已给约束的最低成本发电计划，并逐项报告验证结果。';
      const id = String(x.id || x.task_id || `powerplan-${path.basename(file)}-${this.tasks.length + 1}`);
      this.tasks.push({
        id, title: String(x.title || id).slice(0, 60), prompt: String(prompt),
        context: x.context || '输入数据以 JSON 数值表示；采用线性成本模型。',
        groundTruth: { periods, generators, optimalDispatch: x.optimalDispatch || null, optimalCost: x.optimalCost ?? null, answer: x.answer || null },
        sim: null, meta: { source: path.basename(file) },
      });
      n++;
    }
    return n;
  },
};

export const powerPlan = ds;
