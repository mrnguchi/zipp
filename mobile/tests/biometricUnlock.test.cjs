const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness({ enrolled = true, platform = 'android', face = false, expoGo = false } = {}) {
  const hooks = [], listeners = new Set();
  let cursor = 0, effects = [], result = { success: true }, authCalls = 0, tree;
  const changed = (previous, next) => !previous || next.some((item, index) => item !== previous[index]);
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState(initial) { const index = cursor++; hooks[index] ??= { value: initial }; return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; hooks[index] ??= { current: initial }; return hooks[index]; },
    useCallback(callback, deps) { const index = cursor++; if (changed(hooks[index]?.deps, deps)) hooks[index] = { value: callback, deps }; return hooks[index].value; },
    useEffect(callback, deps) { const index = cursor++; if (changed(hooks[index]?.deps, deps)) { const old = hooks[index]; effects.push(() => { old?.cleanup?.(); hooks[index] = { deps, cleanup: callback() }; }); } },
  };
  const auth = {
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 }, SecurityLevel: { BIOMETRIC_STRONG: 3 },
    hasHardwareAsync: async () => true, isEnrolledAsync: async () => enrolled,
    supportedAuthenticationTypesAsync: async () => [face ? 2 : 1], getEnrolledLevelAsync: async () => 3,
    authenticateAsync: async () => { authCalls++; return result; },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/contexts/BiometricContext.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'react-native') return { AppState: { addEventListener: (_, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } }, Platform: { OS: platform }, StyleSheet: { create: value => value }, Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable' };
    if (name === 'expo-local-authentication') return auth;
    if (name === 'expo-constants') return { __esModule: true, default: { executionEnvironment: expoGo ? 'storeClient' : 'bare' } };
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === '../components/ActionButton') return { ActionButton: 'ActionButton' };
    throw Error(name);
  }});
  function render() { cursor = 0; effects = []; tree = exports.BiometricProvider({ children: null }); effects.forEach(effect => effect()); return tree.props.value; }
  return { render, get value() { return tree.props.value; }, get locked() { return tree.props.children[1].props.visible; }, setResult(next) { result = next; }, background() { [...listeners].forEach(listener => listener('background')); }, get authCalls() { return authCalls; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('biometric enrollment, unlock and disabling require successful device verification', async () => {
  const app = harness(); app.render(); await flush(); app.render();
  assert.equal(app.value.available, true);
  app.setResult({ success: false, error: 'user_cancel' }); await app.value.setEnabled(true); app.render();
  assert.equal(app.value.enabled, false);
  app.setResult({ success: true }); await app.value.setEnabled(true); app.render();
  assert.equal(app.value.enabled, true);
  app.background(); app.render(); assert.equal(app.locked, true);
  app.setResult({ success: false, error: 'authentication_failed' }); await app.value.test(); app.render(); assert.equal(app.locked, true);
  app.setResult({ success: true }); await app.value.test(); app.render(); assert.equal(app.locked, false);
  app.setResult({ success: false, error: 'user_cancel' }); await app.value.setEnabled(false); app.render(); assert.equal(app.value.enabled, true);
  app.setResult({ success: true }); await app.value.setEnabled(false); app.render(); assert.equal(app.value.enabled, false);
});
test('unenrolled devices cannot enable unlock and Face ID in Expo Go explains the development-build requirement', async () => {
  const unenrolled = harness({ enrolled: false }); unenrolled.render(); await flush(); unenrolled.render();
  assert.equal(unenrolled.value.available, false); await unenrolled.value.setEnabled(true); assert.equal(unenrolled.authCalls, 0);
  const expo = harness({ platform: 'ios', face: true, expoGo: true }); expo.render(); await flush(); expo.render();
  assert.equal(expo.value.available, false); assert.match(expo.value.reason, /development build/);
});
