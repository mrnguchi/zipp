import {
  liveAuth,
  liveSnapshot,
  liveError,
} from '../dist/modules/realtime/contracts/realtime.schemas.js';
import {
  addCommunicationContracts,
  decorateCommunicationPaths,
  communicationEventSchema,
} from './communication-contracts.mjs';
import {
  addCallContracts,
  decorateCallPaths,
  callEventSchema,
} from './call-contracts.mjs';
import {
  addOperationsContracts,
  decorateOperationsPaths,
  operationsEventSchema,
} from './operations-contracts.mjs';
import {
  addNotificationContracts,
  decorateNotificationPaths,
  notificationCommandSchema,
} from './notification-contracts.mjs';
import {
  addDeliveryContracts,
  decorateDeliveryPaths,
  deliveryEventSchema,
  deliveryDispatchCommandSchema,
} from './delivery-contracts.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  addRideContracts,
  rideEventSchema,
  rideDispatchCommandSchema,
} from './ride-contracts.mjs';
import { identitySchemas } from '../dist/modules/identity/contracts/identity.schemas.js';
import { accountSchemas } from '../dist/modules/accounts/contracts/account.schemas.js';
import { driverSchemas } from '../dist/modules/drivers/contracts/driver.schemas.js';
import { pricingSchemas } from '../dist/modules/pricing/contracts/pricing.schemas.js';
import {
  financeSchemas,
  financialPaymentCommand,
} from '../dist/modules/finance/contracts/finance.schemas.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemas = Object.fromEntries(
  Object.entries({
    ...identitySchemas,
    ...accountSchemas,
    ...financeSchemas,
    ...driverSchemas,
    ...pricingSchemas,
  }).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
);
schemas.UpdateProfile.minProperties = 1;
schemas.Error = {
  type: 'object',
  required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string', format: 'uuid' },
    operationId: { type: 'string', format: 'uuid' },
  },
  additionalProperties: false,
};
schemas.Challenge = {
  type: 'object',
  required: ['challengeId', 'next', 'expiresIn'],
  properties: {
    challengeId: { type: 'string', format: 'uuid' },
    next: { enum: ['phone_code', 'two_factor'] },
    expiresIn: { type: 'integer', const: 300 },
  },
};
schemas.TokenPair = {
  type: 'object',
  required: [
    'accessToken',
    'refreshToken',
    'tokenType',
    'expiresIn',
    'sessionId',
    'user',
  ],
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    tokenType: { const: 'Bearer' },
    expiresIn: { type: 'integer', const: 600 },
    sessionId: { type: 'string', format: 'uuid' },
    user: {
      type: 'object',
      required: ['id', 'phone', 'roles'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        phone: { type: 'string' },
        roles: {
          type: 'array',
          items: {
            enum: ['CUSTOMER', 'DRIVER', 'SUPPORT', 'FINANCE', 'ADMIN'],
          },
        },
      },
    },
  },
};
schemas.Profile = {
  type: 'object',
  required: [
    'displayName',
    'language',
    'preferredMode',
    'notificationsEnabled',
    'marketingConsent',
  ],
  properties: {
    displayName: { type: 'string' },
    language: { enum: ['en', 'fr'] },
    preferredMode: { enum: ['customer', 'driver'] },
    notificationsEnabled: { type: 'boolean' },
    marketingConsent: { type: 'boolean' },
  },
};
schemas.Place = {
  ...schemas.SavedPlace,
  required: ['id', 'createdAt', ...schemas.SavedPlace.required],
  properties: {
    ...schemas.SavedPlace.properties,
    id: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};
schemas.PlacePage = {
  type: 'object',
  required: ['items', 'nextCursor'],
  properties: {
    items: { type: 'array', items: { $ref: '#/components/schemas/Place' } },
    nextCursor: { type: ['string', 'null'], format: 'uuid' },
  },
};
schemas.Session = {
  type: 'object',
  required: [
    'userId',
    'sessionId',
    'roles',
    'twoFactorEnabled',
    'mfaVerifiedAt',
  ],
  properties: {
    userId: { type: 'string', format: 'uuid' },
    sessionId: { type: 'string', format: 'uuid' },
    roles: { type: 'array', items: { type: 'string' } },
    twoFactorEnabled: { type: 'boolean' },
    mfaVerifiedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};
schemas.Enrollment = {
  type: 'object',
  required: ['provisioningUri', 'expiresIn'],
  properties: {
    provisioningUri: {
      type: 'string',
      description:
        'Secret enrollment URI; show only to the authenticated account owner and never log/cache.',
    },
    expiresIn: { const: 600 },
  },
};
schemas.RecoveryCodes = {
  type: 'object',
  required: ['recoveryCodes', 'signInRequired'],
  properties: {
    recoveryCodes: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: { type: 'string' },
    },
    signInRequired: { const: true },
  },
};
schemas.FactorAction = {
  type: 'object',
  required: ['success', 'signInRequired'],
  properties: {
    success: { const: true },
    signInRequired: { type: 'boolean' },
    recoveryCodes: { type: 'array', items: { type: 'string' } },
  },
};
schemas.Deletion = {
  type: 'object',
  required: ['status'],
  properties: { status: { const: 'deletion_requested' } },
};

const routes = [
  ['post', '/auth/signup', 'signup', 'Signup', true, 202, 'Challenge'],
  [
    'post',
    '/auth/signup/verify',
    'verifySignup',
    'VerifyCode',
    true,
    200,
    'TokenPair',
  ],
  ['post', '/auth/login', 'login', 'Login', true, 202, 'Challenge'],
  [
    'post',
    '/auth/login/verify',
    'verifyLogin',
    'VerifyCode',
    true,
    200,
    'TokenPair',
  ],
  [
    'post',
    '/auth/challenges/resend',
    'resendCode',
    'ResendCode',
    true,
    202,
    'Challenge',
  ],
  [
    'post',
    '/auth/refresh',
    'refreshSession',
    'Refresh',
    true,
    200,
    'TokenPair',
  ],
  ['post', '/auth/logout', 'logout', 'Logout', false, 204],
  [
    'post',
    '/auth/password/reset',
    'requestReset',
    'Phone',
    true,
    202,
    'Challenge',
  ],
  [
    'post',
    '/auth/password/reset/confirm',
    'confirmReset',
    'ResetPassword',
    true,
    204,
  ],
  [
    'post',
    '/auth/password/change',
    'changePassword',
    'ChangePassword',
    false,
    204,
  ],
  [
    'post',
    '/auth/account-deletion',
    'requestDeletion',
    'Password',
    false,
    202,
    'Deletion',
  ],
  ['get', '/auth/session', 'getSession', null, false, 200, 'Session'],
  [
    'post',
    '/auth/2fa/login',
    'verifyFactorLogin',
    'VerifyFactor',
    true,
    200,
    'TokenPair',
  ],
  [
    'post',
    '/auth/2fa/enroll',
    'enrollFactor',
    'Password',
    false,
    200,
    'Enrollment',
  ],
  [
    'post',
    '/auth/2fa/confirm',
    'confirmFactor',
    'ConfirmFactor',
    false,
    200,
    'RecoveryCodes',
  ],
  [
    'post',
    '/auth/2fa/reauthenticate',
    'reauthenticateFactor',
    'SecureFactor',
    false,
    200,
    'FactorAction',
  ],
  [
    'post',
    '/auth/2fa/disable',
    'disableFactor',
    'SecureFactor',
    false,
    200,
    'FactorAction',
  ],
  [
    'post',
    '/auth/2fa/recovery-codes',
    'rotateRecoveryCodes',
    'SecureFactor',
    false,
    200,
    'FactorAction',
  ],
  ['get', '/accounts/me', 'getProfile', null, false, 200, 'Profile'],
  [
    'patch',
    '/accounts/me',
    'updateProfile',
    'UpdateProfile',
    false,
    200,
    'Profile',
  ],
  [
    'get',
    '/accounts/me/saved-places',
    'listPlaces',
    null,
    false,
    200,
    'PlacePage',
  ],
  [
    'post',
    '/accounts/me/saved-places',
    'createPlace',
    'SavedPlace',
    false,
    201,
    'Place',
  ],
  [
    'patch',
    '/accounts/me/saved-places/{id}',
    'updatePlace',
    'SavedPlace',
    false,
    200,
    'Place',
  ],
  ['delete', '/accounts/me/saved-places/{id}', 'deletePlace', null, false, 204],
];
schemas.FinancialOperation = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'operationType',
    'status',
    'amountXaf',
    'currency',
    'failureCode',
    'createdAt',
    'completedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    operationType: { enum: ['TOP_UP', 'WITHDRAWAL'] },
    status: {
      enum: [
        'AWAITING_APPROVAL',
        'PENDING_CONFIRMATION',
        'CONFIRMED',
        'FAILED',
        'REJECTED',
        'REVIEW_REQUIRED',
      ],
    },
    amountXaf: { type: 'string', pattern: '^[1-9][0-9]*$' },
    currency: { const: 'XAF' },
    failureCode: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    completedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};
