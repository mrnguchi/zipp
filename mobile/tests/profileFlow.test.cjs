const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const source = fs.readFileSync(path.join(__dirname, '../src/screens/profile/profileData.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { profileSections, faqItems, validateProfile, validatePassword, validateSupport } = exportsObject;

test('profile contains Account and Support with the requested order and real destinations', () => {
  assert.deepEqual(Array.from(profileSections, section => section.title), ['Account', 'Support']);
  assert.deepEqual(Array.from(profileSections[0].rows, row => row.label), ['Manage Profile', 'Password & Security', 'Notifications', 'Language', 'Refer & earn']);
  assert.deepEqual(Array.from(profileSections[1].rows, row => row.label), ['FAQ', 'Contact Support', 'About Us']);
  const navigator = fs.readFileSync(path.join(__dirname, '../src/navigation/RootNavigator.tsx'), 'utf8');
  const details = fs.readFileSync(path.join(__dirname, '../src/screens/profile/ProfileDetailScreen.tsx'), 'utf8');
  for (const section of profileSections) for (const row of section.rows) {
    assert.ok(navigator.includes(`'${row.screen}'`), `${row.label} has a stack destination`);
    if (row.screen !== 'AboutUs' && row.screen !== 'ReferAndEarn') assert.ok(details.includes(`case '${row.screen}'`));
  }
  assert.equal(new Set(faqItems.map(item => item.id)).size, faqItems.length);
  for (const item of faqItems) assert.ok(item.answer.length > 30);
});
test('profile edits accept valid details and reject missing names, malformed email and phone', () => {
  assert.equal(validateProfile('Suh', 'suh@example.com', '+237600000000'), '');
  assert.equal(validateProfile('Suh', '', '600000000'), '');
  assert.ok(validateProfile('', '', '600000000'));
  assert.ok(validateProfile('Suh', 'invalid', '600000000'));
  assert.ok(validateProfile('Suh', '', 'abc123'));
});
test('password change requires current password, length, a changed value, and matching confirmation', () => {
  assert.equal(validatePassword('old-password', 'new-password', 'new-password'), '');
  assert.ok(validatePassword('', 'new-password', 'new-password'));
  assert.ok(validatePassword('old-password', 'short', 'short'));
  assert.ok(validatePassword('old-password', 'old-password', 'old-password'));
  assert.ok(validatePassword('old-password', 'new-password', 'different-password'));
});
test('support review requires a topic, reply address and useful message', () => {
  assert.equal(validateSupport('Ride', 'suh@example.com', 'Please help with my pickup.'), '');
  assert.ok(validateSupport('', 'suh@example.com', 'Please help with my pickup.'));
  assert.ok(validateSupport('Ride', 'invalid', 'Please help with my pickup.'));
  assert.ok(validateSupport('Ride', 'suh@example.com', 'Help'));
});
