import path from 'node:path';
import { readJsonOrJsonl } from './index.js';

/**
 * BrowseComp-Plus · 网络研究
 *
 * 官方数据加载：JSONL 放到 server/data/datasets/browsecomp/*.jsonl
 * 兼容字段：id, question|task, answer|gold_answer, urls|sources
 *
 * oracle 说明：无外网时 web_search / fetch_page 返回基于 gold 的模拟检索
 * 快照（含干扰项），答案核查用规范化字符串比对。
 */

const SAMPLES = [
  {
    id: 'browse-demo-001', sample: true,
    title: '查找某标准的首次发布年份',
    prompt: '查明“IEEE 802.11”标准第一版是在哪一年正式发布的，并给出依据来源 URL。',
    context: '允许使用 web_search 与 fetch_page。',
    groundTruth: {
      answer: '1997',
      urls: ['https://standards.ieee.org/ieee/802.11/702/'],
    },
    sim: {
      entities: ['IEEE 802.11', '1997', 'standards.ieee.org'],
      wrongHypothesis: '首版发布于 1999 年',
      goldHypothesis: '首版发布于 1997 年',
      wrongPredicts: { '首次发布年份': '1999' },
      goldObservations: { '首次发布年份': '1997', '依据': 'IEEE standards 页面' },
      wrongClaims: ['IEEE 802.11 首版于 1999 年发布'],
      goldClaims: ['IEEE 802.11 首版于 1997 年发布'],
    },
  },
  {
    id: 'browse-demo-002', sample: true,
    title: '确认开源项目首个贡献者',
    prompt: '查明 Lean 定理证明库 mathlib 的第一个 commit 是谁提交的，给出来源。',
    context: '允许使用 web_search 与 fetch_page。',
    groundTruth: {
      answer: 'Mario Carneiro',
      urls: ['https://github.com/leanprover-community/mathlib/commit/'],
    },
    sim: {
      entities: ['mathlib', 'Mario Carneiro', 'GitHub'],
      wrongHypothesis: '首个贡献者是 Leo de Moura',
      goldHypothesis: '首个贡献者是 Mario Carneiro',
      wrongPredicts: { '首个贡献者': 'Leo de Moura' },
      goldObservations: { '首个贡献者': 'Mario Carneiro', '依据': 'GitHub 仓库提交历史' },
      wrongClaims: ['mathlib 首个 commit 由 Leo de Moura 提交'],
      goldClaims: ['mathlib 首个 commit 由 Mario Carneiro 提交'],
    },
  },
];

function norm(s) {
  return String(s || '').toLowerCase().replace(/[\s'".,!?;:()（）“”„»«\[\]]/g, '');
}

const ds = {
  id: 'browsecomp',
  name: 'BrowseComp-Plus',
  domain: '网络研究 · 多跳检索',
  desc: 'Agent 联网定位难以查找的事实；核查“引用不存在来源”“结论与检索证据矛盾”。',
  tasks: SAMPLES,
  tools: {
    explore: {
      label: 'web_search · 检索',
      run(task, input) {
        const g = task.sim?.goldObservations || {};
        const goldUrl = (task.groundTruth?.urls || [])[0] || 'https://example.org/source';
        return {
          observed: {
            query: input?.query || 'query',
            results: [
              { url: goldUrl, snippet: '权威来源：' + Object.entries(g).map(([k, v]) => `${k}=${v}`).join('; ') },
              { url: 'https://blog.example.org/notes', snippet: '非权威博客，存在与权威来源矛盾的表述。' },
            ],
          },
          text: `检索返回 2 条结果；权威来源片段：${Object.values(g)[0] || '见结果'}。`,
        };
      },
    },
    act: {
      label: 'fetch_page · 抓取页面',
      run(task, input) {
        const url = String(input?.url || '');
        const goldUrls = task.groundTruth?.urls || [];
        const isGold = goldUrls.some(u => url.includes(norm(u).slice(8, 24)) || url === u);
        return {
          observed: { url, authoritative: isGold, content_match: isGold ? Object.values(task.sim?.goldObservations || {})[0] || 'gold' : null },
          text: isGold ? `页面为权威来源，内容与 gold 一致。` : `页面非权威来源：${url}`,
        };
      },
    },
    verify: {
      label: 'cross_check · 交叉验证',
      run(task, input) {
        const g = task.sim?.goldObservations || {};
        return { observed: { cross_check: '一致', ...g }, text: '交叉验证与权威来源一致：' + Object.entries(g).map(([k, v]) => `${k}=${v}`).join('; ') };
      },
    },
  },
  loadFile(file) {
    const items = readJsonOrJsonl(file);
    let n = 0;
    for (const x of items) {
      const q = x?.question || x?.task || x?.prompt;
      if (!q) continue;
      this.tasks.push({
        id: String(x.id || `browse-${path.basename(file)}-${this.tasks.length + 1}`),
        title: String(q).slice(0, 60),
        prompt: String(q),
        context: null,
        groundTruth: {
          answer: x.answer || x.gold_answer || x.final_answer || null,
          urls: x.urls || x.sources || (x.url ? [x.url] : []),
        },
        sim: null,
        meta: { source: path.basename(file) },
      });
      n++;
    }
    return n;
  },
};

export const browseCompPlus = ds;
