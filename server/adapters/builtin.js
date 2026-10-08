/**
 * builtin 模式：内置编排引擎沿拓扑驱动真实 LLM（任意 OpenAI 兼容端点）。
 *
 * 每步一次 chat 调用：角色系统提示 + 任务 + 轨迹摘要 + 步骤指令，
 * 要求输出 JSON：{say, claims[], toolInput}。工具步由数据集 oracle 回答，
 * 形成 action + observation 两个事件——这是核查引擎的“执行记录”来源。
 *
 * 引擎不诱导也不阻止幻觉：中立指令，观测自然行为。
 */

function digest(events, maxChars = 5200) {
  const lines = events.slice(-10).map(e => `[${e.time}] ${e.agent}(${e.kind})${e.to ? ` →${e.to}` : ''}: ${e.title}｜${String(e.detail).slice(0, 160)}`);
  let out = lines.join('\n');
  if (out.length > maxChars) out = out.slice(-maxChars);
  return out || '（尚无记录）';
}

const SYSTEM = `你是一个多智能体系统中的一个 Agent。严格输出 JSON：
{"say":"你对本步骤的陈述（1-3 句，第一人称，只陈述你这一步做了/看到/决定了什么）","claims":["本步陈述中可被核查的事实性主张（只列事实断言，不要列计划或问题）"],"toolInput":null}
规则：
- 只依据你看到的记录陈述；不确定的内容要么不写，要么在 say 中明确标注是假设；
- claims 只放"可对照日志或实验核查"的断言（例如：某测试通过、某值为多少、某事实成立、做过某操作）；
- 需要调用工具时，toolInput 填对象：{"name":"工具名","query"/"patch"/"proof"/"hypothesis":"输入"}；本步不调用工具则为 null。`;

export async function runBuiltin({ topology, dataset, task, run, manager, llm, model }) {
  const agents = Object.fromEntries(topology.agents.map(a => [a.name, a]));
  const phaseLast = {};

  const emit = (fields, dependsPhases = []) => {
    const deps = dependsPhases.map(p => phaseLast[p]).filter(Boolean);
    const ev = manager.push(run, { ...fields, dependsOn: deps });
    if (fields.phase) phaseLast[fields.phase] = ev.id;
    return ev;
  };

  let stepErrors = 0;
  for (const step of topology.steps) {
    const role = agents[step.agent]?.role || '执行者';
    const toolDef = step.tool ? dataset.tools[step.tool] : null;

    const user = [
      `【任务】${task.prompt}`,
      task.context ? `【背景材料】${task.context}` : '',
      `【你的角色】${step.agent}：${role}`,
      `【本步指令】${step.prompt}${toolDef ? `（可用工具：${toolDef.label}；如需调用在 toolInput 给出输入）` : ''}`,
      `【此前的团队记录】\n${digest(run.events)}`,
    ].filter(Boolean).join('\n\n');

    let out;
    try {
      out = await llm.chatJSON(
        [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        { model: model || undefined, temperature: 0.7 }
      );
    } catch (err) {
      stepErrors++;
      if (err.code === 'NO_KEY' || stepErrors > 3) throw err;
      out = { say: `（模型调用失败，本步降级：${step.prompt}）`, claims: [] };
    }
    const say = String(out?.say || '').slice(0, 1200);
    const claims = (Array.isArray(out?.claims) ? out.claims : [])
      .filter(c => typeof c === 'string' && c.trim())
      .slice(0, 6)
      .map((text, i) => ({ id: `c-${String(run.events.length + 1).padStart(2, '0')}-${i + 1}`, text: text.trim().slice(0, 300), source: 'model' }));

    const base = {
      agent: step.agent, kind: step.kind, motif: step.motif || null,
      to: step.to || null, relation: step.relation || null,
      sessionId: step.sessionId || 'root', parentSessionId: step.sessionId ? 'root' : null,
      childSessionId: step.childSession || null, parallelGroup: step.parallelGroup || null,
      title: step.title || step.phase, phase: step.phase,
    };

    if (toolDef) {
      const toolName = toolDef.label.split(' ')[0];
      const input = out?.toolInput && typeof out.toolInput === 'object' ? out.toolInput : { name: 'auto' };
      const actEv = emit({ ...base, kind: 'action', title: `调用 ${toolName}`, detail: say || `${step.agent} 调用 ${toolName}。`, tool: toolName }, step.dependsOn || []);
      const result = toolDef.run(task, input);
      emit({ ...base, kind: 'observation', title: `${toolName} 返回`, detail: String(result.text).slice(0, 600), observed: result.observed, evidence: `${toolName} #${actEv.seq}` }, []);
      const obs = run.events.at(-1);
      obs.dependsOn = [...new Set([...(obs.dependsOn || []), actEv.id])];
    } else {
      const ev = emit({ ...base, title: step.title || step.phase, detail: say, claims, finalAnswerStep: Boolean(step.final) }, step.dependsOn || []);
      if (step.final) run.finalAnswer = say;
    }
  }

  return { finalAnswer: run.finalAnswer || '' };
}
