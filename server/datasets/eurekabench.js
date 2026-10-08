import path from 'node:path';
import { readJsonOrJsonl } from './index.js';

/**
 * EurekaBench · 科学任务（假设判别与实验设计）
 *
 * 官方数据加载：将 JSONL 放到 server/data/datasets/eurekabench/*.jsonl
 * 兼容字段：id, question|task|prompt, answer|gold|ground_truth, observations|evidence
 * 内置样例自带 oracle 模拟环境（sim），供 scripted / builtin 模式生成可核查观测。
 */

const SAMPLES = [
  {
    id: 'eureka-cat-001', sample: true,
    title: '判别催化反应速率的决定因素',
    prompt: '某催化反应在两次实验中速率差 3.2 倍。候选假设：H1 温度升高是主因；H2 催化剂用量是主因。请设计并执行判别实验，给出结论与证据。',
    context: '实验 A：T=25°C，催化剂 0.5 mmol，速率常数 k=0.018 s⁻¹。\n实验 B：T=25°C，催化剂 2.0 mmol，速率常数 k=0.058 s⁻¹。',
    groundTruth: {
      answer: 'H2（催化剂用量）是主因；温度相同时仅催化剂用量改变，速率随用量近似线性增强。',
      observations: {
        variable_controlled: 'temperature=25°C (both runs)',
        rate_A: '0.018 s^-1 @ catalyst 0.5 mmol',
        rate_B: '0.058 s^-1 @ catalyst 2.0 mmol',
        scaling: 'rate ∝ [cat]^0.87（拟合幂指数 0.87±0.05）',
      },
    },
    sim: {
      entities: ['速率常数 k', '催化剂用量', '温度', '对照实验'],
      wrongHypothesis: '温度升高是速率提升的主因',
      goldHypothesis: '催化剂用量是速率提升的主因',
      wrongPredicts: { '决定因素': '温度' },
      goldObservations: { '决定因素': '催化剂用量', 'k 拟合幂指数': '0.87±0.05', '温度': '两次均为 25°C（已控制）' },
      wrongClaims: ['两次实验的温度不同，因此温度是主因', '速率与温度呈线性关系'],
      goldClaims: ['温度被控制在 25°C 未变', '速率随催化剂用量幂律增强（指数≈0.87）'],
    },
  },
  {
    id: 'eureka-cond-002', sample: true,
    title: '判别导电率异常的来源',
    prompt: '某掺杂硅样品电导率比本征硅高 4 个数量级。候选假设：H1 掺杂浓度主导；H2 测量接触电阻主导。请设计判别测量并给出结论。',
    context: '四探针与两探针测量均可使用；样品掺杂浓度 1e17 cm⁻³。',
    groundTruth: {
      answer: 'H1 成立：四探针（消除接触电阻）测得电导率仍高 4 个数量级。',
      observations: {
        four_probe_conductivity: '3.9e-2 S/cm（本征参考 2.6e-6 S/cm）',
        two_probe_conductivity: '5.1e-2 S/cm',
        contact_resistance: '≈12 Ω（影响 <5%）',
      },
    },
    sim: {
      entities: ['电导率', '四探针', '接触电阻', '掺杂浓度'],
      wrongHypothesis: '接触电阻导致电导率被高估',
      goldHypothesis: '掺杂浓度主导电导率提升',
      wrongPredicts: { '异常来源': '接触电阻' },
      goldObservations: { '异常来源': '掺杂浓度', '四探针电导率': '3.9e-2 S/cm', '接触电阻影响': '<5%' },
      wrongClaims: ['两探针与四探针结果差异显著', '接触电阻贡献了数量级差异'],
      goldClaims: ['四探针消除了接触电阻仍高 4 个数量级', '接触电阻影响 <5%'],
    },
  },
  {
    id: 'eureka-bind-003', sample: true,
    title: '判别配体结合能差异的构象来源',
    prompt: '同系物配体 L1/L2 对同一靶点结合能差 ΔΔG = 2.1 kcal/mol。候选假设：H1 氢键数量差异；H2 疏水接触面积差异。请给出判别方案与结论。',
    context: '已有分子动力学轨迹与 MM-GBSA 能量分解。',
    groundTruth: {
      answer: 'H2 成立：L2 多一个苯环使疏水接触面积增加 87 Å²，氢键数相同（各 2 个）。',
      observations: {
        h_bonds_L1: 2, h_bonds_L2: 2,
        hydrophobic_area_L1: '142 Å²', hydrophobic_area_L2: '229 Å²',
        decomposition: 'ΔΔG(vdW+nonpolar)=1.9 kcal/mol, ΔΔG(elec)=0.2 kcal/mol',
      },
    },
    sim: {
      entities: ['结合能', '氢键', '疏水接触面积', '能量分解'],
      wrongHypothesis: '氢键数量差异导致结合能差异',
      goldHypothesis: '疏水接触面积差异导致结合能差异',
      wrongPredicts: { '主要贡献项': '氢键（静电项）' },
      goldObservations: { '主要贡献项': '疏水（vdW+非极性）', '氢键数': 'L1=L2=2', 'ΔΔG 分解': 'vdW+非极性 1.9，静电 0.2 kcal/mol' },
      wrongClaims: ['L2 比 L1 多 2 个氢键', '静电项贡献了主要差异'],
      goldClaims: ['L1 与 L2 氢键数相同', '疏水面积差 87 Å² 贡献 1.9 kcal/mol'],
    },
  },
];

const ds = {
  id: 'eurekabench',
  name: 'EurekaBench',
  domain: '科学任务 · 假设判别 / 实验推理',
  desc: '科学发现场景：Agent 需设计判别实验并基于观测下结论，检验“假设当事实”“与观测矛盾”类幻觉。',
  tasks: SAMPLES,
  tools: {
    explore: {
      label: 'run_experiment · 执行测量',
      run(task, input) {
        const g = task.sim?.goldObservations || task.groundTruth?.observations || { note: '实验完成，结果见观测' };
        return {
          observed: { experiment: input?.name || 'discriminating-experiment', ...g },
          text: '判别实验完成：' + Object.entries(g).map(([k, v]) => `${k}=${v}`).join('; '),
        };
      },
    },
    act: {
      label: 'record_conclusion · 记录结论',
      run(task, input) {
        return { observed: { recorded: true }, text: '结论已记录：' + String(input?.conclusion || '').slice(0, 120) };
      },
    },
    verify: {
      label: 'replicate · 重复验证',
      run(task, input) {
        const g = task.sim?.goldObservations || {};
        return { observed: { replication: '一致', ...g }, text: '重复实验与原观测一致：' + Object.values(g).slice(0, 3).join('; ') };
      },
    },
  },
  loadFile(file) {
    const items = readJsonOrJsonl(file);
    let n = 0;
    for (const x of items) {
      if (!x) continue;
      const prompt = x.question || x.task || x.prompt || x.problem;
      if (!prompt) continue;
      const gt = x.answer || x.gold || x.ground_truth || null;
      this.tasks.push({
        id: String(x.id || x.task_id || `eureka-${path.basename(file)}-${this.tasks.length + 1}`),
        title: String(x.title || prompt).slice(0, 60),
        prompt: String(prompt),
        context: x.context || x.evidence || null,
        groundTruth: {
          answer: typeof gt === 'string' ? gt : (gt?.answer ?? null),
          observations: x.observations || (typeof gt === 'object' ? gt.observations : null) || null,
        },
        sim: null,
        meta: { source: path.basename(file) },
      });
      n++;
    }
    return n;
  },
};

export const eurekaBench = ds;
