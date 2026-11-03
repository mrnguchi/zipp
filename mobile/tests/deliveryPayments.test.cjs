const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
test('delivery reserves funds, releases canceled holds and charges only after handover plus processing', () => {
  let state = null, ref, callback, effectIndex = 0, now = 0, timerId = 0;
  const timers = new Map(), effects = [], pending = [], notices = [];
  function compile(file, require) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require, __DEV__: true, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, due: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id) }); return exports; }
  const ledger = compile('services/walletLedger.ts');
  let wallet = { balance: 5000, holds: {}, settled: {}, deposits: [] };
  const transact = (type, id, amount) => { const next = ledger.updateWallet(wallet, { type, id, amount }); if (next === wallet) return false; wallet = next; return true; };
  const react = { useState: initial => [state ?? initial, value => { state = value; }], useRef: initial => ref ?? (ref = { current: initial }), useCallback: fn => callback ?? (callback = fn), useEffect: (fn, deps) => { const index = effectIndex++, old = effects[index]; if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; }); } };
  const flow = compile('services/deliveryFlow.ts');
  const { useDeliveryLifecycle } = compile('hooks/useDeliveryLifecycle.ts', name => name === 'react' ? react : name.includes('ActivityContext') ? { useActivity: () => ({ upsert: () => {} }) } : name.includes('WalletContext') ? { useWallet: () => ({ reserve: (id, amount) => transact('reserve', id, amount), settle: (id, amount) => transact('settle', id, amount) }) } : name.includes('NotificationContext') ? { useNotifications: () => ({ notify: notice => notices.push(notice) }) } : name.includes('formatCurrency') ? { formatXaf: amount => `${amount} XAF` } : flow);
  const render = () => { effectIndex = 0; const result = useDeliveryLifecycle(); while (pending.length) pending.shift()(); return result; };
  let lifecycle = render();
  assert.equal(lifecycle.applyEvent({ type: 'requested', deliveryId: 'too-much', fare: 5001, pin: '7352' }), false);
  assert.equal(wallet.balance, 5000);
  assert.equal(lifecycle.applyEvent({ type: 'requested', deliveryId: 'cancel-me', fare: 1500, pin: '7352' }), true);
  assert.equal(ledger.availableBalance(wallet), 3500);
  lifecycle.applyEvent({ type: 'canceled', deliveryId: 'cancel-me' });
  assert.equal(ledger.availableBalance(wallet), 5000); assert.equal(wallet.balance, 5000);
  lifecycle.applyEvent({ type: 'requested', deliveryId: 'deliver-me', fare: 1500, pin: '7352' });
  for (const type of ['courier_arrived', 'collected', 'destination_arrived']) lifecycle.applyEvent({ type, deliveryId: 'deliver-me' });
  assert.equal(wallet.balance, 5000);
  assert.equal(lifecycle.applyEvent({ type: 'canceled', deliveryId: 'deliver-me' }), false);
  lifecycle.applyEvent({ type: 'handover_verified', deliveryId: 'deliver-me' });
  lifecycle = render(); assert.equal(lifecycle.session.phase, 'processing_payment');
  now = 2999; assert.equal([...timers.values()].filter(timer => timer.due <= now).length, 0);
  now = 3000; for (const [id, timer] of timers) if (timer.due <= now) { timers.delete(id); timer.fn(); }
  lifecycle = render(); assert.equal(lifecycle.session.phase, 'delivered'); assert.equal(lifecycle.session.paid, true);
  assert.equal(wallet.balance, 3500); assert.equal(ledger.availableBalance(wallet), 3500);
  assert.equal(lifecycle.applyEvent({ type: 'payment_received', deliveryId: 'deliver-me' }), false); assert.equal(wallet.balance, 3500);
  assert.equal(notices.at(-1).title, 'Delivery complete');
  effects.forEach(effect => effect.cleanup?.());
});
