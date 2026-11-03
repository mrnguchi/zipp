const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/deliveryFlow.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsForTest });
const { validateDelivery, validDeliveryPhone, deliveryFare, transitionDelivery, createDeliveryDraft, switchDeliveryPerspective, deliveryProgressNotice } = exportsForTest;
const draft = () => ({ perspective: 'sending', pickup: { label: 'Buea', coordinate: { latitude: 4.155, longitude: 9.24 } }, dropoff: { label: 'Mile 17', coordinate: { latitude: 4.1502, longitude: 9.3001 } }, mode: 'standard', senderName: 'Nguchi', senderPhone: '+237 612 345 678', recipientName: 'Alex', recipientPhone: '612345678', description: 'Documents', size: 'small' });
test('delivery validates real stops, contacts and package description before confirmation', () => {
  assert.equal(validateDelivery(draft(), 2), undefined);
  assert.ok(validateDelivery({ ...draft(), dropoff: undefined }, 0));
  assert.ok(validateDelivery({ ...draft(), dropoff: draft().pickup }, 0));
  assert.ok(validateDelivery({ ...draft(), recipientPhone: '123' }, 1));
  assert.ok(validateDelivery({ ...draft(), description: '   ' }, 2));
  assert.ok(validateDelivery({ ...draft(), pickup: { label: 'Bad', coordinate: { latitude: NaN, longitude: 9 } } }, 0));
  assert.equal(validDeliveryPhone('+237 612 345 678'), true);
  assert.equal(validDeliveryPhone('call me'), false);
});
test('express uses the 1.5 delivery multiplier with whole-XAF quotes', () => {
  const standard = deliveryFare(3400, 'standard');
  assert.equal(deliveryFare(3400, 'express'), Math.round(standard * 1.5));
  assert.ok(Number.isSafeInteger(standard));
});
test('recipient PIN handover must precede payment and rating', () => {
  let current = transitionDelivery(null, { type: 'requested', deliveryId: 'd1', fare: 1500, pin: '7352' });
  assert.equal(current.phase, 'courier_arriving');
  assert.equal(transitionDelivery(current, { type: 'handover_verified', deliveryId: 'd1' }), current);
  assert.equal(transitionDelivery(current, { type: 'payment_received', deliveryId: 'd1' }), current);
  for (const [type, phase] of [['courier_arrived', 'at_pickup'], ['collected', 'in_transit'], ['destination_arrived', 'at_dropoff'], ['handover_verified', 'processing_payment']]) {
    current = transitionDelivery(current, { type, deliveryId: 'd1' }); assert.equal(current.phase, phase);
  }
  assert.equal(current.pin, '');
  const paid = transitionDelivery(current, { type: 'payment_received', deliveryId: 'd1' });
  assert.equal(paid.phase, 'delivered'); assert.equal(paid.paid, true);
  const rated = transitionDelivery(paid, { type: 'rated', deliveryId: 'd1', rating: 5, feedback: ' Fast ' });
  assert.equal(rated.phase, 'rated'); assert.equal(rated.feedback, 'Fast');
  assert.equal(transitionDelivery(paid, { type: 'payment_received', deliveryId: 'd1' }), paid);
});
test('cancellation is allowed before collection and blocked after collection', () => {
  const requested = transitionDelivery(null, { type: 'requested', deliveryId: 'd1', fare: 1500, pin: '7352' });
  assert.equal(transitionDelivery(requested, { type: 'canceled', deliveryId: 'd1' }).phase, 'canceled');
  const pickup = transitionDelivery(requested, { type: 'courier_arrived', deliveryId: 'd1' });
  assert.equal(transitionDelivery(pickup, { type: 'canceled', deliveryId: 'd1' }).phase, 'canceled');
  const collected = transitionDelivery(pickup, { type: 'collected', deliveryId: 'd1' });
  assert.equal(transitionDelivery(collected, { type: 'canceled', deliveryId: 'd1' }), collected);
  assert.equal(transitionDelivery(collected, { type: 'destination_arrived', deliveryId: 'wrong' }), collected);
});
test('failed payment stays unpaid and cannot be rated until settlement succeeds', () => {
  let state = transitionDelivery(null, { type: 'requested', deliveryId: 'd1', fare: 1500, pin: '7352' });
  for (const type of ['courier_arrived', 'collected', 'destination_arrived', 'handover_verified', 'payment_failed']) state = transitionDelivery(state, { type, deliveryId: 'd1' });
  assert.equal(state.phase, 'delivered'); assert.equal(state.paid, false);
  assert.equal(transitionDelivery(state, { type: 'rated', deliveryId: 'd1', rating: 5, feedback: '' }), state);
  assert.equal(transitionDelivery(state, { type: 'payment_received', deliveryId: 'd1' }).paid, true);
});
test('receiving is the default and the booker is prefilled as recipient', () => {
  const state = createDeliveryDraft('Nguchi', '+237612345678');
  assert.equal(state.perspective, 'receiving');
  assert.equal(state.recipientName, 'Nguchi'); assert.equal(state.recipientPhone, '+237612345678');
  assert.equal(state.senderName, ''); assert.equal(state.senderPhone, '');
});
test('switching roles swaps the contacts and stops while retaining package details', () => {
  const sender = draft();
  const receiver = switchDeliveryPerspective(sender, 'receiving');
  assert.equal(receiver.recipientName, 'Nguchi'); assert.equal(receiver.senderName, 'Alex');
  assert.equal(receiver.dropoff.coordinate, sender.pickup.coordinate); assert.equal(receiver.pickup.coordinate, sender.dropoff.coordinate);
  assert.equal(receiver.description, sender.description);
  const restored = switchDeliveryPerspective(receiver, 'sending');
  assert.equal(restored.senderName, sender.senderName); assert.equal(restored.senderPhone, sender.senderPhone);
  assert.equal(restored.pickup, sender.pickup); assert.equal(restored.dropoff, sender.dropoff);
  assert.equal(switchDeliveryPerspective(sender, 'sending'), sender);
});
test('switching GPS endpoints keeps them identifiable for reverse address lookup', () => {
  const state = { ...draft(), pickup: { ...draft().pickup, label: 'Pickup · 4.1550, 9.2400' } };
  const switched = switchDeliveryPerspective(state, 'receiving');
  assert.match(switched.dropoff.label, /^Drop-off ·/);
  assert.match(switchDeliveryPerspective(switched, 'sending').pickup.label, /^Pickup ·/);
});
test('receivers get pickup-at-sender notices and their own arrival/PIN instructions', () => {
  assert.equal(deliveryProgressNotice('courier_arrived', 'receiving')[0], 'Courier at pickup');
  assert.match(deliveryProgressNotice('collected', 'receiving')[1], /to you/);
  assert.match(deliveryProgressNotice('destination_arrived', 'receiving')[1], /your handover PIN/);
  assert.equal(deliveryProgressNotice('courier_arrived', 'sending')[0], 'Your courier is here');
  assert.match(deliveryProgressNotice('destination_arrived', 'sending')[1], /Your recipient/);
});
test('confirmed delivery retains the selected role and still requires recipient handover', () => {
  for (const perspective of ['receiving', 'sending']) {
    const session = transitionDelivery(null, { type: 'requested', deliveryId: perspective, fare: 1500, pin: '7352', perspective });
    assert.equal(session.perspective, perspective);
    assert.equal(transitionDelivery(session, { type: 'handover_verified', deliveryId: perspective }), session);
  }
});
