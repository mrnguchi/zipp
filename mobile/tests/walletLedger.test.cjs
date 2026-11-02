const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/walletLedger.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { updateWallet, availableBalance } = exportsForTest;
const wallet = balance => ({ balance, holds: {}, settled: {}, deposits: [] });
test('zero or insufficient funds cannot reserve a ride; exact fare can', () => {
  for (const balance of [0, 1499]) {
    const state = wallet(balance);
    assert.equal(updateWallet(state, { type: 'reserve', id: 'ride', amount: 1500 }), state);
  }
  const reserved = updateWallet(wallet(1500), { type: 'reserve', id: 'ride', amount: 1500 });
  assert.equal(availableBalance(reserved), 0); assert.equal(reserved.balance, 1500);
  assert.equal(updateWallet(reserved, { type: 'reserve', id: 'other', amount: 1 }), reserved);
});
test('completion charges a reservation once and releases its hold', () => {
  const reserved = updateWallet(wallet(5000), { type: 'reserve', id: 'ride', amount: 1500 });
  const paid = updateWallet(reserved, { type: 'settle', id: 'ride', amount: 1500 });
  assert.equal(paid.balance, 3500); assert.equal(availableBalance(paid), 3500);
  assert.equal(Object.keys(paid.holds).length, 0);
  assert.equal(updateWallet(paid, { type: 'settle', id: 'ride', amount: 1500 }), paid);
  assert.equal(updateWallet(paid, { type: 'reserve', id: 'ride', amount: 1500 }), paid);
});
test('cancellation charges 25 percent and releases the rest', () => {
  const reserved = updateWallet(wallet(5000), { type: 'reserve', id: 'ride', amount: 1500 });
  const canceled = updateWallet(reserved, { type: 'settle', id: 'ride', amount: Math.round(1500 * 0.25) });
  assert.equal(canceled.balance, 4625); assert.equal(availableBalance(canceled), 4625);
});
test('higher final fare cannot overdraw or consume another ride’s hold', () => {
  let state = updateWallet(wallet(5000), { type: 'reserve', id: 'ride1', amount: 1500 });
  state = updateWallet(state, { type: 'reserve', id: 'ride2', amount: 3000 });
  assert.equal(updateWallet(state, { type: 'settle', id: 'ride1', amount: 2100 }), state);
  const paid = updateWallet(state, { type: 'settle', id: 'ride1', amount: 2000 });
  assert.equal(paid.balance, 3000); assert.equal(paid.holds.ride2, 3000); assert.equal(availableBalance(paid), 0);
});
test('deposits are credited once; malformed amounts and unreserved payments are rejected', () => {
  const empty = wallet(0);
  const funded = updateWallet(empty, { type: 'deposit', id: 'tx1', amount: 5000 });
  assert.equal(funded.balance, 5000);
  assert.equal(updateWallet(funded, { type: 'deposit', id: 'tx1', amount: 5000 }), funded);
  for (const amount of [-1, NaN, Infinity, 0.5]) assert.equal(updateWallet(funded, { type: 'deposit', id: 'tx2', amount }), funded);
  assert.equal(updateWallet(funded, { type: 'settle', id: 'unreserved', amount: 1000 }), funded);
});
