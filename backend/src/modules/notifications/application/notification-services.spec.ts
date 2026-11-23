import 'reflect-metadata';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { AccountsFacade } from '../../accounts/accounts.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { NotificationsConfig } from '../notifications.config.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationCrypto } from './notification-crypto.port.js';
import { NotificationProvider } from './notification-provider.port.js';
import { NotificationAdmissionService } from './notification-admission.service.js';
import { NotificationDevicesService } from './notification-devices.service.js';
import { NotificationInboxService } from './notification-inbox.service.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import type {
  DeviceRecord,
  DeliveryRecord,
  NotificationIntent,
} from '../contracts/notification-records.js';
describe('owned notification devices and bounded delivery (written, not run)', () => {
  const context = { id: randomUUID() },
    actor: Actor = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['CUSTOMER'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    },
    proof = randomBytes(32).toString('base64url');
  let devices: NotificationDevicesService,
    inbox: NotificationInboxService,
    service: NotificationDeliveryService;
  let device: DeviceRecord,
    delivery: DeliveryRecord,
    intent: NotificationIntent,
    now: Date;
  const digest = (purpose: string, value: string) =>
    createHmac('sha256', 'unit-only-key')
      .update(purpose + value)
      .digest('hex');
  const repo = {
    now: jest.fn<NotificationsRepository['now']>(),
    device: jest.fn<NotificationsRepository['device']>(),
    devices: jest.fn<NotificationsRepository['devices']>(),
    tokenOwner: jest.fn<NotificationsRepository['tokenOwner']>(),
    saveDevice: jest.fn<NotificationsRepository['saveDevice']>(),
    intent: jest.fn<NotificationsRepository['intent']>(),
    completeIntent: jest.fn<NotificationsRepository['completeIntent']>(),
    materialize: jest.fn<NotificationsRepository['materialize']>(),
    delivery: jest.fn<NotificationsRepository['delivery']>(),
    claim: jest.fn<NotificationsRepository['claim']>(),
    finish: jest.fn<NotificationsRepository['finish']>(),
    inbox: jest.fn<NotificationsRepository['inbox']>(),
    readInbox: jest.fn<NotificationsRepository['readInbox']>(),
  };
  const eligible = jest.fn<IdentityFacade['notificationEligible']>(),
    authorize = jest.fn<IdentityFacade['authorize']>(),
    lockUsers = jest.fn<IdentityFacade['lockUsers']>(),
    preference = jest.fn<AccountsFacade['notificationsEnabled']>(),
    send = jest.fn<NotificationProvider['send']>(),
    admit = jest.fn<NotificationAdmissionService['admit']>();
  beforeEach(async () => {
    jest.resetAllMocks();
    now = new Date();
    device = {
      id: randomUUID(),
      ownerUserId: actor.userId,
      sessionId: actor.sessionId,
      platform: 'IOS',
      provider: 'LOCAL',
      proofHash: '',
      tokenHash: digest('LOCAL:token', 'local_' + 'a'.repeat(32)),
      tokenCiphertext: 'encrypted',
      generation: 1,
      expiresAt: new Date(now.getTime() + 86400000),
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    device.proofHash = digest(`proof:${device.id}`, proof);
    intent = {
      id: randomUUID(),
      sourceEventId: randomUUID(),
      recipientUserId: actor.userId,
      eventType: 'ACTIVITY',
      expiresAt: new Date(now.getTime() + 86400000),
      completedAt: null,
      createdAt: now,
    };
    delivery = {
      id: randomUUID(),
      notificationId: intent.id,
      ownerUserId: actor.userId,
      deviceId: device.id,
      deviceGeneration: 1,
      status: 'PENDING',
      attempts: 0,
      availableAt: now,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: null,
      createdAt: now,
    };
    repo.now.mockImplementation(() => Promise.resolve(now));
    repo.device.mockImplementation(() => Promise.resolve({ ...device }));
    repo.devices.mockImplementation(() => Promise.resolve([{ ...device }]));
    repo.tokenOwner.mockResolvedValue(null);
    repo.intent.mockImplementation(() => Promise.resolve({ ...intent }));
    repo.delivery.mockImplementation(() => Promise.resolve({ ...delivery }));
    repo.claim.mockImplementation((_c, d, token, at) => {
      delivery = {
        ...d,
        attempts: d.attempts + 1,
        leaseToken: token,
        leaseExpiresAt: new Date(at.getTime() + 30000),
      };
      return Promise.resolve({ ...delivery });
    });
    repo.finish.mockImplementation((_c, _id, status, at, availableAt) => {
      delivery = {
        ...delivery,
        status,
        completedAt: status === 'PENDING' ? null : at,
        leaseToken: null,
        leaseExpiresAt: null,
        availableAt: availableAt ?? at,
      };
      return Promise.resolve();
    });
    repo.saveDevice.mockImplementation((_c, d) => {
      device = { ...d };
      return Promise.resolve();
    });
    repo.inbox.mockResolvedValue([]);
    repo.readInbox.mockResolvedValue(null);
    eligible.mockResolvedValue(true);
    authorize.mockResolvedValue(actor);
    preference.mockResolvedValue(true);
    send.mockResolvedValue('CAPTURED');
    const module = await Test.createTestingModule({
      providers: [
        NotificationDevicesService,
        NotificationInboxService,
        NotificationDeliveryService,
        {
          provide: UnitOfWork,
          useValue: {
            run: <T>(operation: (c: TransactionContext) => Promise<T>) =>
              operation(context),
          },
        },
        { provide: NotificationsRepository, useValue: repo },
        {
          provide: IdentityFacade,
          useValue: { authorize, notificationEligible: eligible, lockUsers },
        },
        {
          provide: AccountsFacade,
          useValue: { notificationsEnabled: preference },
        },
        { provide: NotificationProvider, useValue: { send } },
        {
          provide: NotificationCrypto,
          useValue: {
            digest,
            matches: (a: string, b: string) => a === b,
            seal: () => 'cipher',
            open: () => 'local_' + 'a'.repeat(32),
          },
        },
        { provide: AuditPort, useValue: { record: () => Promise.resolve() } },
        { provide: NotificationAdmissionService, useValue: { admit } },
        {
          provide: NotificationsConfig,
          useValue: new NotificationsConfig({
            NODE_ENV: 'test',
            SERVICE_ROLE: 'worker',
            NOTIFICATIONS_ENABLED: 'true',
            NOTIFICATION_DISPATCH_ENABLED: 'true',
            NOTIFICATION_DATA_KEY: '44'.repeat(32),
            NOTIFICATION_CAPTURE_ROOT: process.cwd(),
          }),
        },
      ],
    }).compile();
    devices = module.get(NotificationDevicesService);
    inbox = module.get(NotificationInboxService);
    service = module.get(NotificationDeliveryService);
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  const registration = () => ({
    proof,
    expectedGeneration: 1,
    platform: 'IOS' as const,
    provider: 'LOCAL' as const,
    pushToken: 'local_' + 'a'.repeat(32),
  });
  it('renews an identical registration without rotating generation or returning secrets', async () => {
    const view = await devices.register(actor, device.id, registration());
    expect(view.generation).toBe(1);
    for (const key of [
      'token',
      'pushToken',
      'proof',
      'proofHash',
      'tokenHash',
      'tokenCiphertext',
      'sessionId',
      'ownerUserId',
    ])
      expect(view).not.toHaveProperty(key);
  });
  it('rejects ownership/proof injection and stale rotation without persistence', async () => {
    await expect(
      devices.register(
        { ...actor, userId: randomUUID() },
        device.id,
        registration(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      devices.register(actor, device.id, {
        ...registration(),
        proof: randomBytes(32).toString('base64url'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      devices.register(actor, device.id, {
        ...registration(),
        pushToken: 'local_' + 'b'.repeat(32),
        expectedGeneration: 0,
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_VERSION_CONFLICT' });
    expect(repo.saveDevice).not.toHaveBeenCalled();
  });
  it('rotates generation for a rebind and never revives a revoked identity', async () => {
    const view = await devices.register(
      { ...actor, sessionId: randomUUID() },
      device.id,
      registration(),
    );
    expect(view.generation).toBe(2);
    await devices.revoke(actor, device.id, { proof, expectedGeneration: 2 });
    expect(device.tokenCiphertext).toBeNull();
    await expect(
      devices.register(actor, device.id, registration()),
    ).rejects.toMatchObject({ code: 'DEVICE_REVOKED' });
  });
  it('allows revocation at the generation ceiling and bounds live device admission', async () => {
    device.generation = 1000000;
    expect(
      (
        await devices.revoke(actor, device.id, {
          proof,
          expectedGeneration: 1000000,
        })
      ).revokedAt,
    ).not.toBeNull();
    repo.device.mockResolvedValue(null);
    repo.devices.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ ...device })),
    );
    await expect(
      devices.register(actor, randomUUID(), {
        ...registration(),
        expectedGeneration: 0,
      }),
    ).rejects.toMatchObject({ code: 'DEVICE_LIMIT' });
  });
  it('keeps an inbox for opted-out/expired activity but creates no push deliveries', async () => {
    preference.mockResolvedValue(false);
    await service.materialize(intent.id);
    expect(repo.materialize).toHaveBeenCalledWith(context, intent, [], now);
    preference.mockResolvedValue(true);
    intent.expiresAt = new Date(now.getTime() - 1);
    await service.materialize(intent.id);
    expect(repo.materialize).toHaveBeenLastCalledWith(context, intent, [], now);
  });
  it('suppresses inactive owners and never repeats materialization after completion', async () => {
    eligible.mockResolvedValue(false);
    await service.materialize(intent.id);
    expect(repo.completeIntent).toHaveBeenCalled();
    expect(repo.materialize).not.toHaveBeenCalled();
    eligible.mockResolvedValue(true);
    intent.completedAt = now;
    await service.materialize(intent.id);
    expect(repo.materialize).not.toHaveBeenCalled();
  });
  it('reauthorizes current bound session and generation immediately before capture', async () => {
    await service.dispatch(delivery.id);
    expect(eligible).toHaveBeenCalledWith(
      context,
      actor.userId,
      actor.sessionId,
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(delivery.status).toBe('CAPTURED');
    expect(delivery.attempts).toBe(1);
  });
  it('suppresses revoked session, rotated device and opted-out dispatch', async () => {
    eligible.mockResolvedValue(false);
    await service.dispatch(delivery.id);
    expect(send).not.toHaveBeenCalled();
    expect(delivery.status).toBe('SUPPRESSED');
    delivery.status = 'PENDING';
    eligible.mockResolvedValue(true);
    device.generation = 2;
    await service.dispatch(delivery.id);
    expect(send).not.toHaveBeenCalled();
    delivery.status = 'PENDING';
    device.generation = 1;
    preference.mockResolvedValue(false);
    await service.dispatch(delivery.id);
    expect(send).not.toHaveBeenCalled();
  });
  it('does not steal live work and reviews an expired final-attempt lease without a ninth send', async () => {
    delivery.leaseToken = randomUUID();
    delivery.leaseExpiresAt = new Date(now.getTime() + 1000);
    await service.dispatch(delivery.id);
    expect(send).not.toHaveBeenCalled();
    delivery.leaseExpiresAt = now;
    delivery.attempts = 8;
    await service.dispatch(delivery.id);
    expect(delivery.status).toBe('REVIEW_REQUIRED');
    expect(send).not.toHaveBeenCalled();
  });
  it('persists a retry without exposing provider errors', async () => {
    send.mockRejectedValue(new Error('private token/provider error'));
    await service.dispatch(delivery.id);
    expect(delivery.status).toBe('PENDING');
    expect(delivery.availableAt.getTime()).toBeGreaterThan(now.getTime());
    expect(JSON.stringify(repo.finish.mock.calls)).not.toContain(
      'private token',
    );
  });
  it('does not let an expired worker overwrite a newer lease', async () => {
    send.mockImplementation(() => {
      delivery.leaseToken = randomUUID();
      return Promise.resolve('CAPTURED');
    });
    await service.dispatch(delivery.id);
    expect(repo.finish).not.toHaveBeenCalled();
  });
  it('does not revoke a newer device generation on an old invalid endpoint result', async () => {
    send.mockImplementation(() => {
      device.generation = 2;
      return Promise.resolve('INVALID_DEVICE');
    });
    await service.dispatch(delivery.id);
    expect(repo.saveDevice).not.toHaveBeenCalled();
    expect(device.revokedAt).toBeNull();
  });
  it('enforces the adapter deadline even for a non-cooperative adapter', async () => {
    jest.useFakeTimers();
    send.mockImplementation(() => new Promise(() => {}));
    const pending = service.dispatch(delivery.id);
    await jest.advanceTimersByTimeAsync(8001);
    await pending;
    expect(delivery.status).toBe('PENDING');
    expect(delivery.attempts).toBe(1);
  });
  it('keeps inbox acknowledgement owned and does not invent a missing notification', async () => {
    await expect(inbox.read(actor, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repo.readInbox).toHaveBeenCalledWith(
      context,
      actor.userId,
      expect.any(String),
      now,
    );
  });
});
