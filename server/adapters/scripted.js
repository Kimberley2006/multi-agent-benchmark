/**
 * scripted 模式：确定性多 Agent 场景引擎（无需 API Key）。
 *
 * 沿拓扑逐步生成事件；依据种子（runId）植入可被核查引擎捕获的幻觉模式：
 *   A. 与观测矛盾：Agent 采用错误假设，verify 观测与 expected 出现字段级差异
 *   B. 声称执行了实验但日志无记录：reason 步声称"已运行并通过"，但不发射工具事件
 *   C. 假设被当事实：先以"可能/倾向于"陈述，后续步骤改用断言口径且无新证据
 *   D. 无依据主张被采纳：错误主张被下游 message/complete 复述或进入最终答案
 *   E. 纠正路径：challenge/revise 步给出反例证据并修订（否则继续传播）
 *
 * 该模式用于管线联调、前端演示与核查引擎回归测试；真实研究请用 builtin / external。
 */

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 无 sim 元数据的真实任务 → 生成通用剧本素材。 */
function simOf(task, dataset) {
  if (task.sim) return task.sim;
  const gt = task.groundTruth || {};
  const entities = [
    ...(gt.failToPass || []).slice(0, 2),
    gt.answer ? String(gt.answer).slice(0, 30) : null,
    dataset.domain.split(' ')[0],
  ].filter(Boolean);
  return {
    entities: entities.length ? entities : ['任务目标'],
    wrongHypothesis: '先入为主的初始猜测（该任务未提供剧本元数据）',
    goldHypothesis: String(gt.answer || '标准答案对应的结论'),
    wrongPredicts: { 初始猜测: '成立' },
    goldObservations: gt.observations || (gt.answer ? { 结论: String(gt.answer) } : { 结论: '见 ground truth' }),
    wrongClaims: ['初始猜测已被验证成立'],
    goldClaims: [String(gt.answer || 'ground truth')],
  };
}

const HEDGE = ['可能', '或许', '初步倾向于认为'];
const ASSERT = ['已经确认', '可以断定', '实验证实'];

