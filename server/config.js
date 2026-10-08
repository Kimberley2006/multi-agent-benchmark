import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.TRACELAB_DATA_DIR || path.join(__dirname, 'data');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const PORT = Number(process.env.TRACELAB_PORT || 8787);
export const HOST = process.env.TRACELAB_HOST || '0.0.0.0';

/** 用户可编辑的服务端配置；密钥只存在服务端，绝不进入前端。 */
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  llm: {
    // 任意 OpenAI 兼容端点（DeepSeek 官方、vLLM、Ollama 的 /v1 等）
    baseUrl: process.env.TRACELAB_LLM_BASE_URL || 'https://api.deepseek.com/v1',
    apiKey: process.env.TRACELAB_LLM_API_KEY || 'sk-6eb1767e2c034333968d5d3440a9b0dd',
    model: process.env.TRACELAB_LLM_MODEL || 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    timeoutMs: 120000,
  },
  external: {
    // external 模式探测：命令模板。{task} 占位符替换任务提示词；{workdir} 为运行工作目录。
    dsh: {
      // DeepSeek Harness 本地 checkout：探测 dsh CLI；可用则记录其 JSONL 事件流
      command: process.env.TRACELAB_DSH_CMD || 'node /data1/wuhan/deepseek-harness/apps/cli/lib/bin.js --version',
      runTemplate: process.env.TRACELAB_DSH_RUN || '',
      logGlob: 'events*.jsonl',
      cwd: '/data1/wuhan/deepseek-harness',
    },
    claudeTeam: {
      command: process.env.TRACELAB_CLAUDE_CMD || 'claude --version',
      runTemplate: process.env.TRACELAB_CLAUDE_RUN || 'claude -p {task} --output-format stream-json --verbose --max-turns 24',
    },
    deerflow: {
      command: process.env.TRACELAB_DEERFLOW_CMD || '',
      runTemplate: process.env.TRACELAB_DEERFLOW_RUN || 'deer-flow "{task}"',
      cwd: process.env.TRACELAB_DEERFLOW_CWD || '',
    },
  },
  datasets: {
    // 指向官方数据文件/目录：{ eurekabench: '/data/datasets/eureka.jsonl', ... }
    paths: {},
  },
  audit: {
    llmAssist: false, // 为 true 且配置了 key 时，主张提取叠加 LLM 辅助
    // 为 true 且配置了 key 时，对规则判为 unsupported / weak-evidence 的模糊带主张
    // 逐条做 LLM 语义复核（引文必须逐字命中观测原文，否则不采信）。仅建议层，不改规则结论。
    llmJudge: false,
    llmJudgeMaxClaims: 30, // 单次 run 最多复核的模糊带主张数
  },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  let userCfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try { userCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
    catch { console.error(`[config] ${CONFIG_FILE} 解析失败，使用默认配置`); }
  }
  return deepMerge(DEFAULT_CONFIG, userCfg);
}

export function configPublicShape(cfg) {
  return {
    llmConfigured: Boolean(cfg.llm.apiKey),
    model: cfg.llm.model,
    baseUrlHost: (() => { try { return new URL(cfg.llm.baseUrl).host; } catch { return cfg.llm.baseUrl; } })(),
    llmAssist: Boolean(cfg.audit.llmAssist && cfg.llm.apiKey),
    llmJudge: Boolean(cfg.audit.llmJudge && cfg.llm.apiKey),
    external: Object.fromEntries(
      Object.entries(cfg.external).map(([k, v]) => [k, { command: v.command, runTemplate: v.runTemplate }])
    ),
  };
}
