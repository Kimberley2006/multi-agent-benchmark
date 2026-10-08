import { TOPOLOGIES } from './topologies.js';
import { runScripted } from './scripted.js';
import { runBuiltin } from './builtin.js';
import { runExternal, probeExternal } from './external.js';

/**
 * 架构注册表：8 种架构（5 基础 + DeerFlow 1.x / Claude Code Agent Teams / DeepSeek Harness）。
 * 每种架构三种执行模式：
 *  - scripted  确定性场景（无需 Key，管线联调 / 演示 / 核查回归）
 *  - builtin   内置编排引擎 + 真实 LLM（任意 OpenAI 兼容端点）
 *  - external  外部真实 CLI（配置探测命令与 runTemplate 后启用）
 */

const EXTERNAL_MAP = { dsh: 'dsh', claudeTeam: 'claudeTeam', deerflow: 'deerflow' };

export function architectureCatalog() {
  return Object.values(TOPOLOGIES).map(t => ({
    id: t.id, name: t.name, short: t.short, category: t.category, tone: t.tone,
    desc: t.desc, agents: t.agents.map(a => a.name), steps: t.steps.length,
    modes: ['scripted', 'builtin', ...(EXTERNAL_MAP[t.id] ? ['external'] : [])],
  }));
}

export async function probeAvailability(cfg) {
  const out = {};
  for (const [archId, key] of Object.entries(EXTERNAL_MAP)) {
    out[archId] = await probeExternal(cfg.external[key]);
  }
  return out;
}

export function adapterFor(archId) {
  const topo = TOPOLOGIES[archId];
  if (!topo) throw new Error(`未知架构: ${archId}`);
  return topo;
}

/** 执行入口：mode 决定引擎。返回 promise，完成后 run 已 finish。 */
export async function executeRun({ manager, run, mode, dataset, task, cfg, llm, model, speed }) {
  const topo = TOPOLOGIES[run.architecture];
  if (!topo) throw new Error(`未知架构: ${run.architecture}`);

  if (mode === 'scripted') {
    const r = await runScripted({ topology: topo, dataset, task, run, manager, seed: run.id, speed });
    if (r.finalAnswer) run.finalAnswer = r.finalAnswer;
    return;
  }
  if (mode === 'builtin') {
    const r = await runBuiltin({ topology: topo, dataset, task, run, manager, llm, model });
    if (r.finalAnswer) run.finalAnswer = r.finalAnswer;
    return;
  }
  if (mode === 'external') {
    const key = EXTERNAL_MAP[run.architecture];
    if (!key) throw new Error(`架构 ${run.architecture} 不支持 external 模式`);
    const r = await runExternal({ entry: cfg.external[key], task, run, manager, label: topo.name });
    if (r.finalAnswer) run.finalAnswer = r.finalAnswer;
    return;
  }
  throw new Error(`未知模式: ${mode}`);
}
