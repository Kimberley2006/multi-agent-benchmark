import './style.css';
import { api, probeBackend } from './api.js';

const TYPES = {
  knowledge: { label: '知识', color: '#8b5cf6' },
  context: { label: '上下文', color: '#3b82f6' },
  planning: { label: '规划', color: '#f59e0b' },
  tool: { label: '工具', color: '#ef4444' },
  state: { label: '状态', color: '#ec4899' },
  completion: { label: '完成', color: '#f97316' },
};

const ICONS = {
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5"/></svg>',
  paste: '<svg viewBox="0 0 24 24"><path d="M9 5h6m-7 3H6v12h12V8h-2M9 3h6v4H9z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M3 12s3-5 9-5 9 5 9 5-3 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
  filter: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10m-7 6h4"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M9 15 7 17a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0m5-1 2-2a3 3 0 1 1 4 4l-3 3a3 3 0 0 1-4 0m-5-2 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

const ARCH_META = {
  Single: { short: 'SGL', tone: '#475569', desc: '单 Agent · 自循环执行' },
  Independent: { short: 'IND', tone: '#0e7490', desc: '并行隔离 · 结果汇聚' },
  Pipeline: { short: 'PIP', tone: '#2563eb', desc: '顺序依赖 · 逐段交接' },
  Discussion: { short: 'DSC', tone: '#7c3aed', desc: '互相质疑 · 多轮修订' },
  Star: { short: 'STR', tone: '#0f766e', desc: '中心协调 · 星型通信' },
  'Harness Dynamic': { short: 'DYN', tone: '#ea580c', desc: '五种基元 · 时变组合' },
};

const PRIMITIVES = {
  Single: { icon: '↻', rule: '单一执行主体连续规划、工具调用与自检', evidence: '活跃 Agent = 1' },
  Independent: { icon: '∥', rule: '多个同级子任务互不消费彼此结果，最终汇聚', evidence: '同父会话 + 无同级依赖' },
  Pipeline: { icon: '→', rule: '上游结果成为下游步骤的输入或前置条件', evidence: '有序 data dependency' },
  Discussion: { icon: '⇄', rule: '同级 Agent 双向通信、反驳并据此修订', evidence: '互惠边 + 多轮修订' },
  Star: { icon: '✣', rule: '中心节点分派、收集并中介大多数通信', evidence: '中心度高 + delegate/report' },
};

const MOTIF_NAMES = [...Object.keys(PRIMITIVES), 'Hybrid / Unknown'];
const BASIC_ARCHS = new Set(['Single','Independent','Pipeline','Discussion','Star']);

const ARCHITECTURE_CATALOG = [
  {group:'静态协作模式',mode:'static',items:[
    {name:'Independent / Parallel',kind:'基础模式',runner:'independent',summary:'预先确定并行分工和汇总步骤；各 Agent 通常不消费彼此中间结果。',capture:'子任务、父会话、并行组、汇总输入。'},
    {name:'Pipeline',kind:'基础模式',runner:'pipeline',summary:'预先确定阶段和交接方向；运行时结果可改变后续任务内容。',capture:'handoff、depends_on、result-used-by、阶段输入输出。'},
    {name:'Hub / Star',kind:'基础模式',runner:'star',summary:'中心 Agent 委派并汇总；执行角色和中心通信关系预先配置。',capture:'delegate / report、发起者、接收者、汇总采用情况。'},
    {name:'Debate / Discussion',kind:'基础模式',runner:'discussion',summary:'固定成员围绕主张交换论据、质疑和修订；轮数可固定或设上限。',capture:'主张 ID、反例、回应、修订前后内容。'},
    {name:'AutoGen RoundRobinGroupChat',kind:'框架实例',summary:'参与者集合与轮转方式预先配置，按顺序发言。',capture:'team 配置、发言顺序、终止条件。'},
  ]},
  {group:'固定成员 · 动态路由',mode:'hybrid',items:[
    {name:'AutoGen SelectorGroupChat',kind:'框架实例',summary:'成员集合固定，由选择器根据共享上下文决定下一位发言者。',capture:'候选成员、选择结果、选择依据、终止条件。'},
    {name:'OpenAI Agents SDK',kind:'框架实例',summary:'可用 manager-as-tool 或 handoff；Agent 角色通常预先注册，运行时决定调用或移交给谁。',capture:'可用 Agent、handoff、调用参数、最终回答归属。'},
    {name:'LangGraph 自定义图',kind:'编排框架',summary:'节点和边由实现者定义；条件边可动态路由，但不代表 Agent 团队会自动扩容。',capture:'图版本、节点进入/退出、条件路由、状态变化。'},
    {name:'DeerFlow 1.x',kind:'研究工作流',runner:'deerflow',summary:'原始 Deep Research 工作流以预定义流程组织研究；计划内容可变不等于运行时拓扑可变。',capture:'计划迭代、阶段节点、worker 分派、重规划记录。'},
  ]},
  {group:'动态委派 / 运行时扩展',mode:'dynamic',items:[
    {name:'DeepSeek Harness',kind:'Agent Harness',runner:'dsh',summary:'插件化运行时支持创建、恢复和管理 Agent；具体多 Agent 拓扑由插件或上层编排逻辑决定。',capture:'agent create/resume/dispose、父子关系、session/event、插件和消息事件。'},
    {name:'DeerFlow 2.0',kind:'Agent Harness',summary:'Lead Agent 可按任务委派给子 Agent；实际并发和总委派数受配置限制。',capture:'task / batch_task、子 Agent、委派上限、结果回传和汇总。'},
    {name:'Claude Code Agent Teams',kind:'Agent Teams',runner:'claudeTeam',summary:'Lead 可按任务生成队友；队友有独立上下文，能通过消息和共享任务列表协作。',capture:'队友创建、任务分配、消息、任务状态、Lead 汇总。'},
  ]},
];

const CLAIM_VERDICTS = {
  supported:{label:'有证据支持',tone:'supported'},
  contradicted:{label:'与观测矛盾',tone:'contradicted'},
  unsupported:{label:'无依据 / 假设被当事实',tone:'unsupported'},
  unverified:{label:'尚未核实',tone:'unverified'},
};
const CLAIM_FATES = {
  unresolved:'尚未处置', adopted:'被后续采用 / 传播', corrected:'已修正',
};

/* ---------- 运行台 / 自动核查 ---------- */
const MODE_META = {
  scripted: { label: 'scripted', desc: '确定性场景 · 无需 Key · 联调与演示', tone: '#0891b2' },
  builtin: { label: 'builtin', desc: '内置编排引擎 + 真实 LLM（OpenAI 兼容端点）', tone: '#2563eb' },
  external: { label: 'external', desc: '外部真实 CLI（探测可用后启用）', tone: '#d97706' },
};
const CHECK_META = {
  contradiction: { label: '与观测矛盾', icon: '⊘', tone: '#dc2626', key: 'contradiction' },
  hypothesisAsFact: { label: '假设当事实', icon: '≒', tone: '#f97316', key: 'hypothesisAsFact' },
  fabricatedExecution: { label: '声称未跑实验', icon: '∅', tone: '#db2777', key: 'fabricatedExecution' },
  unsupportedAdoption: { label: '无据被采纳', icon: '⤳', tone: '#7c3aed', key: 'unsupportedAdoption' },
  correction: { label: '纠正 / 传播', icon: '↺', tone: '#0f9f6e', key: 'correction' },
};
const CHECK_FLAG = {
  contradiction: c => c.checks.contradiction.flag,
  hypothesisAsFact: c => c.checks.hypothesisAsFact.flag,
  fabricatedExecution: c => c.checks.fabricatedExecution.flag,
  unsupportedAdoption: c => c.checks.unsupportedAdoption.flag,
  correction: c => c.checks.correction.status === 'corrected' || c.checks.correction.status === 'propagated',
};

function event(id, time, agent, kind, title, detail, extra = {}) {
  return {
    id, time, agent, kind, title, detail,
    expected: extra.expected ?? null,
    observed: extra.observed ?? null,
    stateChange: extra.stateChange ?? null,
    to: extra.to ?? null,
    relation: extra.relation ?? null,
    annotation: extra.annotation ?? null,
    goldStatus: normalizeGoldStatus(extra.goldStatus, extra.annotation ? 'hallucination' : 'valid'),
    goldReason: extra.goldReason ?? null,
    signal: extra.signal ?? null,
    evidence: extra.evidence ?? null,
    ...extra,
  };
}

function normalizeGoldStatus(value, fallback='unreviewed') {
  if(value==null||value==='')return fallback;
  const s=String(value).toLowerCase();
  if(/hallucination|error|invalid|错误|幻觉/.test(s))return 'hallucination';
  if(/valid|correct|正确|有效/.test(s))return 'valid';
  if(/uncertain|待定|不确定/.test(s))return 'uncertain';
  if(/unreviewed|未复核/.test(s))return 'unreviewed';
  return fallback;
}

const DATA = {
  Single: {
    id: 'run-sgl-011', task: '删除场景中的 person_A 及物理依赖实体', duration: '15.7s',
    agents: ['Solo-Agent'],
    metrics: { affectedF1: .58, grounding: .70, progress: .72, cost: 4, recovery: 0, spread: 2 },
    episodes: [{ id:'sgl-1', start:0, end:6, motif:'Single', confidence:.99, evidence:'全程只有 Solo-Agent；工具结果回到同一上下文。' }],
    events: [
      event('s1','00:00.0','Solo-Agent','plan','制定单体计划','读取画面、生成掩码并验证。',{motif:'Single'}),
      event('s2','00:02.4','Solo-Agent','observation','读取目标区域','检测到 person_A，未展开附着关系。',{expected:{person_A:'present',bag_A:'attached'},observed:{person_A:'present'},annotation:'context',signal:'origin',motif:'Single',evidence:'frame_0212'}),
      event('s3','00:05.1','Solo-Agent','reason','确认影响范围','自我推断仅需处理 person_A。',{signal:'accepted',motif:'Single'}),
      event('s4','00:08.0','Solo-Agent','action','调用删除工具','mask target=person_A。',{signal:'propagated',motif:'Single',stateChange:'person_A: present → removed'}),
      event('s5','00:11.8','Solo-Agent','observation','读取工具成功状态','status=200；未检查目标外区域。',{expected:{person_A:'removed',bag_A:'removed'},observed:{person_A:'removed',bag_A:'present'},annotation:'tool',signal:'propagated',motif:'Single'}),
      event('s6','00:15.7','Solo-Agent','complete','宣布完成','把工具成功等同于任务成功。',{annotation:'completion',signal:'propagated',motif:'Single'})
    ]
  },
  Independent: {
    id: 'run-ind-024', task: '删除场景中的 person_A 及物理依赖实体', duration: '18.4s',
    agents: ['A-视觉', 'B-关系', 'C-执行'],
    metrics: { affectedF1: .67, grounding: .76, progress: .80, cost: 3, recovery: 0, spread: 2 },
    episodes: [{ id:'ind-1', start:0, end:6, motif:'Independent', confidence:.96, evidence:'三个同级 Agent 并行分析，彼此不读取结果，最终由执行分支汇聚。' }],
    events: [
      event('i1','00:00.0','A-视觉','plan','解析目标实体','定位 person_A 与空间邻域。',{evidence:'frame_0212 @ 00:08.48'}),
      event('i2','00:02.1','A-视觉','observation','检测到 person_A','bbox=[412,88,611,702]，置信度 0.94。',{observed:{person_A:'present', bag_A:'attached'},expected:{person_A:'present',bag_A:'attached'}}),
      event('i3','00:04.7','B-关系','reason','独立推断影响范围','仅把 person_A 判为需要编辑，忽略其手持 bag_A。',{observed:{affected:['person_A']},expected:{affected:['person_A','bag_A']},annotation:'context',signal:'origin',evidence:'relation graph edge: holds(person_A, bag_A)'}),
      event('i4','00:08.2','C-执行','action','执行删除掩码','删除 person_A；保留 bag_A。',{stateChange:'person_A: present → removed',signal:'accepted',annotation:'planning'}),
      event('i5','00:12.9','C-执行','observation','工具返回 success','mask_inpaint status=200，但 bag_A 悬浮。',{observed:{person_A:'removed',bag_A:'present'},expected:{person_A:'removed',bag_A:'removed'},annotation:'state',signal:'propagated',evidence:'output/frame_0212.png'}),
      event('i6','00:18.4','C-执行','complete','宣布任务完成','以工具 success 作为完成依据，未做物理一致性验证。',{annotation:'completion',signal:'propagated'})
    ]
  },
  Pipeline: {
    id: 'run-pip-018', task: '删除场景中的 person_A 及物理依赖实体', duration: '19.8s',
    agents: ['Detector', 'Relation', 'Editor', 'Verifier'],
    metrics: { affectedF1: .71, grounding: .79, progress: .83, cost: 4, recovery: 0, spread: 3 },
    episodes: [{ id:'pip-1', start:0, end:7, motif:'Pipeline', confidence:.98, evidence:'Detector → Relation → Editor → Verifier，后一步显式依赖前一步输出。' }],
    events: [
      event('p1','00:00.0','Detector','observation','输出检测列表','entities=[person_A, bag_A, bench_1]',{to:'Relation',relation:'handoff',motif:'Pipeline'}),
      event('p2','00:03.0','Relation','reason','生成关系子图','错误标注 bag_A 为背景物。',{expected:{bag_A:'attached'},observed:{bag_A:'background'},annotation:'knowledge',signal:'origin',motif:'Pipeline',dependsOn:['p1']}),
      event('p3','00:05.8','Relation','message','交接影响集合','affected=[person_A]',{to:'Editor',relation:'result-used-by',signal:'propagated',motif:'Pipeline',dependsOn:['p2']}),
      event('p4','00:09.0','Editor','action','执行单实体删除','严格消费上游 affected 集合。',{to:'Verifier',relation:'handoff',signal:'accepted',motif:'Pipeline',dependsOn:['p3'],stateChange:'person_A: present → removed'}),
      event('p5','00:13.2','Verifier','observation','局部区域验证','目标框内无 person_A，未检查 bag_A。',{expected:{person_A:'removed',bag_A:'removed'},observed:{person_A:'removed',bag_A:'present'},annotation:'state',signal:'propagated',motif:'Pipeline',dependsOn:['p4']}),
      event('p6','00:16.1','Verifier','decision','通过验证','局部检查结果被继续传递。',{signal:'propagated',motif:'Pipeline',dependsOn:['p5']}),
      event('p7','00:19.8','Verifier','complete','流水线完成','错误沿四个阶段到达完成判断。',{annotation:'completion',signal:'propagated',motif:'Pipeline'})
    ]
  },
  Discussion: {
    id: 'run-deb-025', task: '删除场景中的 person_A 及物理依赖实体', duration: '27.1s',
    agents: ['Proposer', 'Critic', 'Judge'],
    metrics: { affectedF1: .88, grounding: .86, progress: .92, cost: 8, recovery: 1, spread: 1 },
    episodes: [{ id:'dsc-1', start:0, end:8, motif:'Discussion', confidence:.94, evidence:'提案、质疑、反例和裁决形成多轮互惠通信。' }],
    events: [
      event('d1','00:00.0','Proposer','plan','提出编辑计划','删除 person_A，背景补全。'),
      event('d2','00:03.2','Proposer','observation','读取局部关系','检测 person_A、bag_A 与 bench_1。',{observed:{edges:['near(person_A,bench_1)']},expected:{edges:['holds(person_A,bag_A)','near(person_A,bench_1)']},annotation:'context',signal:'origin'}),
      event('d3','00:07.0','Proposer','message','提交候选方案','affected={person_A}',{to:'Critic',relation:'proposal',signal:'propagated'}),
      event('d4','00:10.5','Critic','reason','质疑依赖缺失','bag_A 在连续帧中与手部同速，可能是持有关系。',{evidence:'motion track #44',signal:'corrected'}),
      event('d5','00:14.8','Critic','message','发送反例证据','建议 affected 加入 bag_A。',{to:'Judge',relation:'challenge'}),
      event('d6','00:18.0','Judge','decision','修订编辑集合','采用 affected={person_A, bag_A}。',{stateChange:'affected: 1 → 2',signal:'corrected'}),
      event('d7','00:23.4','Judge','action','执行联合删除','两个 mask 合并后时序补全。',{expected:{person_A:'removed',bag_A:'removed'},observed:{person_A:'removed',bag_A:'removed'}}),
      event('d8','00:27.1','Judge','complete','验证后完成','跨 8 帧检查无悬浮物与残影。')
    ]
  },
  Star: {
    id: 'run-hub-031', task: '删除场景中的 person_A 及物理依赖实体', duration: '21.6s',
    agents: ['Coordinator', 'Vision', 'Executor'],
    metrics: { affectedF1: .74, grounding: .82, progress: .84, cost: 6, recovery: 0, spread: 3 },
    episodes: [{ id:'str-1', start:0, end:8, motif:'Star', confidence:.97, evidence:'Coordinator 中介 Vision 与 Executor 的全部通信；叶节点之间无直接边。' }],
    events: [
      event('h1','00:00.0','Coordinator','plan','拆分并分派任务','Vision 识别实体，Executor 准备编辑。',{to:'Vision',relation:'delegate'}),
      event('h2','00:03.1','Vision','observation','实体与关系检测','识别 person_A、bag_A；错误判定 bag_A 属于背景。',{expected:{bag_A:'attached'},observed:{bag_A:'background'},annotation:'knowledge',signal:'origin'}),
      event('h3','00:06.2','Vision','message','回传视觉结论','只需删除 person_A。',{to:'Coordinator',relation:'report',signal:'propagated'}),
      event('h4','00:09.0','Coordinator','decision','接受子 Agent 结论','未要求原始证据位置，生成单实体计划。',{annotation:'planning',signal:'accepted'}),
      event('h5','00:12.7','Coordinator','message','下发删除指令','mask target=person_A。',{to:'Executor',relation:'delegate',signal:'propagated'}),
      event('h6','00:16.3','Executor','action','执行视频补全','工具正常返回。',{stateChange:'person_A: present → removed'}),
      event('h7','00:19.0','Executor','observation','抽样帧验证','只检查目标区域，未检查 bag_A。',{annotation:'tool',signal:'propagated'}),
      event('h8','00:21.6','Coordinator','complete','汇总并完成','根据 Executor success 宣布完成。',{annotation:'completion',signal:'propagated'})
    ]
  },
  'Harness Dynamic': {
    id: 'dsh-session-042', task: '修复删除实体后遗留依赖对象的缺陷', duration: '34.6s',
    agents: ['Main', 'Research', 'Test', 'Coder', 'Critic'],
    metrics: { affectedF1: 1, grounding: .94, progress: .96, cost: 11, recovery: 1, spread: 3 },
    episodes: [
      { id:'dyn-1', start:0, end:1, motif:'Single', confidence:.99, evidence:'Main 独立解析任务与制定初始计划。' },
      { id:'dyn-2', start:1, end:3, motif:'Star', confidence:.95, evidence:'Main 作为中心连续发起 subagent/start，所有委派从中心出发。' },
      { id:'dyn-3', start:3, end:6, motif:'Independent', confidence:.93, evidence:'Research、Test、Coder 在隔离子会话并行运行，无同级消息边。' },
      { id:'dyn-4', start:6, end:9, motif:'Pipeline', confidence:.90, evidence:'Research 结论被 Main 接受，并作为 Coder 修改输入；存在 result-used-by 依赖。' },
      { id:'dyn-5', start:9, end:12, motif:'Discussion', confidence:.92, evidence:'Main、Critic、Test 围绕同一结论交换反例并触发修订。' },
      { id:'dyn-6', start:12, end:15, motif:'Single', confidence:.98, evidence:'Main 合并修复、调用验证工具并完成。' }
    ],
    events: [
      event('y1','00:00.0','Main','plan','解析任务与风险','Main 先建立修改目标和验证条件。',{motif:'Single',sessionId:'root'}),
      event('y2','00:02.0','Main','message','委派代码定位','启动 Research 子会话。',{to:'Research',relation:'delegate',motif:'Star',sessionId:'root',childSessionId:'child-research'}),
      event('y3','00:03.1','Main','message','委派测试复现','启动 Test 与 Coder 子会话。',{to:'Test',relation:'delegate',motif:'Star',sessionId:'root',childSessionId:'child-test'}),
      event('y4','00:06.2','Research','observation','定位影响集合逻辑','误判只删除目标实体，不需展开 holds 关系。',{expected:{affected:['person_A','bag_A']},observed:{affected:['person_A']},annotation:'context',signal:'origin',motif:'Independent',sessionId:'child-research',parentSessionId:'root',parallelGroup:'fanout-1',evidence:'src/graph/affected.ts:42',claims:[{id:'c-y4-1',text:'影响集合只需包含 person_A。',verdict:'contradicted',evidenceRefs:['fixture expected.affected = person_A + bag_A','观测 affected = person_A','src/graph/affected.ts:42'],adoptedBy:['y7','y8'],fate:'adopted',note:'日志给出的观测与完整影响集合相矛盾。'}]}),
      event('y5','00:07.0','Test','observation','复现现有用例','旧用例只断言 person_A 消失，未覆盖 bag_A。',{signal:'propagated',motif:'Independent',sessionId:'child-test',parentSessionId:'root',parallelGroup:'fanout-1',evidence:'tests/remove.spec.ts:18'}),
      event('y6','00:08.4','Coder','plan','准备最小补丁','隔离分支等待定位结果。',{motif:'Independent',sessionId:'child-code',parentSessionId:'root',parallelGroup:'fanout-1'}),
      event('y7','00:11.0','Research','message','回传错误结论','affected={person_A}。',{to:'Main',relation:'report',signal:'accepted',motif:'Pipeline',sessionId:'child-research',dependsOn:['y4'],claims:[{id:'c-y7-1',text:'affected={person_A} 是完整的影响集合。',verdict:'contradicted',evidenceRefs:['y4'],adoptedBy:['y8'],fate:'adopted',note:'Research 将未经充分核查的结论作为报告回传。'}]}),
      event('y8','00:14.2','Main','message','将结论交给 Coder','把 Research 输出作为补丁约束。',{to:'Coder',relation:'result-used-by',signal:'propagated',motif:'Pipeline',dependsOn:['y7'],claims:[{id:'c-y8-1',text:'补丁只需处理 person_A。',verdict:'contradicted',evidenceRefs:['y7','y4'],adoptedBy:['y9'],fate:'adopted',note:'Main 将错误集合写入下游补丁约束。'}]}),
      event('y9','00:18.1','Coder','action','提交单实体补丁','补丁通过旧测试，但仍留下 bag_A。',{expected:{removed:['person_A','bag_A']},observed:{removed:['person_A']},annotation:'planning',signal:'propagated',motif:'Pipeline',dependsOn:['y8'],stateChange:'patch: none → target-only'}),
      event('y10','00:21.0','Main','message','请求交叉复核','把补丁与目标状态发给 Critic、Test。',{to:'Critic',relation:'challenge',motif:'Discussion',dependsOn:['y9']}),
      event('y11','00:24.3','Critic','reason','提出反例','holds(person_A, bag_A) 说明影响闭包缺少 bag_A。',{to:'Main',relation:'counterexample',signal:'corrected',motif:'Discussion',evidence:'frame_0212 + relation graph',claims:[{id:'c-y11-1',text:'holds(person_A, bag_A)，因此影响闭包需要包含 bag_A。',verdict:'supported',evidenceRefs:['frame_0212','relation graph: holds(person_A,bag_A)','y9 observed.removed'],adoptedBy:['y13'],fate:'adopted',note:'反例证据触发了影响集合修订。'}]}),
      event('y12','00:26.0','Test','message','确认新增失败用例','新增物理一致性断言可稳定复现悬浮 bag_A。',{to:'Main',relation:'revision',signal:'corrected',motif:'Discussion',dependsOn:['y11']}),
      event('y13','00:29.0','Main','action','合并影响闭包修复','递归删除 holds 依赖并更新测试。',{motif:'Single',stateChange:'affected: 1 → 2',dependsOn:['y11','y12']}),
      event('y14','00:32.1','Main','observation','运行验证工具','新旧测试全部通过，真实状态与预期一致。',{motif:'Single',expected:{person_A:'removed',bag_A:'removed',tests:'pass'},observed:{person_A:'removed',bag_A:'removed',tests:'pass'},evidence:'test run #884',claims:[{id:'c-y14-1',text:'新旧测试均已执行并通过，person_A 与 bag_A 均已移除。',verdict:'supported',experimentExecution:'verified',evidenceRefs:['test run #884','y14.expected','y14.observed'],adoptedBy:['y15'],fate:'adopted',note:'需要保留实际执行记录或测试产物；不能只依据最终回复判定。'}]}),
      event('y15','00:34.6','Main','complete','基于证据完成','修复声明绑定补丁、失败用例与验证结果。',{motif:'Single'})
    ]
  }
};

const state = {
  architecture: 'Harness Dynamic',
  tab: 'trace',
  selectedId: 'y4',
  selectedAgent: null,
  selectedMessageId: null,
  selectedTaskInfoId: null,
  compareA: 'Pipeline',
  compareB: 'Harness Dynamic',
  query: '',
  kindFilter: 'all',
  annotations: JSON.parse(localStorage.getItem('tracelab-annotations') || '{}'),
  claimAnnotations: JSON.parse(localStorage.getItem('tracelab-claim-annotations') || '{}'),
  motifOverrides: JSON.parse(localStorage.getItem('tracelab-motif-overrides') || '{}'),
  // 运行台 / 自动核查
  backend: null,            // /api/status 结果；null = 离线
  architectures: [], datasetsApi: [], tasksApi: [], runs: [],
  launch: { architecture: 'dsh', dataset: 'swebench', taskId: null, mode: 'scripted' },
  live: null,               // {runId, events[], status, close}
  audit: { runId: null, report: null, filter: 'all', loading: false },
  phenomena: { data: null, loading: false, expanded: null },
};

const app = document.querySelector('#app');

function getTrace(name = state.architecture) { return DATA[name]; }
function selectedEvent() { return getTrace().events.find(e => e.id === state.selectedId) || getTrace().events[0]; }
function goldRecord(e, arch = state.architecture) { return state.annotations[`${arch}:${e.id}`] || null; }
function goldStatusOf(e, arch = state.architecture) { const r=goldRecord(e,arch); return r?.status ?? (r?.type?'hallucination':null) ?? e.goldStatus ?? 'unreviewed'; }
function annotationOf(e, arch = state.architecture) { return goldStatusOf(e,arch)==='hallucination' ? (goldRecord(e,arch)?.type ?? e.annotation ?? 'context') : null; }
function noteOf(e, arch = state.architecture) { return goldRecord(e,arch)?.note ?? e.goldReason ?? ''; }
function claimKey(e, claim, arch=state.architecture) { return `${arch}:${e.id}:${claim.id}`; }
function claimReview(e, claim, arch=state.architecture) { return {...claim,...(state.claimAnnotations[claimKey(e,claim,arch)]||{})}; }
function goldCoverage(trace = getTrace(), arch = state.architecture) { return trace.events.filter(e=>goldStatusOf(e,arch)!=='unreviewed').length; }
function goldStats(trace = getTrace(), arch = state.architecture) {
  const reviewed=goldCoverage(trace,arch);
  const hallucinations=trace.events.filter(e=>goldStatusOf(e,arch)==='hallucination').length;
  const uncertain=trace.events.filter(e=>goldStatusOf(e,arch)==='uncertain').length;
  return {reviewed,hallucinations,uncertain,coverage:trace.events.length?reviewed/trace.events.length:0,rate:reviewed?hallucinations/reviewed:0};
}
function hasComposition(name = state.architecture) {
  if (BASIC_ARCHS.has(name)) return false;
  if (name === 'Harness Dynamic') return true;
  return Boolean((DATA[name]?.sourceType==='Imported'||DATA[name]?.sourceType==='Run') && episodesFor(DATA[name],name).length > 1);
}
function isMismatch(e) {
  if (e.expected == null || e.observed == null) return false;
  return JSON.stringify(sortObject(e.expected)) !== JSON.stringify(sortObject(e.observed));
}
function sortObject(v) {
  if (Array.isArray(v)) return [...v].sort().map(sortObject);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o,k) => (o[k]=sortObject(v[k]),o),{});
  return v;
}
function firstError(trace = getTrace(), arch = state.architecture) {
  return trace.events.find(e => goldStatusOf(e,arch) === 'hallucination') || null;
}
function inferPropagationSignals(events) {
  const tainted=new Set(); let hasOrigin=events.some(e=>e.signal==='origin' && e.goldStatus==='hallucination');
  events.forEach(e=>{
    const deps=Array.isArray(e.dependsOn)?e.dependsOn:(e.dependsOn?[e.dependsOn]:[]);
    const consumesError=deps.some(id=>tainted.has(String(id)));
    const correctionCue=/counter|challenge|revision|correct|verify|reject/i.test(`${e.relation||''} ${e.kind||''} ${e.title||''}`);
    if(!e.signal && e.goldStatus==='hallucination' && !hasOrigin){e.signal='origin';hasOrigin=true;tainted.add(String(e.id));return;}
    if(e.signal==='origin' && e.goldStatus==='hallucination'){tainted.add(String(e.id));return;}
    if(!e.signal && consumesError){
      if(correctionCue && !isMismatch(e)) e.signal='corrected';
      else e.signal=['message','report','tool/call'].includes(e.kind)?'propagated':'accepted';
    }
    if(consumesError && e.signal!=='corrected')tainted.add(String(e.id));
  });
}
function rebuildPropagationFromGold(trace = getTrace(), arch = state.architecture) {
  const firstIndex=trace.events.findIndex(e=>goldStatusOf(e,arch)==='hallucination');
  if(firstIndex<0)return;
  const tainted=new Set([String(trace.events[firstIndex].id)]);
  if(!trace.events[firstIndex].signal)trace.events[firstIndex].signal='origin';
  trace.events.slice(firstIndex+1).forEach(e=>{
    const deps=Array.isArray(e.dependsOn)?e.dependsOn:(e.dependsOn?[e.dependsOn]:[]);
    if(!deps.some(id=>tainted.has(String(id))))return;
    const correctionCue=/counter|challenge|revision|correct|verify|reject/i.test(`${e.relation||''} ${e.kind||''} ${e.title||''}`);
    if(!e.signal)e.signal=correctionCue&&goldStatusOf(e,arch)==='valid'?'corrected':(['message','report','tool/call'].includes(e.kind)?'propagated':'accepted');
    if(e.signal!=='corrected')tainted.add(String(e.id));
  });
}
function recomputeGoldMetrics(trace = getTrace(), arch = state.architecture) {
  const firstIndex=trace.events.findIndex(e=>goldStatusOf(e,arch)==='hallucination');
  const afterFirst=firstIndex>=0?trace.events.slice(firstIndex+1):[];
  const correctionIndex=afterFirst.findIndex(e=>e.signal==='corrected');
  const propagationWindow=correctionIndex>=0?afterFirst.slice(0,correctionIndex):afterFirst;
  const stats=goldStats(trace,arch);
  trace.metrics={...trace.metrics,goldCoverage:stats.coverage,hallucinationRate:stats.rate,spread:propagationWindow.filter(e=>['accepted','propagated'].includes(e.signal)).length,recovery:correctionIndex>=0?1:0};
  return trace.metrics;
}
function escapeHTML(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function initials(name) { return name.split(/[-_ ]/).map(s=>s[0]).join('').slice(0,2).toUpperCase(); }
function jsonBlock(v) { return v == null ? '<span class="muted">— 未提供 —</span>' : `<pre>${escapeHTML(JSON.stringify(v,null,2))}</pre>`; }

function episodeStatus(ep, trace = getTrace(), arch = state.architecture) {
  const events = trace.events.slice(ep.start, ep.end);
  const origin = trace.events.findIndex(e => goldStatusOf(e,arch)==='hallucination');
  if (origin < 0) return 'clean';
  if (events.some(e => goldStatusOf(e,arch)==='hallucination' && e.signal === 'origin')) return 'origin';
  if (events.some(e => e.signal === 'corrected')) return 'corrected';
  if (events.some(e => ['accepted','propagated'].includes(e.signal))) return 'propagated';
  if (origin >= 0 && ep.start > origin) return 'recovered';
  return 'clean';
}

function inferEventMotif(trace, index) {
  const current = trace.events[index];
  if (current.motif && PRIMITIVES[current.motif]) return { motif: current.motif, confidence: .98, evidence: '日志提供 motif 字段；已与邻近通信边交叉检查。' };
  const window = trace.events.slice(Math.max(0,index-2), Math.min(trace.events.length,index+3));
  const agents = new Set(window.flatMap(e => [e.agent,e.to].filter(Boolean)));
  const relations = window.map(e => String(e.relation||'').toLowerCase());
  const siblingSessions = new Set(window.filter(e=>e.parentSessionId).map(e=>`${e.parentSessionId}:${e.sessionId}`));
  const hasDependency = window.some(e => e.dependsOn?.length) || relations.some(r=>/handoff|result-used|next|causal/.test(r));
  const hasDiscussion = relations.some(r=>/challenge|counter|critique|revision|debate/.test(r));
  const hasStar = relations.some(r=>/delegate|report|route/.test(r));
  if (agents.size <= 1) return { motif:'Single', confidence:.88, evidence:'滑动窗口内仅检测到一个活跃 Agent。' };
  if (hasDiscussion) return { motif:'Discussion', confidence:.84, evidence:'检测到质疑、反例或修订关系。' };
  if (siblingSessions.size >= 2 || window.filter(e=>e.parallelGroup).length >= 2) return { motif:'Independent', confidence:.86, evidence:'检测到同父隔离会话或共同 parallel_group，且无同级依赖。' };
  if (hasDependency) return { motif:'Pipeline', confidence:.82, evidence:'检测到 result-used-by / handoff / depends_on 数据依赖。' };
  if (hasStar) return { motif:'Star', confidence:.80, evidence:'delegate/report 边集中连接中心执行者。' };
  return { motif:'Hybrid / Unknown', confidence:.42, evidence:'通信证据不足，保留 Unknown，等待人工复核。' };
}

function episodesFor(trace = getTrace(), arch = state.architecture) {
  const source = trace.episodes?.length ? trace.episodes.map(x=>({...x})) : (()=>{
    const inferred = trace.events.map((_,i)=>inferEventMotif(trace,i));
    const groups = [];
    inferred.forEach((item,i)=>{
      const last=groups.at(-1);
      if(last?.motif===item.motif){last.end=i+1;last.confidence=(last.confidence+item.confidence)/2;}
      else groups.push({id:`auto-${groups.length+1}`,start:i,end:i+1,...item});
    });
    return groups;
  })();
  return source.map((ep,i)=>{
    const key=`${arch}:${ep.id||i}`;
    const motif=state.motifOverrides[key]||ep.motif;
    return {...ep,id:ep.id||`episode-${i+1}`,motif,originalMotif:ep.motif,status:episodeStatus(ep,trace,arch)};
  });
}

function architectureSummary(trace = getTrace(), arch = state.architecture) {
  const eps=episodesFor(trace,arch);
  const avg=eps.reduce((s,e)=>s+(e.confidence||0),0)/(eps.length||1);
  const unknown=eps.filter(e=>!PRIMITIVES[e.motif]).length;
  return {episodes:eps,confidence:avg,unknown,signature:eps.map(e=>e.motif).join(' → ')};
}

function backendChip() {
  if (!state.backend) return `<span class="privacy offline">${ICONS.shield} 离线模式 · 本地解析</span>`;
  const llm = state.backend.llm || {};
  return `<span class="privacy public">${ICONS.shield} 后端已连 · ${escapeHTML(llm.model || 'scripted')}${llm.llmConfigured ? '' : '（未配 Key）'}</span>`;
}

function header() {
  return `<header class="topbar">
    <div class="brand-wrap">
      <div class="brand-mark"><span></span><span></span><span></span></div>
      <div><div class="brand">TRACE<span>//</span>LAB</div><div class="brand-sub">MULTI-AGENT OBSERVABILITY</div></div>
    </div>
    <div class="run-context">
      <span class="pulse"></span><span>LIVE ANALYSIS</span>
      <span class="divider"></span>
      <span class="run-name">${escapeHTML(getTrace().system?`${getTrace().system} · ${getTrace().id}`:getTrace().id)}</span>
      ${backendChip()}
      <span class="method-badge">判定：人工 Gold 轨迹</span>
    </div>
    <div class="header-actions">
      <button class="btn ghost" id="pasteBtn">${ICONS.paste} 粘贴 Event</button>
      <label class="btn ghost" for="goldInput">${ICONS.check} 导入人工 Gold</label>
      <input id="goldInput" type="file" accept=".json,.jsonl,.txt" hidden />
      <label class="btn primary" for="fileInput">${ICONS.upload} 导入日志</label>
      <input id="fileInput" type="file" accept=".json,.jsonl,.log,.txt" hidden />
    </div>
  </header>`;
}

function controls() {
  const archs = Object.keys(DATA);
  return `<section class="control-strip">
    <div class="arch-switcher">
      <span class="control-label">ARCHITECTURE</span>
      ${archs.map(a => `<button class="arch-chip ${state.architecture===a?'active':''}" data-arch="${a}" style="--tone:${ARCH_META[a]?.tone || '#2563eb'}">
        <b>${ARCH_META[a]?.short || 'LOG'}</b><span>${a}</span>
      </button>`).join('')}
    </div>
    <div class="control-right">
      <div class="run-stat"><span>EVENTS</span><b>${getTrace().events.length}</b></div>
      <div class="run-stat"><span>AGENTS</span><b>${getTrace().agents.length}</b></div>
      <div class="run-stat"><span>DURATION</span><b>${getTrace().duration}</b></div>
      <div class="run-stat"><span>GOLD</span><b>${goldCoverage()}/${getTrace().events.length}</b></div>
      <button class="btn sample" id="sampleBtn">${ICONS.play} 重置示例</button>
    </div>
  </section>`;
}

function tabs() {
  return `<nav class="tabs">
    <button data-tab="runs" class="${state.tab==='runs'?'active':''}">运行台 <span>${state.backend?state.runs.length:'—'}</span></button>
    <button data-tab="audit" class="${state.tab==='audit'?'active':''}">核查轨迹 <span>${state.runs.filter(r=>r.audited).length||''}</span></button>
    <button data-tab="phenomena" class="${state.tab==='phenomena'?'active':''}">失败现象 <span>${state.phenomena.data?state.phenomena.data.phenomena.reduce((n,p)=>n+p.total,0):''}</span></button>
    <button data-tab="trace" class="${state.tab==='trace'?'active':''}">执行轨迹 <span>${getTrace().events.length}</span></button>
    <button data-tab="compare" class="${state.tab==='compare'?'active':''}">并排比较</button>
    <button data-tab="metrics" class="${state.tab==='metrics'?'active':''}">指标视图</button>
    <button data-tab="catalog" class="${state.tab==='catalog'?'active':''}">测评对象 <span>${ARCHITECTURE_CATALOG.reduce((n,g)=>n+g.items.length,0)}</span></button>
  </nav>`;
}

function catalogView() {
  const descriptions={
    static:['拓扑和 Agent 角色预先配置','固定成员 / 固定依赖'],
    hybrid:['固定成员，运行时改变路由或阶段内容','固定团队 / 自适应控制'],
    dynamic:['运行时可委派、创建 Agent 或扩展团队','动态成员 / 动态委派'],
  };
  return `<section class="catalog-view">
    <header class="catalog-heading"><div><span class="eyebrow">MULTI-AGENT EVALUATION TARGETS</span><h2>架构与运行系统清单</h2><p>按运行时可变性归类。框架不等于单一架构，最终分类应以这次运行的配置与日志为准。</p></div><div class="catalog-legend"><span class="mode-static">静态协作</span><span class="mode-hybrid">固定成员 · 动态路由</span><span class="mode-dynamic">动态委派</span></div></header>
    <div class="catalog-groups">${ARCHITECTURE_CATALOG.map(group=>`<article class="catalog-group ${group.mode}"><header><div><h3>${escapeHTML(group.group)}</h3><p>${descriptions[group.mode][0]}</p></div><span>${descriptions[group.mode][1]}</span></header><div class="catalog-cards">${group.items.map(item=>`<section class="catalog-card"><div class="catalog-card-top"><span class="catalog-kind">${escapeHTML(item.kind)}</span><span class="catalog-mode mode-${group.mode}">${escapeHTML(group.group)}</span></div><h4>${escapeHTML(item.name)}</h4><p>${escapeHTML(item.summary)}</p><div class="capture-list"><b>建议保留</b><span>${escapeHTML(item.capture)}</span></div><footer>${item.runner&&state.backend
      ?`<span class="awaiting-log runnable"><i></i>已接入运行器 · 可直接运行</span><button class="btn catalog-run" data-catalog-run="${item.runner}">▶ 运行此架构</button>`
      :`<span class="awaiting-log"><i></i>需导入该对象的真实运行日志</span><button class="btn catalog-import" data-import-target="${escapeHTML(item.name)}">导入此对象日志</button>`}</footer></section>`).join('')}</div></article>`).join('')}</div>
    <div class="catalog-note"><b>比较纪律</b><p>当前架构样例用于检查网站交互，不代表框架实测结果。只有导入实际运行日志并完成 Gold 标注后，才计入架构比较和指标。</p></div>
  </section>`;
}

function compositionView() {
  const trace=getTrace();
  const summary=architectureSummary(trace,state.architecture);
  const first=firstError(trace,state.architecture);
  const firstIndex=first?trace.events.indexOf(first):-1;
  const activeMotifs=[...new Set(summary.episodes.map(e=>e.motif))];
  const propagationEvents=first?trace.events.slice(firstIndex).filter(e=>e.signal):[];
  const correctedAt=trace.events.findIndex(e=>e.signal==='corrected');
  const depth=correctedAt>=0?trace.events.slice(firstIndex+1,correctedAt).filter(e=>['accepted','propagated'].includes(e.signal)).length:trace.metrics.spread;
  const exposed=Math.max(0,propagationEvents.length-(first?1:0));
  const accepted=propagationEvents.filter(e=>['accepted','propagated'].includes(e.signal)).length;
  const rejected=propagationEvents.filter(e=>e.signal==='corrected').length;
  const acceptanceRate=accepted+rejected?accepted/(accepted+rejected):0;
  const affectedAgents=new Set(propagationEvents.filter(e=>e.signal!=='origin').map(e=>e.agent)).size;
  const motifAt=index=>summary.episodes.find(ep=>index>=ep.start&&index<ep.end)?.motif||'Hybrid / Unknown';
  const matrix=Object.fromEntries(Object.keys(PRIMITIVES).map(a=>[a,Object.fromEntries(Object.keys(PRIMITIVES).map(b=>[b,0]))]));
  propagationEvents.forEach((e,i)=>{if(!i)return;const a=motifAt(trace.events.indexOf(propagationEvents[i-1]));const b=motifAt(trace.events.indexOf(e));if(matrix[a]?.[b]!==undefined)matrix[a][b]++;});
  return `<section class="composition-view">
    <div class="composition-head">
      <div><span class="eyebrow">DYNAMIC ARCHITECTURE INFERENCE</span><h2>${escapeHTML(trace.id)} · 架构组合反演</h2><p>仅用于动态运行；幻觉起点与传播状态以人工 Gold 标注轨迹为准。</p></div>
      <div class="inference-score"><span>平均置信度</span><b>${Math.round(summary.confidence*100)}%</b><small>${summary.unknown?`${summary.unknown} 个待复核片段`:'全部片段已归类'}</small></div>
    </div>

    <div class="primitive-grid">
      ${Object.entries(PRIMITIVES).map(([name,p])=>`<article class="primitive-card ${activeMotifs.includes(name)?'active':''}" style="--motif:${ARCH_META[name].tone}"><div><b>${p.icon}</b><span>${name}</span></div><p>${p.rule}</p><small>${p.evidence}</small></article>`).join('')}
    </div>

    <div class="composition-layout">
      <article class="episode-panel">
        <header><div><span class="eyebrow">TEMPORAL MOTIF RIBBON</span><h3>动态组合时间轴</h3></div><span>${summary.episodes.length} EPISODES</span></header>
        <div class="motif-ribbon">${summary.episodes.map((ep,i)=>{
          const meta=ARCH_META[ep.motif]||{tone:'#94a3b8',short:'UNK'};
          const width=Math.max(12,((ep.end-ep.start)/trace.events.length)*100);
          return `<button class="ribbon-segment ${ep.status}" data-episode-jump="${ep.start}" style="--motif:${meta.tone};flex-basis:${width}%"><small>E${i+1}</small><b>${escapeHTML(ep.motif)}</b><span>${escapeHTML(trace.events[ep.start]?.time||'')}–${escapeHTML(trace.events[Math.max(ep.start,ep.end-1)]?.time||'')}</span></button>`;
        }).join('')}</div>
        <div class="ribbon-legend"><span><i class="origin"></i>错误产生</span><span><i class="propagated"></i>接受 / 传播</span><span><i class="corrected"></i>纠正</span><span><i class="recovered"></i>恢复后</span></div>
        <div class="composition-tree">
          <div class="tree-root"><span>ROOT SESSION</span><b>Main / Orchestrator</b></div>
          <div class="tree-line"></div>
          <div class="tree-children">${summary.episodes.map((ep,i)=>`<div class="tree-node" style="--motif:${(ARCH_META[ep.motif]||{tone:'#94a3b8'}).tone}"><span>${i+1}</span><b>${escapeHTML(ep.motif)}</b><small>${ep.end-ep.start} events</small>${ep.motif==='Star'&&summary.episodes.some(x=>x.motif==='Independent')?'<em>包含并行子会话</em>':''}</div>`).join('')}</div>
        </div>
      </article>

      <aside class="propagation-panel">
        <header><span class="eyebrow">ERROR PROPAGATION</span><h3>跨片段传播</h3></header>
        <div class="prop-stats"><span><small>FIRST ERROR</small><b>${first?`E${String(firstIndex+1).padStart(2,'0')}`:'—'}</b></span><span><small>DEPTH</small><b>${depth}</b></span><span><small>RECOVERY</small><b>${trace.metrics.recovery?'YES':'NO'}</b></span></div>
        <div class="error-path">${propagationEvents.map((e,i)=>`<div class="error-hop ${e.signal}"><span>${escapeHTML(e.agent)}</span><b>${({origin:'产生错误',accepted:'接受前提',propagated:'继续传播',corrected:'发现并纠正'})[e.signal]}</b><small>${escapeHTML(e.motif||inferEventMotif(trace,trace.events.indexOf(e)).motif)}</small>${i<propagationEvents.length-1?'<i>↓</i>':''}</div>`).join('')||'<p class="muted">当前轨迹没有已标记的错误传播事件。</p>'}</div>
      </aside>
    </div>

    <div class="episode-table-wrap"><div class="table-head"><h3>片段判定证据</h3><span>拓扑只是证据之一；result-used-by 才能区分并行与流水线</span></div><table class="episode-table"><thead><tr><th>片段</th><th>事件范围</th><th>自动识别 / 人工修订</th><th>置信度</th><th>判定证据</th><th>错误状态</th></tr></thead><tbody>${summary.episodes.map((ep,i)=>`<tr><td><b>E${i+1}</b></td><td>${escapeHTML(trace.events[ep.start]?.time||'')} – ${escapeHTML(trace.events[Math.max(ep.start,ep.end-1)]?.time||'')}</td><td><select data-motif-override="${ep.id}">${MOTIF_NAMES.map(n=>`<option ${n===ep.motif?'selected':''}>${n}</option>`).join('')}</select>${ep.motif!==ep.originalMotif?'<small class="manual-tag">MANUAL</small>':''}</td><td><b>${Math.round((ep.confidence||0)*100)}%</b></td><td>${escapeHTML(ep.evidence||'由邻近事件的通信与依赖边推断。')}</td><td><span class="episode-status ${ep.status}">${({origin:'错误产生',propagated:'传播中',corrected:'已纠正',recovered:'恢复后',clean:'正常'})[ep.status]}</span></td></tr>`).join('')}</tbody></table></div>
    <div class="propagation-metrics">
      <article><small>EXPOSED EVENTS</small><b>${exposed}</b><span>接触错误前提的下游事件</span></article>
      <article><small>ACCEPTANCE RATE</small><b>${Math.round(acceptanceRate*100)}%</b><span>接受或继续传播 / 已判定事件</span></article>
      <article><small>AFFECTED AGENTS</small><b>${affectedAgents}</b><span>除错误源外受影响的 Agent</span></article>
      <article><small>RECOVERY LATENCY</small><b>${correctedAt>=0?`${correctedAt-firstIndex} hops`:'—'}</b><span>first error 到首次纠正</span></article>
    </div>
    <div class="transition-wrap"><div class="table-head"><h3>基元间传播矩阵</h3><span>单元格 = 已标注错误链跨越次数</span></div><table class="transition-table"><thead><tr><th>FROM \ TO</th>${Object.keys(PRIMITIVES).map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${Object.keys(PRIMITIVES).map(a=>`<tr><th>${a}</th>${Object.keys(PRIMITIVES).map(b=>`<td class="${matrix[a][b]?'hot':''}" style="--heat:${Math.min(1,matrix[a][b]/2)}">${matrix[a][b]||'·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="method-note"><b>判定方法</b><p>架构片段可由拓扑自动推断，但“是否发生幻觉”只读取人工 Gold 标签。expected / observed 差异仅作为标注者证据，不会自动生成幻觉结论。</p></div>
  </section>`;
}

function traceView() {
  const trace = getTrace();
  const ev = selectedEvent();
  const first = firstError();
  let events = trace.events.filter(e => {
    const q = state.query.toLowerCase();
    const matchesQ = !q || [e.agent,e.title,e.detail,e.kind].join(' ').toLowerCase().includes(q);
    const matchesKind = state.kindFilter==='all' || e.kind===state.kindFilter || (state.kindFilter==='hallucination' && annotationOf(e));
    return matchesQ && matchesKind;
  });
  const agents = [...new Set([...trace.agents, ...trace.events.map(e=>e.agent), ...trace.events.map(e=>e.to).filter(Boolean)])];
  const selectedAgent = agents.includes(state.selectedAgent) ? state.selectedAgent : (state.selectedAgent = null);
  return `<div class="trace-grid trace-focus">
    <aside class="trace-rail">
      <div class="panel-head"><div><span class="eyebrow">SESSION</span><h2>执行事件</h2></div><span class="count">${events.length}/${trace.events.length}</span></div>
      <div class="search">${ICONS.search}<input id="eventSearch" value="${escapeHTML(state.query)}" placeholder="搜索 agent / action" /></div>
      <div class="filter-row">
        ${[['all','全部'],['observation','观测'],['message','通信'],['hallucination','Gold 幻觉']].map(([k,v])=>`<button data-kind="${k}" class="${state.kindFilter===k?'active':''}">${v}</button>`).join('')}
      </div>
      <div class="event-list">
        ${events.map((e,i)=>eventRow(e, trace.events.indexOf(e))).join('') || '<div class="empty">没有匹配事件</div>'}
      </div>
    </aside>
    <main class="trajectory">
      ${first ? firstErrorBanner(first) : autoAuditBanner() || successBanner()}
      ${agentFlow(trace)}
      ${agentCommunicationView(trace, selectedAgent)}
      ${taskInformationView(trace)}
    </main>
    <aside class="inspector">${inspector(ev)}</aside>
  </div>`;
}

function agentCommunicationView(trace, agent) {
  const messages=trace.events.filter(e=>e.to&&e.to!==e.agent).filter(e=>!agent||e.agent===agent||e.to===agent);
  if(!messages.some(e=>String(e.id)===String(state.selectedMessageId)))state.selectedMessageId=null;
  const selected=messages.find(e=>String(e.id)===String(state.selectedMessageId));
  const route=selected?messageRoute(trace,selected):{origin:null,steps:[]};
  const infoItems=informationItems(trace);
  const infoTagOf=e=>{
    const own=infoItems.map((item,i)=>String(item.origin.id)===String(e.id)?i:-1).filter(i=>i>=0);
    const idx=own.length?own:[infoItems.findIndex(item=>item.steps.some(st=>String(st.id)===String(e.id)))].filter(i=>i>=0);
    return idx.map(i=>`${infoItems[i].claim?'Claim':'信息'} ${String(i+1).padStart(2,'0')}`).join(' · ');
  };
  return `<section class="agent-detail-panel agent-communication-panel"><header><div><span class="eyebrow">AGENT COMMUNICATIONS · Agent 信息收发</span><h2>${agent?`${escapeHTML(agent)} 的信息交互`:'Agent 信息交互'}</h2><p>查看 Agent 产生、接收和传递的具体消息；点击消息可展开其上下游记录。</p></div><span class="count">${messages.length} 条消息</span></header><nav class="agent-filter">${[...new Set([...trace.agents,...trace.events.map(e=>e.agent),...trace.events.map(e=>e.to).filter(Boolean)])].map(name=>`<button data-agent-filter="${escapeHTML(name)}" class="${agent===name?'active':''}">${escapeHTML(name)}</button>`).join('')}</nav><div class="flow-choice-list">${messages.map((e,i)=>`<button class="flow-choice ${String(selected?.id)===String(e.id)?'active':''}" data-message-choice="${escapeHTML(e.id)}"><small>${escapeHTML(infoTagOf(e)||`消息 ${String(i+1).padStart(2,'0')}`)} · ${escapeHTML(e.time)}</small><b>${escapeHTML(e.detail||e.title||'未命名消息')}</b><span>${escapeHTML(e.agent)} → ${escapeHTML(e.to)}</span></button>`).join('')||'<div class="empty">当前 Agent 筛选下没有消息</div>'}</div>${selected?`<div class="flow-selected"><div class="flow-content"><span class="eyebrow">MESSAGE CONTENT</span><h3>${escapeHTML(selected.title||'Agent 消息')}</h3><p>${escapeHTML(selected.detail||'日志没有记录消息正文。')}</p><small>发送方：${escapeHTML(selected.agent)} · 接收方：${escapeHTML(selected.to)} · ${escapeHTML(selected.time)}</small></div><div class="flow-route-title"><b>关联事件</b><span>${route.steps.length} 个有记录的事件</span></div><div class="flow-route">${route.steps.map((e,i)=>`<article class="flow-step ${String(e.id)===String(selected.id)?'handoff':''}"><div class="flow-step-index">${String(e.id)===String(selected.id)?'传递':e.to?'转交':'处理'}</div><div><b>${escapeHTML(e.agent)}${e.to?` → ${escapeHTML(e.to)}`:''}</b><strong>${escapeHTML(e.title||e.kind)}</strong><p>${escapeHTML(e.detail||'没有记录详细内容。')}</p></div><time>${escapeHTML(e.time)}</time></article>`).join('')||'<p class="muted">日志没有记录可还原的上下游事件。</p>'}</div></div>`:''}</section>`;
}

function taskInformationView(trace) {
  const items=informationItems(trace);
  if(!items.some(item=>item.key===state.selectedTaskInfoId))state.selectedTaskInfoId=null;
  const selected=items.find(item=>item.key===state.selectedTaskInfoId);
  return `<section class="agent-detail-panel task-information-panel"><header><div><span class="eyebrow">TASK INFORMATION INDEX · 本次任务信息</span><h2>本次任务产生的信息</h2><p>按信息内容汇总本次任务中的 Claim 与消息。点击一条信息查看它经过哪些 Agent，以及日志记录的处理和转交过程。</p></div><span class="count">${items.length} 条信息</span></header><div class="flow-choice-list">${items.map((item,i)=>`<button class="flow-choice ${item.key===selected?.key?'active':''}" data-task-info-choice="${escapeHTML(item.key)}"><small>${item.claim?'Claim':'信息'} ${String(i+1).padStart(2,'0')} · ${escapeHTML(item.origin.time)}</small><b>${escapeHTML(item.text)}</b><span>${escapeHTML(item.origin.agent)}${item.origin.to?` → ${escapeHTML(item.origin.to)}`:' · 产生'}</span></button>`).join('')||'<div class="empty">日志没有记录可汇总的 Claim 或 Agent 间信息</div>'}</div>${selected?`<div class="flow-selected"><div class="flow-content"><span class="eyebrow">${selected.claim?'CLAIM':'INFORMATION'}</span><h3>${escapeHTML(selected.text)}</h3><p>${escapeHTML(selected.origin.detail||selected.origin.title||'日志没有记录更多上下文。')}</p><small>产生者：${escapeHTML(selected.origin.agent)} · ${escapeHTML(selected.origin.time)}</small></div><div class="flow-route-title"><b>Agent 传播路径</b><span>${selected.steps.length} 个有记录的事件</span></div><div class="flow-route">${selected.steps.map((e,i)=>{const sameClaim=(e.claims||[]).find(c=>c.id===selected.claim?.id);return `<article class="flow-step ${i===0?'handoff':''}"><div class="flow-step-index">${i===0?'产生':e.to?'传递':'处理'}</div><div><b>${escapeHTML(e.agent)}${e.to?` → ${escapeHTML(e.to)}`:''}</b><strong>${escapeHTML(e.title||e.kind)}</strong><p>${escapeHTML(sameClaim?.text||e.detail||'日志没有记录这一步的处理内容。')}</p></div><time>${escapeHTML(e.time)}</time></article>`;}).join('')||'<p class="muted">日志没有记录可还原的传播事件。</p>'}</div>${selected.steps.length<2?'<p class="flow-unrecorded">日志中未记录这条信息后续被其他 Agent 接收。</p>':''}</div>`:''}</section>`;
}

function informationItems(trace) {
  const events=trace.events, occurrences=[];
  events.forEach(event=>(event.claims||[]).forEach(claim=>occurrences.push({event,claim})));
  const downstreamEvents=new Set(occurrences.flatMap(({claim})=>(claim.adoptedBy||[]).map(String)));
  const items=[];
  for(const {event,claim} of occurrences){
    if(downstreamEvents.has(String(event.id)))continue;
    const included=new Set([String(event.id)]), queue=[event];
    while(queue.length){const current=queue.shift();for(const childId of (current.claims||[]).flatMap(c=>c.adoptedBy||[])){const child=events.find(e=>String(e.id)===String(childId));if(child&&!included.has(String(child.id))){included.add(String(child.id));queue.push(child);}}}
    const steps=events.filter(e=>included.has(String(e.id)));
    items.push({key:`claim:${event.id}:${claim.id}`,claim,origin:event,text:claim.text||'日志中的 Claim 未记录文本',steps});
  }
  const claimEventIds=new Set(occurrences.map(({event})=>String(event.id)));
  events.filter(e=>e.to&&e.to!==e.agent&&!claimEventIds.has(String(e.id))).forEach(event=>{
    const route=messageRoute(trace,event);
    items.push({key:`message:${event.id}`,origin:event,text:event.detail||event.title||'未记录信息内容',steps:route.steps});
  });
  return items.sort((a,b)=>events.indexOf(a.origin)-events.indexOf(b.origin));
}

function messageRoute(trace, selected) {
  const events=trace.events, byId=new Map(events.map((e,i)=>[String(e.id),{event:e,index:i}]));
  const ancestors=new Set(), queue=(selected.dependsOn||[]).map(String);
  while(queue.length){const id=queue.shift();if(ancestors.has(id)||!byId.has(id))continue;ancestors.add(id);for(const dep of byId.get(id).event.dependsOn||[])queue.push(String(dep));}
  const sourceCandidates=[...ancestors].map(id=>byId.get(id)).filter(x=>x.event.agent===selected.agent&&x.event.kind!=='message');
  const origin=sourceCandidates.sort((a,b)=>b.index-a.index)[0]?.event || [...ancestors].map(id=>byId.get(id)).sort((a,b)=>b.index-a.index)[0]?.event || selected;
  const included=new Set([String(selected.id)]), forward=[String(selected.id)];
  while(forward.length){const id=forward.shift();for(const e of events){if((e.dependsOn||[]).some(dep=>String(dep)===id)&&!included.has(String(e.id))){included.add(String(e.id));forward.push(String(e.id));}}}
  const sourceIndex=events.indexOf(origin);
  const steps=events.filter((e,i)=>String(e.id)===String(selected.id)||i>=sourceIndex&&ancestors.has(String(e.id))||included.has(String(e.id)));
  const downstream=steps.filter(e=>String(e.id)!==String(selected.id)&&events.indexOf(e)>events.indexOf(selected));
  return {origin,steps,unrecorded:downstream.length===0};
}

function eventRow(e, index) {
  const ann = annotationOf(e);
  return `<button class="event-row ${state.selectedId===e.id?'active':''} ${ann?'has-error':''}" data-event="${e.id}">
    <span class="event-index">${String(index+1).padStart(2,'0')}</span>
    <span class="event-copy"><b>${escapeHTML(e.title)}</b><small>${escapeHTML(e.agent)} · ${escapeHTML(e.time)}</small></span>
    ${ann?`<i class="error-pip" style="--pip:${TYPES[ann]?.color}"></i>`:''}
    ${e.autoFlagged?'<i class="error-pip auto"></i>':''}
    ${ICONS.chevron}
  </button>`;
}

function firstErrorBanner(e) {
  const idx = getTrace().events.indexOf(e) + 1;
  return `<div class="first-error-banner">
    <div class="alert-icon">!</div>
    <div><span class="eyebrow">FIRST GOLD HALLUCINATION · E${String(idx).padStart(2,'0')}</span><b>${escapeHTML(e.title)}</b><p>${escapeHTML(noteOf(e) || e.detail)}</p></div>
    <div class="propagation-mini"><span class="origin">产生</span><i></i><span class="accept">接受</span><i></i><span class="spread">传播 ${getTrace().metrics.spread}</span>${getTrace().metrics.recovery?'<i></i><span class="fix">纠正</span>':''}</div>
    <button class="btn jump" data-event="${e.id}">${ICONS.eye} 查看证据</button>
  </div>`;
}

function successBanner() {
  const reviewed=goldCoverage(), total=getTrace().events.length;
  return `<div class="success-banner">${ICONS.check}<div><b>人工 Gold 轨迹中未标注幻觉</b><span>已复核 ${reviewed}/${total} 个事件；未复核事件不会被自动判为正确或错误。</span></div></div>`;
}

function agentFlow(trace, { interactive = true } = {}) {
  const edges = trace.events.filter(e=>e.to && e.to!==e.agent);
  const selectedItem=informationItems(trace).find(item=>item.key===state.selectedTaskInfoId);
  const highlighted=new Set(selectedItem?selectedItem.steps.map(e=>String(e.id)):[]);
  const agents = [...new Set([...trace.agents, ...trace.events.map(e=>e.agent), ...edges.map(e=>e.to)].filter(Boolean))];
  const width=760, height=Math.max(250,Math.min(390,agents.length*62)), boxW=126, boxH=46;
  const center={x:width/2,y:height/2};
  const points=new Map(agents.map((name,i)=>{
    const angle=(-Math.PI/2)+(2*Math.PI*i/Math.max(agents.length,1));
    const radius=Math.min(width*.36,height*.38);
    return [name,{x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius}];
  }));
  const dirRank=new Map();
  const paths=edges.map(e=>{
    const a=points.get(e.agent), b=points.get(e.to); if(!a||!b)return '';
    const dk=`${e.agent}→${e.to}`, rank=dirRank.get(dk)||0; dirRank.set(dk,rank+1);
    // 平行车道：以“字母序较小→较大”方向为参考法向，正向边偏一侧、反向边偏另一侧，
    // 锚点沿偏移线与节点矩形边界求交，两个方向的线从锚点到中段都不重合。
    const lo=e.agent<e.to?e.agent:e.to, side=e.agent===lo?1:-1;
    const pa=points.get(lo), pb=points.get(e.agent===lo?e.to:e.agent);
    const rl=Math.max(1,Math.hypot(pb.x-pa.x,pb.y-pa.y));
    const ox=-(pb.y-pa.y)/rl, oy=(pb.x-pa.x)/rl;
    const lane=side*(9+16*rank);
    const ang=Math.atan2(b.y-a.y,b.x-a.x), nx=Math.cos(ang), ny=Math.sin(ang);
    const borderPoint=(c,dir)=>{
      const lx=ox*lane, ly=oy*lane, ex=dir*nx, ey=dir*ny;
      const tx=ex>0?(boxW/2+2.5-lx)/ex:ex<0?(boxW/2+2.5+lx)/(-ex):Infinity;
      const ty=ey>0?(boxH/2+2.5-ly)/ey:ey<0?(boxH/2+2.5+ly)/(-ey):Infinity;
      const t=Math.max(0,Math.min(tx,ty));
      return {x:c.x+lx+ex*t,y:c.y+ly+ey*t};
    };
    const start=borderPoint(a,1), end=borderPoint(b,-1);
    const bow=side*(5+8*rank);
    const cx=(start.x+end.x)/2+ox*bow, cy=(start.y+end.y)/2+oy*bow;
    const lt=side>0?0.42:0.58, lu=1-lt;
    const labelX=lu*lu*start.x+2*lu*lt*cx+lt*lt*end.x, labelY=lu*lu*start.y+2*lu*lt*cy+lt*lt*end.y;
    const relation=String(e.relation||'message');
    return `<g class="network-edge ${highlighted.has(String(e.id))?'route-active':''}" ${interactive?`data-event="${escapeHTML(e.id)}" tabindex="0" role="button" aria-label="${escapeHTML(e.agent)} → ${escapeHTML(e.to)}：${escapeHTML(e.title)}"`:''}><path class="edge-hit" d="M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}"/><path class="edge-line" d="M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}" marker-end="url(#network-arrow)"/><text class="edge-label" x="${labelX}" y="${labelY-4}">${escapeHTML(relation.length>18?`${relation.slice(0,16)}…`:relation)}</text><title>${escapeHTML(e.agent)} → ${escapeHTML(e.to)} · ${escapeHTML(relation)} · ${escapeHTML(e.title)}</title></g>`;
  }).join('');
  const nodes=agents.map(name=>{const p=points.get(name), count=trace.events.filter(e=>e.agent===name).length;
    return `<g class="network-node ${state.selectedAgent===name?'active':''}" data-agent="${escapeHTML(name)}" tabindex="0" role="button" transform="translate(${p.x-boxW/2},${p.y-boxH/2})"><rect width="${boxW}" height="${boxH}" rx="4"/><text class="node-name" x="${boxW/2}" y="20">${escapeHTML(name.length>19?`${name.slice(0,17)}…`:name)}</text><text class="node-count" x="${boxW/2}" y="35">${count} events</text><title>点击查看 ${escapeHTML(name)} 的信息收发</title></g>`;
  }).join('');
  return `<section class="agent-flow">
    <div class="flow-label"><span class="eyebrow">AGENT COLLABORATION NETWORK</span><span>${agents.length} 个 Agent · ${edges.length} 条有向边</span></div>
    ${edges.length?`<div class="network-canvas"><svg class="agent-network" viewBox="0 0 ${width} ${height}" role="img" aria-label="Agent 协作关系网"><defs><marker id="network-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L10 5 L0 9 z" fill="#4b6683"/></marker><marker id="network-arrow-bright" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 L10 5 L0 9 z" fill="#57bed3"/></marker></defs>${paths}${nodes}</svg></div><div class="network-legend"><span><i></i>消息 / 委派 / 报告</span><small>点击 Agent 查看其收发与处理过程；点击连线定位具体消息</small></div>`:'<div class="network-canvas"><svg class="agent-network" viewBox="0 0 760 300" role="img" aria-label="Agent 节点关系">${nodes}</svg></div><div class="network-empty">当前运行没有记录 Agent 间的直接通信；仍可点击 Agent 查看执行记录。</div>'}
    ${interactive?`<div class="message-routes">${edges.map(m=>`<button data-event="${escapeHTML(m.id)}"><b>${escapeHTML(m.agent)}</b><span>→ ${escapeHTML(m.to)}</span><em>${escapeHTML(m.relation||'message')}</em></button>`).join('') || '<span class="muted">暂无可跳转的通信事件</span>'}</div>`:''}
  </section>`;
}

function trace_audit_origin(e) { return firstError() ? 'Gold 错误起点' : '自动核查 · 起点'; }

function timelineCard(e) {
  const ann = annotationOf(e);
  const mismatch = isMismatch(e);
  return `<article class="time-card ${state.selectedId===e.id?'selected':''} ${ann?'fault':''}" data-event="${e.id}">
    <div class="time-axis"><span>${escapeHTML(e.time)}</span><i class="kind-${e.kind}"></i></div>
    <div class="agent-badge"><span>${initials(e.agent)}</span><b>${escapeHTML(e.agent)}</b></div>
    <div class="time-content">
      <div class="card-title"><span class="kind-label">${escapeHTML(e.kind.toUpperCase())}</span><h3>${escapeHTML(e.title)}</h3>${ann?`<mark style="--mark:${TYPES[ann]?.color}">GOLD · ${TYPES[ann]?.label}幻觉</mark>`:''}${goldStatusOf(e)==='uncertain'?'<mark class="uncertain">GOLD · 待定</mark>':''}${e.autoFlagged?'<mark class="auto-mark">AUTO · 核查线索</mark>':''}${mismatch?'<mark class="mismatch">状态差异证据</mark>':''}</div>
      <p>${escapeHTML(e.detail)}</p>
      ${e.stateChange?`<div class="state-change"><b>Δ STATE</b><code>${escapeHTML(e.stateChange)}</code></div>`:''}
      ${e.claims?.length?`<span class="claim-count">${e.claims.length} 条主张待逐条核查</span>`:''}
      ${e.to?`<div class="communication">${ICONS.link}<span>${escapeHTML(e.agent)}</span><i>→</i><span>${escapeHTML(e.to)}</span><em>${escapeHTML(e.relation||'message')}</em></div>`:''}
      ${(firstError()||getTrace().audit)&&e.signal?`<span class="signal ${e.signal}">${({origin:trace_audit_origin(e),accepted:'被接受',propagated:'已传播',corrected:'已纠正'})[e.signal] || e.signal}</span>`:''}
    </div>
  </article>`;
}

function inspector(e) {
  const ann = annotationOf(e);
  const goldStatus = goldStatusOf(e);
  const idx = getTrace().events.indexOf(e)+1;
  return `<div class="panel-head inspector-head"><div><span class="eyebrow">EVIDENCE INSPECTOR</span><h2>事件 E${String(idx).padStart(2,'0')}</h2></div><span class="kind-pill">${escapeHTML(e.kind)}</span></div>
    <div class="inspect-meta"><span><small>AGENT</small><b>${escapeHTML(e.agent)}</b></span><span><small>TIMESTAMP</small><b>${escapeHTML(e.time)}</b></span></div>
    ${e.to?`<div class="inspect-section message-payload"><div class="section-title"><h4>通信内容</h4><span>${escapeHTML(e.relation||'message')}</span></div><div class="message-direction"><b>${escapeHTML(e.agent)}</b><i>→</i><b>${escapeHTML(e.to)}</b></div><p>${escapeHTML(e.detail||e.title||'该通信事件没有记录正文。')}</p>${e.claims?.length?`<div class="message-claims"><b>随消息传递的主张</b>${e.claims.map(c=>`<p>${escapeHTML(typeof c==='string'?c:c.text||JSON.stringify(c))}</p>`).join('')}</div>`:''}${e.dependsOn?.length?`<small class="message-deps">依赖事件：${e.dependsOn.map(escapeHTML).join('、')}</small>`:''}</div>`:''}
    <div class="inspect-section">
      <h4>状态对齐证据</h4>
      <div class="diff-grid"><div><label>EXPECTED</label>${jsonBlock(e.expected)}</div><div class="${isMismatch(e)?'diff-bad':''}"><label>OBSERVED</label>${jsonBlock(e.observed)}</div></div>
      <div class="match-result ${isMismatch(e)?'bad':'good'}">${isMismatch(e)?'发现字段级差异，仅作为人工标注证据':'未发现字段级差异；仍以人工 Gold 标签为准'}</div>
    </div>
    <div class="inspect-section"><h4>原始证据</h4><div class="evidence-box">${ICONS.eye}<span>${escapeHTML(e.evidence || '该事件未绑定原始证据位置')}</span></div></div>
    ${claimReviewSection(e)}
    <div class="inspect-section annotation-section"><div class="section-title"><h4>人工 Gold 判定</h4><span>人工标签是唯一判定依据</span></div>
      <div class="gold-verdicts"><button data-gold-status="valid" class="${goldStatus==='valid'?'active valid':''}">有效</button><button data-gold-status="hallucination" class="${goldStatus==='hallucination'?'active hallucination':''}">幻觉</button><button data-gold-status="uncertain" class="${goldStatus==='uncertain'?'active uncertain':''}">待定</button><button data-gold-status="unreviewed" class="${goldStatus==='unreviewed'?'active':''}">未复核</button></div>
      <div class="annotation-grid ${goldStatus!=='hallucination'?'disabled':''}">${Object.entries(TYPES).map(([k,v])=>`<button data-annotation="${k}" class="${ann===k?'active':''}" style="--type:${v.color}" ${goldStatus!=='hallucination'?'disabled':''}><i></i>${v.label}</button>`).join('')}</div>
      <textarea id="annotationNote" placeholder="填写人工判断依据、证据位置与仲裁说明…">${escapeHTML(noteOf(e))}</textarea>
      <div class="annotation-actions"><button class="btn clear" id="clearAnnotation">恢复原始 Gold</button><button class="btn save" id="saveNote">保存人工标注</button></div>
    </div>
    ${propagationPanel(e)}`;
}

function claimReviewSection(e) {
  const claims=e.claims||[];
  return `<div class="inspect-section claim-review"><div class="section-title"><h4>逐主张证据核查</h4><span>${claims.length} 条主张</span></div>
    <p class="claim-intro">逐条记录主张、支持它的日志或实验产物、后续是否采用，以及是否被纠正。系统不会仅凭措辞自动判定幻觉。</p>
    <div class="claim-list">${claims.map((claim,index)=>{
      const r=claimReview(e,claim);const verdict=CLAIM_VERDICTS[r.verdict];
      const autoChips=r.autoChecks?`<div class="auto-chips">${Object.entries(CHECK_META).map(([k,m])=>{
        const hit=k==='correction'?(r.autoChecks.correction?.status==='corrected'||r.autoChecks.correction?.status==='propagated')
          :k==='fabricatedExecution'?(r.autoChecks.fabricatedExecution?.status&&r.autoChecks.fabricatedExecution.status!=='not_applicable'&&r.autoChecks.fabricatedExecution.status!=='verified')
          :Boolean(r.autoChecks[m.key]?.flag);
        return hit?`<i style="--tone:${m.tone}">${m.icon} ${m.label}</i>`:'';}).join('')||'<i class="none">自动核查：未触发</i>'}</div>`:'';
      return `<article class="claim-card" data-claim-card="${escapeHTML(claim.id)}"><header><b>主张 C${String(index+1).padStart(2,'0')}</b><span class="claim-verdict ${verdict?.tone||'unreviewed'}">${verdict?.label||'未复核'}</span>${r.source==='model'||claim.source==='model'?'<span class="src-tag">模型自报</span>':claim.source==='scripted'?'<span class="src-tag">场景注入</span>':''}</header>
        ${autoChips}
        <label>主张内容<textarea data-claim-field="text">${escapeHTML(r.text||'')}</textarea></label>
        <label>核查结论<select data-claim-field="verdict"><option value="unreviewed" ${!r.verdict?'selected':''}>未复核</option>${Object.entries(CLAIM_VERDICTS).map(([key,v])=>`<option value="${key}" ${r.verdict===key?'selected':''}>${v.label}</option>`).join('')}</select></label>
        <label>实验是否实际执行<select data-claim-field="experimentExecution"><option value="not_applicable" ${!r.experimentExecution||r.experimentExecution==='not_applicable'?'selected':''}>不适用 / 未声明实验</option><option value="verified" ${r.experimentExecution==='verified'?'selected':''}>有运行记录 / 产物</option><option value="partial" ${r.experimentExecution==='partial'?'selected':''}>证据不完整</option><option value="not_run" ${r.experimentExecution==='not_run'?'selected':''}>未找到执行记录</option><option value="contradicted" ${r.experimentExecution==='contradicted'?'selected':''}>日志显示并未执行</option></select></label>
        <label>证据引用<textarea data-claim-field="evidenceRefs" placeholder="事件 ID、日志路径、工具返回、实验产物…">${escapeHTML(Array.isArray(r.evidenceRefs)?r.evidenceRefs.join('\n'):(r.evidenceRefs||''))}</textarea></label>
        <label>下游采用 / 传播到<textarea data-claim-field="adoptedBy" placeholder="填写采用该主张的 event_id，逐行一个">${escapeHTML(Array.isArray(r.adoptedBy)?r.adoptedBy.join('\n'):(r.adoptedBy||''))}</textarea></label>
        <label>后续处置<select data-claim-field="fate">${Object.entries(CLAIM_FATES).map(([key,label])=>`<option value="${key}" ${(r.fate||'unresolved')===key?'selected':''}>${label}</option>`).join('')}</select></label>
        <label>复核说明<textarea data-claim-field="note" placeholder="说明矛盾点、假设边界、修正事件或证据缺口…">${escapeHTML(r.note||'')}</textarea></label>
        <button class="btn save claim-save" data-save-claim="${escapeHTML(claim.id)}">保存主张标注</button>
      </article>`;
    }).join('')||'<p class="empty-claims">暂无主张标注。可从本事件的文本或工具输出中添加一条待核查主张。</p>'}</div>
    <div class="add-claim"><textarea id="newClaimText" placeholder="粘贴本事件中的一条可核查主张…"></textarea><button class="btn clear" id="addClaim">添加主张</button></div>
  </div>`;
}

function propagationPanel(e) {
  if (!firstError() || (!e.signal && !annotationOf(e))) return '';
  const trace = getTrace();
  const start = trace.events.indexOf(e);
  const related = trace.events.slice(Math.max(0,start), start+4).filter(x=>x.signal || x.to);
  return `<div class="inspect-section"><h4>传播 / 纠正</h4><div class="chain">${related.map((x,i)=>`<div><span class="chain-dot ${x.signal||'message'}"></span><p><b>${escapeHTML(x.agent)}</b><small>${escapeHTML(x.signal||x.relation||'传递')}</small></p>${i<related.length-1?'<i></i>':''}</div>`).join('')}</div></div>`;
}

function compareView() {
  return `<section class="compare-view">
    <div class="compare-toolbar"><div><span class="eyebrow">HUMAN-GOLD COMPARISON</span><h2>同任务 · 多架构并排轨迹</h2><p>以同一套人工 Gold 标签对齐 first error、传播与纠正，不要求执行步骤完全相同。</p></div><div class="compare-selects">${archSelect('compareA',state.compareA)}<span>VS</span>${archSelect('compareB',state.compareB)}</div></div>
    <div class="compare-grid">${compareColumn(state.compareA)}${compareColumn(state.compareB)}</div>
  </section>`;
}

function archSelect(id,value) {
  return `<label><small>${id==='compareA'?'BASELINE':'CANDIDATE'}</small><select id="${id}">${Object.keys(DATA).map(a=>`<option value="${escapeHTML(a)}" ${a===value?'selected':''}>${escapeHTML(DATA[a].system||a)}</option>`).join('')}</select></label>`;
}

function compareColumn(name) {
  const trace = DATA[name]; const first = firstError(trace,name); const fi = first?trace.events.indexOf(first):null;
  return `<article class="compare-column" style="--arch:${ARCH_META[name]?.tone||'#2563eb'}">
    <header><div class="compare-arch"><span>${ARCH_META[name]?.short||'LOG'}</span><div><h3>${escapeHTML(trace.system||name)}</h3><p>${ARCH_META[name]?.desc||'导入轨迹'}</p></div></div><b>${escapeHTML(trace.duration)}</b></header>
    <div class="score-row">${trace.sourceType==='Run'
      ?`<span><small>AUTO FLAGGED</small><b>${trace.metrics.autoFlagged!=null?`${trace.metrics.autoFlagged}/${trace.metrics.autoTotal||'?'}`:'未核查'}</b></span><span><small>纠正/传播</small><b>${trace.metrics.recovery?'有纠正':trace.metrics.spread?`传播 ${trace.metrics.spread}`:'—'}</b></span><span><small>TOOL CALLS</small><b>${trace.metrics.cost}</b></span>`
      :`<span><small>AFFECTED F1</small><b>${(trace.metrics.affectedF1*100).toFixed(0)}%</b></span><span><small>PROGRESS</small><b>${(trace.metrics.progress*100).toFixed(0)}%</b></span><span><small>LLM CALLS</small><b>${trace.metrics.cost}</b></span>`}</div>
    <div class="mini-trace">${trace.events.map((e,i)=>`<div class="mini-event ${fi===i?'first':''} ${e.signal==='corrected'?'corrected':''}"><span>${escapeHTML(e.time)}</span><i></i><div><small>${escapeHTML(e.agent)}</small><b>${escapeHTML(e.title)}</b>${fi===i?'<em>FIRST ERROR</em>':''}${e.signal==='corrected'?'<em class="fixed">CORRECTED</em>':''}</div></div>`).join('')}</div>
    <footer>${first?`<span class="compare-warning">首个人工标注幻觉：E${String(fi+1).padStart(2,'0')} · ${escapeHTML(first.title)}</span>`:'<span class="compare-ok">人工 Gold 未标注幻觉</span>'}<span>传播深度 <b>${trace.metrics.spread}</b></span></footer>
  </article>`;
}

function metricsView() {
  const entries = Object.entries(DATA);
  return `<section class="metrics-view">
    <div class="metrics-title"><div><span class="eyebrow">HUMAN-GOLD EVALUATION</span><h2>人工标注幻觉 × Progress 指标</h2><p>幻觉率、first error 与传播深度仅来自人工 Gold 轨迹；状态差异不自动计入。</p></div><div class="metric-key"><span><i class="blue"></i>越高越好</span><span><i class="orange"></i>越低越好</span></div></div>
    <div class="metric-cards">
      ${metricCard('Affected F1','受影响实体识别', entries, 'affectedF1', true)}
      ${metricCard('Grounding Acc.','证据对齐准确率', entries, 'grounding', true)}
      ${metricCard('Progress Rate','有效步骤完成率', entries, 'progress', true)}
      ${metricCard('Propagation Depth','错误传播步数', entries, 'spread', false)}
    </div>
    <div class="metric-table-wrap"><div class="table-head"><h3>完整比较矩阵</h3><span>示例轨迹与真实导入运行分开展示</span></div><table><thead><tr><th>架构</th><th>Gold 覆盖</th><th>Gold 幻觉率</th><th>Affected F1</th><th>Grounding</th><th>Progress</th><th>First error</th><th>传播深度</th><th>恢复</th><th>LLM Calls</th></tr></thead><tbody>${entries.map(([name,t])=>{const gs=goldStats(t,name);return `<tr class="${name===state.architecture?'current':''}"><td><i style="background:${ARCH_META[name]?.tone}"></i><b>${escapeHTML(t.system||name)}</b>${name===state.architecture?'<small>CURRENT</small>':''}</td><td>${fmt(gs.coverage)}</td><td>${fmt(gs.rate)}</td><td>${fmt(t.metrics.affectedF1)}</td><td>${fmt(t.metrics.grounding)}</td><td>${fmt(t.metrics.progress)}</td><td>${firstError(t,name)?'E'+String(t.events.indexOf(firstError(t,name))+1).padStart(2,'0'):'—'}</td><td>${t.metrics.spread}</td><td>${t.metrics.recovery?'成功':'未触发'}</td><td>${t.metrics.cost}</td></tr>`}).join('')}</tbody></table></div>
    <div class="metric-note"><b>判读</b><p>Harness Dynamic 示例中的错误起源于 Independent 子会话，经 Pipeline 被消费，在 Discussion 片段由反例证据纠正，最后回到 Single 完成验证。指标用于验证交互流程，不代表对 DeepSeek Harness 的一般性结论。</p></div>
  </section>`;
}

function fmt(v){return (v*100).toFixed(0)+'%';}
function metricCard(title,sub,entries,key,higher) {
  const max = Math.max(...entries.map(([,t])=>t.metrics[key]),1);
  return `<article class="metric-card"><header><div><h3>${title}</h3><span>${sub}</span></div><em class="${higher?'high':'low'}">${higher?'↑ HIGH':'↓ LOW'}</em></header><div class="bars">${entries.map(([name,t])=>{const val=t.metrics[key];return `<div><span>${ARCH_META[name]?.short}</span><i><b style="width:${(val/max)*100}%;background:${ARCH_META[name]?.tone}"></b></i><strong>${key==='spread'?val:fmt(val)}</strong></div>`}).join('')}</div></article>`;
}

/* ================= 运行台 ================= */

const RUN_STATUS = {
  running: { label: '运行中', tone: '#2563eb', pulse: true },
  completed: { label: '已完成', tone: '#0f9f6e' },
  failed: { label: '失败', tone: '#dc2626' },
  stopped: { label: '已停止', tone: '#6b788c' },
};

function runConsoleView() {
  if (!state.backend) return `<section class="console-view offline-console">
    <div><span class="eyebrow">RUN CONSOLE</span><h2>后端未连接</h2>
    <p>运行台需要 TraceLab 后端服务（架构运行器 + 数据集 + 自动核查引擎）。启动方式：</p>
    <pre>node server/index.js   # 默认 8787 端口，同时托管 API 与 dist/ 静态站点</pre>
    <p>未连接时，网站仍可离线使用：导入日志、人工 Gold 标注、主张核查与比较视图不受影响。</p></div>
  </section>`;

  const arch = state.architectures.find(a => a.id === state.launch.architecture);
  const mode = state.launch.mode;
  const modeAvailable = arch ? arch.modes.includes(mode) : false;
  const externalAvail = (state.backend.external || {})[state.launch.architecture];

  return `<section class="console-view">
    <header class="console-head">
      <div><span class="eyebrow">RUN CONSOLE · 架构 × 数据集</span><h2>启动多 Agent 运行并收集日志</h2>
      <p>8 种架构（5 基础 + DeerFlow 1.x / Claude Code Agent Teams / DeepSeek Harness）× 4 数据集。运行结束后自动执行逐主张核查。</p></div>
      <div class="console-mode-help">${Object.entries(MODE_META).map(([k,m])=>`<span><b style="--tone:${m.tone}">${m.label}</b><small>${m.desc}</small></span>`).join('')}</div>
    </header>

    <div class="console-grid">
      <div class="launch-panel">
        <div class="launch-block"><div class="launch-label">① 架构</div>
          <div class="arch-picker">${state.architectures.map(a=>{
            const active = a.id===state.launch.architecture;
            return `<button class="arch-pick ${active?'active':''}" data-pick-arch="${a.id}" style="--tone:${a.tone}">
              <b>${a.short}</b><div><span>${escapeHTML(a.name)}</span><small>${a.category==='basic'?'基础架构':'动态架构'} · ${a.agents.length} agents</small></div>
              <em>${a.modes.map(m=>MODE_META[m]?.label||m).join('·')}</em>
            </button>`;}).join('')}
          </div>
          ${arch?`<p class="arch-desc">${escapeHTML(arch.desc)}</p>`:''}
        </div>
        <div class="launch-block"><div class="launch-label">② 数据集与任务</div>
          <div class="launch-selects">
            <label><small>数据集</small><select id="dsSelect">${state.datasetsApi.map(d=>`<option value="${d.id}" ${d.id===state.launch.dataset?'selected':''}>${escapeHTML(d.name)}（${d.taskCount}）</option>`).join('')}</select></label>
            <label><small>任务</small><select id="taskSelect">${state.tasksApi.map(t=>`<option value="${t.id}" ${t.id===state.launch.taskId?'selected':''}>${t.sample?'【样例】':''}${escapeHTML(t.title)}</option>`).join('')||'<option>—</option>'}</select></label>
          </div>
        </div>
        <div class="launch-block"><div class="launch-label">③ 执行模式</div>
          <div class="mode-chips">${['scripted','builtin','external'].map(m=>{
            const avail = arch ? arch.modes.includes(m) : false;
            const hint = m==='builtin' && !state.backend.llm?.llmConfigured ? '需在服务端配置 API Key'
              : m==='external' ? (externalAvail?.available ? '已探测到外部进程' : (externalAvail?.reason||'未配置探测命令')) : MODE_META[m].desc;
            return `<button class="mode-chip ${mode===m?'active':''} ${avail?'':'disabled'}" data-pick-mode="${m}" ${avail?'':'disabled'} style="--tone:${MODE_META[m].tone}"><b>${MODE_META[m].label}</b><small>${escapeHTML(hint)}</small></button>`;}).join('')}
          </div>
        </div>
        <div class="launch-actions">
          <button class="btn primary" id="launchBtn" ${(!modeAvailable||!state.launch.taskId)?'disabled':''}>${ICONS.play} 启动运行</button>
          <button class="btn ghost" id="refreshRunsBtn">刷新运行列表</button>
        </div>
      </div>

      <div class="runs-panel">
        <div class="panel-head"><div><span class="eyebrow">RUNS</span><h3>运行记录</h3></div><span class="count">${state.runs.length}</span></div>
        <div class="runs-table-wrap"><table class="runs-table"><thead><tr><th>RUN</th><th>架构</th><th>数据集 / 任务</th><th>模式</th><th>事件</th><th>核查</th><th>状态</th><th></th></tr></thead>
        <tbody>${state.runs.map(r=>{
          const st = RUN_STATUS[r.status] || { label: r.status, tone: '#6b788c' };
          return `<tr class="${state.live?.runId===r.id?'live-row':''}">
            <td><b>${r.id.slice(-8)}</b><small>${(r.startedAt||'').slice(5,16).replace('T',' ')}</small></td>
            <td>${escapeHTML(r.archName)}</td>
            <td><small>${escapeHTML(r.dataset)} · ${escapeHTML(String(r.taskTitle).slice(0,18))}</small></td>
            <td><em class="mode-tag mode-${r.mode}">${r.mode}</em></td>
            <td>${r.eventCount}</td>
            <td>${r.audited?`<span class="audited-yes">✓</span>`:'<span class="muted">—</span>'}</td>
            <td><span class="run-status" style="--tone:${st.tone}">${st.pulse?'<i class="pulse-mini"></i>':''}${st.label}</span></td>
            <td class="run-actions">
              ${r.status==='running'?`<button class="mini-btn" data-run-action="stop" data-run-id="${r.id}">停止</button>`:''}
              <button class="mini-btn" data-run-action="monitor" data-run-id="${r.id}">实时</button>
              <button class="mini-btn" data-run-action="load" data-run-id="${r.id}" ${r.status==='running'?'disabled':''}>载入分析</button>
              <button class="mini-btn" data-run-action="audit" data-run-id="${r.id}">核查</button>
              <button class="mini-btn danger" data-run-action="delete" data-run-id="${r.id}" ${r.status==='running'?'disabled':''}>删</button>
            </td></tr>`;}).join('')||'<tr><td colspan="8" class="muted empty-cell">还没有运行记录</td></tr>'}
        </tbody></table></div>
        ${liveMonitorHTML()}
      </div>
    </div>
  </section>`;
}

function liveMonitorHTML() {
  if (!state.live) return '';
  const st = RUN_STATUS[state.live.status] || { label: state.live.status, tone: '#6b788c' };
  const finished = state.live.status && state.live.status !== 'running';
  const run=state.runs.find(r=>r.id===state.live.runId);
  return `<div class="live-monitor" id="liveMonitor">
    <div class="live-head">
      <span class="live-dot" style="--tone:${st.tone}"></span>
      <b>${state.live.runId}</b>
      <span class="live-run-context">${escapeHTML(run?.archName||'多 Agent 运行')} · ${escapeHTML(run?.taskTitle||'组织架构随事件更新')}</span>
      <span class="run-status" style="--tone:${st.tone}">${st.label}</span>
      <span class="count" id="liveCount">${state.live.events.length} events</span>
      <div class="live-actions">
        ${finished?`<button class="mini-btn" data-run-action="load" data-run-id="${state.live.runId}">载入分析</button>
        <button class="mini-btn" data-run-action="audit" data-run-id="${state.live.runId}">查看核查</button>`:
        `<button class="mini-btn danger" data-run-action="stop" data-run-id="${state.live.runId}">停止</button>`}
        <button class="mini-btn" data-run-action="close-monitor">关闭</button>
      </div>
    </div>
    <div class="live-network-slot">${agentFlow({agents:[],events:state.live.events},{interactive:false})}</div>
    <div class="live-stream" id="liveStream">
      ${state.live.events.slice(-40).map(e=>liveEventLine(e)).join('')||'<div class="muted">等待事件…</div>'}
    </div>
  </div>`;
}

function liveEventLine(e) {
  return `<div class="live-line kind-${e.kind}"><span class="live-time">${escapeHTML(e.time)}</span><b>${escapeHTML(e.agent)}</b><small>${escapeHTML(e.kind)}</small><p>${escapeHTML(e.title)}${e.tool?` · ${escapeHTML(e.tool)}`:''}</p>${e.claims?.length?`<em>${e.claims.length} claims</em>`:''}</div>`;
}

/* ================= 自动核查 ================= */

function auditView() {
  if (!state.backend) return `<section class="console-view offline-console"><div><span class="eyebrow">CLAIM AUDIT</span><h2>后端未连接</h2><p>自动核查依赖后端核查引擎。</p></div></section>`;
  const auditedRuns = state.runs.filter(r => r.status !== 'running');
  const report = state.audit.report;
  const runId = state.audit.runId;

  return `<section class="audit-view">
    <header class="console-head">
      <div><span class="eyebrow">CLAIM-BY-CLAIM AUDIT · 逐主张证据核查</span><h2>幻觉核查与传播轨迹</h2>
      <p>对运行日志中的每条主张执行五项检查：与观测矛盾 / 假设当事实 / 声称未跑实验 / 无据被采纳 / 纠正或传播。自动结果仅为线索，最终判定以人工 Gold 为准。</p></div>
      <div class="audit-picker">
        <label><small>选择运行</small><select id="auditRunSelect">${auditedRuns.map(r=>`<option value="${r.id}" ${r.id===runId?'selected':''}>${r.id.slice(-8)} · ${escapeHTML(r.archName)} · ${escapeHTML(r.dataset)}${r.audited?' ✓':''}</option>`).join('')||'<option>—</option>'}</select></label>
        <button class="btn ghost" id="rerunAuditBtn" ${runId?'':'disabled'}>重新核查</button>
      </div>
    </header>
    ${state.audit.loading ? '<div class="audit-loading">核查引擎运行中…</div>' : ''}
    ${report ? auditReportHTML(report) : `<div class="audit-empty muted">选择一个已完成的运行查看核查报告，或在运行台点击「核查」。</div>`}
  </section>`;
}

function auditReportHTML(report) {
  const s = report.summary;
  const cards = [
    { k:'totalClaims', label:'提取主张', v:s.totalClaims, tone:'#334155', sub:'声明式 + 启发式' },
    { k:'contradiction', label:'与观测矛盾', v:s.contradicted, tone:CHECK_META.contradiction.tone, sub:'主张与实验/工具观测冲突' },
    { k:'hypothesisAsFact', label:'假设当事实', v:s.hypothesisAsFact, tone:CHECK_META.hypothesisAsFact.tone, sub:'无新证据即升级为断言' },
    { k:'fabricatedExecution', label:'声称未跑实验', v:s.fabricatedExecution, tone:CHECK_META.fabricatedExecution.tone, sub:'日志中无执行记录' },
    { k:'unsupportedAdoption', label:'无据被采纳', v:s.unsupportedAdopted, tone:CHECK_META.unsupportedAdoption.tone, sub:`${s.reachedFinal} 条进入最终结论` },
    { k:'correction', label:'纠正 vs 传播', v:`${s.corrected} / ${s.propagated}`, tone:CHECK_META.correction.tone, sub:'修正数 / 继续传播数' },
    ...(s.llmJudge ? [{ k:'llmJudge', label:'LLM 复核一致', v:`${s.llmJudge.agree}/${s.llmJudge.judged}`, tone:'#7c3aed', sub:`翻转为支持 ${s.llmJudge.flipToSupported} · 相反 ${s.llmJudge.flipToContradicted} · 引文未校验 ${s.llmJudge.unverified}` }] : []),
  ];
  const filters = [['all','全部主张'],['flagged','仅幻觉线索'],['supported','有支持'],['contradiction','与观测矛盾'],['hypothesisAsFact','假设当事实'],['fabricatedExecution','声称未跑实验'],['unsupportedAdoption','无据被采纳'],
    ...(s.llmJudge ? [['llmDisagree','规则/LLM 分歧']] : [])];
  const claims = report.claims.filter(c => {
    if (state.audit.filter==='all') return true;
    if (state.audit.filter==='flagged') return Object.keys(CHECK_META).some(k=>CHECK_FLAG[k](c));
    if (state.audit.filter==='supported') return c.suggested.verdict==='supported';
    if (state.audit.filter==='llmDisagree') {
      const q0=(c.qa||[]).find(q=>q.key==='Q0'), q6=(c.qa||[]).find(q=>q.key==='Q6');
      if (!q0 || !q6) return false; // 方向（是/否）任一不同即分歧
      return (q0.answer==='是')!==(q6.answer==='是') || (q0.answer==='否')!==(q6.answer==='否');
    }
    return CHECK_FLAG[state.audit.filter]?.(c);
  });
  const trajectories = report.trajectories.filter(t => state.audit.filter==='all' || state.audit.filter==='flagged' || t.triggers.includes(state.audit.filter));

  return `<div class="audit-disclaimer"><b>判定纪律</b><span>${escapeHTML(report.disclaimer||'')} 引擎 ${escapeHTML(report.engine)} · 生成于 ${escapeHTML((report.generatedAt||'').slice(11,19))}</span></div>
  <div class="audit-cards">${cards.map(c=>`<article class="audit-card" style="--tone:${c.tone}"><small>${c.label}</small><b>${c.v}</b><span>${escapeHTML(c.sub)}</span></article>`).join('')}</div>
  <div class="audit-filters">${filters.map(([k,v])=>`<button data-audit-filter="${k}" class="${state.audit.filter===k?'active':''}">${v}</button>`).join('')}</div>
  <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>#</th><th>主张</th><th>Agent</th><th>五项检查</th><th>建议判定</th><th>处置</th><th>证据</th></tr></thead>
    <tbody>${claims.map((c,i)=>{
      const chips = Object.entries(CHECK_META).map(([k,m])=>{
        const hit = CHECK_FLAG[k](c);
        return `<i class="check-chip ${hit?'hit':''}" style="--tone:${m.tone}" title="${escapeHTML(why(c,m.key))}">${m.icon}<span>${m.label}</span></i>`;}).join('');
      const vd = CLAIM_VERDICTS[c.suggested.verdict] || {label:c.suggested.verdict};
      const fate = {corrected:'已纠正',adopted:'被采纳',unresolved:'未处置'}[c.suggested.fate]||c.suggested.fate;
      return `<tr class="${Object.keys(CHECK_META).some(k=>CHECK_FLAG[k](c))?'flagged-row':''}">
        <td><b>${String(i+1).padStart(2,'0')}</b><small>E${c.seq}</small></td>
        <td class="claim-cell">
          <p class="qa-q">${c.question?`<b>Q</b> ${escapeHTML(c.question)}`:''}</p>
          ${(()=>{const ansTone=a=>({'是':'yes','否':'no','证据不足':'insufficient','不适用':'na'})[a]||'';
            const q0=(c.qa||[]).find(q=>q.key==='Q0'), q6=(c.qa||[]).find(q=>q.key==='Q6');
            const disagree=q0&&q6&&((q0.answer==='是')!==(q6.answer==='是')||(q0.answer==='否')!==(q6.answer==='否'));
            return `${q0?`<span class="qa-a ${ansTone(q0.answer)}">答：${escapeHTML(q0.answer)}</span>`:''}`
              + `${q6?`<span class="qa-a llm ${ansTone(q6.answer)}" title="${escapeHTML(q6.why||'')}">LLM：${escapeHTML(q6.answer)}</span>`:''}`
              + `${disagree?'<span class="qa-a disagree">分歧</span>':''}`;})()}
          <p class="claim-text">${escapeHTML(c.text)}</p>
          <small>${c.source==='declared'?'声明式':c.source==='llm'?'LLM 辅助':'启发式'}${c.hedged?' · 假设口径':''}${c.execClaim?' · 执行声称':''}</small></td>
        <td>${escapeHTML(c.agent)}</td>
        <td><div class="check-chips">${chips}</div></td>
        <td><span class="claim-verdict ${vd.tone||'unverified'}">${vd.label}</span>${c.execClaim?`<small>${{verified:'有运行记录',partial:'证据不完整',not_run:'未找到执行记录',contradicted:'记录显示未通过',not_applicable:''}[c.suggested.experimentExecution]||''}</small>`:''}</td>
        <td>${fate}</td>
        <td class="evidence-cell">${[...new Set([...(c.suggested.evidenceRefs||[]),...(c.checks.contradiction?.evidence||[])])].slice(0,3).map(id=>`<button data-jump-run="${report.runId}" data-jump-event="${escapeHTML(String(id))}">${escapeHTML(String(id).slice(-6))}</button>`).join('')||'<span class="muted">—</span>'}</td>
      </tr>`;}).join('')||'<tr><td colspan="7" class="muted empty-cell">当前筛选下无主张</td></tr>'}
    </tbody></table></div>
  <div class="traj-section">
    <div class="table-head"><h3>幻觉传播轨迹</h3><span>主张 → 下游采用 / 复述 → 最终结论或纠正；点击节点跳转事件</span></div>
    ${report.trajectories.map(t=>trajectoryLane(t,report)).join('')||'<p class="muted">未发现幻觉线索轨迹。</p>'}
  </div>`;
}

function why(c, key) {
  const byKey = { contradiction:()=>c.checks.contradiction?.why, hypothesisAsFact:()=>c.checks.hypothesisAsFact?.why,
    fabricatedExecution:()=>c.checks.fabricatedExecution?.why, unsupportedAdoption:()=>c.checks.unsupportedAdoption?.why,
    correction:()=>`状态：${c.checks.correction?.status||''} ${c.checks.correction?.why||''}` };
  return (byKey[key]?.() || '') || '未触发';
}

function trajectoryLane(t, report) {
  const HOP_KIND = { 'restated':'复述','cited':'引用','acted-on':'据此行动','final-answer':'进入最终结论' };
  const RES = { corrected:{label:'已纠正',tone:'#0f9f6e'}, 'propagated-to-final':{label:'传播至最终结论',tone:'#dc2626'}, propagated:{label:'继续传播',tone:'#f97316'}, dropped:{label:'未被采用',tone:'#6b788c'} };
  const res = RES[t.resolution] || {label:t.resolution,tone:'#6b788c'};
  const triggers = t.triggers.map(k=>`<i style="--tone:${CHECK_META[k]?.tone||'#666'}">${CHECK_META[k]?.label||k}</i>`).join('');
  return `<div class="traj-lane">
    <div class="traj-claim"><p>${escapeHTML(t.text)}</p><div class="traj-tags">${triggers}</div></div>
    <div class="traj-flow">
      <button class="traj-node origin" data-jump-run="${report.runId}" data-jump-event="${escapeHTML(t.origin.eventId)}"><span>E${t.origin.seq}</span><b>${escapeHTML(t.origin.agent)}</b><small>主张产生</small></button>
      ${t.hops.map(h=>`<div class="traj-arrow">→</div><button class="traj-node hop ${h.kind}" data-jump-run="${report.runId}" data-jump-event="${escapeHTML(h.eventId)}"><span>${h.eventId==='final-answer'?'FIN':'E'+h.seq}</span><b>${escapeHTML(h.agent)}</b><small>${HOP_KIND[h.kind]||h.kind}</small></button>`).join('')||'<div class="traj-arrow">→</div><span class="muted traj-none">无下游采用</span>'}
      <div class="traj-arrow">⇒</div>
      <span class="traj-res" style="--tone:${res.tone}">${res.label}</span>
    </div>
  </div>`;
}

/* ================= 失败现象目录 ================= */

function phenomenaView() {
  if (!state.backend) return `<section class="console-view offline-console"><div><span class="eyebrow">FAILURE PHENOMENA</span><h2>后端未连接</h2><p>失败现象聚合依赖后端核查数据。</p></div></section>`;
  const ph = state.phenomena;
  if (ph.loading) return `<section class="audit-view"><header class="console-head"><div><span class="eyebrow">FAILURE PHENOMENA</span><h2>失败现象目录</h2></div></header><div class="audit-loading">正在聚合 ${state.runs.filter(r=>r.audited).length} 条已核查运行…</div></section>`;
  if (!ph.data) return `<section class="audit-view"><div class="audit-empty muted">加载中…</div></section>`;

  const total = ph.data.phenomena.reduce((n, p) => n + p.total, 0);
  const maxCount = Math.max(1, ...ph.data.phenomena.map(p => p.total));
  return `<section class="audit-view">
    <header class="console-head">
      <div><span class="eyebrow">FAILURE PHENOMENA · 从轨迹观察的失败现象</span><h2>失败现象目录</h2>
      <p>把跨运行轨迹中反复出现的失败模式沉淀为现象分类（是非问驱动）。每条现象来自五项检查信号的组合，样本可回溯到原始事件。覆盖 ${ph.data.runsCovered} 条已核查运行。</p></div>
      <div class="audit-picker"><button class="btn ghost" id="reloadPhenomenaBtn">重新聚合</button></div>
    </header>
    <div class="pheno-cards">
      ${ph.data.phenomena.map(p => `
        <article class="pheno-card ${state.phenomena.expanded===p.id?'open':''}" style="--tone:${p.tone}">
          <header data-phenomenon="${p.id}">
            <b>${p.id}</b><div><h3>${escapeHTML(p.name)}</h3><small>${escapeHTML(p.desc)}</small></div>
            <span class="pheno-count">${p.total}</span>
          </header>
          <p class="pheno-q">核查问句：${escapeHTML(p.question)}</p>
          ${p.total ? `<div class="pheno-bars">${Object.entries(p.byArchitecture).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([a,n])=>`<div><span>${escapeHTML(a)}</span><i><b style="width:${(n/maxCount)*100}%"></b></i><em>${n}</em></div>`).join('')}</div>` : '<p class="muted">当前数据中未观察到该现象。</p>'}
          ${state.phenomena.expanded===p.id && p.samples.length ? `
          <div class="pheno-samples">
            ${p.samples.map(s=>`<div class="pheno-sample">
              <div class="pheno-sample-head"><button data-jump-run="${s.runId}" data-jump-event="">${s.runId.slice(-8)}</button><b>${escapeHTML(s.agent)}</b><span>E${s.seq}</span><em>${escapeHTML(s.resolution||'')}</em></div>
              <p>${escapeHTML(s.question||s.text)}</p>
              <small> hops: ${escapeHTML(s.hops.join(' → ')||'—')}</small>
            </div>`).join('')}
          </div>`:''}
        </article>`).join('')}
    </div>
    <div class="audit-disclaimer"><b>使用说明</b><span>现象由规则信号组合判定（${total} 次命中）；用于研究分析的起点而非结论。新增运行并核查后点「重新聚合」更新。</span></div>
  </section>`;
}

async function loadPhenomena(force = false) {
  if (state.phenomena.data && !force) return;
  state.phenomena.loading = true; state.phenomena.expanded = null;
  render();
  try { state.phenomena.data = await api.phenomena(); }
  catch (err) { showToast('现象聚合失败：' + err.message, true); state.phenomena.data = null; }
  state.phenomena.loading = false; render();
}

function autoAuditBanner() {
  const trace = getTrace();
  if (trace.sourceType !== 'Run' || !trace.audit) return '';
  const s = trace.audit.summary;
  if (!s.flaggedClaims) return '';
  return `<div class="first-error-banner auto-banner">
    <div class="alert-icon auto">A</div>
    <div><span class="eyebrow">AUTO AUDIT · ${escapeHTML(trace.audit.engine)}</span><b>自动核查标记 ${s.flaggedClaims}/${s.totalClaims} 条可疑主张</b>
    <p>矛盾 ${s.contradicted} · 假设当事实 ${s.hypothesisAsFact} · 声称未跑实验 ${s.fabricatedExecution} · 无据被采纳 ${s.unsupportedAdopted}；纠正 ${s.corrected} / 传播 ${s.propagated}（${s.reachedFinal} 条进入最终结论）。人工 Gold 判定不受影响。</p></div>
    <button class="btn jump" data-tab="audit">查看核查轨迹</button>
  </div>`;
}

function modal() {
  return `<dialog id="pasteDialog"><form method="dialog" class="dialog-card"><header><div><span class="eyebrow">LOCAL IMPORT</span><h2>粘贴 Event / Session 日志</h2></div><button value="cancel" class="icon-btn">${ICONS.close}</button></header><p>支持 JSON、JSONL、单 Session 或含 <code>sessions[]</code> 的父子会话包。日志可在事件中附带 <code>claims[]</code>；没有主张字段时，可在事件详情中人工添加。系统不会自动把主张判成幻觉。</p><textarea id="pasteArea" placeholder='{"system":"DeepSeek Harness","events":[{"id":"e1","agent":"main","type":"observation","detail":"...","evidence":"tool output / artifact ref","claims":[{"id":"c1","text":"可核查主张","evidence_refs":["e1"],"adopted_by":["e2"]}]}],"gold_annotations":[{"event_id":"e1","claim_id":"c1","verdict":"contradicted","evidence_refs":["tool-obs-7"],"experiment_execution":"not_run","fate":"corrected","note":"人工核查说明"}]}'></textarea><div class="schema-hint"><b>主张核查 Gold 字段</b><span>event_id · claim_id · verdict · evidence_refs · experiment_execution · adopted_by · fate · note</span></div><footer><button value="cancel" class="btn clear">取消</button><button type="button" id="importPaste" class="btn save">载入轨迹</button></footer></form></dialog>
  <div id="toast" class="toast"></div>`;
}

function render() {
  if (state.tab==='composition') state.tab='trace';
  const view=state.tab==='trace'?traceView():state.tab==='compare'?compareView():state.tab==='catalog'?catalogView():state.tab==='runs'?runConsoleView():state.tab==='audit'?auditView():state.tab==='phenomena'?phenomenaView():metricsView();
  const showControls=!['runs','audit','catalog','phenomena'].includes(state.tab);
  app.innerHTML = `${header()}${showControls?controls():''}${tabs()}<div class="workspace">${view}</div>${modal()}`;
  bind();
}

function bind() {
  document.querySelectorAll('[data-message-choice]').forEach(btn=>btn.onclick=()=>{state.selectedMessageId=btn.dataset.messageChoice;render();});
  document.querySelectorAll('[data-task-info-choice]').forEach(btn=>btn.onclick=()=>{state.selectedTaskInfoId=btn.dataset.taskInfoChoice;render();});
  document.querySelectorAll('[data-agent-filter]').forEach(btn=>btn.onclick=()=>{state.selectedAgent=state.selectedAgent===btn.dataset.agentFilter?null:btn.dataset.agentFilter;render();});
  document.querySelectorAll('.network-node[data-agent]').forEach(node=>node.onclick=e=>{e.stopPropagation();state.selectedAgent=node.dataset.agent;render();});
  document.querySelectorAll('[data-arch]').forEach(btn=>btn.onclick=()=>{
    state.architecture=btn.dataset.arch; state.selectedId=getTrace().events[0]?.id;
    render();
  });
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.tab;if(state.tab==='runs')refreshRuns().then(render);if(state.tab==='phenomena')loadPhenomena();render();});
  document.querySelectorAll('[data-event]').forEach(el=>el.onclick=()=>{state.selectedId=el.dataset.event;const event=getTrace().events.find(x=>String(x.id)===String(el.dataset.event));if(event?.agent)state.selectedAgent=event.agent;if(event?.to)state.selectedMessageId=event.id;state.tab='trace';render();setTimeout(()=>document.querySelector('.time-card.selected')?.scrollIntoView({behavior:'smooth',block:'center'}),30);});
  document.querySelectorAll('[data-kind]').forEach(btn=>btn.onclick=()=>{state.kindFilter=btn.dataset.kind;render();});
  const search=document.querySelector('#eventSearch'); if(search) search.oninput=e=>{state.query=e.target.value; const pos=e.target.selectionStart; render(); const n=document.querySelector('#eventSearch'); n.focus();n.setSelectionRange(pos,pos);};
  document.querySelector('#pasteBtn').onclick=()=>document.querySelector('#pasteDialog').showModal();
  document.querySelector('#importPaste').onclick=()=>{const raw=document.querySelector('#pasteArea').value; try{loadImported(raw,'Pasted Session');document.querySelector('#pasteDialog').close();showToast('日志解析成功，已载入 '+getTrace().events.length+' 个事件');}catch(err){showToast('解析失败：'+err.message,true);}};
  document.querySelectorAll('[data-import-target]').forEach(btn=>btn.onclick=()=>{state.importTarget=btn.dataset.importTarget;document.querySelector('#fileInput').click();});
  document.querySelectorAll('[data-catalog-run]').forEach(btn=>btn.onclick=()=>{
    state.launch.architecture=btn.dataset.catalogRun;
    const arch=state.architectures.find(a=>a.id===state.launch.architecture);
    if(arch&&!arch.modes.includes(state.launch.mode))state.launch.mode=arch.modes[0];
    state.tab='runs';render();showToast(`已选中 ${arch?.name||state.launch.architecture}，选择数据集后点「启动运行」`);
  });
  document.querySelector('#fileInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{loadImported(await f.text(),f.name);state.tab='trace';render();showToast(`已导入 ${f.name} · ${getTrace().events.length} events`);}catch(err){showToast('导入失败：'+err.message,true);}finally{e.target.value='';}};
  document.querySelector('#goldInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const count=loadGold(await f.text());render();showToast(`已载入 ${count} 条人工 Gold 标注`);}catch(err){showToast('Gold 导入失败：'+err.message,true);}};
  const sample=document.querySelector('#sampleBtn');if(sample)sample.onclick=()=>{state.architecture='Harness Dynamic';state.selectedId='y4';state.tab='trace';state.query='';state.kindFilter='all';render();showToast('DeepSeek Harness 执行轨迹示例已重置');};
  document.querySelectorAll('[data-annotation]').forEach(btn=>btn.onclick=()=>saveAnnotation(btn.dataset.annotation));
  document.querySelectorAll('[data-gold-status]').forEach(btn=>btn.onclick=()=>saveGoldStatus(btn.dataset.goldStatus));
  document.querySelectorAll('[data-save-claim]').forEach(btn=>btn.onclick=()=>saveClaim(btn.dataset.saveClaim));
  const addClaim=document.querySelector('#addClaim');if(addClaim)addClaim.onclick=()=>{
    const text=document.querySelector('#newClaimText')?.value.trim();if(!text){showToast('先填写要核查的主张',true);return;}
    const e=selectedEvent();e.claims=e.claims||[];const claim={id:`c-${e.id}-${e.claims.length+1}`,text,verdict:null,evidenceRefs:[],adoptedBy:[],fate:'unresolved',experimentExecution:'not_applicable'};e.claims.push(claim);render();showToast('已添加主张；请补充证据和人工核查结论');
  };
  const save=document.querySelector('#saveNote');if(save)save.onclick=()=>saveGoldNote();
  const clear=document.querySelector('#clearAnnotation');if(clear)clear.onclick=()=>{delete state.annotations[`${state.architecture}:${selectedEvent().id}`];recomputeGoldMetrics();persist();render();showToast('已恢复该事件的原始 Gold');};
  const a=document.querySelector('#compareA');if(a)a.onchange=e=>{state.compareA=e.target.value;render();};
  const b=document.querySelector('#compareB');if(b)b.onchange=e=>{state.compareB=e.target.value;render();};
  document.querySelectorAll('[data-episode-jump]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.episodeJump);state.selectedId=getTrace().events[i]?.id;state.tab='trace';render();});
  document.querySelectorAll('[data-motif-override]').forEach(select=>select.onchange=e=>{
    const key=`${state.architecture}:${select.dataset.motifOverride}`;
    state.motifOverrides[key]=e.target.value;
    localStorage.setItem('tracelab-motif-overrides',JSON.stringify(state.motifOverrides));
    render();showToast(`片段已修订为 ${e.target.value}`);
  });
  const root=document.querySelector('.workspace');
  ['dragenter','dragover'].forEach(type=>root?.addEventListener(type,e=>{e.preventDefault();root.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type=>root?.addEventListener(type,e=>{e.preventDefault();root.classList.remove('dragging');}));
  root?.addEventListener('drop',async e=>{const f=e.dataTransfer.files[0];if(!f)return;try{loadImported(await f.text(),f.name);showToast('拖放导入成功');}catch(err){showToast('导入失败：'+err.message,true);}});
  bindConsole();
  bindAudit();
}

/* ---------- 运行台 / 核查 事件绑定 ---------- */
function bindConsole() {
  document.querySelectorAll('[data-pick-arch]').forEach(btn=>btn.onclick=()=>{
    state.launch.architecture=btn.dataset.pickArch;
    const arch=state.architectures.find(a=>a.id===state.launch.architecture);
    if(arch&&!arch.modes.includes(state.launch.mode)) state.launch.mode=arch.modes[0];
    render();
  });
  document.querySelectorAll('[data-pick-mode]').forEach(btn=>btn.onclick=()=>{state.launch.mode=btn.dataset.pickMode;render();});
  const dsSel=document.querySelector('#dsSelect'); if(dsSel) dsSel.onchange=async e=>{
    state.launch.dataset=e.target.value; state.launch.taskId=null;
    state.tasksApi=await api.tasks(state.launch.dataset).catch(()=>[]);
    state.launch.taskId=state.tasksApi[0]?.id||null;
    render();
  };
  const taskSel=document.querySelector('#taskSelect'); if(taskSel) taskSel.onchange=e=>{state.launch.taskId=e.target.value;};
  const launch=document.querySelector('#launchBtn'); if(launch) launch.onclick=async()=>{
    try{
      const r=await api.startRun({...state.launch});
      showToast(`运行已启动：${r.id}`);
      state.tab='runs';
      await refreshRuns();
      subscribeLive(r.id);
      render();
    }catch(err){showToast('启动失败：'+err.message,true);}
  };
  const refresh=document.querySelector('#refreshRunsBtn'); if(refresh) refresh.onclick=async()=>{await refreshRuns();render();};

  document.querySelectorAll('[data-run-action]').forEach(btn=>btn.onclick=()=>handleRunAction(btn.dataset.runAction,btn.dataset.runId));
}

async function handleRunAction(action,runId) {
  try{
    if(action==='monitor'){ state.tab='runs'; subscribeLive(runId); render(); }
    else if(action==='close-monitor'){ state.live?.close?.(); state.live=null; render(); }
    else if(action==='stop'){ await api.stopRun(runId); await refreshRuns(); if(state.live?.runId===runId){state.live.status='stopped';} render(); }
    else if(action==='delete'){ await api.deleteRun(runId); if(state.live?.runId===runId){state.live?.close?.();state.live=null;} await refreshRuns(); render(); showToast('已删除'); }
    else if(action==='load'){ await loadRunIntoAnalysis(runId); showToast('运行已载入分析视图'); }
    else if(action==='audit'){ await openAudit(runId); }
  }catch(err){showToast((err.message||'操作失败'),true);}
}

function subscribeLive(runId) {
  state.live?.close?.();
  state.live={runId,events:[],status:'running',close:null};
  state.live.close=api.subscribe(runId,{
    onEvent:ev=>{
      if(!state.live||state.live.runId!==runId)return;
      state.live.events.push(ev);
      const network=document.querySelector('.live-network-slot');
      if(network)network.innerHTML=agentFlow({agents:[],events:state.live.events},{interactive:false});
      const stream=document.querySelector('#liveStream');
      if(stream){ stream.insertAdjacentHTML('beforeend',liveEventLine(ev)); stream.scrollTop=stream.scrollHeight;
        const c=document.querySelector('#liveCount'); if(c)c.textContent=`${state.live.events.length} events`; }
    },
    onStatus:s=>{
      if(!state.live||state.live.runId!==runId)return;
      const was=state.live.status;
      state.live.status=s.status||state.live.status;
      const dot=document.querySelector('.live-monitor .run-status');
      if(dot&&was!==state.live.status){ refreshRuns().then(()=>render()); }
      else if(dot&&s.status&&s.status!=='running'){ dot.textContent=s.status; }
    },
  });
  // SSE 推送增量；读取已有事件后合并，保证打开历史运行时也能看到完整组织网。
  api.run(runId).then(run=>{
    if(!state.live||state.live.runId!==runId)return;
    const known=new Set(state.live.events.map(e=>e.id));
    state.live.events=[...run.events.filter(e=>!known.has(e.id)),...state.live.events].sort((a,b)=>(a.seq||0)-(b.seq||0));
    state.live.status=run.status||state.live.status;
    render();
  }).catch(()=>{});
}

async function refreshRuns(){ try{ state.runs=await api.runs(); }catch{ /* offline */ } }

async function loadRunIntoAnalysis(runId,jumpEventId) {
  const trace=await api.run(runId);
  if(trace.audit){
    const flagged=new Set(trace.audit.claims.filter(c=>Object.keys(CHECK_META).some(k=>CHECK_FLAG[k](c))).map(c=>c.eventId));
    trace.events.forEach(e=>{ if(flagged.has(e.id))e.autoFlagged=true; });
  }
  DATA[runId]=trace;
  ARCH_META[runId]={short:(trace.architecture||'run').slice(0,3).toUpperCase(),tone:'#0891b2',desc:`${trace.system||''} · 运行台`};
  state.architecture=runId;
  state.selectedId=jumpEventId&&trace.events.some(e=>e.id===jumpEventId)?jumpEventId:(trace.events[0]?.id);
  state.query=''; state.kindFilter='all';
  state.tab='trace';
  render();
}

function bindAudit() {
  const sel=document.querySelector('#auditRunSelect'); if(sel) sel.onchange=()=>openAudit(sel.value);
  const rerun=document.querySelector('#rerunAuditBtn'); if(rerun) rerun.onclick=async()=>{
    if(!state.audit.runId)return;
    state.audit.loading=true; render();
    try{ state.audit.report=await api.rerunAudit(state.audit.runId); }
    catch(err){ showToast('核查失败：'+err.message,true); }
    state.audit.loading=false; render();
  };
  document.querySelectorAll('[data-audit-filter]').forEach(btn=>btn.onclick=()=>{state.audit.filter=btn.dataset.auditFilter;render();});
  document.querySelectorAll('[data-phenomenon]').forEach(el=>el.onclick=()=>{
    state.phenomena.expanded = state.phenomena.expanded===el.dataset.phenomenon?null:el.dataset.phenomenon;
    render();
  });
  const reloadPh=document.querySelector('#reloadPhenomenaBtn'); if(reloadPh)reloadPh.onclick=()=>loadPhenomena(true);
  document.querySelectorAll('[data-jump-run]').forEach(btn=>btn.onclick=async()=>{
    const runId=btn.dataset.jumpRun,eventId=btn.dataset.jumpEvent;
    try{
      if(DATA[runId]){ state.architecture=runId; state.selectedId=eventId&&getTrace().events.some(e=>e.id===eventId)?eventId:state.selectedId; state.tab='trace'; render(); }
      else await loadRunIntoAnalysis(runId,eventId);
      setTimeout(()=>document.querySelector('.time-card.selected')?.scrollIntoView({behavior:'smooth',block:'center'}),30);
    }catch(err){showToast('载入失败：'+err.message,true);}
  });
}

async function openAudit(runId) {
  state.audit.runId=runId; state.audit.loading=true; state.tab='audit';
  render();
  try{
    state.audit.report=await api.audit(runId);
    if(!state.runs.find(r=>r.id===runId)?.audited) await refreshRuns();
  }catch(err){ state.audit.report=null; showToast('获取核查报告失败：'+err.message,true); }
  state.audit.loading=false; render();
}

async function initBackend(){
  state.backend=await probeBackend();
  if(!state.backend){ render(); return; }
  try{
    const [archs,dss,runs]=await Promise.all([api.architectures(),api.datasets(),api.runs()]);
    state.architectures=archs; state.datasetsApi=dss; state.runs=runs;
    if(!state.launch.taskId){
      state.tasksApi=await api.tasks(state.launch.dataset).catch(()=>[]);
      state.launch.taskId=state.tasksApi[0]?.id||null;
    }
  }catch{ state.backend=null; }
  render();
}

function saveAnnotation(type) {
  const e=selectedEvent(); const note=document.querySelector('#annotationNote')?.value||noteOf(e);
  state.annotations[`${state.architecture}:${e.id}`]={status:'hallucination',type,note};rebuildPropagationFromGold();recomputeGoldMetrics();persist();render();showToast(`人工 Gold：${TYPES[type].label}幻觉`);
}
function saveGoldStatus(status) {
  const e=selectedEvent(); const key=`${state.architecture}:${e.id}`; const old=state.annotations[key]||{};
  const note=document.querySelector('#annotationNote')?.value||old.note||noteOf(e);
  state.annotations[key]={...old,status,type:status==='hallucination'?(old.type||e.annotation||'context'):null,note};
  rebuildPropagationFromGold();recomputeGoldMetrics();persist();render();showToast(`人工 Gold：${({valid:'有效',hallucination:'幻觉',uncertain:'待定',unreviewed:'未复核'})[status]}`);
}
function saveGoldNote() {
  const e=selectedEvent(); const key=`${state.architecture}:${e.id}`; const old=state.annotations[key]||{};
  const status=old.status||e.goldStatus||'unreviewed';
  state.annotations[key]={...old,status,type:status==='hallucination'?(old.type||e.annotation||'context'):null,note:document.querySelector('#annotationNote')?.value||''};
  persist();render();showToast('人工 Gold 说明已保存');
}
function saveClaim(claimId) {
  const e=selectedEvent();const claim=(e.claims||[]).find(c=>String(c.id)===String(claimId));
  const card=[...document.querySelectorAll('[data-claim-card]')].find(el=>el.dataset.claimCard===String(claimId));if(!claim||!card)return;
  const field=name=>card.querySelector(`[data-claim-field="${name}"]`)?.value??'';
  const lines=value=>value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  state.claimAnnotations[claimKey(e,claim)]={
    text:field('text').trim(),verdict:field('verdict'),experimentExecution:field('experimentExecution'),
    evidenceRefs:lines(field('evidenceRefs')),adoptedBy:lines(field('adoptedBy')),fate:field('fate'),note:field('note').trim(),
    reviewedAt:new Date().toISOString(),annotator:'human',
  };
  persistClaims();render();showToast('主张级证据核查已保存');
}
function persist(){localStorage.setItem('tracelab-annotations',JSON.stringify(state.annotations));}
function persistClaims(){localStorage.setItem('tracelab-claim-annotations',JSON.stringify(state.claimAnnotations));}
function showToast(msg,bad=false){const t=document.querySelector('#toast');if(!t)return;t.textContent=msg;t.className='toast show '+(bad?'bad':'');setTimeout(()=>t.className='toast',2600);}

function loadGold(raw) {
  let parsed;
  try{parsed=JSON.parse(raw);}catch{parsed=raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
  const items=Array.isArray(parsed)?parsed:(parsed.gold_annotations||parsed.annotations||parsed.labels||[]);
  if(!Array.isArray(items)||!items.length)throw new Error('未找到 gold_annotations / annotations 数组');
  const trace=getTrace(); let count=0;
  items.forEach(x=>{
    const id=String(x.event_id||x.id||x.eventId||'');
    const target=trace.events.find(e=>String(e.id)===id);
    if(!target)return;
    if(x.claim_id||x.claimId){
      const claim=(target.claims||[]).find(c=>String(c.id)===String(x.claim_id||x.claimId));if(!claim)return;
      state.claimAnnotations[claimKey(target,claim)]={
        text:x.text||x.claim||x.statement||claim.text,verdict:x.verdict||x.review_status||null,
        experimentExecution:x.experiment_execution||x.execution_check||'not_applicable',
        evidenceRefs:Array.isArray(x.evidence_refs)?x.evidence_refs:[x.evidence_refs||x.evidence].filter(Boolean),
        adoptedBy:Array.isArray(x.adopted_by)?x.adopted_by:[x.adopted_by||x.downstream_event_ids].filter(Boolean),
        fate:x.fate||x.propagation_status||'unresolved',note:x.reason||x.rationale||x.note||'',annotator:x.annotator||'human'
      };count++;return;
    }
    const status=normalizeGoldStatus(x.status||x.label||x.validity,'unreviewed');
    const rawType=x.type||x.hallucination_type||null;
    const type=status==='hallucination'?(TYPES[rawType]?rawType:'context'):null;
    state.annotations[`${state.architecture}:${id}`]={status,type,note:x.reason||x.rationale||x.note||'',annotator:x.annotator||null,evidence:x.evidence_refs||x.evidence||null};
    if(x.propagation_role)target.signal=x.propagation_role;
    count++;
  });
  if(!count)throw new Error('Gold 中的 event_id 与当前轨迹不匹配');
  rebuildPropagationFromGold();recomputeGoldMetrics();
  persist();persistClaims();return count;
}

function loadImported(raw,filename) {
  let parsed;
  try{parsed=JSON.parse(raw);}catch{parsed=raw.split(/\r?\n/).filter(Boolean).map((l,i)=>{try{return JSON.parse(l);}catch{return {time:`00:${String(i).padStart(2,'0')}`,agent:'system',kind:'log',title:'Raw log',detail:l};}});}
  let items;
  if(Array.isArray(parsed?.sessions)){
    items=parsed.sessions.flatMap((session,sIndex)=>(session.events||[]).map((x,i)=>({...x,
      session_id:x.session_id||session.id||session.session_id||`session-${sIndex+1}`,
      parent_session_id:x.parent_session_id||session.parent_session_id||session.parent_id||null,
      agent:x.agent||session.agent||session.profile||session.name||`agent-${sIndex+1}`,
      _sessionIndex:sIndex,_eventIndex:i
    })));
  } else items=Array.isArray(parsed)?parsed:(parsed.events||parsed.trace||parsed.session?.events);
  if(!Array.isArray(items)||!items.length)throw new Error('未找到 events 数组或 JSONL 事件');
  const events=items.map((x,i)=>{
    const rawType=String(x.kind||x.type||x.event_type||'event');
    const isSubStart=/subagent\/start|subagent_start/i.test(rawType);
    const isSubEnd=/subagent\/end|subagent_end/i.test(rawType);
    const to=x.to??x.target_agent??x.child_agent_id??x.subagent_id??(isSubStart?(x.child_session_id||x.child_id):null);
    const relation=x.relation??(isSubStart?'delegate':isSubEnd?'report':null);
    const rawClaims=x.claims||x.assertions||x.claims_made||(x.claim?[x.claim]:[]);
    const asRefs=v=>Array.isArray(v)?v.map(String):v==null?[]:[String(v)];
    const claims=(Array.isArray(rawClaims)?rawClaims:[rawClaims]).filter(Boolean).map((c,j)=>typeof c==='string'?{id:`c-${i+1}-${j+1}`,text:c}:({
      id:String(c.id||c.claim_id||`c-${i+1}-${j+1}`),text:String(c.text||c.claim||c.content||c.statement||''),
      verdict:c.verdict||c.review_status||null,
      evidenceRefs:asRefs(c.evidenceRefs||c.evidence_refs||c.evidence),
      adoptedBy:asRefs(c.adoptedBy||c.adopted_by||c.downstream_event_ids),
      fate:c.fate||c.propagation_status||'unresolved',
      experimentExecution:c.experimentExecution||c.experiment_execution||c.execution_check||'not_applicable',
      note:c.note||c.reason||c.rationale||''
    })).filter(c=>c.text);
    return event(
      String(x.id||x.event_id||x.seq||`u${i+1}`), String(x.time||x.timestamp||x.created_at||`00:${String(i).padStart(2,'0')}`),
      String(x.agent||x.actor||x.source||x.profile||'agent'), rawType,
      String(x.title||x.action||x.name||x.tool_name||`Event ${i+1}`), String(x.detail||x.message||x.content||x.observation||x.result||''),
      {expected:x.expected??x.expected_state??null,observed:x.observed??x.actual_state??x.tool_observation??x.result??null,stateChange:x.stateChange??x.state_change??null,to,relation,evidence:x.evidence??x.source_ref??x.file_ref??null,signal:x.signal??null,annotation:x.annotation??x.hallucination_type??null,
       goldStatus:x.gold_status??x.gold_label??x.human_label??(x.annotation||x.hallucination_type?'hallucination':'unreviewed'),goldReason:x.gold_reason??x.rationale??x.annotation_reason??null,
       motif:x.motif??null,sessionId:x.session_id??x.sessionId??null,parentSessionId:x.parent_session_id??x.parentSessionId??null,childSessionId:x.child_session_id??null,
       dependsOn:x.depends_on??x.dependsOn??x.source_event_seqs??(x.parent_event_id?[x.parent_event_id]:null),parallelGroup:x.parallel_group??x.parallelGroup??null,callId:x.call_id??x.callId??null,claims}
    );
  });
  events.sort((a,b)=>String(a.time).localeCompare(String(b.time),undefined,{numeric:true}));
  inferPropagationSignals(events);
  const agents=[...new Set(events.map(e=>e.agent))];
  const importedSystem=parsed.system||parsed.framework||parsed.architecture||state.importTarget||filename;
  const importedKey=`Run ${Date.now().toString(36)}`;
  DATA[importedKey]={id:parsed.id||parsed.session_id||`import-${Date.now().toString().slice(-6)}`,system:importedSystem,sourceType:'Imported',task:parsed.task||parsed.name||filename,duration:events.at(-1).time,metrics:{affectedF1:parsed.metrics?.affectedF1??0,grounding:parsed.metrics?.grounding??0,progress:parsed.metrics?.progress??0,cost:parsed.metrics?.cost??agents.length,recovery:events.some(e=>e.signal==='corrected')?1:0,spread:events.filter(e=>['accepted','propagated'].includes(e.signal)).length},events};
  ARCH_META[importedKey]={short:'LOG',tone:'#0891b2',desc:`${importedSystem} · 用户导入`};
  state.importTarget='';
  state.architecture=importedKey;state.selectedId=events[0].id;state.query='';state.kindFilter='all';
  if(Array.isArray(parsed.gold_annotations))loadGold(JSON.stringify(parsed.gold_annotations));
  else recomputeGoldMetrics(DATA[importedKey],importedKey);
  state.tab='trace';render();
}

Object.entries(DATA).forEach(([name,trace])=>recomputeGoldMetrics(trace,name));
render();
initBackend();
