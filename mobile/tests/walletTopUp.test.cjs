const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(dev = true) {
  const slots = [], effects = [], queued = [], timers = new Map(), deposits = new Set();
  let index = 0, effectIndex = 0, timerId = 0, now = 0, closed = 0;
  const handle = { current: null };
  const react = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useImperativeHandle(ref, create) { ref.current = create(); },
    useEffect(fn, deps) { const slot = effectIndex++, previous = effects[slot]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) queued.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: fn() }; }); },
  };
  const jsx = (type, props) => ({ type, props });
  const simulateDeposit = id => { if (deposits.has(id)) return false; deposits.add(id); return true; };
  const notify = () => {};
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/components/WalletTopUp.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, __DEV__: dev, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, due: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id), require(name) {
    if (name === 'react') return react;
    if (name.includes('inputStyles')) return { inputStyles: { field: {}, container: {}, text: {} } };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { Animated: { Value: class { setValue() {} interpolate() {} }, View: 'AnimatedView', loop: () => ({ start() {}, stop() {} }), timing() {} }, Easing: { linear: null }, Keyboard: { dismiss() {} }, StyleSheet: { create: value => value, absoluteFill: {} }, ...Object.fromEntries(['Image', 'Modal', 'Pressable', 'ScrollView', 'TextInput', 'View'].map(key => [key, key])) };
    if (name.includes('WalletContext')) return { useWallet: () => ({ simulateDeposit }) };
    if (name.includes('ProfileContext')) return { useProfile: () => ({ profile: { phone: '612345678' } }) };
    if (name.includes('NotificationContext')) return { useNotifications: () => ({ notify }) };
    if (name.includes('colors')) return { colors: { yellow: '#FEC400' } };
    if (name.includes('ActionButton')) return { ActionButton: 'ActionButton' };
    return {};
  } });
  let tree;
  function render() { index = effectIndex = 0; tree = exports.WalletTopUp({ ref: handle, onBack() {}, onClose() { closed++; } }); while (queued.length) queued.shift()(); return tree; }
  function find(label, node = tree) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.map(child => find(label, child)).find(Boolean); if (node.props?.accessibilityLabel === label) return node; return find(label, node.props?.children ?? null); }
  function advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.due <= now) { timers.delete(id); timer.fn(); } render(); }
  render();
  return { render, find, advance, deposits, handle, get closed() { return closed; }, start() { find('Top-up amount in XAF').props.onChangeText('5000'); render(); find('Send payment request').props.onPress(); render(); } };
}

test('development top-up credits once after five seconds and shows a receipt', () => {
  const app = harness(); app.start(); app.advance(4999); assert.equal(app.deposits.size, 0);
  app.advance(1); assert.equal(app.deposits.size, 1); assert.ok(app.find('Back to wallet'));
  app.advance(10000); assert.equal(app.deposits.size, 1);
});
test('leaving processing requires confirmation and canceled requests cannot credit', () => {
  const app = harness(); app.start(); app.handle.current.requestClose(); app.render();
  assert.equal(app.closed, 0); assert.ok(app.find('Keep waiting'));
  app.find('Cancel payment').props.onPress(); app.render(); assert.equal(app.closed, 1);
  app.advance(5000); assert.equal(app.deposits.size, 0);
});
test('release builds never simulate a successful deposit', () => {
  const app = harness(false); app.start(); app.advance(60000); assert.equal(app.deposits.size, 0); assert.equal(app.find('Back to wallet'), undefined);
});

