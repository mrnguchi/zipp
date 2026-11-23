import { z } from 'zod';
import {
  rideSchemas,
  rideWorkCommand,
} from '../dist/modules/rides/contracts/ride.schemas.js';
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
export const rideEventSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Ride notification/outbox envelope v1',
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
        'ride.booked',
        'ride.dispatch_wave',
        'ride.assigned',
        'ride.arrived',
        'ride.started',
        'ride.completion_code_changed',
        'ride.completed',
        'ride.cancelled',
        'ride.no_driver',
        'ride.dispute_opened',
        'ride.dispute_released',
        'ride.refunded',
      ],
    },
    schemaVersion: { const: 1 },
    aggregateId: uuid,
    aggregateVersion: { type: 'integer', minimum: 1 },
    occurredAt: date,
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['rideId'],
      properties: { rideId: uuid },
    },
  },
  description:
    'Persisted/versioned notification history for participant REST resync. Fetch the current authorized snapshot. No PIN, precise GPS or contact in payload; no Socket.IO/native delivery claim.',
};
export const rideDispatchCommandSchema = {
  title: 'Internal ride dispatch command v1',
  description:
    'Queue reference only; worker reloads the persisted job/task/offer state.',
  ...z.toJSONSchema(rideWorkCommand),
};
export function addRideContracts(schemas, routes) {
  for (const [name, schema] of Object.entries(rideSchemas))
    schemas[name] = z.toJSONSchema(schema);
  schemas.RideView = {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'status',
      'version',
      'customerUserId',
      'driverUserId',
      'serviceClass',
      'currency',
      'quotedAmountXaf',
      'chargedAmountXaf',
      'cancellationFeeXaf',
      'pickup',
      'destination',
      'distanceMeters',
      'durationSeconds',
      'pricingPolicyVersion',
      'searchExpiresAt',
      'createdAt',
      'assignedAt',
      'arrivedAt',
      'startedAt',
      'completedAt',
      'cancellationReason',
    ],
    properties: {
      id: uuid,
      status: {
        enum: [
          'SEARCHING',
          'ASSIGNED',
          'ARRIVED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
          'NO_DRIVER',
        ],
      },
      version: { type: 'integer', minimum: 1 },
      customerUserId: uuid,
      driverUserId: { type: ['string', 'null'], format: 'uuid' },
      serviceClass: { enum: ['EVERYDAY', 'COMFORT', 'PREMIUM'] },
      currency: { const: 'XAF' },
      quotedAmountXaf: amount,
      chargedAmountXaf: amount,
      cancellationFeeXaf: amount,
      pickup: point,
      destination: point,
      distanceMeters: { type: 'integer' },
      durationSeconds: { type: 'integer' },
      pricingPolicyVersion: { type: 'string' },
      searchExpiresAt: date,
      createdAt: date,
      assignedAt: nullableDate,
      arrivedAt: nullableDate,
      startedAt: nullableDate,
      completedAt: nullableDate,
      cancellationReason: { type: ['string', 'null'] },
    },
  };
  schemas.RidePage = {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: {
        type: 'array',
        maxItems: 50,
        items: { $ref: '#/components/schemas/RideView' },
      },
      nextCursor: { type: ['string', 'null'], format: 'uuid' },
    },
  };
  schemas.ActiveRides = {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: 10,
        items: { $ref: '#/components/schemas/RideView' },
      },
    },
  };
  schemas.RideEvent = rideEventSchema;
  schemas.RideSnapshot = structuredClone(schemas.RideView);
  Object.assign(schemas.RideSnapshot.properties, {
    rating: {
      type: ['object', 'null'],
      properties: {
        stars: { type: 'integer', minimum: 1, maximum: 5 },
        comment: { type: ['string', 'null'] },
        createdAt: date,
      },
    },
    dispute: {
      type: ['object', 'null'],
      properties: {
        reason: { type: 'string' },
        resolution: { type: ['string', 'null'] },
        resolutionReason: { type: ['string', 'null'] },
        resolvedAt: nullableDate,
        createdAt: date,
      },
    },
    events: {
      type: 'array',
      maxItems: 10,
      items: { $ref: '#/components/schemas/RideEvent' },
    },
    dispatch: {
      type: ['object', 'null'],
      properties: {
        reviewRequired: { type: 'boolean' },
        availableAt: date,
        completedAt: nullableDate,
      },
    },
  });
  schemas.RideSnapshot.required.push('rating', 'dispute', 'events', 'dispatch');
  schemas.RideEventPage = {
    type: 'object',
    required: ['rideId', 'currentVersion', 'items', 'nextAction'],
    properties: {
      rideId: uuid,
      currentVersion: { type: 'integer' },
      items: {
        type: 'array',
        maxItems: 50,
        items: { $ref: '#/components/schemas/RideEvent' },
      },
      nextAction: { type: 'string' },
    },
  };
  schemas.RideTracking = {
    type: 'object',
    required: ['rideId', 'available'],
    properties: {
      rideId: uuid,
      available: { type: 'boolean' },
      reason: { type: 'string' },
      stale: { type: 'boolean' },
      version: { type: 'integer' },
      location: {
        type: 'object',
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          accuracyMeters: { type: 'number' },
          capturedAt: date,
          receivedAt: date,
          freshUntil: date,
          sequence: { type: 'integer' },
          locationSessionId: uuid,
        },
      },
    },
  };
  schemas.RideReceipt = {
    type: 'object',
    required: [
      'rideId',
      'status',
      'currency',
      'quotedAmountXaf',
      'chargedAmountXaf',
      'refundedAmountXaf',
      'netPaidAmountXaf',
      'pricingPolicyVersion',
      'completedAt',
    ],
    properties: {
      rideId: uuid,
      status: schemas.RideView.properties.status,
      currency: { const: 'XAF' },
      quotedAmountXaf: amount,
      chargedAmountXaf: amount,
      refundedAmountXaf: amount,
      netPaidAmountXaf: amount,
      driverEarningsXaf: amount,
      platformCommissionXaf: amount,
      pricingPolicyVersion: { type: 'string' },
      completedAt: date,
    },
  };
  schemas.RideCompletionCode = {
    type: 'object',
    additionalProperties: false,
    required: ['rideId', 'pin', 'expiresAt'],
    properties: {
      rideId: uuid,
      pin: { type: 'string', pattern: '^[0-9]{6}$' },
      expiresAt: date,
    },
    description:
      'Customer-only, no-store response. Never log/persist/share in an event. One code/minute and three/hour; raw code returned only on issuance.',
  };
  schemas.DriverRideOffers = {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'rideId',
            'serviceClass',
            'pickup',
            'quotedAmountXaf',
            'currency',
            'radiusMeters',
            'expiresAt',
          ],
          properties: {
            id: uuid,
            rideId: uuid,
            serviceClass: schemas.RideView.properties.serviceClass,
            pickup: point,
            quotedAmountXaf: amount,
            currency: { const: 'XAF' },
            radiusMeters: { type: 'integer' },
            expiresAt: date,
          },
        },
      },
    },
  };
  schemas.RideOfferDeclined = {
    type: 'object',
    required: ['offerId', 'status'],
    properties: { offerId: uuid, status: { const: 'DECLINED' } },
  };
  routes.push(
    ['post', '/rides', 'bookRide', 'BookRide', false, 202, 'RideView'],
    ['get', '/rides', 'listRides', null, false, 200, 'RidePage'],
    ['get', '/rides/active', 'getActiveRides', null, false, 200, 'ActiveRides'],
    ['get', '/rides/{id}', 'getRideSnapshot', null, false, 200, 'RideSnapshot'],
    [
      'get',
      '/rides/{id}/events',
      'getRideEvents',
      null,
      false,
      200,
      'RideEventPage',
    ],
    [
      'get',
      '/rides/{id}/tracking',
      'getRideTracking',
      null,
      false,
      200,
      'RideTracking',
    ],
    [
      'get',
      '/rides/{id}/receipt',
      'getRideReceipt',
      null,
      false,
      200,
      'RideReceipt',
    ],
    [
      'post',
      '/rides/{id}/cancel',
      'cancelRide',
      'RideCancellation',
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/rides/{id}/completion-pin',
      'issueRideCompletionCode',
      null,
      false,
      200,
      'RideCompletionCode',
    ],
    [
      'post',
      '/rides/{id}/rating',
      'rateRide',
      'RideRating',
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/rides/{id}/disputes',
      'openRideDispute',
      'RideDispute',
      false,
      200,
      'RideView',
    ],
    [
      'get',
      '/driver/rides/offers',
      'listDriverRideOffers',
      null,
      false,
      200,
      'DriverRideOffers',
    ],
    [
      'post',
      '/driver/rides/offers/{id}/accept',
      'acceptRideOffer',
      null,
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/driver/rides/offers/{id}/decline',
      'declineRideOffer',
      null,
      false,
      200,
      'RideOfferDeclined',
    ],
    [
      'post',
      '/driver/rides/{id}/arrive',
      'arriveAtRidePickup',
      null,
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/driver/rides/{id}/start',
      'startRide',
      null,
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/driver/rides/{id}/complete',
      'completeRide',
      'RideCompletion',
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/admin/rides/{id}/resolve-dispute',
      'resolveRideDispute',
      'RideResolution',
      false,
      200,
      'RideView',
    ],
    [
      'post',
      '/admin/rides/{id}/retry-dispatch',
      'retryRideDispatch',
      'RideCancellation',
      false,
      200,
      'RideView',
    ],
  );
}
