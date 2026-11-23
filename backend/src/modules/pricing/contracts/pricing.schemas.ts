import { z } from 'zod';
export const quoteCoordinate = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export const quoteBody = z.strictObject({
  serviceAreaId: z.uuid({ version: 'v4' }),
  serviceClass: z.enum([
    'EVERYDAY',
    'COMFORT',
    'PREMIUM',
    'DELIVERY_STANDARD',
    'DELIVERY_EXPRESS',
  ]),
  pickup: quoteCoordinate,
  destination: quoteCoordinate,
});
const rate = z.string().regex(/^(?:0|[1-9][0-9]{0,6})$/);
export const pricingPolicyBody = z.strictObject({
  serviceAreaId: z.uuid({ version: 'v4' }),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),
  serviceClass: quoteBody.shape.serviceClass,
  baseFareXaf: rate,
  perKilometerXaf: rate,
  perMinuteXaf: rate,
  minimumFareXaf: z.string().regex(/^[1-9][0-9]{0,6}$/),
  nightMultiplierBps: z.number().int().min(10000).max(30000),
  commissionBps: z.number().int().min(0).max(10000),
  cancellationFeeXaf: rate,
});
export const serviceAreaBody = z.strictObject({
  code: z.string().regex(/^[A-Z0-9_-]{3,60}$/),
  name: z.string().trim().min(3).max(100),
  minimumLatitude: z.number().finite().min(-90).max(90),
  maximumLatitude: z.number().finite().min(-90).max(90),
  minimumLongitude: z.number().finite().min(-180).max(180),
  maximumLongitude: z.number().finite().min(-180).max(180),
});
export const areaActivationBody = z.strictObject({ active: z.boolean() });
export const pricingSchemas = {
  PriceQuoteRequest: quoteBody,
  PricingPolicy: pricingPolicyBody,
  ServiceArea: serviceAreaBody,
  ServiceAreaActivation: areaActivationBody,
};
export type QuoteInput = z.infer<typeof quoteBody>;
export type PolicyInput = z.infer<typeof pricingPolicyBody>;
export type AreaInput = z.infer<typeof serviceAreaBody>;
