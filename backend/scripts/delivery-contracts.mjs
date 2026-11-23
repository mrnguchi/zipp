import { z } from 'zod';
import {
  deliverySchemas,
  deliveryDispatchCommand,
} from '../dist/modules/deliveries/contracts/delivery.schemas.js';
const uuid = { type: 'string', format: 'uuid' },
  date = { type: 'string', format: 'date-time' },
  nullableDate = { type: ['string', 'null'], format: 'date-time' },
  amount = { type: 'string', pattern: '^[0-9]+$' },
  point = {
    type: 'object',
    required: ['latitude', 'longitude'],
    properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
    },
  };
const status = {
    enum: [
      'SEARCHING',
      'ASSIGNED',
      'AT_PICKUP',
      'COLLECTED',
      'IN_TRANSIT',
      'AT_DESTINATION',
      'RETURNING',
      'AT_RETURN',
      'DELIVERED',
      'RETURNED',
      'CANCELLED',
      'NO_COURIER',
    ],
  },
  custody = {
    enum: [
      'WITH_SENDER',
      'WITH_COURIER',
      'WITH_RECIPIENT',
      'RETURNED_TO_SENDER',
    ],
  },
  contact = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'phone'],
    properties: {
      name: { type: 'string' },
      phone: { type: ['string', 'null'] },
    },
  };
