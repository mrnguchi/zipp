import 'reflect-metadata';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import { NotificationsFacade } from '../../notifications/notifications.facade.js';
import {
  UnitOfWork,
  AuditPort,
} from '../../../shared/contracts/unit-of-work.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { RateLimitPort } from '../../../shared/contracts/rate-limit.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { CallingConfig } from '../calling.config.js';
import { CallRelayConfig } from '../call-relay.config.js';
import { CallRelayService } from './call-relay.service.js';
import { CallRelay } from './call-relay.port.js';
import { CallRepository } from './call.repository.js';
import { CallSignals } from './call-signals.port.js';
import { CallAccessService } from './call-access.service.js';
import { CallAdmissionService } from './call-admission.service.js';
import { CallRequestsService } from './call-requests.service.js';
import { CallCreateService } from './call-create.service.js';
import { CallLifecycleService } from './call-lifecycle.service.js';
import { CallStateService } from './call-state.service.js';
import { CallReadService } from './call-read.service.js';
import { CallReaperService } from './call-reaper.service.js';
import { CallSignalingService } from './call-signaling.service.js';
import type { CallRecord } from '../contracts/call-records.js';
describe('call authorization, claim and recovery (written, not run)', () => {
  let r: CallRecord,
    caller: Actor,
    callee: Actor,
    now: Date,
    creates: CallCreateService,
    life: CallLifecycleService,
    reads: CallReadService,
    signals: CallSignalingService,
    reaper: CallReaperService,
    requests: CallRequestsService,
    relay: CallRelayService;
  let transactionDepth = 0;
  const proof = randomBytes(32).toString('base64url'),
    context = { id: randomUUID() };
  const repo = {
    now: jest.fn<CallRepository['now']>(),
    get: jest.fn<CallRepository['get']>(),
    active: jest.fn<CallRepository['active']>(),
    create: jest.fn<CallRepository['create']>(),
    save: jest.fn<CallRepository['save']>(),
    claimAccounts: jest.fn<CallRepository['claimAccounts']>(),
    releaseAccounts: jest.fn<CallRepository['releaseAccounts']>(),
    recentPair: jest.fn<CallRepository['recentPair']>(),
    command: jest.fn<CallRepository['command']>(),
    receipt: jest.fn<CallRepository['receipt']>(),
    event: jest.fn<CallRepository['event']>(),
    candidates: jest.fn<CallRepository['candidates']>(),
    checked: jest.fn<CallRepository['checked']>(),
  };
  const authorize = jest.fn<IdentityFacade['authorize']>(),
    eligible = jest.fn<IdentityFacade['notificationEligible']>(),
    lockUsers = jest.fn<IdentityFacade['lockUsers']>(),
    job = jest.fn<RidesFacade['callingContext']>(),
    device = jest.fn<NotificationsFacade['assertCallDevice']>(),
    currentDevice = jest.fn<NotificationsFacade['currentCallDevice']>(),
    send = jest.fn<CallSignals['send']>(),
    read = jest.fn<CallSignals['read']>(),
    consume = jest.fn<RateLimitPort['consume']>(),
    mint = jest.fn<CallRelay['mint']>();
  beforeEach(async () => {
    jest.resetAllMocks();
    now = new Date();
    transactionDepth = 0;
    caller = {
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['CUSTOMER'],
      mfaEnabled: false,
      mfaVerifiedAt: null,
    };
    callee = {
      ...caller,
      userId: randomUUID(),
      sessionId: randomUUID(),
      roles: ['DRIVER'],
    };
    r = {
      id: randomUUID(),
      jobId: randomUUID(),
      jobType: 'RIDE',
      callerUserId: caller.userId,
      calleeUserId: callee.userId,
      callerSessionId: caller.sessionId,
      callerDeviceId: randomUUID(),
      callerDeviceGeneration: 1,
      calleeSessionId: null,
      calleeDeviceId: null,
      calleeDeviceGeneration: null,
      status: 'RINGING',
      version: 1,
      signalEpoch: 0,
      ringExpiresAt: new Date(now.getTime() + 30000),
      connectExpiresAt: null,
      acceptedAt: null,
      endedAt: null,
      endReason: null,
      lastCheckedAt: now,
      createdAt: now,
    };
    repo.get.mockImplementation(() => Promise.resolve({ ...r }));
    repo.now.mockImplementation(() => Promise.resolve(now));
    repo.active.mockImplementation(() => Promise.resolve({ ...r }));
    repo.create.mockImplementation((_c, value) => {
      r = { ...value };
      return Promise.resolve();
    });
    repo.save.mockImplementation((_c, value) => {
      r = { ...value };
      return Promise.resolve();
    });
    repo.recentPair.mockResolvedValue(false);
    repo.command.mockResolvedValue(null);
    repo.candidates.mockImplementation(() => Promise.resolve([r.id]));
    authorize.mockImplementation((_c, a) => Promise.resolve(a));
    eligible.mockResolvedValue(true);
    job.mockResolvedValue({ eligible: true });
    currentDevice.mockResolvedValue(true);
    send.mockResolvedValue({ acceptedSequence: 1 });
    read.mockResolvedValue({
      items: [],
      lastSequence: 0,
      resyncRequired: false,
    });
    const module = await Test.createTestingModule({
      providers: [
        CallAccessService,
        CallAdmissionService,
        CallRequestsService,
        CallStateService,
        CallCreateService,
        CallLifecycleService,
        CallReadService,
        CallReaperService,
        CallSignalingService,
        CallRelayService,
        { provide: CallRelayConfig, useValue: { assertEnabled: () => {} } },
        { provide: CallRelay, useValue: { mint } },
        {
          provide: UnitOfWork,
          useValue: {
            run: async <T>(
              operation: (c: TransactionContext) => Promise<T>,
            ) => {
              transactionDepth++;
              try {
                return await operation(context);
              } finally {
                transactionDepth--;
              }
            },
          },
        },
        { provide: CallRepository, useValue: repo },
        {
          provide: IdentityFacade,
          useValue: {
            authorize,
            notificationEligible: eligible,
            lockUsers,
            pseudonym: (p: string, v: string) =>
              createHmac('sha256', 'unit-only-key')
                .update(p + v)
                .digest('hex'),
          },
        },
        { provide: RidesFacade, useValue: { callingContext: job } },
        { provide: DeliveriesFacade, useValue: { callingContext: job } },
        {
          provide: NotificationsFacade,
          useValue: {
            assertCallDevice: device,
            currentCallDevice: currentDevice,
          },
        },
        {
          provide: CallingConfig,
          useValue: {
            enabled: true,
            reaperEnabled: true,
            assertEnabled: () => {},
            assertSignaling: () => {},
          },
        },
        { provide: CallSignals, useValue: { send, read } },
        { provide: RateLimitPort, useValue: { consume } },
        { provide: AuditPort, useValue: { record: () => Promise.resolve() } },
      ],
    }).compile();
    creates = module.get(CallCreateService);
    life = module.get(CallLifecycleService);
    reads = module.get(CallReadService);
    signals = module.get(CallSignalingService);
    reaper = module.get(CallReaperService);
    requests = module.get(CallRequestsService);
    relay = module.get(CallRelayService);
    mint.mockImplementation((grant) => {
      expect(transactionDepth).toBe(0);
      return {
        iceServers: [
          {
            urls: [
              'turn:192.168.1.50:3478?transport=udp',
              'turn:192.168.1.50:3478?transport=tcp',
            ],
            username: 'opaque-unit-grant',
            credential: 'opaque-unit-password',
          },
        ],
        expiresAt: grant.expiresAt.toISOString(),
        serverTime: grant.serverTime.toISOString(),
        iceTransportPolicy: 'relay',
        audioAvailable: false,
      };
    });
  });
  const callerDevice = () => ({
    deviceId: r.callerDeviceId,
    deviceGeneration: 1,
    proof,
  });
  async function accept() {
    const d = {
      deviceId: randomUUID(),
      deviceGeneration: 1,
      proof,
      expectedVersion: 1,
    };
    await life.command(callee, randomUUID(), r.id, 'ACCEPT', d);
    return d;
  }
  it('creates metadata, both reservations, event and receipt atomically without a media claim', async () => {
    const result = await creates.create(caller, randomUUID(), {
      ...callerDevice(),
      jobType: 'RIDE',
      jobId: r.jobId,
      peerUserId: callee.userId,
    });
    expect(result.status).toBe('RINGING');
    expect(repo.claimAccounts).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        callerUserId: caller.userId,
        calleeUserId: callee.userId,
      }),
    );
    expect(JSON.stringify(repo.event.mock.calls)).not.toContain(proof);
    expect(r).not.toHaveProperty('sdp');
  });
  it('issues only after accept, outside transactions, with fixed expiry and shared issuer quota', async () => {
    const request = {
      ...callerDevice(),
      epoch: 1 as const,
      expectedVersion: 1,
    };
    await expect(relay.issue(caller, r.id, request)).rejects.toMatchObject({
      code: 'CALL_NOT_READY',
    });
    expect(mint).not.toHaveBeenCalled();
    await accept();
    request.expectedVersion = r.version;
    const first = await relay.issue(caller, r.id, request);
    now = new Date(now.getTime() + 5000);
    const retry = await relay.issue(caller, r.id, request);
    expect(first.expiresAt).toBe(retry.expiresAt);
    expect(first.audioAvailable).toBe(false);
    expect(mint.mock.calls[0]?.[0].scope).toEqual(
      mint.mock.calls[1]?.[0].scope,
    );
    expect(repo.receipt).toHaveBeenCalledTimes(1); // ACCEPT only; no credential receipts.
    expect(consume).toHaveBeenCalledWith([
      expect.objectContaining({ limit: 6, windowMs: 60000 }),
    ]);
  });
  it('denies relay grants to strangers, losing devices, changed sessions, stale versions and revoked endpoints', async () => {
    await accept();
    const input = {
      ...callerDevice(),
      epoch: 1 as const,
      expectedVersion: r.version,
    };
    await expect(
      relay.issue(
        { ...caller, userId: randomUUID(), roles: ['ADMIN'] },
        r.id,
        input,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      relay.issue(caller, r.id, { ...input, deviceId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CALL_DEVICE_NOT_CLAIMED' });
    await expect(
      relay.issue({ ...caller, sessionId: randomUUID() }, r.id, input),
    ).rejects.toMatchObject({ code: 'CALL_DEVICE_NOT_CLAIMED' });
    await expect(
      relay.issue(caller, r.id, { ...input, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'CALL_VERSION_CONFLICT' });
    currentDevice.mockResolvedValue(false);
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_NOT_ELIGIBLE',
    });
    expect(mint).not.toHaveBeenCalled();
  });
  it('reauthorizes after mint and never returns a credential after end/job/device-loss races', async () => {
    await accept();
    const input = {
      ...callerDevice(),
      epoch: 1 as const,
      expectedVersion: r.version,
    };
    const original = mint.getMockImplementation();
    if (!original) throw new Error('Missing relay test adapter');
    mint.mockImplementation((grant) => {
      const result = original(grant);
      r.status = 'ENDED';
      r.version++;
      return result;
    });
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_NOT_READY',
    });
    r.status = 'CONNECTING';
    r.version = input.expectedVersion;
    mint.mockImplementation((grant) => {
      const result = original(grant);
      job.mockResolvedValue({ eligible: false });
      return result;
    });
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_NOT_ELIGIBLE',
    });
    job.mockResolvedValue({ eligible: true });
    mint.mockImplementation((grant) => {
      const result = original(grant);
      currentDevice.mockResolvedValue(false);
      return result;
    });
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_NOT_ELIGIBLE',
    });
  });
  it('commits setup expiry cleanup before refusing a relay grant, never refreshing a terminal attempt', async () => {
    await accept();
    const input = {
      ...callerDevice(),
      epoch: 1 as const,
      expectedVersion: r.version,
    };
    now = new Date(r.connectExpiresAt!.getTime());
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_EXPIRED',
    });
    expect(r.status).toBe('FAILED');
    expect(repo.releaseAccounts).toHaveBeenCalledWith(context, r.id);
    await expect(relay.issue(caller, r.id, input)).rejects.toMatchObject({
      code: 'CALL_NOT_READY',
    });
    expect(mint).not.toHaveBeenCalled();
  });
  it('denies stranger history and current-job access without a role bypass', async () => {
    await expect(
      reads.snapshot({ ...caller, userId: randomUUID() }, r.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    job.mockRejectedValue(new BusinessError('NOT_FOUND', 'private job'));
    await expect(
      life.command(callee, randomUUID(), r.id, 'ACCEPT', {
        deviceId: randomUUID(),
        deviceGeneration: 1,
        proof,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('atomically binds the first callee device and excludes a later device', async () => {
    const d = await accept();
    expect(r.status).toBe('CONNECTING');
    expect(r.calleeDeviceId).toBe(d.deviceId);
    expect(r.signalEpoch).toBe(1);
    await expect(
      life.command(callee, randomUUID(), r.id, 'ACCEPT', {
        ...d,
        deviceId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CALL_ALREADY_ANSWERED' });
    await expect(
      signals.read(callee, r.id, {
        ...d,
        deviceId: randomUUID(),
        epoch: 1,
        afterSequence: 0,
      }),
    ).rejects.toMatchObject({ code: 'CALL_DEVICE_NOT_CLAIMED' });
    expect(read).not.toHaveBeenCalled();
  });
  it('blocks self-answer and stale expected version without claiming a device', async () => {
    await expect(
      life.command(caller, randomUUID(), r.id, 'ACCEPT', {
        ...callerDevice(),
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      life.command(callee, randomUUID(), r.id, 'ACCEPT', {
        deviceId: randomUUID(),
        deviceGeneration: 1,
        proof,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'CALL_VERSION_CONFLICT' });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('commits missed-call cleanup before rejecting a delayed answer', async () => {
    now = r.ringExpiresAt;
    await expect(
      life.command(callee, randomUUID(), r.id, 'ACCEPT', {
        deviceId: randomUUID(),
        deviceGeneration: 1,
        proof,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'CALL_EXPIRED' });
    expect(r.status).toBe('MISSED');
    expect(repo.releaseAccounts).toHaveBeenCalledWith(context, r.id);
  });
  it('never reports a media connection and closes the local CONNECTING deadline', async () => {
    await accept();
    if (!r.connectExpiresAt) throw new Error('Missing negotiation deadline');
    now = r.connectExpiresAt;
    const view = await reads.snapshot(caller, r.id);
    expect(view.status).toBe('FAILED');
    expect(view.audioAvailable).toBe(false);
    expect(r.endReason).toBe('CONNECT_TIMEOUT');
  });
  it('replays a terminal receipt under fresh authorization without reserving slots', async () => {
    const d = callerDevice(),
      key = randomUUID(),
      fingerprint = requests.fingerprint([
        r.id,
        1,
        d.deviceId,
        1,
        requests.proof(proof),
      ]);
    r.status = 'ENDED';
    r.version = 3;
    const receipt = { callId: r.id, status: 'ENDED' as const, version: 3 };
    repo.command.mockResolvedValue({ ...receipt, fingerprint });
    expect(
      await life.command(caller, key, r.id, 'END', {
        ...d,
        expectedVersion: 1,
      }),
    ).toEqual(receipt);
    expect(authorize).toHaveBeenCalled();
    expect(repo.claimAccounts).not.toHaveBeenCalled();
    repo.command.mockResolvedValue({ ...receipt, fingerprint: 'different' });
    await expect(
      life.command(caller, key, r.id, 'END', { ...d, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('does not serve a receipt to a revoked session', async () => {
    authorize.mockRejectedValue(
      new BusinessError('UNAUTHENTICATED', 'Sign in'),
    );
    await expect(reads.snapshot(caller, r.id)).rejects.toBeDefined();
    expect(repo.command).not.toHaveBeenCalled();
  });
  it('checks both claimed endpoints, job state and role before each signal emission', async () => {
    const d = await accept();
    const packet = {
      messageId: randomUUID(),
      sequence: 1,
      payload: { type: 'OFFER' as const, sdp: 'private diagnostic SDP' },
    };
    await signals.send(caller, r.id, { ...callerDevice(), epoch: 1, packet });
    expect(job).toHaveBeenCalled();
    expect(currentDevice).toHaveBeenCalled();
    await expect(
      signals.send(callee, r.id, { ...d, epoch: 1, packet }),
    ).rejects.toMatchObject({ code: 'SIGNAL_ORDER_INVALID' });
    eligible.mockResolvedValue(false);
    await expect(
      signals.read(callee, r.id, { ...d, epoch: 1, afterSequence: 0 }),
    ).rejects.toMatchObject({ code: 'CALL_NOT_ELIGIBLE' });
  });
  it('does not return cached data after a terminal race or a changed claim', async () => {
    const d = await accept();
    read.mockImplementation(() => {
      r.status = 'ENDED';
      r.version++;
      return Promise.resolve({
        items: [],
        lastSequence: 0,
        resyncRequired: false,
      });
    });
    await expect(
      signals.read(callee, r.id, { ...d, epoch: 1, afterSequence: 0 }),
    ).rejects.toMatchObject({ code: 'CALL_NOT_READY' });
  });
  it('keeps Redis I/O outside transaction scopes', async () => {
    await accept();
    send.mockImplementation(() => {
      expect(transactionDepth).toBe(0);
      return Promise.resolve({ acceptedSequence: 1 });
    });
    await signals.send(caller, r.id, {
      ...callerDevice(),
      epoch: 1,
      packet: {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER', sdp: 'opaque' },
      },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(repo.event).toHaveBeenCalledTimes(1);
  });
  it('reaps only call reservations after session/device loss and stops between candidates on shutdown', async () => {
    currentDevice.mockResolvedValue(false);
    await reaper.reap();
    expect(r.status).toBe('FAILED');
    expect(repo.releaseAccounts).toHaveBeenCalledWith(context, r.id);
    repo.get.mockClear();
    await reaper.reap(() => true);
    expect(repo.get).not.toHaveBeenCalled();
  });
});
