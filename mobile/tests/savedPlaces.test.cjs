const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function harness(storage = new Map()) {
  const slots = [], effects = [], pending = [];
  let index = 0, effectIndex = 0, value, phone = '612345678', fail = false;
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; }]; },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = effectIndex++, previous = effects[i]; if (!previous || deps.some((item, j) => item !== previous.deps[j])) pending.push(() => { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/contexts/SavedPlacesContext.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (_, props) => { value = props.value; } };
    if (name.includes('async-storage')) return { getItem: async key => storage.get(key) ?? null, setItem: async (key, data) => { if (fail) throw Error('disk full'); storage.set(key, data); } };
    if (name.includes('ProfileContext')) return { useProfile: () => ({ profile: { phone } }) };
    throw Error(name);
  } });
  function render() { index = effectIndex = 0; exports.SavedPlacesProvider({ children: null }); while (pending.length) pending.shift()(); return value; }
  async function load() { render(); await new Promise(resolve => setImmediate(resolve)); return render(); }
  return { load, render, storage, validate: exports.validSavedPlace, setPhone: next => { phone = next; }, failWrites: () => { fail = true; } };
}
const place = (id, kind = 'other') => ({ id, kind, name: ' My place ', label: ' Molyko, Buea ', coordinate: { latitude: 4.15, longitude: 9.28 } });

test('saved places survive reload, update one Home shortcut, and remove durably', async () => {
  const app = harness(); let saved = await app.load();
  assert.equal(await saved.save(place('one', 'home')), true); saved = app.render();
  assert.equal(await saved.save(place('two', 'home')), true); saved = app.render();
  assert.equal(saved.places.length, 1); assert.equal(saved.places[0].id, 'two'); assert.equal(saved.places[0].name, 'My place');
  const restarted = harness(app.storage); let restored = await restarted.load();
  assert.equal(restored.places[0].id, 'two'); assert.equal(await restored.remove('two'), true);
  restored = await harness(app.storage).load(); assert.equal(restored.places.length, 0);
});
test('account places are isolated and failed writes leave the saved list intact', async () => {
  const app = harness(); let saved = await app.load(); await saved.save(place('private'));
  app.setPhone('699999999'); saved = await app.load(); assert.equal(saved.places.length, 0);
  app.setPhone('612345678'); saved = await app.load(); assert.equal(saved.places[0].id, 'private');
  app.failWrites(); assert.equal(await saved.remove('private'), false); saved = app.render(); assert.equal(saved.places.length, 1); assert.ok(saved.error);
});
test('invalid and unresolved coordinates cannot be stored', async () => {
  const app = harness(); const saved = await app.load();
  assert.equal(await saved.save({ ...place('bad'), coordinate: { latitude: 100, longitude: 9 } }), false);
  assert.equal(app.validate({ ...place('bad'), coordinate: undefined }), false);
  assert.equal(app.render().places.length, 0);
});