schemas.WalletBalance = {
  type: 'object',
  additionalProperties: false,
  required: [
    'currency',
    'postedAmountXaf',
    'reservedAmountXaf',
    'availableAmountXaf',
  ],
  properties: {
    currency: { const: 'XAF' },
    ...Object.fromEntries(
      ['postedAmountXaf', 'reservedAmountXaf', 'availableAmountXaf'].map(
        (name) => [name, { type: 'string', pattern: '^[0-9]+$' }],
      ),
    ),
  },
};
schemas.FinancialOperationPage = {
  type: 'object',
  required: ['items', 'nextCursor'],
  properties: {
    items: {
      type: 'array',
      maxItems: 50,
      items: { $ref: '#/components/schemas/FinancialOperation' },
    },
    nextCursor: { type: ['string', 'null'], format: 'uuid' },
  },
};
schemas.WithdrawalReviewPage = structuredClone(schemas.FinancialOperationPage);
schemas.WithdrawalReviewItem = structuredClone(schemas.FinancialOperation);
schemas.WithdrawalReviewItem.properties.ownerUserId = {
  type: 'string',
  format: 'uuid',
};
schemas.WithdrawalReviewItem.required.push('ownerUserId');
schemas.WithdrawalReviewPage.properties.items.items = {
  $ref: '#/components/schemas/WithdrawalReviewItem',
};
schemas.WalletHistoryPage = {
  type: 'object',
  required: ['items', 'nextCursor'],
  properties: {
    items: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        required: [
          'id',
          'amountXaf',
          'createdAt',
          'ledgerTransactionId',
          'description',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          amountXaf: { type: 'string', pattern: '^-?[0-9]+$' },
          createdAt: { type: 'string', format: 'date-time' },
          ledgerTransactionId: { type: 'string', format: 'uuid' },
          description: { type: 'string' },
        },
      },
    },
    nextCursor: { type: ['string', 'null'], format: 'uuid' },
  },
};
routes.push(
  ['get', '/wallet', 'getWalletBalance', null, false, 200, 'WalletBalance'],
  [
    'get',
    '/wallet/history',
    'listWalletHistory',
    null,
    false,
    200,
    'WalletHistoryPage',
  ],
  [
    'get',
    '/wallet/operations',
    'listFinancialOperations',
    null,
    false,
    200,
    'FinancialOperationPage',
  ],
  [
    'get',
    '/wallet/operations/{id}',
    'getFinancialOperation',
    null,
    false,
    200,
    'FinancialOperation',
  ],
  [
    'post',
    '/wallet/top-ups',
    'requestTopUp',
    'PaymentRequest',
    false,
    202,
    'FinancialOperation',
  ],
  [
    'post',
    '/wallet/withdrawals',
    'requestWithdrawal',
    'PaymentRequest',
    false,
    202,
    'FinancialOperation',
  ],
  [
    'get',
    '/finance/withdrawals',
    'listPendingWithdrawals',
    null,
    false,
    200,
    'WithdrawalReviewPage',
  ],
  [
    'post',
    '/finance/withdrawals/{id}/review',
    'reviewWithdrawal',
    'WithdrawalReview',
    false,
    202,
    'FinancialOperation',
  ],
  [
    'post',
    '/finance/operations/{id}/reconcile',
    'reconcilePayment',
    'PaymentReconciliation',
    false,
    202,
    'FinancialOperation',
  ],
);
const uuid = { type: 'string', format: 'uuid' },
  date = { type: 'string', format: 'date-time' },
  nullableDate = { type: ['string', 'null'], format: 'date-time' };
