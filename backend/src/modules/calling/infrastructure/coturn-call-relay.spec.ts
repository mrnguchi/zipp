import 'reflect-metadata';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { CallRelayConfig } from '../call-relay.config.js';
import { CoturnCallRelay, readRelayKey } from './coturn-call-relay.js';
import type { RelayGrant } from '../application/call-relay.port.js';

const files: string[] = [],
  directories: string[] = [];
const key = randomBytes(32).toString('hex');
const env = (file = resolve('unit-private-key')) => ({
  NODE_ENV: 'test',
  CALLING_ENABLED: 'true',
  AUTH_ENABLED: 'true',
  NOTIFICATIONS_ENABLED: 'true',
  CALL_RELAY_CREDENTIALS_ENABLED: 'true',
  CALL_RELAY_LAN_IP: '192.168.1.50',
  CALL_RELAY_SECRET_FILE: file,
});
afterEach(async () => {
  for (const file of files.splice(0)) await unlink(file);
  for (const dir of directories.splice(0)) await rmdir(dir);
});
async function keyFile(value: string) {
  const dir = await mkdtemp(join(tmpdir(), 'zipp-relay-unit-'));
  directories.push(dir);
  await chmod(dir, 0o700);
  const file = join(dir, 'key');
  await writeFile(file, value, { mode: 0o600, flag: 'wx' });
  files.push(file);
  return file;
}
const grant = (): RelayGrant => {
  const callId = randomUUID(),
    session = randomUUID(),
    device = randomUUID();
  return {
    callId,
    version: 2,
    epoch: 1,
    side: 'CALLER',
    scope: [
      callId,
      1,
      session,
      device,
      1,
      randomUUID(),
      randomUUID(),
      1,
      'CALLER',
    ],
    serverTime: new Date('2026-11-24T12:00:00.000Z'),
    expiresAt: new Date('2026-11-24T12:01:00.000Z'),
  };
};
// Actual key filesystem/permission assertions below are source only, UNRUN.
// Running as root cannot qualify the intended non-root production loader.
const nonRootIt =
  process.platform !== 'win32' && process.getuid?.() === 0 ? it.skip : it;
describe('relay crypto/configuration boundaries (written, unrun)', () => {
  it('defaults off, never reads keys in disabled API/worker, rejects worker credentials', async () => {
    const adapter = new CoturnCallRelay(new CallRelayConfig({}));
    await expect(adapter.onModuleInit()).resolves.toBeUndefined();
    expect(() => adapter.mint(grant())).toThrow(
      'Relay credentials unavailable',
    );
    await expect(
      new CoturnCallRelay(
        new CallRelayConfig({ SERVICE_ROLE: 'worker' }),
      ).onModuleInit(),
    ).resolves.toBeUndefined();
    expect(
      () => new CallRelayConfig({ ...env(), SERVICE_ROLE: 'worker' }),
    ).toThrow('API-only');
    expect(
      () =>
        new CallRelayConfig({
          SERVICE_ROLE: 'worker',
          CALL_RELAY_SECRET_FILE: '/private',
        }),
    ).toThrow('API-only');
  });
  it('rejects production, missing dependency, URL injection, public/wildcard/bridge listener and relative paths', () => {
    for (const change of [
      { NODE_ENV: 'production' },
      { APP_ENV: 'production' },
      { CALLING_ENABLED: 'false' },
      { AUTH_ENABLED: 'false' },
      { NOTIFICATIONS_ENABLED: 'false' },
      { CALLING_ADAPTER: 'managed' },
      { CALL_RELAY_CREDENTIALS_ENABLED: 'yes' },
      { CALL_RELAY_SECRET_FILE: './relative' },
      ...[
        '0.0.0.0',
        '127.0.0.1',
        '169.254.169.254',
        '172.30.240.2',
        '8.8.8.8',
        '::1',
        '192.168.1.50\nuser=x',
        'turn:host:3478',
      ].map((ip) => ({ CALL_RELAY_LAN_IP: ip })),
    ])
      expect(() => new CallRelayConfig({ ...env(), ...change })).toThrow();
    const cfg = new CallRelayConfig({ ...env(), AUTH_SIGNING_KEY: key });
    expect(() => cfg.assertDedicatedKey(key)).toThrow('separate');
  });
  nonRootIt(
    'matches coturn ASCII HMAC-SHA1, hides identifiers and preserves same-attempt retry credentials',
    async () => {
      const file = await keyFile(`${key}\n`);
      const cfg = new CallRelayConfig(env(file)),
        adapter = new CoturnCallRelay(cfg);
      await adapter.onModuleInit();
      const g = grant(),
        first = adapter.mint(g),
        server = first.iceServers[0];
      if (!server) throw new Error('Missing fixture server');
      expect(server.username.split(':')[0]).toBe(
        String(g.expiresAt.getTime() / 1000),
      );
      expect(server.credential).toBe(
        createHmac('sha1', key).update(server.username).digest('base64'),
      );
      expect(server.credential).not.toBe(
        createHmac('sha1', Buffer.from(key, 'hex'))
          .update(server.username)
          .digest('base64'),
      );
      expect(JSON.stringify(first)).not.toContain(g.callId);
      for (const part of g.scope.filter(
        (part) => typeof part === 'string' && part.includes('-'),
      ))
        expect(server.username).not.toContain(part);
      const retry = adapter.mint({
        ...g,
        serverTime: new Date(g.serverTime.getTime() + 5000),
      });
      expect(retry.iceServers).toEqual(first.iceServers);
      const otherLeg = adapter.mint({
        ...g,
        side: 'CALLEE',
        scope: [...g.scope.slice(0, -1), 'CALLEE'],
      });
      expect(otherLeg.iceServers[0]?.username).not.toBe(server.username);
      const otherClaim = adapter.mint({
        ...g,
        scope: [...g.scope, randomUUID()],
      });
      expect(otherClaim.iceServers[0]?.username).not.toBe(server.username);
      adapter.onModuleDestroy();
      expect(() => adapter.mint(g)).toThrow('unavailable');
    },
  );
  nonRootIt(
    'fails safely for malformed/oversized file contents and reused keys',
    async () => {
      for (const content of [
        'short',
        `${key}\nno-auth`,
        `${key}\r\n`,
        'x'.repeat(10000),
      ]) {
        const file = await keyFile(content);
        await expect(readRelayKey(file)).rejects.toThrow(
          'Private relay key is unavailable or invalid',
        );
      }
      const file = await keyFile(key);
      const adapter = new CoturnCallRelay(
        new CallRelayConfig({ ...env(file), CALL_SIGNAL_KEY: key }),
      );
      await expect(adapter.onModuleInit()).rejects.toThrow(
        'Private relay key configuration is invalid',
      );
      expect(() => adapter.mint(grant())).toThrow('unavailable');
      if (process.platform !== 'win32') {
        await chmod(file, 0o644);
        await expect(readRelayKey(file)).rejects.toThrow(
          'unavailable or invalid',
        );
      }
    },
  );
});