export const deliveryEventSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Delivery persisted notification envelope v1',
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
    id: uuid,
    type: {
      enum: [
        'delivery.booked',
        'delivery.dispatch_wave',
        'delivery.assigned',
        'delivery.at_pickup',
        'delivery.collected',
        'delivery.in_transit',
        'delivery.at_destination',
        'delivery.delivered',
        'delivery.cancelled',
        'delivery.no_driver',
        'delivery.issue_opened',
        'delivery.return_authorized',

        'delivery.at_return',
        'delivery.returned',
        'delivery.refunded',
        'delivery.contact_claimed',
      ],
    },
    schemaVersion: { const: 1 },
    aggregateId: uuid,
    aggregateVersion: { type: 'integer', minimum: 1 },
    occurredAt: date,
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['deliveryId'],
      properties: { deliveryId: uuid },
    },
  },
  description:
    'Persisted versioned REST resync contract. No PIN, contact, photo, token or GPS in event payload. Socket/push integration is deferred.',
};
export const deliveryDispatchCommandSchema = {
  title: 'Internal delivery dispatch command v1',
  ...z.toJSONSchema(deliveryDispatchCommand),
};
export function addDeliveryContracts(schemas, routes) {
  for (const [name, s] of Object.entries(deliverySchemas))
    schemas[name] = z.toJSONSchema(s);
  schemas.DeliveryView = {
    type: 'object',
    additionalProperties: false,
    required: [
      'viewerRole',
      'id',
      'status',
      'custody',
      'version',
      'perspective',
      'serviceClass',
      'sender',
      'recipient',
      'package',
      'pickup',
      'destination',
      'createdAt',
      'assignedAt',
      'collectedAt',
      'completedAt',
    ],
    properties: {
      viewerRole: { enum: ['BOOKER', 'SENDER', 'RECIPIENT', 'COURIER'] },
      id: uuid,
      status,
      custody,
      version: { type: 'integer', minimum: 1 },
      perspective: { enum: ['SENDING', 'RECEIVING'] },
      serviceClass: { enum: ['DELIVERY_STANDARD', 'DELIVERY_EXPRESS'] },
      sender: contact,
      recipient: contact,
      package: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'size', 'weightGrams', 'photoId'],
        properties: {
          description: { type: 'string', maxLength: 300 },
          size: { enum: ['SMALL', 'MEDIUM', 'LARGE'] },
          weightGrams: { type: 'integer', minimum: 1, maximum: 20000 },
          photoId: { type: ['string', 'null'], format: 'uuid' },
        },
      },
      pickup: point,
      destination: point,
      currency: { const: 'XAF' },
      quotedAmountXaf: amount,
      cancellationFeeXaf: amount,
      chargedAmountXaf: amount,
      refundedAmountXaf: amount,
      createdAt: date,
      assignedAt: nullableDate,
      collectedAt: nullableDate,
      completedAt: nullableDate,
    },
    description:
      'Phones are purpose-limited: booker/current courier see both, contacts see their own. Money only for booker. Terminal courier photo access is removed.',
  };
  schemas.DeliveryPage = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 50,
        items: { $ref: '#/components/schemas/DeliveryView' },
      },
      nextCursor: { type: ['string', 'null'], format: 'uuid' },
    },
  };
  schemas.DeliveryCodeAcknowledgement = {
    type: 'object',
    additionalProperties: false,
    required: ['requestId', 'purpose', 'expiresAt'],
    properties: {
      requestId: uuid,
      purpose: { enum: ['PICKUP', 'HANDOVER', 'RETURN'] },
      expiresAt: date,
    },
    description:
      'No raw code is returned. Code is sent only to the immutable purpose-specific contact phone; local development mailbox simulates delivery.',
  };
  schemas.DeliveryCapabilityIssued = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'expiresAt', 'revokedAt'],
    properties: {
      id: uuid,
      expiresAt: date,
      revokedAt: nullableDate,
    },
    description:
      'Client generates id and 256-bit secret; API returns metadata only. Retry identical input with the same id. Never put a capability in a URL.',
  };
  schemas.DeliveryPublicTracking = {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'custody',
      'updatedVersion',
      'createdAt',
      'completedAt',
      'position',
    ],
    properties: {
      status,
      custody,
      updatedVersion: { type: 'integer', minimum: 1 },
      createdAt: date,
      completedAt: nullableDate,
      position: {
        oneOf: [
          { type: 'null' },
          {
            ...point,
            properties: { ...point.properties, receivedAt: nullableDate },
          },
        ],
      },
    },
    description:
      'Coarse three-decimal coordinates only during courier custody, none after terminal outcome. No contacts, identities, package photo, code or money.',
  };
  schemas.DeliveryOfferResult = {
    type: 'object',
    additionalProperties: false,
    required: ['deliveryId', 'status'],
    properties: {
      deliveryId: uuid,
      status: { enum: ['ACCEPTED', 'DECLINED'] },
    },
  };
  schemas.DeliveryOffers = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: uuid,
            deliveryId: uuid,
            expiresAt: date,
            serviceClass: { enum: ['DELIVERY_STANDARD', 'DELIVERY_EXPRESS'] },
            pickup: point,
            packageSize: { enum: ['SMALL', 'MEDIUM', 'LARGE'] },
            packageWeightGrams: { type: 'integer' },
            quotedAmountXaf: amount,
          },
        },
      },
    },
  };
  schemas.DeliveryPhotoIntentResult = {
    type: 'object',
    properties: {
      id: uuid,
      byteLength: { type: 'integer', maximum: 3145728 },
      uploadExpiresAt: date,
    },
  };
  schemas.DeliveryPhotoStored = {
    type: 'object',
    properties: { id: uuid, status: { const: 'STORED' } },
  };
  schemas.DeliveryPosition = {
    type: 'object',
    properties: {
      deliveryId: uuid,
      status,
      custody,
      version: { type: 'integer' },
      position: {
        oneOf: [
          { type: 'null' },
          {
            ...point,
            properties: {
              ...point.properties,
              receivedAt: nullableDate,
              stale: { type: 'boolean' },
            },
          },
        ],
      },
    },
  };
  schemas.DeliveryEvents = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            id: uuid,
            deliveryId: uuid,
            aggregateVersion: { type: 'integer' },
            schemaVersion: { const: 1 },
            eventType: deliveryEventSchema.properties.type,
            occurredAt: date,
          },
        },
      },
      nextVersion: { type: 'integer' },
    },
  };
  schemas.DeliveryIssuePage = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            id: uuid,
            kind: {
              enum: ['RECIPIENT_UNREACHABLE', 'RETURN_REQUEST', 'DISPUTE'],
            },
            reason: { type: 'string' },
            resolution: { type: ['string', 'null'] },
            resolutionReason: { type: ['string', 'null'] },
            createdAt: date,
            resolvedAt: nullableDate,
          },
        },
      },
    },
  };
  schemas.DeliveryReceipt = {
    type: 'object',
    properties: {
      deliveryId: uuid,
      currency: { const: 'XAF' },
      quotedAmountXaf: amount,
      chargedAmountXaf: amount,
      refundedAmountXaf: amount,
      netAmountXaf: amount,
      status,
      completedAt: date,
      rating: {
        type: ['object', 'null'],
        properties: {
          stars: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: ['string', 'null'] },
          createdAt: date,
        },
      },
    },
  };
  schemas.DeliveryCapabilityPage = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            id: uuid,
            expiresAt: date,
            revokedAt: nullableDate,
            createdAt: date,
          },
        },
      },
    },
  };
  schemas.DeliveryRevoked = {
    type: 'object',
    properties: { revoked: { const: true } },
  };
  schemas.DeliveryOperationResult = {
    type: 'object',
    properties: { id: uuid, status, version: { type: 'integer' } },
  };
  schemas.DeliveryLocationSession = {
    type: 'object',
    properties: {
      locationSessionId: uuid,
      sessionExpiresAt: date,
      sequence: { type: 'integer' },
      receivedAt: nullableDate,
    },
  };
  schemas.DeliveryReviewView = {
    type: 'object',
    description:
      'Recent-MFA ADMIN review, audited; bounded issues and dispatch recovery metadata.',
    properties: {
      id: uuid,
      status,
      custody,
      version: { type: 'integer' },
      chargedAmountXaf: amount,
      refundedAmountXaf: amount,
      issues: { type: 'array', maxItems: 10, items: { type: 'object' } },
      dispatch: { type: ['object', 'null'] },
    },
  };
  const add = (
    m,
    p,
    id,
    b = null,
    out = 'DeliveryView',
    code = 200,
    pub = false,
  ) => routes.push([m, p, id, b, pub, code, out]);
  add(
    'post',
    '/deliveries',
    'bookDelivery',
    'BookDelivery',
    'DeliveryView',
    202,
  );
  add('get', '/deliveries', 'listDeliveries', null, 'DeliveryPage');
  add('get', '/deliveries/active', 'activeDeliveries', null, 'DeliveryPage');
  for (const [suffix, id, out] of [
    ['', 'getDelivery', 'DeliveryView'],
    ['/events', 'getDeliveryEvents', 'DeliveryEvents'],
    ['/tracking', 'getDeliveryTracking', 'DeliveryPosition'],
    ['/receipt', 'getDeliveryReceipt', 'DeliveryReceipt'],
    ['/issues', 'listDeliveryIssues', 'DeliveryIssuePage'],
  ])
    add('get', '/deliveries/{id}' + suffix, id, null, out);
  for (const [suffix, id, body, out] of [
    ['cancel', 'cancelDelivery', 'DeliveryCancellation', 'DeliveryView'],
    [
      'contact-codes',
      'issueDeliveryCode',
      'DeliveryCodeRequest',
      'DeliveryCodeAcknowledgement',
    ],
    [
      'claim-contact',
      'claimDeliveryContact',
      'DeliveryContactClaim',
      'DeliveryView',
    ],
    ['issues', 'openDeliveryIssue', 'DeliveryIssue', 'DeliveryView'],
    ['rating', 'rateDelivery', 'DeliveryRating', 'DeliveryView'],
    [
      'tracking-capabilities',
      'shareDeliveryTracking',
      'DeliveryTrackingCapability',
      'DeliveryCapabilityIssued',
    ],
  ])
    add(
      'post',
      '/deliveries/{id}/' + suffix,
      id,
      body,
      out,
      suffix === 'tracking-capabilities' ? 201 : 200,
    );
  add(
    'get',
    '/deliveries/{id}/tracking-capabilities',
    'listDeliveryCapabilities',
    null,
    'DeliveryCapabilityPage',
  );
  add(
    'delete',
    '/deliveries/{id}/tracking-capabilities/{capId}',
    'revokeDeliveryCapability',
    null,
    'DeliveryRevoked',
  );
  add(
    'get',
    '/courier/deliveries/offers',
    'listDeliveryOffers',
    null,
    'DeliveryOffers',
  );
  for (const action of ['accept', 'decline'])
    add(
      'post',
      '/courier/deliveries/offers/{id}/' + action,
      action + 'DeliveryOffer',
      null,
      'DeliveryOfferResult',
    );
  for (const action of [
    'arrive-pickup',
    'collect',
    'transit',
    'arrive-destination',
    'deliver',
    'arrive-return',
    'confirm-return',
  ])
    add(
      'post',
      '/courier/deliveries/{id}/' + action,
      'courierDelivery' + action.replaceAll('-', '_'),
      ['collect', 'deliver', 'confirm-return'].includes(action)
        ? 'DeliveryProof'
        : null,
    );
  add(
    'post',
    '/courier/deliveries/{id}/custody-location-session',
    'deliveryCustodyEpoch',
    null,
    'DeliveryLocationSession',
  );
  add(
    'post',
    '/courier/deliveries/{id}/custody-location',
    'deliveryCustodyLocation',
    'DriverLocation',
    'DeliveryLocationSession',
  );
  add(
    'get',
    '/admin/deliveries/{id}',
    'inspectDelivery',
    null,
    'DeliveryReviewView',
  );
  for (const [path, id, body] of [
    [
      'authorize-return',
      'authorizeDeliveryReturn',
      'DeliveryReturnAuthorization',
    ],
    ['refund', 'refundDelivery', 'DeliveryRefund'],
    ['retry-dispatch', 'retryDeliveryDispatch', 'DeliveryCancellation'],
  ])
    add(
      'post',
      '/admin/deliveries/{id}/' + path,
      id,
      body,
      'DeliveryOperationResult',
    );
  add(
    'post',
    '/delivery-photos',
    'createDeliveryPhotoIntent',
    'DeliveryPhotoIntent',
    'DeliveryPhotoIntentResult',
    201,
  );
  add(
    'put',
    '/delivery-photos/{id}/content',
    'uploadDeliveryPhoto',
    null,
    'DeliveryPhotoStored',
  );
  add(
    'get',
    '/delivery-photos/{id}/content',
    'downloadDeliveryPhoto',
    null,
    null,
  );
  add(
    'get',
    '/delivery-tracking',
    'getPublicDeliveryTracking',
    null,
    'DeliveryPublicTracking',
    200,
    true,
  );
}
export function decorateDeliveryPaths(paths) {
  for (const [path, methods] of Object.entries(paths))
    for (const [method, op] of Object.entries(methods)) {
      if (
        !/^\/(deliveries|courier\/deliveries|admin\/deliveries|delivery-photos|delivery-tracking)(\/|$)/.test(
          path,
        )
      )
        continue;
      op.tags = ['Deliveries'];
      const id = op.operationId;
      if (path.includes('{capId}'))
        (op.parameters ??= []).push({
          name: 'capId',
          in: 'path',
          required: true,
          schema: uuid,
        });
      if (id === 'listDeliveries')
        (op.parameters ??= []).push(
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          { name: 'cursor', in: 'query', schema: uuid },
        );
      if (id === 'getDeliveryEvents')
        (op.parameters ??= []).push({
          name: 'afterVersion',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 0,
            maximum: 2147483646,
            default: 0,
          },
        });
      if (
        method === 'post' &&
        ![
          'issueDeliveryCode',
          'shareDeliveryTracking',
          'deliveryCustodyEpoch',
          'deliveryCustodyLocation',
          'createDeliveryPhotoIntent',
        ].includes(id)
      )
        (op.parameters ??= []).push({
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: uuid,
          description:
            'UUID v4; retained actor/action identity, same input on retries. Terminal recovery window 24h; expired identity cannot be reused.',
        });
      if (
        [
          'listDeliveryOffers',
          'acceptDeliveryOffer',
          'courierDeliveryarrive_pickup',
          'courierDeliverycollect',
        ].includes(id)
      )
        op['x-required-roles'] = ['DRIVER'];
      if (id === 'getPublicDeliveryTracking') {
        op.security = [{ deliveryTracking: [] }];
        op.description =
          'Reviewed capability-only route. Account access tokens do not authorize it. Authorization: Bearer <id.secret>; no URL token. Read-only coarse custody view.';
      }
      if (id === 'uploadDeliveryPhoto') {
        op.requestBody = {
          required: true,
          content: {
            'application/octet-stream': {
              schema: { type: 'string', format: 'binary', maxLength: 3145728 },
            },
          },
        };
        (op.parameters ??= []).push({
          name: 'Content-Length',
          in: 'header',
          required: true,
          schema: { type: 'integer', minimum: 16, maximum: 3145728 },
        });
      }
      if (id === 'downloadDeliveryPhoto')
        op.responses[200] = {
          description:
            'Authorized participant attachment; active courier only. no-store/nosniff.',
          content: {
            'image/jpeg': { schema: { type: 'string', format: 'binary' } },
            'image/png': { schema: { type: 'string', format: 'binary' } },
          },
        };
    }
}
