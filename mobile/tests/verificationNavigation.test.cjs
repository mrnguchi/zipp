const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the screen's real verification callback with navigation/profile spies.
const source = ts.createSourceFile('PhoneVerificationScreen.tsx', fs.readFileSync(path.join(__dirname, '../src/screens/PhoneVerificationScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'verifyCode') callback = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
function verify(purpose, code = '123456') {
  const calls = [];
  const context = { purpose, code, phone: '+237600000000', profile: null, route: {params: {name: 'Test'}}, Keyboard: {dismiss() {}}, Alert: {alert() {}}, t: key => key, setError() {}, setProfile() {}, navigation: {
    replace: name => calls.push(name),
    reset: state => calls.push(...state.routes.map(route => route.name)),
    navigate: name => calls.push(name),
  }};
  vm.runInNewContext(`(${callback})()`, context);
  return calls;
}
test('signup selects a role, login resets straight to Home, invalid codes cannot advance', () => {
  assert.deepEqual(verify('signup'), ['SelectRole']);
  assert.deepEqual(verify('login'), ['RoleHome']);
  assert.deepEqual(verify('login', '123'), []);
  assert.deepEqual(verify('signup', '123'), []);
});
