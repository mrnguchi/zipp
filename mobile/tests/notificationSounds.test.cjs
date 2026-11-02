const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/services/notificationSounds.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject });
const { defaultNotificationSounds, resolveNotificationSound, notificationEvents, soundOptions } = exportsObject;
test('each notification chooses its own tone without changing another event, with silent and legacy defaults', () => {
  const sounds = { ...defaultNotificationSounds, arrived: 'silent', payment_received: 'pulse', wallet_deposit: 'chime' };
  assert.equal(resolveNotificationSound(sounds, 'arrived', 'ride'), 'silent');
  assert.equal(resolveNotificationSound(sounds, 'started', 'ride'), 'chime');
  assert.equal(resolveNotificationSound(sounds, 'payment_received', 'wallet'), 'pulse');
  assert.equal(resolveNotificationSound(sounds, 'wallet_deposit', 'wallet'), 'chime');
  assert.equal(resolveNotificationSound(sounds, undefined, 'info'), 'chime');
  for (const event of notificationEvents) assert.ok(soundOptions.some(sound => sound.id === defaultNotificationSounds[event.key]));
});
test('bundled preview tones are valid short mono WAV files containing audio', () => {
  for (const name of ['chime', 'bell', 'pulse']) {
    const data = fs.readFileSync(path.join(__dirname, `../assets/sounds/${name}.wav`));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF'); assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(22), 1); assert.equal(data.readUInt16LE(34), 16);
    assert.ok(data.length > 1000 && data.length < 44144);
    assert.ok(data.subarray(44).some(value => value !== 0));
  }
});
