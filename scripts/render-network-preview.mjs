// 在 Node 沙箱中执行真实的 agentFlow()，导出 SVG 并做几何断言：
//   1) 每条边的终点必须落在目标节点矩形边框之外（箭头不再被节点盖住）
//   2) 生成 cairosvg 可渲染的独立 SVG（显式多边形箭头，样式内联）
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('src/main.js', 'utf8')
  .replace(/^import .*$/gm, ''); // 去掉 vite/api 导入，沙箱内打桩

function magic() {
  const f = function () {};
  return new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : (k === 'then' ? undefined : magic())),
    set: () => true,
    apply: () => magic(),
  });
}
const noop = () => {};
const sandbox = {
  console, setTimeout, clearTimeout,
  setInterval: noop, clearInterval: noop,
  fetch: async () => ({ ok: true, json: async () => ({}), text: async () => '' }),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  navigator: { clipboard: { writeText: async () => {} } },
  document: magic(), window: magic(), location: { search: '' },
  probeBackend: async () => ({}), api: magic(),
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.__out={agentFlow,DATA};', sandbox, { filename: 'main.js' });

const { agentFlow, DATA } = sandbox.__out;
const key = Object.keys(DATA).find(k => {
  const a = DATA[k].agents || [];
  return a.includes('Research') && a.includes('Test') && a.includes('Coder');
}) || Object.keys(DATA)[0];
console.log('渲染数据集:', key, 'agents:', DATA[key].agents.join(','));

const html = agentFlow(DATA[key]);
const svgMatch = html.match(/<svg class="agent-network" viewBox="0 0 (\d+) (\d+)"[\s\S]*?<\/svg>/);
if (!svgMatch) throw new Error('未找到 agent-network SVG');
const W = +svgMatch[1], H = +svgMatch[2];
const svgBody = svgMatch[0].slice(svgMatch[0].indexOf('>') + 1, -6); // 去掉外层 svg 标签

// ---- 提取节点（中心坐标 = translate + 半宽/半高）----
const boxW = 126, boxH = 46, GAP = 2.5;
const nodes = [...svgBody.matchAll(/<g class="network-node[^"]*"[^>]*transform="translate\(([\d.]+),([\d.]+)\)"><rect width="126" height="46"[\s\S]*?<text class="node-name"[^>]*>([^<]+)<\/text>/g)]
  .map(m => ({ cx: +m[1] + boxW / 2, cy: +m[2] + boxH / 2, name: m[3] }));
const nodeByName = new Map(nodes.map(n => [n.name, n]));
console.log('节点数:', nodes.length);

// ---- 提取边 ----
const edges = [...svgBody.matchAll(/<g class="network-edge[^"]*"[^>]*aria-label="([^"]+)：[^"]*"[^>]*><path class="edge-hit" d="M([\d.-]+),([\d.-]+) Q([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)"\/><path class="edge-line"[^>]*><text class="edge-label" x="([\d.-]+)" y="([\d.-]+)">([^<]*)<\/text>/g)]
  .map(m => ({
    from: m[1], sx: +m[2], sy: +m[3], cx: +m[4], cy: +m[5], ex: +m[6], ey: +m[7],
    lx: +m[8], ly: +m[9], label: m[10],
  }));
console.log('边数:', edges.length);

// ---- 几何断言：终点在目标节点矩形之外（留 GAP 间隙），起点同理 ----
let bad = 0;
for (const e of edges) {
  const [srcName, dstName] = e.from.split(' → ');
  const a = nodeByName.get(srcName), b = nodeByName.get(dstName);
  const outside = (p, c) => Math.abs(p.x - c.cx) >= boxW / 2 - 0.6 || Math.abs(p.y - c.cy) >= boxH / 2 - 0.6;
  const strictlyInside = (p, c) => Math.abs(p.x - c.cx) < boxW / 2 && Math.abs(p.y - c.cy) < boxH / 2;
  for (const [p, c, tag] of [[{ x: e.ex, y: e.ey }, b, '终点'], [{ x: e.sx, y: e.sy }, a, '起点']]) {
    if (!c) { console.log(`⚠ ${e.from} ${tag}: 找不到节点`); bad++; continue; }
    if (strictlyInside(p, c)) { console.log(`✗ ${e.from} ${tag} (${p.x.toFixed(1)},${p.y.toFixed(1)}) 落在节点框内`); bad++; }
    else if (!outside(p, c)) { console.log(`✗ ${e.from} ${tag} 未贴到边框`); bad++; }
  }
}
console.log(bad ? `几何断言失败 ${bad} 处` : '几何断言通过：所有边起止点都在节点边框之外');

// ---- 车道分离断言：同一节点对的边（含反向）在全程采样点上两两间距 ≥ 8 ----
const q = (e, t) => {
  const u = 1 - t;
  return [u * u * e.sx + 2 * u * t * e.cx + t * t * e.ex, u * u * e.sy + 2 * u * t * e.cy + t * t * e.ey];
};
let laneBad = 0;
for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
  const A = edges[i], B = edges[j];
  if (new Set([...A.from.split(' → '), ...B.from.split(' → ')]).size !== 2) continue;
  const min = Math.min(...[0.1, 0.25, 0.5, 0.75, 0.9].map(t => Math.hypot(q(A, t)[0] - q(B, t)[0], q(A, t)[1] - q(B, t)[1])));
  if (min < 8) { console.log(`✗ ${A.from} 与 ${B.from} 最小间距 ${min.toFixed(1)} < 8`); laneBad++; }
}
console.log(laneBad ? `车道断言失败 ${laneBad} 处` : '车道断言通过：同一节点对的边全程间距 ≥ 8');

// ---- 生成 cairosvg 独立 SVG（深色 trace-focus 主题，箭头=显式多边形）----
const arrow = (e) => {
  let tx = e.ex - e.cx, ty = e.ey - e.cy; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  const px = -ty, py = tx; // 法向
  const tipX = e.ex + tx * 1.1, tipY = e.ey + ty * 1.1;          // refX=9, markerWidth=11 → 尖端超出端点 1.1
  const bx = tipX - tx * 11, by = tipY - ty * 11;                // 底边中心（距尖端 11 单位）
  return `<polygon points="${tipX},${tipY} ${bx + px * 4.4},${by + py * 4.4} ${bx - px * 4.4},${by - py * 4.4}" fill="#57bed3"/>`;
};
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const edgeSvg = edges.map(e =>
  `<path d="M${e.sx},${e.sy} Q${e.cx},${e.cy} ${e.ex},${e.ey}" fill="none" stroke="#57bed3" stroke-width="1.3"/>${arrow(e)}` +
  `<text x="${e.lx}" y="${e.ly}" fill="#b8c9db" font-family="DejaVu Sans Mono" font-size="9" text-anchor="middle">${esc(e.label)}</text>`
).join('');
const nodeSvg = nodes.map(n =>
  `<g transform="translate(${n.cx - boxW / 2},${n.cy - boxH / 2})"><rect width="${boxW}" height="${boxH}" rx="4" fill="#172c44" stroke="#56718f" stroke-width="2"/>` +
  `<text x="${boxW / 2}" y="20" fill="#e5f1fc" font-family="DejaVu Sans" font-size="13" font-weight="600" text-anchor="middle">${esc(n.name)}</text>` +
  `<text x="${boxW / 2}" y="35" fill="#7f95ad" font-family="DejaVu Sans Mono" font-size="10" text-anchor="middle">${(DATA[key].events.filter(ev => ev.agent === n.name).length)} events</text></g>`
).join('');
fs.writeFileSync('scripts/network-preview.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}"><rect width="${W}" height="${H}" fill="#0b1727"/>${edgeSvg}${nodeSvg}</svg>`);
console.log('已写入 scripts/network-preview.svg');
