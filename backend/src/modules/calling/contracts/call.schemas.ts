import { z } from 'zod';
import { installationProof } from '../../notifications/contracts/notification.schemas.js';
const uuid = z.uuid({ version: 'v4' });
export const callDeviceBody = z
  .object({
    deviceId: uuid,
    deviceGeneration: z.number().int().min(1).max(1000000),
    proof: installationProof,
  })
  .strict();
export const createCallBody = callDeviceBody.extend({
  jobType: z.enum(['RIDE', 'DELIVERY']),
  jobId: uuid,
  peerUserId: uuid,
});
export const callActionBody = callDeviceBody.extend({
  expectedVersion: z.number().int().min(1).max(1000000),
});
export const callRequestKey = uuid;
export const callStatus = z.enum([
  'RINGING',
  'CONNECTING',
  'REJECTED',
  'MISSED',
  'FAILED',
  'ENDED',
]);
export const callReceipt = z
  .object({
    callId: uuid,
    version: z.number().int().min(1).max(1000000),
    status: callStatus,
  })
  .strict();
export const callSnapshot = z
  .object({
    id: uuid,
    status: callStatus,
    version: z.number().int().min(1),
    role: z.enum(['CALLER', 'CALLEE']),
    signalEpoch: z.number().int().min(0).max(1),
    ringExpiresAt: z.iso.datetime(),
    connectExpiresAt: z.iso.datetime().nullable(),
    acceptedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    endReason: z.string().nullable(),
    createdAt: z.iso.datetime(),
    audioAvailable: z.literal(false),
  })
  .strict();
export const signalPayload = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('OFFER'), sdp: z.string().min(1).max(8192) })
    .strict(),
  z
    .object({ type: z.literal('ANSWER'), sdp: z.string().min(1).max(8192) })
    .strict(),
  z
    .object({
      type: z.literal('ICE'),
      candidate: z.string().min(1).max(1024),
      sdpMid: z.string().max(64).nullable(),
      sdpMLineIndex: z.number().int().min(0).max(31).nullable(),
    })
    .strict(),
]);
export const signalPacket = z
  .object({
    messageId: uuid,
    sequence: z.number().int().min(1).max(64),
    payload: signalPayload,
  })
  .strict();
export const sendSignalBody = callDeviceBody.extend({
  epoch: z.literal(1),
  packet: signalPacket,
});
export const readSignalsBody = callDeviceBody.extend({
  epoch: z.literal(1),
  afterSequence: z.number().int().min(0).max(64),
});
export const callSchemas = {
  CreateCall: createCallBody,
  CallAction: callActionBody,
  SendCallSignal: sendSignalBody,
  ReadCallSignals: readSignalsBody,
  CallReceipt: callReceipt,
  CallSnapshot: callSnapshot,
  ActiveCall: z.object({ call: callSnapshot.nullable() }).strict(),
  CallSignalAck: z
    .object({ acceptedSequence: z.number().int().min(1).max(64) })
    .strict(),
  CallSignalPage: z
    .object({
      items: z.array(signalPacket).max(32),
      lastSequence: z.number().int().min(0).max(64),
      resyncRequired: z.boolean(),
    })
    .strict(),
  CallCapabilities: z
    .object({
      mode: z.literal('LOCAL_CONTROL'),
      audioAvailable: z.literal(false),
      turnCredentialsAvailable: z.literal(false),
      nativeIncomingCalls: z.literal(false),
      signaling: z.literal('REST_EPHEMERAL'),
    })
    .strict(),
};
export type CallDevice = z.infer<typeof callDeviceBody>;
export type CreateCall = z.infer<typeof createCallBody>;
export type CallAction = z.infer<typeof callActionBody>;
export type CallStatus = z.infer<typeof callStatus>;
export type CallReceipt = z.infer<typeof callReceipt>;
export type SignalPacket = z.infer<typeof signalPacket>;
export type SendSignal = z.infer<typeof sendSignalBody>;
export type ReadSignals = z.infer<typeof readSignalsBody>;
