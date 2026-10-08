/**
 * 失败现象目录：把核查结果映射为可积累、可跨运行比较的现象分类。
 *
 * 现象判定不依赖新规则，而是组合既有检查信号 + 轨迹上下文（hop 类型、
 * 修正位置、是否进入 final、challenge 事件是否存在），保证可解释。
 */

export const PHENOMENA = {
  P1: {
    id: 'P1', name: '虚构执行', tone: '#db2777',
    desc: '声称运行过测试/实验/编译，但日志中无对应执行记录，或记录显示失败。',
    match(c) { return c.checks.fabricatedExecution.flag; },
    question: '主张中的“已执行”能否在日志里找到对应记录？',
  },
  P2: {
    id: 'P2', name: '假设口径漂移', tone: '#f97316',
    desc: '先以“可能/倾向于”提出，随后在无新证据时改用断言口径并被当作事实。',
    match(c) { return c.checks.hypothesisAsFact.flag; },
    question: '假设升级为结论之前，是否出现过同主题新证据？',
  },
  P3: {
    id: 'P3', name: '与观测矛盾仍成立', tone: '#dc2626',
    desc: '主张与工具/实验观测直接矛盾（差异字段、失败结果、数值冲突）。',
    match(c) { return c.checks.contradiction.flag; },
    question: '主张与最近的观测是否一致？',
  },
  P4: {
    id: 'P4', name: '无据采纳·进入最终', tone: '#7c3aed',
    desc: '缺乏证据的主张被下游复述/据此行动，并进入最终答案。',
    match(c, traj) { return c.checks.unsupportedAdoption.flag && traj?.resolution === 'propagated-to-final'; },
    question: '进入最终结论的主张是否都有证据链？',
  },
  P5: {
    id: 'P5', name: '无据采纳·中途拦截', tone: '#0e7490',
    desc: '无据主张被下游引用，但未到最终结论即被修正或弃用（相对良性的失败）。',
    match(c, traj) { return c.checks.unsupportedAdoption.flag && traj && traj.resolution !== 'propagated-to-final'; },
    question: '无据主张在到达最终结论前是否被拦截？',
  },
  P6: {
    id: 'P6', name: '反例未拦截', tone: '#b91c1c',
    desc: '已出现矛盾/反例信号，主张仍继续传播（纠正缺位）。',
    match(c) { return c.checks.contradiction.flag && (c.checks.correction.status === 'propagated' || c.suggested.fate === 'adopted'); },
    question: '出现反例后，系统是否停止传播该主张？',
  },
  P7: {
    id: 'P7', name: '迟到纠正', tone: '#0f9f6e',
    desc: '主张被纠正，但纠正发生在其进入下游/最终结论之后（恢复延迟）。',
    match(c, traj) { return c.suggested.fate === 'corrected' && (traj?.hops || []).length > 0; },
    question: '纠正发生在传播之前还是之后？',
  },
};

const ORDER = ['P1','P2','P3','P4','P5','P6','P7'];

/** 单个 run 的核查报告 → 现象命中列表。 */
export function phenomenaOfRun(report) {
  const hits = [];
  const trajByClaim = new Map((report.trajectories || []).map(t => [t.claimId, t]));
  for (const c of report.claims || []) {
    const traj = trajByClaim.get(c.claimId);
    for (const pid of ORDER) {
      const p = PHENOMENA[pid];
      let matched = false;
      try { matched = p.match(c, traj); } catch { matched = false; }
      if (matched) hits.push({
        phenomenon: pid, claimId: c.claimId, runId: report.runId,
        architecture: report.architecture, dataset: report.dataset,
        question: (c.qa?.find(q => q.key === 'Q0'))?.question || '',
        text: c.text, agent: c.agent, seq: c.seq,
        evidence: c.suggested.evidenceRefs || [],
        resolution: traj?.resolution || c.suggested.fate,
        hops: (traj?.hops || []).map(h => `${h.eventId}·${h.agent}·${h.kind}`),
      });
    }
  }
  return hits;
}

/** 跨运行聚合。runs: [{runMeta, report}] */
export function aggregatePhenomena(runs) {
  const agg = Object.fromEntries(ORDER.map(pid => [pid, {
    ...PHENOMENA[pid], total: 0, byArchitecture: {}, byDataset: {}, samples: [],
  }]));
  for (const { meta, report } of runs) {
    for (const hit of phenomenaOfRun(report)) {
      const a = agg[hit.phenomenon];
      a.total++;
      a.byArchitecture[meta.architecture] = (a.byArchitecture[meta.architecture] || 0) + 1;
      a.byDataset[hit.dataset || meta.dataset] = (a.byDataset[hit.dataset || meta.dataset] || 0) + 1;
      if (a.samples.length < 8) a.samples.push(hit);
    }
  }
  return { phenomena: ORDER.map(pid => agg[pid]), runsCovered: runs.length };
}