schemas.DriverDocumentView = {
  type: 'object',
  required: [
    'id',
    'kind',
    'status',
    'contentType',
    'byteLength',
    'contentSha256',
    'documentExpiresAt',
    'uploadExpiresAt',
  ],
  properties: {
    id: uuid,
    kind: schemas.DriverDocumentIntent.properties.kind,
    status: { enum: ['PENDING_UPLOAD', 'STORED', 'APPROVED', 'REJECTED'] },
    contentType: schemas.DriverDocumentIntent.properties.contentType,
    byteLength: { type: 'integer', maximum: 3145728 },
    contentSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    documentExpiresAt: date,
    uploadExpiresAt: date,
  },
};
schemas.DriverApplicationView = {
  type: ['object', 'null'],
  required: [
    'id',
    'status',
    'revision',
    'approvedClasses',
    'vehicle',
    'submittedAt',
    'reviewedAt',
    'documents',
    'reviews',
    'presence',
  ],
  properties: {
    id: uuid,
    status: {
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUSPENDED'],
    },
    revision: { type: 'integer', minimum: 1, maximum: 20 },
    approvedClasses: {
      type: 'array',
      maxItems: 5,
      items: schemas.PriceQuoteRequest.properties.serviceClass,
    },
    vehicle: {
      anyOf: [{ $ref: '#/components/schemas/DriverVehicle' }, { type: 'null' }],
    },
    submittedAt: nullableDate,
    reviewedAt: nullableDate,
    documents: {
      type: 'array',
      maxItems: 20,
      items: { $ref: '#/components/schemas/DriverDocumentView' },
    },
    reviews: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        required: ['revision', 'decision', 'reason', 'createdAt'],
        properties: {
          revision: { type: 'integer' },
          decision: { enum: ['approve', 'reject', 'suspend', 'reopen'] },
          reason: { type: 'string' },
          createdAt: date,
        },
      },
    },
    presence: {
      type: ['object', 'null'],
      properties: {
        online: { type: 'boolean' },
        locationSessionId: uuid,
        sequence: { type: 'integer' },
        sessionExpiresAt: date,
        receivedAt: nullableDate,
      },
    },
  },
};
schemas.DriverApplicationPage = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        required: [
          'id',
          'ownerUserId',
          'status',
          'revision',
          'approvedClasses',
          'submittedAt',
          'reviewedAt',
        ],
        properties: {
          id: uuid,
          ownerUserId: uuid,
          status: schemas.DriverApplicationView.properties.status,
          revision: { type: 'integer' },
          approvedClasses:
            schemas.DriverApplicationView.properties.approvedClasses,
          submittedAt: nullableDate,
          reviewedAt: nullableDate,
        },
      },
    },
    nextCursor: { type: ['string', 'null'], format: 'uuid' },
  },
  required: ['items', 'nextCursor'],
};
schemas.DriverUploadIntent = {
  type: 'object',
  required: ['id', 'uploadExpiresAt', 'uploadPath'],
  properties: {
    id: uuid,
    uploadExpiresAt: date,
    uploadPath: { type: 'string' },
  },
};
schemas.DriverLocationSession = {
  type: 'object',
  required: ['online', 'locationSessionId', 'sessionExpiresAt', 'sequence'],
  properties: {
    online: { type: 'boolean' },
    locationSessionId: uuid,
    sessionExpiresAt: date,
    sequence: { type: 'integer' },
  },
};
schemas.DriverLocationAccepted = {
  type: 'object',
  required: ['acceptedSequence', 'receivedAt', 'freshUntil'],
  properties: {
    acceptedSequence: { type: 'integer' },
    receivedAt: date,
    freshUntil: date,
  },
};
schemas.DriverEligibility = {
  type: 'object',
  required: ['eligible', 'reason'],
  properties: {
    eligible: { type: 'boolean' },
    reason: { type: ['string', 'null'] },
    locationSessionId: uuid,
  },
};
schemas.ServiceAreaView = {
  type: 'object',
  properties: {
    id: uuid,
    code: { type: 'string' },
    name: { type: 'string' },
    minimumLatitude: { type: 'number' },
    maximumLatitude: { type: 'number' },
    minimumLongitude: { type: 'number' },
    maximumLongitude: { type: 'number' },
    developmentOnly: { type: 'boolean' },
    active: { type: 'boolean' },
    createdAt: date,
  },
};
schemas.ServiceAreaPage = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 50,
      items: { $ref: '#/components/schemas/ServiceAreaView' },
    },
  },
};
schemas.PricingPolicyView = {
  type: 'object',
  properties: {
    ...schemas.PricingPolicy.properties,
    id: uuid,
    active: { type: 'boolean' },
  },
};
schemas.QuotePolicySnapshot = {
  type: 'object',
  required: [
    'version',
    'baseFareXaf',
    'perKilometerXaf',
    'perMinuteXaf',
    'minimumFareXaf',
    'nightMultiplierBps',
    'commissionBps',
    'cancellationFeeXaf',
    'night',
    'timeZone',
    'developmentOnly',
  ],
  properties: {
    version: { type: 'string' },
    baseFareXaf: { type: 'string' },
    perKilometerXaf: { type: 'string' },
    perMinuteXaf: { type: 'string' },
    minimumFareXaf: { type: 'string' },
    nightMultiplierBps: { type: 'integer' },
    commissionBps: { type: 'integer' },
    cancellationFeeXaf: { type: 'string' },
    night: { type: 'boolean' },
    timeZone: { const: 'Africa/Douala' },
    developmentOnly: { type: 'boolean' },
  },
};
schemas.PriceQuoteView = {
  type: 'object',
  required: [
    'id',
    'serviceClass',
    'currency',
    'totalAmountXaf',
    'pickup',
    'destination',
    'distanceMeters',
    'durationSeconds',
    'routeVersion',
    'pricingPolicyId',
    'policy',
    'expiresAt',
    'consumed',
    'createdAt',
  ],
  properties: {
    id: uuid,
    serviceClass: schemas.PriceQuoteRequest.properties.serviceClass,
    currency: { const: 'XAF' },
    totalAmountXaf: { type: 'string', pattern: '^[1-9][0-9]*$' },
    pickup: schemas.PriceQuoteRequest.properties.pickup,
    destination: schemas.PriceQuoteRequest.properties.destination,
    distanceMeters: { type: 'integer', minimum: 1, maximum: 200000 },
    durationSeconds: { type: 'integer', minimum: 1, maximum: 43200 },
    routeVersion: { type: 'string' },
    pricingPolicyId: uuid,
    policy: { $ref: '#/components/schemas/QuotePolicySnapshot' },
    expiresAt: date,
    consumed: { type: 'boolean' },
    createdAt: date,
  },
};
routes.push(
  [
    'get',
    '/drivers/me',
    'getMyDriverApplication',
    null,
    false,
    200,
    'DriverApplicationView',
  ],
  [
    'put',
    '/drivers/me/vehicle',
    'saveDriverVehicle',
    'DriverVehicle',
    false,
    200,
    'DriverApplicationView',
  ],
  [
    'post',
    '/drivers/me/submit',
    'submitDriverApplication',
    null,
    false,
    200,
    'DriverApplicationView',
  ],
  [
    'post',
    '/drivers/me/documents',
    'createDriverDocumentIntent',
    'DriverDocumentIntent',
    false,
    201,
    'DriverUploadIntent',
  ],
  [
    'put',
    '/drivers/me/documents/{id}/content',
    'uploadDriverDocument',
    null,
    false,
    204,
  ],
  [
    'put',
    '/drivers/me/availability',
    'setDriverAvailability',
    'DriverAvailability',
    false,
    200,
    'DriverLocationSession',
  ],
  [
    'post',
    '/drivers/me/location',
    'publishDriverLocation',
    'DriverLocation',
    false,
    200,
    'DriverLocationAccepted',
  ],
  [
    'get',
    '/drivers/me/eligibility',
    'getDriverEligibility',
    null,
    false,
    200,
    'DriverEligibility',
  ],
  [
    'get',
    '/driver-documents/{id}/content',
    'downloadDriverDocument',
    null,
    false,
    200,
  ],
  [
    'get',
    '/admin/drivers',
    'listDriverApplications',
    null,
    false,
    200,
    'DriverApplicationPage',
  ],
  [
    'get',
    '/admin/drivers/{id}',
    'getDriverApplication',
    null,
    false,
    200,
    'DriverApplicationView',
  ],
  [
    'post',
    '/admin/drivers/{id}/review',
    'reviewDriverApplication',
    'DriverReview',
    false,
    200,
    'DriverApplicationView',
  ],
  [
    'get',
    '/pricing/service-areas',
    'listServiceAreas',
    null,
    false,
    200,
    'ServiceAreaPage',
  ],
  [
    'post',
    '/pricing/quotes',
    'createPriceQuote',
    'PriceQuoteRequest',
    false,
    201,
    'PriceQuoteView',
  ],
  [
    'get',
    '/pricing/quotes/{id}',
    'getPriceQuote',
    null,
    false,
    200,
    'PriceQuoteView',
  ],
  [
    'post',
    '/admin/pricing/service-areas',
    'createServiceArea',
    'ServiceArea',
    false,
    201,
    'ServiceAreaView',
  ],
  [
    'patch',
    '/admin/pricing/service-areas/{id}',
    'activateServiceArea',
    'ServiceAreaActivation',
    false,
    204,
  ],
  [
    'post',
    '/admin/pricing/policies',
    'publishPricingPolicy',
    'PricingPolicy',
    false,
    201,
    'PricingPolicyView',
  ],
);
addRideContracts(schemas, routes);
addDeliveryContracts(schemas, routes);
addCommunicationContracts(schemas, routes);
addNotificationContracts(schemas, routes);
addCallContracts(schemas, routes);
addOperationsContracts(schemas, routes);
const paths = {};
for (const [
  method,
  path,
  operationId,
  body,
  isPublic,
  status,
  response,
] of routes) {
  const parameters = path.includes('{id}')
    ? [
        {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ]
    : [];
  if (
    [
      'listPlaces',
      'listWalletHistory',
      'listFinancialOperations',
      'listPendingWithdrawals',
      'listDriverApplications',
      'listRides',
    ].includes(operationId)
  )
    parameters.push(
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      {
        name: 'cursor',
        in: 'query',
        required: false,
        schema: { type: 'string', format: 'uuid' },
      },
    );
  if (
    method === 'post' &&
    (path.startsWith('/wallet') || path.startsWith('/finance'))
  )
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description:
        'UUID v4. Reuse with the same validated input for retries. Terminal response window: 24 hours; key identity retained. Expiry returns 409 IDEMPOTENCY_KEY_EXPIRED and operationId; use status lookup. Pending/review work does not expire.',
    });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 413, 429, 500, 503].map((code) => [
      code,
      {
        description:
          'Safe error response; 429/503 may include Retry-After seconds.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    ]),
  );
  paths[path] ??= {};
  const ridePath =
    path.startsWith('/rides') ||
    path.startsWith('/driver/rides') ||
    path.startsWith('/admin/rides');
  if (
    ridePath &&
    method === 'post' &&
    operationId !== 'issueRideCompletionCode'
  )
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description:
        'UUID v4. Same actor/action/key/input recovers the same ride. Changed input conflicts; terminal response window is 24h, key identities remain retained.',
    });
  if (operationId === 'getRideEvents')
    parameters.push({
      name: 'afterVersion',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 0, maximum: 2147483646, default: 0 },
    });
  if (operationId === 'createPriceQuote')
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: uuid,
      description:
        'UUID v4. Same input/key returns the same quote. Quote expires in 120s; a new quote needs a new key. This is separate from financial request retention.',
    });
  paths[path][method] = {
    operationId,
    tags: [
      path.startsWith('/auth')
        ? 'Identity'
        : path.startsWith('/accounts')
          ? 'Accounts'
          : 'Finance',
    ],
    ...(path.startsWith('/finance')
      ? {
          'x-required-roles': ['FINANCE', 'ADMIN'],
          'x-recent-mfa-required': true,
        }
      : {}),
    security: isPublic ? [] : [{ bearerAuth: [] }],
    ...(parameters.length ? { parameters } : {}),
    ...(body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${body}` },
              },
            },
          },
        }
      : {}),
    responses: {
      ...errors,
      [status]: {
        description:
          status === 204
            ? 'Completed without a response body'
            : 'Successful result; no-store',
        ...(response
          ? {
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${response}` },
                },
              },
            }
          : {}),
      },
    },
  };
  if (path.startsWith('/drivers') || path.startsWith('/driver-documents'))
    paths[path][method].tags = ['Drivers'];
  if (path.startsWith('/pricing') || path.startsWith('/admin/pricing'))
    paths[path][method].tags = ['Pricing'];
  if (path.startsWith('/admin/'))
    Object.assign(paths[path][method], {
      'x-required-roles': ['ADMIN'],
      'x-recent-mfa-required': true,
    });
  if (ridePath) paths[path][method].tags = ['Rides'];
  if (path.startsWith('/driver/rides'))
    paths[path][method]['x-required-roles'] = ['DRIVER'];
  if (operationId === 'uploadDriverDocument')
    paths[path][method].requestBody = {
      required: true,
      content: {
        'application/octet-stream': {
          schema: { type: 'string', format: 'binary', maxLength: 3145728 },
        },
      },
      description:
        'Raw bytes only, exact Content-Length from intent; private local storage must be enabled. No multipart/base64 or client paths.',
    };
  if (operationId === 'downloadDriverDocument')
    paths[path][method].responses[200] = {
      description:
        'Private attachment; owner or recent-MFA ADMIN. no-store/nosniff.',
      content: Object.fromEntries(
        ['image/jpeg', 'image/png', 'application/pdf'].map((type) => [
          type,
          { schema: { type: 'string', format: 'binary' } },
        ]),
      ),
    };
}
decorateDeliveryPaths(paths);
decorateCommunicationPaths(paths);
decorateNotificationPaths(paths);
decorateCallPaths(paths);
decorateOperationsPaths(paths);
const directory = resolve(root, 'contracts');
mkdirSync(directory, { recursive: true });
writeFileSync(
  resolve(directory, 'delivery-event.schema.json'),
  JSON.stringify(deliveryEventSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'delivery-dispatch-command.schema.json'),
  JSON.stringify(deliveryDispatchCommandSchema, null, 2) + '\n',
);
mkdirSync(directory, { recursive: true });
writeFileSync(
  resolve(directory, 'ride-event.schema.json'),
  JSON.stringify(rideEventSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'ride-dispatch-command.schema.json'),
  JSON.stringify(rideDispatchCommandSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'openapi.json'),
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Zipp API',
        version: '1.0.0',
        description:
          'M2 identity/accounts, M3 finance, M4 drivers/pricing and M5 rides/dispatch, M6 deliveries and M7.1 live participant contracts; runtime verification pending. Local OTP/payment/storage/routing adapters are not production providers. Financial 202 responses represent persisted operations, not confirmation of payment. M4 quotes expire in two minutes and use labelled development fares.',
      },
      'x-realtime': {
        path: '/api/v1/live/socket.io',
        transport: 'websocket-only',
        enabledByDefault: false,
        handshake: 'realtime-handshake.schema.json',
        events: {
          'job.snapshot': 'realtime-snapshot.schema.json',
          'live.error': 'realtime-error.schema.json',
        },
        description:
          'M7.1 minimal participant projections; reauthenticate and reauthorize every cycle. Read-only. Reconnect via current JWT and REST resync; public capability tokens are excluded. No chat/calling/media claim.',
      },
      servers: [{ url: '/api/v1' }],
      paths,
      components: {
        securitySchemes: {
          deliveryTracking: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'delivery capability',
          },
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas,
      },
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  resolve(directory, 'identity-event.schema.json'),
  JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'Identity event envelope v1 (future outbox integration)',
      description:
        'Reserved contract only. M2 persists audit records; no realtime/outbox event publisher is enabled.',
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'type',
        'schemaVersion',
        'aggregateId',
        'aggregateVersion',
        'occurredAt',
        'payload',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        type: {
          enum: [
            'identity.phone_verified',
            'identity.password_changed',
            'identity.sessions_revoked',
            'identity.deletion_requested',
          ],
        },
        schemaVersion: { const: 1 },
        aggregateId: { type: 'string', format: 'uuid' },
        aggregateVersion: { type: 'integer', minimum: 1 },
        occurredAt: { type: 'string', format: 'date-time' },
        payload: {
          type: 'object',
          additionalProperties: false,
          required: ['userId'],
          properties: { userId: { type: 'string', format: 'uuid' } },
        },
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Generated API, financial command and reserved identity event contracts; no tests or database operations executed.',
);
writeFileSync(
  resolve(directory, 'financial-payment-command.schema.json'),
  JSON.stringify(
    {
      title: 'Internal financial payment command v1',
      description:
        'BullMQ payload only. ID references the persisted PostgreSQL outbox event; operation/provider state must be loaded from storage. Not a public realtime event.',
      ...z.toJSONSchema(financialPaymentCommand),
    },
    null,
    2,
  ) + '\n',
);

for (const [name, schema] of Object.entries({
  'realtime-handshake': liveAuth,
  'realtime-snapshot': liveSnapshot,
  'realtime-error': liveError,
}))
  writeFileSync(
    resolve(directory, name + '.schema.json'),
    JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n',
  );
writeFileSync(
  resolve(directory, 'communication-event.schema.json'),
  JSON.stringify(communicationEventSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'notification-command.schema.json'),
  JSON.stringify(notificationCommandSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'call-event.schema.json'),
  JSON.stringify(callEventSchema, null, 2) + '\n',
);
writeFileSync(
  resolve(directory, 'operations-event.schema.json'),
  JSON.stringify(operationsEventSchema, null, 2) + '\n',
);
