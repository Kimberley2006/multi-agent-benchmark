# TraceLab · 多智能体幻觉轨迹分析平台

在网站中**运行** 8 种多 Agent 架构、收集运行日志、可视化动态架构，并对日志做**逐主张证据核查**，追踪幻觉的产生、传播与纠正。

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


## 架构（8 种 × 三种执行模式）

| 架构 | 类别 | scripted | builtin | external |
|---|---|---|---|---|
| Single / Independent / Pipeline / Discussion / Star | 5 基础架构 | ✅ | ✅ | — |
| DeerFlow 1.x（Deep Research 工作流） | 动态 | ✅ | ✅ | 可配置 |
| Claude Code Agent Teams（Lead 动态生成队友） | 动态 | ✅ | ✅ | 可配置 |
| DeepSeek Harness（插件化子会话编排） | 动态 | ✅ | ✅ | 可配置 |

- **scripted**：用于模拟调试。
- **builtin**：真实LLM测试。
- **external**：benchmark 系统不跑 Agent，交给外部CLI，系统只负责调用、解析、展示。

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


## 逐主张证据核查（是非问 + 证据）


1. **Q1 与观测矛盾** — 该主张是否与实验/工具观测相矛盾？（差异字段、失败结果、数值冲突）
2. **Q2 假设** — 是否在“无新证据”的情况下由假设口径升级为结论口径？
3. **Q3 执行记录** — 声称的执行在日志中是否有对应记录？
4. **Q4 无据采纳** — 该主张在缺乏证据时是否被下游事件或最终结论采纳？
5. **Q5 修正传播** — 该可疑主张最终是否被修正（而非继续传播）？

答案枚举：是 / 否 / 证据不足 / 不适用。输出：逐主张 QA（含证据事件 ID）、幻觉传播轨迹

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
ToDo
1. 添加架构的可视化图  
2. 处理某个 Agent 接受错信息来源的问题  
3. 运筹优化是否可以提到 LeanDojo 数据集实现数学证明任务  
4. 数学证明、代码实现等领域的幻觉怎么判别，目前使用词面语义判别有问题  
5. 确定 benchmark 中包含哪些功能后，删除冗余功能  
6. 扩大数据集规模，将上述内容转换成 Markdown 形式
