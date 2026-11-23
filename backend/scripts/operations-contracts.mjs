import { z } from 'zod';
import {
  operationsSchemas,
  eventView,
} from '../dist/modules/operations/contracts/operations.schemas.js';
export function addOperationsContracts(schemas, routes) {
  Object.assign(
    schemas,
    Object.fromEntries(
      Object.entries(operationsSchemas).map(([n, s]) => [n, z.toJSONSchema(s)]),
    ),
  );
  routes.push(
    [
      'get',
      '/operations/capabilities',
      'getOperationsCapabilities',
      null,
      false,
      200,
      'OperationsCapabilities',
    ],
    [
      'get',
      '/operations/subjects/{type}/{id}',
      'getOperationsSubject',
      null,
      false,
      200,
      'OperationsSubject',
    ],
    [
      'get',
      '/operations/cases',
      'listOperationsCases',
      null,
      false,
      200,
      'OperationsCasePage',
    ],
    [
      'post',
      '/operations/cases',
      'openOperationsCase',
      'OpenOperationsCase',
      false,
      200,
      'OperationsReceipt',
    ],
    [
      'get',
      '/operations/cases/{id}',
      'getOperationsCase',
      null,
      false,
      200,
      'OperationsCase',
    ],
    [
      'get',
      '/operations/cases/{id}/events',
      'getOperationsCaseEvents',
      null,
      false,
      200,
      'OperationsEventPage',
    ],
    [
      'post',
      '/operations/cases/{id}/reviews',
      'reviewOperationsCase',
      'ReviewOperationsCase',
      false,
      200,
      'OperationsReceipt',
    ],
    [
      'post',
      '/operations/cases/{id}/account-status',
      'changeOperationsAccount',
      'ChangeOperationsAccount',
      false,
      200,
      'OperationsReceipt',
    ],
    [
      'get',
      '/operations/finance/report',
      'getOperationsFinanceReport',
      null,
      false,
      200,
      'OperationsFinanceReport',
    ],
  );
}
export function decorateOperationsPaths(paths) {
  for (const [p, methods] of Object.entries(paths))
    if (p.startsWith('/operations/'))
      for (const [m, op] of Object.entries(methods)) {
        op.tags = ['Operations'];
        op['x-enabled-by-default'] = false;
        op.description =
          'Requires current staff role and recent MFA. SUPPORT cannot inspect finance; FINANCE cannot inspect support/job cases. Manual review metadata is not proven fraud. Audited/no-store. Reuse owning action routes; no arbitrary ledger or custody override.';
        op.parameters ??= [];
        if (m === 'post')
          op.parameters.push({
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description:
              'Actor/action-scoped UUID v4. Immutable receipt; fresh authorization before replay; changed input conflicts. No expiry/reuse.',
          });
        if (p.includes('{type}')) {
          op.parameters = op.parameters.filter((v) => v.name !== 'type');
          op.parameters.push(
            {
              name: 'type',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                enum: ['ACCOUNT', 'DRIVER', 'RIDE', 'DELIVERY', 'PAYMENT'],
              },
            },
            {
              name: 'reasonCode',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
                enum: [
                  'SAFETY_CONCERN',
                  'SERVICE_COMPLAINT',
                  'DUPLICATE_ACTIVITY',
                  'PAYMENT_MISMATCH',
                  'REVIEW_COMPLETED',
                  'INSUFFICIENT_EVIDENCE',
                  'OTHER',
                ],
              },
            },
          );
        }
        if (m === 'get' && (p.endsWith('/cases') || p.endsWith('/report')))
          op.parameters.push(
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            {
              name: 'afterId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
            },
          );
        if (p.endsWith('/cases') && m === 'get')
          op.parameters.push(
            {
              name: 'subjectType',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['ACCOUNT', 'DRIVER', 'RIDE', 'DELIVERY', 'PAYMENT'],
              },
            },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
              },
            },
          );
        if (p.endsWith('/events'))
          op.parameters.push(
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
            {
              name: 'afterVersion',
              in: 'query',
              schema: {
                type: 'integer',
                minimum: 0,
                maximum: 1000,
                default: 0,
              },
            },
          );
      }
}
export const operationsEventSchema = {
  ...z.toJSONSchema(eventView),
  title: 'Persisted operations case event v1',
  description:
    'Append-only metadata intent; no freeform case description/contact/financial secret. Not a published job/provider command.',
};
