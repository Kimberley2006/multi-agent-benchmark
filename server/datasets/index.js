import fs from 'node:fs';
import path from 'node:path';
import { eurekaBench } from './eurekabench.js';
import { sweBenchVerified } from './swebench.js';
import { browseCompPlus } from './browsecomp.js';
import { leanDojo } from './leandojo.js';
import { powerPlan } from './powerplan.js';

const REGISTRY = { eurekabench: eurekaBench, swebench: sweBenchVerified, browsecomp: browseCompPlus, leandojo: leanDojo, powerplan: powerPlan };

/** 额外任务目录：把官方数据文件挂载进对应数据集。 */
const EXTRA_DIR = process.env.TRACELAB_DATA_DIR
  ? path.join(process.env.TRACELAB_DATA_DIR, 'datasets')
  : path.resolve(import.meta.dirname, '../data/datasets');

function loadExtras() {
  for (const ds of Object.values(REGISTRY)) {
    const dir = path.join(EXTRA_DIR, ds.id);
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => /\.(jsonl|json)$/i.test(f));
      for (const f of files) {
        const loaded = ds.loadFile(path.join(dir, f));
        if (loaded) console.log(`[datasets] ${ds.id}: 从 ${f} 载入 ${loaded} 个任务`);
      }
    } catch (err) {
      console.warn(`[datasets] ${ds.id} 额外目录加载失败:`, err.message);
    }
  }
}

let initialized = false;
export function getDatasets() {
  if (!initialized) { loadExtras(); initialized = true; }
  return Object.values(REGISTRY).map(ds => ({
    id: ds.id, name: ds.name, domain: ds.domain, desc: ds.desc,
    taskCount: ds.tasks.length, tools: Object.fromEntries(Object.entries(ds.tools).map(([k, t]) => [k, t.label])),
  }));
}

export function getDataset(id) {
  if (!initialized) { loadExtras(); initialized = true; }
  return REGISTRY[id] || null;
}

export function getTask(datasetId, taskId) {
  const ds = getDataset(datasetId);
  if (!ds) return null;
  return ds.tasks.find(t => t.id === taskId) || null;
}

/** 读取 JSON / JSONL（自动识别）。 */
export function readJsonOrJsonl(file) {
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return [];
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // 整体不是合法 JSON 时退回按行解析
    }
  }
  return raw.split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
}

/** 任务脱敏视图（下发给前端 / LLM prompt 用）。 */
export function publicTask(t) {
  return {
    id: t.id, dataset: t.dataset, title: t.title, prompt: t.prompt,
    context: t.context || null, sample: Boolean(t.sample),
    meta: t.meta || null,
    // groundTruth 只保留概要，不泄露答案给前端（核查在服务端完成）
    hasGroundTruth: Boolean(t.groundTruth && Object.keys(t.groundTruth).length),
  };
}
