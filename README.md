# TraceLab · 多智能体幻觉轨迹分析平台

在网站中**运行** 8 种多 Agent 架构、收集运行日志、可视化动态架构，并对日志做**逐主张证据核查**，追踪幻觉的产生、传播与纠正。

```
┌──────────────────────────── 前端 (Vite · 原生 JS) ────────────────────────────┐
│ 运行台        核查轨迹        架构组合        执行轨迹      并排比较   指标      │
│ (启动/实时流)  (五项检查+轨迹)  (基元反演)     (事件+主张)                        │
└───────────────────────────────────┬ /api + SSE ──────────────────────────────┘
┌───────────────────────────────────▼ 后端 (Node · 零依赖) ────────────────────┐
│ 运行管理器 ─→ 架构适配器(8) ─→ 数据集(4) + oracle 环境模拟                     │
│      └────────→ 审计引擎：主张提取 → 五项检查 → 传播轨迹 → 事件 signal 回填     │
│ 文件存储 server/data/（runs / config）                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 快速开始

```bash
npm ci
npm run build        # 构建前端到 dist/
npm run server       # 启动后端：http://0.0.0.0:8787 （同时托管 API 与 dist 静态站点）
```

本地开发（前端热更新，`/api` 自动代理到 8787）：

```bash
npm run server       # 终端 1
npm run dev          # 终端 2 → http://localhost:5173
```

后端不可达时网站自动退回**离线模式**：导入日志、人工 Gold 标注、主张核查、比较视图照常可用。

## 架构（8 种 × 三种执行模式）

| 架构 | 类别 | scripted | builtin | external |
|---|---|---|---|---|
| Single / Independent / Pipeline / Discussion / Star | 5 基础架构 | ✅ | ✅ | — |
| DeerFlow 1.x（Deep Research 工作流） | 动态 | ✅ | ✅ | 可配置 |
| Claude Code Agent Teams（Lead 动态生成队友） | 动态 | ✅ | ✅ | 可配置 |
| DeepSeek Harness（插件化子会话编排） | 动态 | ✅ | ✅ | 可配置 |

- **scripted**：确定性场景引擎（免 Key）。按种子植入五类幻觉模式，用于管线联调、前端演示与核查引擎回归测试。
- **builtin**：内置编排引擎按拓扑驱动**真实 LLM**（任意 OpenAI 兼容端点：DeepSeek / vLLM / Ollama 等）。工具调用由数据集 oracle 回答，形成 `action + observation` 执行记录。
- **external**：把任务交给真实外部 CLI（`dsh` / `claude` / `deer-flow`），解析其 JSON 输出流。需在 `server/data/config.json` 配置探测命令与运行模板；探测失败时前端禁用该模式。

模型配置（**密钥只放服务端**，绝不进前端）：

```jsonc
// server/data/config.json
{
  "llm": {
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-…",
    "model": "deepseek-chat"
  }
}
```

或用环境变量 `TRACELAB_LLM_BASE_URL / TRACELAB_LLM_API_KEY / TRACELAB_LLM_MODEL`。

## 数据集（4 个）

| 数据集 | 任务域 | 内置样例 | 官方数据接入 |
|---|---|---|---|
| EurekaBench | 科学假设判别 | 3 | JSONL → `server/data/datasets/eurekabench/` |
| SWE-bench Verified | 代码修复 | 2 | 官方 JSONL → `server/data/datasets/swebench/` |
| BrowseComp-Plus | 网络研究 | 2 | JSONL → `server/data/datasets/browsecomp/` |
| LeanDojo | Lean 4 形式化证明 | 2 | JSONL → `server/data/datasets/leandojo/` |

把官方数据文件放进对应目录即自动挂载（字段映射见各 `server/datasets/*.js` 顶部注释）。
内置样例与 builtin/scripted 模式使用 **oracle 环境模拟**：实验测量、测试结果、编译输出由
ground truth 确定性生成（Lean 装了 `lean` CLI 时为真实编译）。SWE-bench 的真实 Docker 执行、
BrowseComp 的真实联网检索可在 `server/datasets/*.js` 的 `tools.*.run` 中替换接入。

## 逐主张证据核查（是非问 + 证据）

运行结束后审计引擎自动执行（也可在核查轨迹页手动重跑）。每条主张转成**主是非问**
（「该主张是否被日志或观测证据支持？」）+ 五项检查子问句，每个回答都必须附带证据引用：

1. **Q1 与观测矛盾** — 该主张是否与实验/工具观测相矛盾？（差异字段、失败结果、数值冲突）
2. **Q2 假设升级** — 是否在“无新证据”的情况下由假设口径升级为结论口径？
3. **Q3 执行记录** — 声称的执行在日志中是否有对应记录？
4. **Q4 无据采纳** — 该主张在缺乏证据时是否被下游事件或最终结论采纳？
5. **Q5 修正传播** — 该可疑主张最终是否被修正（而非继续传播）？

答案枚举：是 / 否 / 证据不足 / 不适用。输出：逐主张 QA（含证据事件 ID）、幻觉传播轨迹
（产生 → 采纳 → 最终/纠正）、运行级汇总；并回填事件 `signal`（origin/propagated/accepted/corrected）
供前端"执行轨迹/架构组合"视图直接渲染错误路径。

## 失败现象目录（跨轨迹聚合）

「失败现象」Tab 把多条运行中反复出现的失败模式聚合为现象分类（P1-P7）：
虚构执行、假设口径漂移、与观测矛盾仍成立、无据采纳·进入最终 / 中途拦截、
反例未拦截、迟到纠正。每类现象给出核查问句、按架构/数据集的频次分布与可回溯样本
（`GET /api/phenomena`）。现象由五项检查信号组合判定，随运行积累自动更新。

> **判定纪律**：自动核查结果仅是线索（规则与 LLM 均可能误报/漏报），最终判定以人工 Gold 标注为准。
> 前端在所有自动结果上明确标注 AUTO。配置 `audit.llmAssist: true` 且有 Key 时，叠加模型辅助主张提取。

## HTTP API

```
GET  /api/status                     服务/模型/外部适配器可用性
GET  /api/architectures | /api/datasets
GET  /api/datasets/:id/tasks[/:taskId]
POST /api/runs                       {architecture, dataset, taskId, mode, speed}
GET  /api/runs | /api/runs/:id       运行列表 / 完整 trace（前端兼容格式）
GET  /api/runs/:id/stream            SSE 实时事件流（event/status）
POST /api/runs/:id/stop | /audit     停止 / 重新核查
DELETE /api/runs/:id
```

## 部署（Nginx）

后端同进程托管 `dist/`，最简单是直接暴露 8787；需要 80/443 时反代：

```nginx
location / { proxy_pass http://127.0.0.1:8787; }   # 静态与 API 一起代理，SSE 无需额外配置
```

数据目录可用 `TRACELAB_DATA_DIR` 迁移；`server/data/` 建议加入备份并从 git 排除（含 API Key）。

## 目录

```
src/            前端（main.js 单页应用 + api.js 客户端）
server/
  index.js      HTTP + SSE + 静态托管
  runs/         运行管理器（事件流、落盘、审计回填）
  adapters/     8 种拓扑 + scripted/builtin/external 三引擎
  datasets/     4 数据集适配器 + oracle 环境模拟
  audit/        主张提取 + 五项检查 + 传播轨迹
  data/         运行时数据（runs/、config.json、datasets/ 官方数据）
```
# multi-agent-benchmark
