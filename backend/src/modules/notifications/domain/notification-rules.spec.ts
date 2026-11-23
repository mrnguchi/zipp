import { describe, expect, it } from '@jest/globals';
import {
  retryDelayMs,
  assertGeneration,
  ownsDeliveryLease,
} from './notification-rules.js';
import { NotificationsConfig } from '../notifications.config.js';
import {
  registerDeviceBody,
  notificationCommand,
  installationProof,
  inboxViewSchema,
  notificationPageQuery,
} from '../contracts/notification.schemas.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { DeliveryRecord } from '../contracts/notification-records.js';
describe('notification bounded contracts and policies (written, not run)', () => {
  it('defaults off and rejects real providers, production, mixed roles and reused identity keys', () => {
    expect(new NotificationsConfig({}).enabled).toBe(false);
    const env = {
      NODE_ENV: 'test',
      AUTH_ENABLED: 'true',
      NOTIFICATIONS_ENABLED: 'true',
      NOTIFICATION_DATA_KEY: '44'.repeat(32),
    };
    expect(
      () => new NotificationsConfig({ ...env, NODE_ENV: 'production' }),
    ).toThrow();
    expect(
      () => new NotificationsConfig({ ...env, NOTIFICATION_ADAPTER: 'expo' }),
    ).toThrow();
    expect(
      () =>
        new NotificationsConfig({
          ...env,
          NOTIFICATION_DISPATCH_ENABLED: 'true',
        }),
    ).toThrow();
    expect(
      () =>
        new NotificationsConfig({
          ...env,
          AUTH_SIGNING_KEY: env.NOTIFICATION_DATA_KEY,
        }),
    ).toThrow();
    expect(
      () => new NotificationsConfig({ ...env, AUTH_ENABLED: 'false' }),
    ).toThrow();
    expect(
      new NotificationsConfig({
        ...env,
        AUTH_ENABLED: 'false',
        SERVICE_ROLE: 'worker',
      }).enabled,
    ).toBe(true);
  });
  it('requires canonical client-owned proof and LOCAL dummy endpoints only', () => {
    const body = {
      proof: randomBytes(32).toString('base64url'),
      expectedGeneration: 0,
      platform: 'IOS',
      provider: 'LOCAL',
      pushToken: 'local_' + 'a'.repeat(32),
    };
    expect(registerDeviceBody.safeParse(body).success).toBe(true);
    expect(installationProof.safeParse('A'.repeat(42) + 'B').success).toBe(
      false,
    );
    for (const extra of [
      { ownerUserId: randomUUID() },
      { sessionId: randomUUID() },
      { generation: 2 },
    ])
      expect(registerDeviceBody.safeParse({ ...body, ...extra }).success).toBe(
        false,
      );
    expect(
      registerDeviceBody.safeParse({
        ...body,
        pushToken: 'ExponentPushToken[secret]',
      }).success,
    ).toBe(false);
  });
  it('keeps queue and inbox payloads free of private source/token data', () => {
    const frame = { schemaVersion: 1, kind: 'DISPATCH', id: randomUUID() };
    expect(notificationCommand.safeParse(frame).success).toBe(true);
    for (const field of ['token', 'proof', 'threadId', 'body', 'ownerUserId'])
      expect(
        notificationCommand.safeParse({ ...frame, [field]: 'secret' }).success,
      ).toBe(false);
    expect(
      inboxViewSchema.safeParse({
        id: randomUUID(),
        type: 'ACTIVITY',
        text: 'private message',
        createdAt: new Date().toISOString(),
        readAt: null,
      }).success,
    ).toBe(false);
    expect(notificationPageQuery.safeParse({ limit: 51 }).success).toBe(false);
  });
  it('rejects stale registrations and bounds retry jitter/backoff', () => {
    expect(() => assertGeneration(2, 1)).toThrow('Reload');
    expect(() => assertGeneration(1000000, 1000000)).toThrow(
      'new installation',
    );
    expect(retryDelayMs(1, 0)).toBe(2000);
    expect(retryDelayMs(8, 9999)).toBe(256999);
    expect(retryDelayMs(20, -1)).toBe(256000);
  });
  it('never revives an expired or superseded delivery lease', () => {
    const now = new Date(),
      d: DeliveryRecord = {
        id: randomUUID(),
        notificationId: randomUUID(),
        ownerUserId: randomUUID(),
        deviceId: randomUUID(),
        deviceGeneration: 1,
        status: 'PENDING',
        attempts: 1,
        availableAt: now,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + 1000),
        completedAt: null,
        createdAt: now,
      };
    expect(ownsDeliveryLease(d, d.leaseToken ?? '', now)).toBe(true);
    expect(ownsDeliveryLease(d, randomUUID(), now)).toBe(false);
    expect(
      ownsDeliveryLease(d, d.leaseToken ?? '', new Date(now.getTime() + 1000)),
    ).toBe(false);
  });
});
