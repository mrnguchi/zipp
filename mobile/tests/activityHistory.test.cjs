const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/activityHistory.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { upsertActivity, filterActivities, groupActivities, rideActivity, deliveryActivity, sampleActivities } = exportsForTest;
const ride = () => ({ id: 'ride1', phase: 'arriving', fare: 1500, paid: false, pin: '4826', pinVerified: false });
const meta = { pickup: 'Molyko, Buea', destination: 'Mile 17, Buea', title: 'Everyday ride', detail: 'Toyota Yaris' };
test('updates a booking in place without duplicating it or changing its booking date', () => {
  const active = upsertActivity([], rideActivity(ride(), meta), 1000);
  const paid = upsertActivity(active, rideActivity({ ...ride(), phase: 'completed', paid: true }, meta), 5000);
  assert.equal(paid.length, 1); assert.equal(paid[0].createdAt, 1000); assert.equal(paid[0].updatedAt, 5000);
  assert.equal(paid[0].payment, 'paid'); assert.equal(paid[0].charged, 1500); assert.equal(paid[0].status, 'completed');
  assert.equal('pin' in paid[0], false);
});
test('cancellation amounts distinguish ride fees from released delivery funds', () => {
  const canceledRide = rideActivity({ ...ride(), phase: 'canceled' }, meta);
  assert.equal(canceledRide.charged, 375); assert.equal(canceledRide.payment, 'paid');
  const delivery = deliveryActivity({ id: 'd1', phase: 'canceled', fare: 2250, paid: false, perspective: 'receiving' }, { mode: 'express', pickup: { label: 'Soppo' }, dropoff: { label: 'Molyko' }, description: 'Documents', size: 'small', recipientName: 'Nguchi' });
  assert.equal(delivery.charged, 0); assert.equal(delivery.payment, 'released'); assert.equal(delivery.perspective, 'receiving');
  const unpaid = rideActivity({ ...ride(), phase: 'completed' }, meta);
  assert.equal(unpaid.payment, 'pending'); assert.equal(unpaid.charged, 0);
});
test('search combines type and status filters with case-insensitive route matching', () => {
  const records = sampleActivities(Date.UTC(2026, 10, 3, 12));
  assert.equal(filterActivities(records, 'delivery', 'completed', 'MOLYKO').length, 1);
  assert.equal(filterActivities(records, 'ride', 'canceled', '').length, 1);
  assert.equal(filterActivities(records, 'delivery', 'canceled', '').length, 0);
  assert.equal(filterActivities(records, 'all', 'all', 'not-a-place').length, 0);
});
test('groups dates in Cameroon time and places active bookings first', () => {
  const now = Date.UTC(2026, 10, 3, 0, 30);
  const sample = sampleActivities(now)[0];
  const records = [
    { ...sample, id: 'local-today', createdAt: Date.UTC(2026, 10, 2, 23, 10) },
    { ...sample, id: 'yesterday', createdAt: Date.UTC(2026, 10, 2, 22, 30) },
    { ...sample, id: 'active', status: 'active', createdAt: now - 172800000 },
  ];
  const groups = groupActivities(records, now);
  assert.equal(groups[0].title, 'In progress');
  assert.equal(groups[1].title, 'Today'); assert.equal(groups[1].data[0].id, 'local-today');
  assert.equal(groups[2].title, 'Yesterday');
});
