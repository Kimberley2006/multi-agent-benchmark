// 沙箱校验：Agent 信息交互卡片编号 与 本次任务产生的信息编号 是否对齐
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('src/main.js', 'utf8').replace(/^import .*$/gm, '');
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
vm.runInContext(src + '\n;globalThis.__out={agentCommunicationView,taskInformationView,DATA};', sandbox, { filename: 'main.js' });
const { agentCommunicationView, taskInformationView, DATA } = sandbox.__out;

const key = Object.keys(DATA).find(k => (DATA[k].agents || []).includes('Research') && DATA[k].agents.includes('Coder'));
const trace = DATA[key];
const comm = agentCommunicationView(trace, null);
const task = taskInformationView(trace);
const label = html => [...html.matchAll(/<small>([^<]+) · [\d:.]+<\/small>/g)].map(m => m[1]);
const commLabels = label(comm), taskLabels = label(task);
console.log('数据集:', key);
console.log('\n信息交互卡片编号:'); commLabels.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
console.log('\n任务信息条目编号:'); taskLabels.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
const cross = commLabels.filter(t => /^(Claim|信息) \d/.test(t)).length;
console.log(`\n对齐情况: ${cross}/${commLabels.length} 张消息卡片使用了 Claim/信息 编号`);
