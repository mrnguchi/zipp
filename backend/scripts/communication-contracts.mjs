import { z } from 'zod';
import {
  communicationSchemas,
  communicationEvent,
} from '../dist/modules/communications/contracts/communication.schemas.js';
export const communicationEventSchema = {
  title: 'Internal communication event/outbox intent v1',
  description:
    'Persisted atomically with messages/status. References only; no publisher or notification delivery is enabled in M7.2.',
  ...z.toJSONSchema(communicationEvent),
};
export function addCommunicationContracts(schemas, routes) {
  Object.assign(
    schemas,
    Object.fromEntries(
      Object.entries(communicationSchemas).map(([name, s]) => [
        name,
        z.toJSONSchema(s),
      ]),
    ),
  );
  routes.push(
    [
      'post',
      '/communications/job-conversations',
      'openJobConversation',
      'JobConversationInput',
      false,
      200,
      'CommunicationThread',
    ],
    [
      'post',
      '/communications/tickets',
      'createSupportTicket',
      'SupportTicketInput',
      false,
      200,
      'CommunicationReceipt',
    ],
    [
      'get',
      '/communications/tickets',
      'listMySupportTickets',
      null,
      false,
      200,
      'SupportTicketPage',
    ],
    [
      'get',
      '/communications/support/tickets',
      'listSupportTicketQueue',
      null,
      false,
      200,
      'SupportTicketPage',
    ],
    [
      'get',
      '/communications/threads/{id}',
      'getCommunicationThread',
      null,
      false,
      200,
      'CommunicationSnapshot',
    ],
    [
      'get',
      '/communications/threads/{id}/messages',
      'getCommunicationHistory',
      null,
      false,
      200,
      'CommunicationHistory',
    ],
    [
      'post',
      '/communications/threads/{id}/messages',
      'sendCommunicationMessage',
      'SendMessageInput',
      false,
      200,
      'CommunicationReceipt',
    ],
    [
      'put',
      '/communications/threads/{id}/read-cursor',
      'acknowledgeCommunicationHistory',
      'ReadCursorInput',
      false,
      200,
      'CommunicationReadCursor',
    ],
    [
      'post',
      '/communications/tickets/{id}/status',
      'changeSupportTicketStatus',
      'TicketStatusInput',
      false,
      200,
      'CommunicationReceipt',
    ],
  );
}
export function decorateCommunicationPaths(paths) {
  for (const [path, methods] of Object.entries(paths)) {
    if (!path.startsWith('/communications/')) continue;
    for (const [method, operation] of Object.entries(methods)) {
      operation.tags = ['Communications'];
      operation['x-enabled-by-default'] = false;
      operation.description =
        'M7.2 private plain-text history. Requires COMMUNICATIONS_ENABLED and applied communications=m7_2 marker. Job participants only; support access requires current SUPPORT/ADMIN and recent MFA. No push/chat socket publication or native integration is implied.';
      operation.parameters ??= [];
      if (method === 'post' && path !== '/communications/job-conversations')
        operation.parameters.push({
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description:
            'UUID v4. Same actor/action/key and canonical input returns the original immutable receipt after fresh authorization. Changed input conflicts. No automatic key expiry or reuse.',
        });
      if (operation.operationId === 'getCommunicationHistory')
        operation.parameters.push(
          {
            name: 'after',
            in: 'query',
            schema: { type: 'integer', minimum: 0, maximum: 2000, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
          },
        );
      if (
        ['listMySupportTickets', 'listSupportTicketQueue'].includes(
          operation.operationId,
        )
      )
        operation.parameters.push(
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 30, default: 20 },
          },
          {
            name: 'status',
            in: 'query',
            schema: { enum: ['OPEN', 'RESOLVED'] },
          },
        );
      if (path.startsWith('/communications/support/'))
        Object.assign(operation, {
          'x-required-roles': ['SUPPORT', 'ADMIN'],
          'x-recent-mfa-required': true,
        });
      for (const response of Object.values(operation.responses))
        response.headers = {
          ...(response.headers ?? {}),
          'Cache-Control': {
            schema: { const: 'no-store' },
            description:
              'Private communication contents and metadata are not cacheable.',
          },
        };
    }
  }
}