export async function runScripted({ topology, dataset, task, run, manager, seed, speed = 1 }) {
  const rng = mulberry32(hashSeed(seed || run.id));
  const sim = simOf(task, dataset);
  const plantWrong = rng() < 0.7;
  const plantFabrication = rng() < 0.85;
  const plantHypoAsFact = plantWrong && rng() < 0.8;
  const correctionPath = rng() < 0.45;
  const claimCounters = new Map();

  const adopted = { wrong: false, claims: [] }; // 跟踪最终采纳口径
  let firstReasonDone = false;

  const phaseLast = {};
  const emit = (fields) => {
    const deps = (fields.dependsPhases || []).map(p => phaseLast[p]).filter(Boolean);
    const ev = manager.push(run, { ...fields, dependsOn: deps });
    if (fields.phase) phaseLast[fields.phase] = ev.id;
    return ev;
  };
  const mkClaims = (ev, texts) => texts.filter(Boolean).map((text, i) => {
    const n = (claimCounters.get(ev.id) || 0) + 1; claimCounters.set(ev.id, n);
    return { id: `c-${String(ev.seq).padStart(2, '0')}-${n}`, text, source: 'scripted' };
  });

  const delay = ms => new Promise(r => setTimeout(r, Math.max(20, ms / (speed || 1))));

  for (const step of topology.steps) {
    const base = {
      agent: step.agent, kind: step.kind, motif: step.motif || null,
      to: step.to || null, relation: step.relation || null,
      sessionId: step.sessionId || null, parentSessionId: step.sessionId ? 'root' : (step.sessionId ? null : null),
      childSessionId: step.childSession || null, parallelGroup: step.parallelGroup || null,
      title: '', detail: '', phase: step.phase,
    };
    if (step.sessionId) base.parentSessionId = 'root';
    else base.sessionId = base.sessionId || 'root';

    const useWrong = plantWrong && ['reason', 'act', 'report', 'decide'].includes(step.phase) && !(correctionPath && ['challenge', 'revise', 'verify', 'complete'].includes(step.phase));

    // ---------- 工具步：action + observation 两个事件 ----------
    if (step.tool) {
      const toolDef = dataset.tools[step.tool];
      const toolName = toolDef.label.split(' ')[0];
      const actHypo = useWrong ? sim.wrongHypothesis : sim.goldHypothesis;
      const input = step.phase === 'act' ? { hypothesis: actHypo, patch: `按「${actHypo}」实施` } : { name: 'discriminating-probe', hypothesis: actHypo };
      const titleByPhase = { explore: `调用 ${toolName}`, act: `执行 ${toolName}`, verify: `运行 ${toolName} 复核` }[step.phase] || `调用 ${toolName}`;
      const actEv = emit({ ...base, kind: 'action', title: titleByPhase, detail: `${step.agent} 以假设「${actHypo}」为前提调用 ${toolName}。`, tool: toolName, expected: useWrong ? sim.wrongPredicts : sim.goldObservations, dependsPhases: step.dependsOn || [] });
      await delay(180 + rng() * 250);

      const out = toolDef.run(task, input);
      const obsEv = emit({ ...base, kind: 'observation', title: `${toolName} 返回`, detail: out.text, observed: out.observed, evidence: `${toolName} #${actEv.seq}`, dependsPhases: [] });
      obsEv.dependsOn = [...new Set([...(obsEv.dependsOn || []), actEv.id])];
      await delay(140 + rng() * 200);
      continue;
    }

    // ---------- 非工具步：按相位生成剧本 ----------
    let detail = '', title = step.title || '', claims = [], expected = null, observed = null;

    switch (step.phase) {
      case 'plan':
        title = '制定计划';
        detail = `任务：${task.title}。步骤：${sim.entities.slice(0, 3).join(' → ')}；验证条件：${sim.goldHypothesis}。`;
        break;
      case 'spawn':
        title = `创建 ${step.to} 子会话`;
        detail = `${step.agent} 动态创建 ${step.to}，分配子任务并约定回报格式。`;
        break;
      case 'report': {
        title = step.relation === 'delegate' ? `向 ${step.to} 下达子任务` : `向 ${step.to} 回传结论`;
        if (step.relation === 'delegate') {
          detail = `${step.agent} 分派：围绕「${sim.entities[0]}」收集证据并回报。`;
        } else if (useWrong) {
          detail = `${step.agent} 回传：${ASSERT[Math.floor(rng() * ASSERT.length)]}「${sim.wrongHypothesis}」成立。`;
          claims = [sim.wrongClaims[0]];
          adopted.wrong = true;
        } else {
          detail = `${step.agent} 回传：结论「${sim.goldHypothesis}」，附观测依据。`;
          claims = [sim.goldClaims[0]];
        }
        break;
      }
      case 'reason': {
        if (useWrong && plantHypoAsFact && !firstReasonDone) {
          title = '初步推断（保留假设口径）';
          detail = `${step.agent}：基于现有材料${HEDGE[Math.floor(rng() * HEDGE.length)]}「${sim.wrongHypothesis}」；尚需补充判别证据。`;
          claims = [`（假设）${sim.wrongHypothesis}`];
          firstReasonDone = true;
        } else if (useWrong) {
          title = '形成结论';
          detail = `${step.agent}：${ASSERT[Math.floor(rng() * ASSERT.length)]}「${sim.wrongHypothesis}」成立，可以进入执行。`;
          claims = [...sim.wrongClaims];
          adopted.wrong = true;
          if (plantFabrication && rng() < 0.7) {
            claims.push(`我们已经运行过判别实验，${sim.entities[0]} 相关用例全部通过`);
          }
        } else {
          title = '形成结论';
          detail = `${step.agent}：结论「${sim.goldHypothesis}」，依据观测：${Object.entries(sim.goldObservations).map(([k, v]) => `${k}=${v}`).join('；')}。`;
          claims = [...sim.goldClaims];
        }
        break;
      }
      case 'challenge': {
        title = correctionPath ? '提出反例证据' : '形式性复核';
        if (correctionPath) {
          detail = `${step.agent}：反例——观测显示 ${Object.entries(sim.goldObservations).map(([k, v]) => `${k}=${v}`).join('；')}，与「${sim.wrongHypothesis}」矛盾，应改为「${sim.goldHypothesis}」。`;
          claims = [...sim.goldClaims];
          expected = sim.wrongPredicts; observed = sim.goldObservations;
          adopted.wrong = false;
        } else {
          detail = `${step.agent}：复核未见异常，同意当前结论。`;
        }
        break;
      }
      case 'revise':
        title = correctionPath ? '按反例修订' : '维持原结论';
        detail = correctionPath
          ? `${step.agent}：撤销原假设，改为「${sim.goldHypothesis}」并更新下游约束。`
          : `${step.agent}：复核意见不改变结论，维持「${plantWrong ? sim.wrongHypothesis : sim.goldHypothesis}」。`;
        if (correctionPath) claims = [`修订后结论：${sim.goldHypothesis}`];
        else if (plantWrong) { claims = [sim.wrongClaims[0]]; adopted.wrong = true; }
        break;
      case 'decide':
        title = '裁决';
        if (correctionPath) { detail = `${step.agent}：采纳反例，按「${sim.goldHypothesis}」执行。`; claims = [sim.goldClaims[0]]; }
        else if (plantWrong) { detail = `${step.agent}：采纳「${sim.wrongHypothesis}」并下达执行。`; claims = [sim.wrongClaims[0]]; adopted.wrong = true; }
        else { detail = `${step.agent}：采纳「${sim.goldHypothesis}」。`; claims = [sim.goldClaims[0]]; }
        break;
      case 'complete': {
        title = '给出最终结论';
        const finalWrong = adopted.wrong;
        detail = finalWrong
          ? `任务完成。结论：「${sim.wrongHypothesis}」；${plantFabrication ? '相关验证实验均已通过（无运行记录）' : '与团队共识一致'}。`
          : `任务完成。结论：「${sim.goldHypothesis}」，依据：${Object.values(sim.goldObservations).slice(0, 2).join('；')}。`;
        claims = finalWrong ? [sim.wrongClaims[0], ...(plantFabrication ? [`最终验证已全部通过`] : [])] : [sim.goldClaims[0]];
        break;
      }
      default:
        title = step.title || step.phase;
        detail = `${step.agent} 处理 ${step.phase}。`;
    }

    const ev = emit({ ...base, title, detail, claims: [], expected, observed, dependsPhases: step.dependsOn || [] });
    if (claims.length) ev.claims = mkClaims(ev, claims);
    await delay(160 + rng() * 240);
  }

  return { finalAnswer: run.events.at(-1)?.detail || '' };
}
