import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { CaptureNotificationProvider } from './capture-notification.provider.js';
import { NotificationsConfig } from '../notifications.config.js';
// Written only. Temporary metadata captures are retained; no recursive cleanup or real endpoints.
describe('local notification capture identity/privacy (written, not run)', () => {
  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'zipp-notification-capture-'));
    const config = new NotificationsConfig({
      NODE_ENV: 'test',
      SERVICE_ROLE: 'worker',
      NOTIFICATIONS_ENABLED: 'true',
      NOTIFICATION_DISPATCH_ENABLED: 'true',
      NOTIFICATION_DATA_KEY: '44'.repeat(32),
      NOTIFICATION_CAPTURE_ROOT: root,
    });
    return {
      root,
      provider: new CaptureNotificationProvider(config),
      work: {
        deliveryId: randomUUID(),
        notificationId: randomUUID(),
        deviceId: randomUUID(),
        generation: 1,
        token: 'local_' + 'a'.repeat(32),
      },
    };
  }
  it('recovers the same stable capture after a lost acknowledgement without writing secrets', async () => {
    const { root, provider, work } = await fixture(),
      signal = new AbortController().signal;
    expect(await provider.send(work, signal)).toBe('CAPTURED');
    expect(await provider.send(work, signal)).toBe('CAPTURED');
    const text = await readFile(join(root, `${work.deliveryId}.json`), 'utf8');
    expect(text).not.toContain(work.token);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null)
      throw new Error('Invalid capture object');
    expect(Object.keys(parsed)).toEqual([
      'schemaVersion',
      'deliveryId',
      'notificationId',
      'deviceId',
      'generation',
    ]);
  });
  it('refuses a mismatching existing record or unsafe identifier', async () => {
    const { root, provider, work } = await fixture(),
      signal = new AbortController().signal;
    await writeFile(join(root, `${work.deliveryId}.json`), 'wrong capture');
    await expect(provider.send(work, signal)).rejects.toThrow('mismatch');
    await expect(
      provider.send({ ...work, deliveryId: '../escape' }, signal),
    ).rejects.toThrow();
  });
});
