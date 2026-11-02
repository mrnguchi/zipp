const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
test('payment stays processing for three seconds, then debits once and opens the receipt', () => {
  let state = null, ref, effectIndex = 0, callback, now = 0, timerId = 0, charges = 0;
  const effects = [], pending = [], timers = new Map(), notices = [];
  const react = {
    useState: initial => [state ?? initial, value => { state = value; }],
    useRef: initial => ref ?? (ref = { current: initial }),
    useCallback: fn => callback ?? (callback = fn),
    useEffect: (fn, deps) => {
      const index = effectIndex++, previous = effects[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pending.push(() => { previous?.cleanup?.(); effects[index] = { deps, cleanup: fn() }; });
    },
  };
  function compile(file, require) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require, __DEV__: true, setTimeout: (fn, delay) => { timers.set(++timerId, { fn, due: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id) });
    return exports;
  }
  const events = compile('services/rideEvents.ts');
  const { useRideLifecycle } = compile('hooks/useRideLifecycle.ts', name => {
    if (name === 'react') return react;
    if (name.includes('NotificationContext')) return { useNotifications: () => ({ notify: notice => notices.push(notice) }) };
    if (name.includes('WalletContext')) return { useWallet: () => ({ reserve: () => true, settle: () => { charges++; return true; } }) };
    if (name.includes('formatCurrency')) return { formatXaf: value => `${value} XAF` };
    return events;
  });
  const render = () => { effectIndex = 0; const result = useRideLifecycle(); while (pending.length) pending.shift()(); return result; };
  let lifecycle = render();
  for (const event of [
    { type: 'confirmed', rideId: 'trip', pin: '4826', fare: 1500 },
    { type: 'arrived', rideId: 'trip' }, { type: 'pin_verified', rideId: 'trip' },
    { type: 'started', rideId: 'trip' }, { type: 'completed', rideId: 'trip', fare: 1500 },
  ]) lifecycle.applyEvent(event);
  lifecycle = render();
  assert.equal(lifecycle.session.phase, 'processing_payment'); assert.equal(charges, 0);
  now = 2999;
  assert.equal([...timers.values()].filter(timer => timer.due <= now).length, 0);
  now = 3000;
  for (const [id, timer] of timers) if (timer.due <= now) { timers.delete(id); timer.fn(); }
  lifecycle = render();
  assert.equal(lifecycle.session.phase, 'completed'); assert.equal(lifecycle.session.paid, true); assert.equal(charges, 1);
  assert.equal(lifecycle.applyEvent({ type: 'payment_received', rideId: 'trip' }), false);
  assert.equal(charges, 1); assert.equal(notices.at(-1).title, 'Your receipt is ready');
  effects.forEach(effect => effect.cleanup?.());
});
