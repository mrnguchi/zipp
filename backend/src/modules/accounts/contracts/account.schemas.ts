import { z } from 'zod';

export const profileBody = z
  .strictObject({
    displayName: z.string().trim().min(1).max(100).optional(),
    language: z.enum(['en', 'fr']).optional(),
    preferredMode: z.enum(['customer', 'driver']).optional(),
    notificationsEnabled: z.boolean().optional(),
    marketingConsent: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const placeBody = z.strictObject({
  kind: z.enum(['home', 'work', 'other']),
  name: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  coordinate: z.strictObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
});
export const placeQuery = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
});
export const accountSchemas = {
  UpdateProfile: profileBody,
  SavedPlace: placeBody,
  ListPlaces: placeQuery,
};
