import { randomUUID, randomBytes } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import {
  callTerminal,
  dueCall,
  assertCallVersion,
  assertSignalOrder,
} from './call-rules.js';
import { CallingConfig } from '../calling.config.js';
import {
  createCallBody,
  callActionBody,
  sendSignalBody,
  callSnapshot,
} from '../contracts/call.schemas.js';
import type { CallRecord } from '../contracts/call-records.js';
export function callFixture(): CallRecord {
  const now = new Date();
  return {
    id: randomUUID(),
    jobId: randomUUID(),
    jobType: 'RIDE',
    callerUserId: randomUUID(),
    calleeUserId: randomUUID(),
    callerSessionId: randomUUID(),
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
}
describe('local call policies and contracts (written, not run)', () => {
  it('does not create media availability or accept CONNECTED claims', () => {
    expect(callTerminal('CONNECTING')).toBe(false);
    expect(callTerminal('FAILED')).toBe(true);
    const input = {
      deviceId: randomUUID(),
      deviceGeneration: 1,
      proof: randomBytes(32).toString('base64url'),
      expectedVersion: 1,
    };
    expect(
      callActionBody.safeParse({ ...input, status: 'CONNECTED' }).success,
    ).toBe(false);
    expect(
      callSnapshot.safeParse({ status: 'CONNECTED', audioAvailable: true })
        .success,
    ).toBe(false);
  });
  it('keeps deadlines finite and terminal state non-resurrectable', () => {
    const r = callFixture();
    expect(dueCall(r, r.createdAt)).toBeNull();
    expect(dueCall(r, r.ringExpiresAt)).toEqual({
      status: 'MISSED',
      reason: 'RING_TIMEOUT',
    });
    r.status = 'CONNECTING';
    r.connectExpiresAt = new Date(r.createdAt.getTime() + 60000);
    expect(dueCall(r, r.connectExpiresAt)).toEqual({
      status: 'FAILED',
      reason: 'CONNECT_TIMEOUT',
    });
    r.status = 'ENDED';
    expect(dueCall(r, new Date(r.createdAt.getTime() + 999999))).toBeNull();
    expect(() => assertCallVersion(r, 99)).toThrow('Reload');
  });
  it('requires correct first SDP direction then bounded ICE', () => {
    expect(() =>
      assertSignalOrder('CALLER', {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER', sdp: '界'.repeat(3000) },
      }),
    ).toThrow('byte limit');
    expect(() =>
      assertSignalOrder('CALLER', {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER', sdp: 'opaque' },
      }),
    ).not.toThrow();
    expect(() =>
      assertSignalOrder('CALLEE', {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER', sdp: 'opaque' },
      }),
    ).toThrow();
    expect(() =>
      assertSignalOrder('CALLER', {
        messageId: randomUUID(),
        sequence: 2,
        payload: { type: 'OFFER', sdp: 'opaque' },
      }),
    ).toThrow();
    const input = {
      deviceId: randomUUID(),
      deviceGeneration: 1,
      proof: randomBytes(32).toString('base64url'),
      epoch: 1,
      packet: {
        messageId: randomUUID(),
        sequence: 1,
        payload: { type: 'OFFER', sdp: 'x'.repeat(8193) },
      },
    };
    expect(sendSignalBody.safeParse(input).success).toBe(false);
  });
  it('rejects injected roles, weak proof, unsupported provider and production', () => {
    const input = {
      deviceId: randomUUID(),
      deviceGeneration: 1,
      proof: randomBytes(32).toString('base64url'),
      jobId: randomUUID(),
      jobType: 'RIDE',
      peerUserId: randomUUID(),
    };
    expect(
      createCallBody.safeParse({ ...input, callerUserId: randomUUID() })
        .success,
    ).toBe(false);
    expect(createCallBody.safeParse({ ...input, proof: 'weak' }).success).toBe(
      false,
    );
    expect(new CallingConfig({}).enabled).toBe(false);
    const env = {
      NODE_ENV: 'test',
      AUTH_ENABLED: 'true',
      NOTIFICATIONS_ENABLED: 'true',
      CALLING_ENABLED: 'true',
      CALL_SIGNAL_KEY: '55'.repeat(32),
    };
    expect(
      () => new CallingConfig({ ...env, NODE_ENV: 'production' }),
    ).toThrow();
    expect(
      () => new CallingConfig({ ...env, CALLING_ADAPTER: 'managed' }),
    ).toThrow();
    expect(
      () =>
        new CallingConfig({
          ...env,
          NOTIFICATION_DATA_KEY: env.CALL_SIGNAL_KEY,
        }),
    ).toThrow();
    expect(
      () => new CallingConfig({ ...env, CALLING_REAPER_ENABLED: 'true' }),
    ).toThrow();
    expect(
      new CallingConfig({
        NODE_ENV: 'test',
        SERVICE_ROLE: 'worker',
        CALLING_ENABLED: 'true',
        CALLING_REAPER_ENABLED: 'true',
        NOTIFICATIONS_ENABLED: 'true',
      }).reaperEnabled,
    ).toBe(true);
  });
});
