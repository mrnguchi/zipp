import { z } from 'zod';
import { callSchemas } from '../dist/modules/calling/contracts/call.schemas.js';
export function addCallContracts(schemas, routes) {
  Object.assign(
    schemas,
    Object.fromEntries(
      Object.entries(callSchemas).map(([name, s]) => [name, z.toJSONSchema(s)]),
    ),
  );
  routes.push(
    [
      'get',
      '/calling/capabilities',
      'getCallCapabilities',
      null,
      false,
      200,
      'CallCapabilities',
    ],
    [
      'post',
      '/calling/calls',
      'createCall',
      'CreateCall',
      false,
      200,
      'CallReceipt',
    ],
    [
      'get',
      '/calling/calls/active',
      'getActiveCall',
      null,
      false,
      200,
      'ActiveCall',
    ],
    [
      'get',
      '/calling/calls/{id}',
      'getCallSnapshot',
      null,
      false,
      200,
      'CallSnapshot',
    ],
    ...['accept', 'reject', 'end'].map((action) => [
      'post',
      `/calling/calls/{id}/${action}`,
      `${action}Call`,
      'CallAction',
      false,
      200,
      'CallReceipt',
    ]),
    [
      'post',
      '/calling/calls/{id}/signals',
      'sendCallSignal',
      'SendCallSignal',
      false,
      200,
      'CallSignalAck',
    ],
    [
      'post',
      '/calling/calls/{id}/signals/read',
      'readCallSignals',
      'ReadCallSignals',
      false,
      200,
      'CallSignalPage',
    ],
  );
}
export function decorateCallPaths(paths) {
  for (const [path, methods] of Object.entries(paths))
    if (path.startsWith('/calling/'))
      for (const [method, op] of Object.entries(methods)) {
        op.tags = ['Calling'];
        op['x-enabled-by-default'] = false;
        op.description =
          'M7.4 local call control only. No connected audio, provider/TURN credentials, OS ringing or native SDK. Requires current private participant/claimed LOCAL installation for negotiation. Never put proof or SDP/ICE in URLs/logs/history. Responses no-store; signaling is encrypted ephemeral cache data.';
        if (method === 'post' && !path.includes('/signals')) {
          op.parameters ??= [];
          op.parameters.push({
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description:
              'UUID v4 actor/action scope. Same canonical input recovers an immutable receipt after fresh authorization; keys do not expire/reuse. GET current snapshot to reconcile later state.',
          });
        }
      }
}
export const callEventSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Persisted local call metadata event/outbox intent v1',
  description:
    'Reference metadata only; not a published ringing event or native push/media delivery. No audio, SDP, ICE, tokens, device proof or credentials.',
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'callId',
    'aggregateVersion',
    'type',
    'actorUserId',
    'reason',
    'occurredAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    callId: { type: 'string', format: 'uuid' },
    aggregateVersion: { type: 'integer', minimum: 1, maximum: 1000000 },
    type: {
      enum: [
        'call.ringing',
        'call.accepted',
        'call.rejected',
        'call.missed',
        'call.failed',
        'call.ended',
      ],
    },
    actorUserId: { type: ['string', 'null'], format: 'uuid' },
    reason: {
      type: ['string', 'null'],
      enum: [
        null,
        'DECLINED',
        'RING_TIMEOUT',
        'CONNECT_TIMEOUT',
        'USER_ENDED',
        'PARTICIPANT_UNAVAILABLE',
      ],
    },
    occurredAt: { type: 'string', format: 'date-time' },
  },
};
