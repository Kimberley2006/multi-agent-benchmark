/**
 * 8 种架构的拓扑定义（纯数据）。builtin（真实 LLM 编排）与 scripted（确定性场景）
 * 两种执行引擎共用：引擎按顺序走 steps，逐步生成事件。
 *
 * step 字段：
 *  - agent / kind / title: 事件三元组
 *  - phase: plan|explore|reason|act|verify|report|decide|complete（决定提示词与剧本模板）
 *  - tool: 调用数据集 oracle 工具（explore/act/verify 阶段）
 *  - to / relation / dependsOn / parallelGroup / motif: 通信与依赖边
 *  - prompt: builtin 模式给该步 LLM 的具体指令
 */

export const TOPOLOGIES = {
  single: {
    id: 'single', name: 'Single', short: 'SGL', category: 'basic', tone: '#475569',
    desc: '单 Agent 自循环：计划 → 观察 → 推理 → 行动 → 自检',
    agents: [{ id: 'solo', name: 'Solo-Agent', role: '独立完成全部工作' }],
    steps: [
      { agent: 'Solo-Agent', kind: 'plan', phase: 'plan', motif: 'Single', prompt: '制定完成任务的分步计划，明确每步的验证条件。' },
      { agent: 'Solo-Agent', kind: 'observation', phase: 'explore', tool: 'explore', motif: 'Single', prompt: '调用工具收集完成任务所需的关键观测。' },
      { agent: 'Solo-Agent', kind: 'reason', phase: 'reason', motif: 'Single', prompt: '基于观测推断结论；明确哪些是证据支持的、哪些只是假设。' },
      { agent: 'Solo-Agent', kind: 'action', phase: 'act', tool: 'act', motif: 'Single', stateChange: true, prompt: '执行任务动作（补丁/证明/实验/结论撰写）。' },
      { agent: 'Solo-Agent', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Single', prompt: '运行验证并报告实际观测结果。' },
      { agent: 'Solo-Agent', kind: 'complete', phase: 'complete', final: true, motif: 'Single', prompt: '给出最终答案，说明依据。' },
    ],
  },

  independent: {
    id: 'independent', name: 'Independent', short: 'IND', category: 'basic', tone: '#0e7490',
    desc: '并行隔离：协调者拆分 → 3 个互不通信的 Worker → 汇聚',
    agents: [
      { id: 'coord', name: 'Coordinator', role: '拆分与汇聚' },
      { id: 'w1', name: 'Worker-A', role: '子任务 1' },
      { id: 'w2', name: 'Worker-B', role: '子任务 2' },
      { id: 'w3', name: 'Worker-C', role: '子任务 3' },
    ],
    steps: [
      { agent: 'Coordinator', kind: 'plan', phase: 'plan', motif: 'Star', prompt: '把任务拆成 3 个互不依赖的子任务并说明汇聚方式。' },
      { agent: 'Coordinator', kind: 'message', phase: 'report', to: 'Worker-A', relation: 'delegate', parallelGroup: 'fanout-1', motif: 'Star', prompt: '向 Worker-A 下达子任务 1。' },
      { agent: 'Coordinator', kind: 'message', phase: 'report', to: 'Worker-B', relation: 'delegate', parallelGroup: 'fanout-1', motif: 'Star', prompt: '向 Worker-B 下达子任务 2。' },
      { agent: 'Worker-A', kind: 'observation', phase: 'explore', tool: 'explore', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '独立收集子任务 1 的观测。' },
      { agent: 'Worker-B', kind: 'observation', phase: 'explore', tool: 'explore', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '独立收集子任务 2 的观测。' },
      { agent: 'Worker-A', kind: 'reason', phase: 'reason', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '独立得出子任务 1 结论。' },
      { agent: 'Worker-B', kind: 'reason', phase: 'reason', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '独立得出子任务 2 结论。' },
      { agent: 'Worker-A', kind: 'message', phase: 'report', to: 'Coordinator', relation: 'report', motif: 'Star', prompt: '回传子任务 1 结论与依据。' },
      { agent: 'Worker-B', kind: 'message', phase: 'report', to: 'Coordinator', relation: 'report', motif: 'Star', prompt: '回传子任务 2 结论与依据。' },
      { agent: 'Coordinator', kind: 'action', phase: 'act', tool: 'act', motif: 'Single', stateChange: true, dependsOn: ['report'], prompt: '汇聚各子任务结论并执行主任务动作。' },
      { agent: 'Coordinator', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Single', prompt: '验证汇聚结果。' },
      { agent: 'Coordinator', kind: 'complete', phase: 'complete', final: true, motif: 'Single', prompt: '给出最终答案。' },
    ],
  },

  pipeline: {
    id: 'pipeline', name: 'Pipeline', short: 'PIP', category: 'basic', tone: '#2563eb',
    desc: '顺序依赖：Detector → Analyzer → Executor → Verifier 逐段交接',
    agents: [
      { id: 'd', name: 'Detector', role: '信息采集' },
      { id: 'a', name: 'Analyzer', role: '分析定位' },
      { id: 'e', name: 'Executor', role: '执行修改' },
      { id: 'v', name: 'Verifier', role: '验证复核' },
    ],
    steps: [
      { agent: 'Detector', kind: 'plan', phase: 'plan', motif: 'Pipeline', prompt: '明确流水线各阶段目标。' },
      { agent: 'Detector', kind: 'observation', phase: 'explore', tool: 'explore', motif: 'Pipeline', prompt: '采集任务相关的原始信息。' },
      { agent: 'Detector', kind: 'message', phase: 'report', to: 'Analyzer', relation: 'handoff', motif: 'Pipeline', dependsOn: ['explore'], prompt: '把采集结果交接给 Analyzer。' },
      { agent: 'Analyzer', kind: 'reason', phase: 'reason', motif: 'Pipeline', prompt: '分析交接内容，得出处理方案；注明不确定处。' },
      { agent: 'Analyzer', kind: 'message', phase: 'report', to: 'Executor', relation: 'result-used-by', motif: 'Pipeline', dependsOn: ['reason'], prompt: '把方案与约束交接给 Executor。' },
      { agent: 'Executor', kind: 'action', phase: 'act', tool: 'act', motif: 'Pipeline', stateChange: true, prompt: '按交接方案执行修改。' },
      { agent: 'Executor', kind: 'message', phase: 'report', to: 'Verifier', relation: 'handoff', motif: 'Pipeline', dependsOn: ['act'], prompt: '把执行产物交接给 Verifier。' },
      { agent: 'Verifier', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Pipeline', prompt: '对照目标验证执行产物，报告实际结果。' },
      { agent: 'Verifier', kind: 'complete', phase: 'complete', final: true, motif: 'Pipeline', prompt: '汇总流水线结论。' },
    ],
  },

  discussion: {
    id: 'discussion', name: 'Discussion', short: 'DSC', category: 'basic', tone: '#7c3aed',
    desc: '多轮辩论：Proposer ↔ Critic → Judge 裁决修订',
    agents: [
      { id: 'p', name: 'Proposer', role: '提出方案' },
      { id: 'c', name: 'Critic', role: '质疑与反例' },
      { id: 'j', name: 'Judge', role: '裁决与执行' },
    ],
    steps: [
      { agent: 'Proposer', kind: 'plan', phase: 'plan', motif: 'Discussion', prompt: '提出初始方案与依据。' },
      { agent: 'Proposer', kind: 'observation', phase: 'explore', tool: 'explore', motif: 'Discussion', prompt: '收集支持方案的观测。' },
      { agent: 'Proposer', kind: 'message', phase: 'report', to: 'Critic', relation: 'proposal', motif: 'Discussion', dependsOn: ['explore'], prompt: '向 Critic 提交候选方案与主张。' },
      { agent: 'Critic', kind: 'reason', phase: 'reason', motif: 'Discussion', prompt: '严格审查方案：找反例、指出证据缺口。必要时调用工具复核。', tool: 'explore', toolOptional: true },
      { agent: 'Critic', kind: 'message', phase: 'challenge', to: 'Judge', relation: 'challenge', motif: 'Discussion', dependsOn: ['reason'], prompt: '向 Judge 提交质疑与反例证据。' },
      { agent: 'Judge', kind: 'decision', phase: 'decide', motif: 'Discussion', prompt: '裁决：采纳/修订/驳回，并说明理由。' },
      { agent: 'Judge', kind: 'action', phase: 'act', tool: 'act', motif: 'Discussion', stateChange: true, dependsOn: ['decide'], prompt: '按裁决执行。' },
      { agent: 'Judge', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Discussion', prompt: '验证执行结果。' },
      { agent: 'Judge', kind: 'complete', phase: 'complete', final: true, motif: 'Discussion', prompt: '给出最终结论与证据链。' },
    ],
  },

  star: {
    id: 'star', name: 'Star', short: 'STR', category: 'basic', tone: '#0f766e',
    desc: '中心协调：Coordinator ↔ {Vision, Executor} 星型通信',
    agents: [
      { id: 'hub', name: 'Coordinator', role: '中心调度' },
      { id: 'v', name: 'Vision', role: '感知分析' },
      { id: 'e', name: 'Executor', role: '执行' },
    ],
    steps: [
      { agent: 'Coordinator', kind: 'plan', phase: 'plan', motif: 'Star', prompt: '制定分派计划。' },
      { agent: 'Coordinator', kind: 'message', phase: 'report', to: 'Vision', relation: 'delegate', motif: 'Star', prompt: '委派 Vision 进行感知分析。' },
      { agent: 'Vision', kind: 'observation', phase: 'explore', tool: 'explore', motif: 'Star', prompt: '完成感知分析并回传结论。' },
      { agent: 'Vision', kind: 'message', phase: 'report', to: 'Coordinator', relation: 'report', motif: 'Star', dependsOn: ['explore'], prompt: '回传分析结论。' },
      { agent: 'Coordinator', kind: 'decision', phase: 'decide', motif: 'Star', dependsOn: ['report'], prompt: '决定是否需要补充分析或直接执行。' },
      { agent: 'Coordinator', kind: 'message', phase: 'report', to: 'Executor', relation: 'delegate', motif: 'Star', prompt: '委派 Executor 执行。' },
      { agent: 'Executor', kind: 'action', phase: 'act', tool: 'act', motif: 'Star', stateChange: true, prompt: '执行修改。' },
      { agent: 'Executor', kind: 'message', phase: 'report', to: 'Coordinator', relation: 'report', motif: 'Star', dependsOn: ['act'], prompt: '回传执行结果。' },
      { agent: 'Coordinator', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Star', prompt: '中心复核。' },
      { agent: 'Coordinator', kind: 'complete', phase: 'complete', final: true, motif: 'Star', prompt: '汇总完成。' },
    ],
  },

  deerflow: {
    id: 'deerflow', name: 'DeerFlow 1.x', short: 'DFW', category: 'dynamic', tone: '#b45309',
    desc: 'Deep Research 工作流：Planner → 并行 Researcher → Reporter ↔ Human/Critic 反馈环',
    agents: [
      { id: 'planner', name: 'Planner', role: '研究计划' },
      { id: 'r1', name: 'Researcher-1', role: '子课题研究' },
      { id: 'r2', name: 'Researcher-2', role: '子课题研究' },
      { id: 'reporter', name: 'Reporter', role: '综合报告' },
      { id: 'critic', name: 'Feedback-Critic', role: '计划反馈' },
    ],
    steps: [
      { agent: 'Planner', kind: 'plan', phase: 'plan', motif: 'Single', prompt: '把研究任务拆成多个子课题并给出研究步骤。' },
      { agent: 'Planner', kind: 'message', phase: 'report', to: 'Researcher-1', relation: 'delegate', parallelGroup: 'dfw-fanout', motif: 'Star', prompt: '分派子课题 1。' },
      { agent: 'Planner', kind: 'message', phase: 'report', to: 'Researcher-2', relation: 'delegate', parallelGroup: 'dfw-fanout', motif: 'Star', prompt: '分派子课题 2。' },
      { agent: 'Researcher-1', kind: 'observation', phase: 'explore', tool: 'explore', parallelGroup: 'dfw-fanout', motif: 'Independent', prompt: '检索并收集子课题 1 的资料。' },
      { agent: 'Researcher-2', kind: 'observation', phase: 'explore', tool: 'explore', parallelGroup: 'dfw-fanout', motif: 'Independent', prompt: '检索并收集子课题 2 的资料。' },
      { agent: 'Reporter', kind: 'reason', phase: 'reason', motif: 'Pipeline', dependsOn: ['explore'], prompt: '综合两个子课题资料，写出初步结论与证据引用。' },
      { agent: 'Feedback-Critic', kind: 'reason', phase: 'challenge', motif: 'Discussion', dependsOn: ['reason'], prompt: '审查报告：结论是否被资料支持？指出过度声称。' },
      { agent: 'Reporter', kind: 'reason', phase: 'revise', motif: 'Discussion', dependsOn: ['challenge'], prompt: '按反馈修订结论；无法支持的表述降级为假设或删除。' },
      { agent: 'Reporter', kind: 'complete', phase: 'complete', final: true, motif: 'Single', prompt: '输出最终研究报告。' },
    ],
  },

  claudeTeam: {
    id: 'claudeTeam', name: 'Claude Code Agent Teams', short: 'CAT', category: 'dynamic', tone: '#d97706',
    desc: 'Lead 动态生成队友：Explore / Coder / Verifier 独立上下文 + 共享任务列表',
    agents: [
      { id: 'lead', name: 'Lead', role: '团队主管' },
      { id: 'te1', name: 'Teammate-Explore', role: '资料定位' },
      { id: 'te2', name: 'Teammate-Coder', role: '实现修改' },
      { id: 'te3', name: 'Teammate-Verifier', role: '复核验证' },
    ],
    steps: [
      { agent: 'Lead', kind: 'plan', phase: 'plan', motif: 'Single', prompt: '分析任务，决定需要哪些队友与任务分解。' },
      { agent: 'Lead', kind: 'message', phase: 'spawn', to: 'Teammate-Explore', relation: 'subagent/start', childSession: 'te-explore', motif: 'Star', prompt: '动态生成 Teammate-Explore 并分配任务。' },
      { agent: 'Teammate-Explore', kind: 'observation', phase: 'explore', tool: 'explore', motif: 'Independent', sessionId: 'te-explore', prompt: '在独立上下文中完成资料定位。' },
      { agent: 'Teammate-Explore', kind: 'message', phase: 'report', to: 'Lead', relation: 'subagent/end', motif: 'Star', sessionId: 'te-explore', dependsOn: ['explore'], prompt: '回报定位结果。' },
      { agent: 'Lead', kind: 'message', phase: 'spawn', to: 'Teammate-Coder', relation: 'subagent/start', childSession: 'te-code', motif: 'Star', dependsOn: ['report'], prompt: '生成 Teammate-Coder，把 Explore 结果转为实现任务。' },
      { agent: 'Teammate-Coder', kind: 'action', phase: 'act', tool: 'act', motif: 'Independent', sessionId: 'te-code', stateChange: true, prompt: '独立完成实现。' },
      { agent: 'Teammate-Coder', kind: 'message', phase: 'report', to: 'Lead', relation: 'subagent/end', motif: 'Star', sessionId: 'te-code', dependsOn: ['act'], prompt: '回报实现与自测情况。' },
      { agent: 'Lead', kind: 'message', phase: 'spawn', to: 'Teammate-Verifier', relation: 'subagent/start', childSession: 'te-verify', motif: 'Star', prompt: '生成 Teammate-Verifier 复核。' },
      { agent: 'Teammate-Verifier', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Independent', sessionId: 'te-verify', prompt: '独立复核 Lead 汇总的结论。' },
      { agent: 'Teammate-Verifier', kind: 'message', phase: 'report', to: 'Lead', relation: 'subagent/end', motif: 'Star', sessionId: 'te-verify', dependsOn: ['verify'], prompt: '回报复核结果。' },
      { agent: 'Lead', kind: 'complete', phase: 'complete', final: true, motif: 'Single', prompt: '汇总队友结果给出最终答案。' },
    ],
  },

  dsh: {
    id: 'dsh', name: 'DeepSeek Harness', short: 'DSH', category: 'dynamic', tone: '#ea580c',
    desc: '插件化 Harness：Main 动态创建 Research / Test / Coder / Critic 子会话，时变组合',
    agents: [
      { id: 'main', name: 'Main', role: '主会话编排' },
      { id: 'research', name: 'Research', role: '定位分析（子会话）' },
      { id: 'test', name: 'Test', role: '复现与用例（子会话）' },
      { id: 'coder', name: 'Coder', role: '实现（子会话）' },
      { id: 'critic', name: 'Critic', role: '交叉复核（子会话）' },
    ],
    steps: [
      { agent: 'Main', kind: 'plan', phase: 'plan', motif: 'Single', prompt: '解析任务、风险与验证条件。' },
      { agent: 'Main', kind: 'message', phase: 'spawn', to: 'Research', relation: 'delegate', childSession: 'child-research', motif: 'Star', prompt: '创建 Research 子会话。' },
      { agent: 'Main', kind: 'message', phase: 'spawn', to: 'Test', relation: 'delegate', childSession: 'child-test', motif: 'Star', prompt: '创建 Test 子会话。' },
      { agent: 'Research', kind: 'observation', phase: 'explore', tool: 'explore', sessionId: 'child-research', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '在隔离子会话中定位关键信息。' },
      { agent: 'Test', kind: 'observation', phase: 'explore', tool: 'verify', sessionId: 'child-test', parallelGroup: 'fanout-1', motif: 'Independent', prompt: '复现现状，记录现有基线行为。' },
      { agent: 'Research', kind: 'message', phase: 'report', to: 'Main', relation: 'report', sessionId: 'child-research', motif: 'Pipeline', dependsOn: ['explore'], prompt: '回传定位结论。' },
      { agent: 'Main', kind: 'message', phase: 'report', to: 'Coder', relation: 'result-used-by', childSession: 'child-code', motif: 'Pipeline', dependsOn: ['report'], prompt: '把 Research 结论作为约束交给 Coder 子会话。' },
      { agent: 'Coder', kind: 'action', phase: 'act', tool: 'act', sessionId: 'child-code', stateChange: true, motif: 'Pipeline', prompt: '按约束实现修改。' },
      { agent: 'Coder', kind: 'message', phase: 'report', to: 'Main', relation: 'report', sessionId: 'child-code', motif: 'Pipeline', dependsOn: ['act'], prompt: '回报实现与自测。' },
      { agent: 'Main', kind: 'message', phase: 'spawn', to: 'Critic', relation: 'challenge', childSession: 'child-critic', motif: 'Discussion', dependsOn: ['report'], prompt: '创建 Critic 子会话做交叉复核。' },
      { agent: 'Critic', kind: 'reason', phase: 'challenge', motif: 'Discussion', sessionId: 'child-critic', prompt: '对照任务目标与观测提出反例或确认。' },
      { agent: 'Critic', kind: 'message', phase: 'report', to: 'Main', relation: 'counterexample', sessionId: 'child-critic', motif: 'Discussion', dependsOn: ['challenge'], prompt: '回传复核结论。' },
      { agent: 'Main', kind: 'action', phase: 'revise', motif: 'Discussion', dependsOn: ['counterexample'], prompt: '按复核结论合并修订。' },
      { agent: 'Main', kind: 'observation', phase: 'verify', tool: 'verify', motif: 'Single', prompt: '运行最终验证。' },
      { agent: 'Main', kind: 'complete', phase: 'complete', final: true, motif: 'Single', prompt: '基于证据给出最终结论。' },
    ],
  },
};

export const TOPOLOGY_LIST = Object.values(TOPOLOGIES);
