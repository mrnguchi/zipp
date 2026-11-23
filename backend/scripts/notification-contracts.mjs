import { z } from 'zod';
import {
  notificationSchemas,
  notificationCommand,
} from '../dist/modules/notifications/contracts/notification.schemas.js';
export const notificationCommandSchema = {
  title: 'Internal notification command v1',
  description:
    'IDs only. Worker must reload PostgreSQL owner/session/device generation/intent and own a live lease. CAPTURED is local capture, not provider/device delivery.',
  ...z.toJSONSchema(notificationCommand),
};
export function addNotificationContracts(schemas, routes) {
  Object.assign(
    schemas,
    Object.fromEntries(
      Object.entries(notificationSchemas).map(([name, s]) => [
        name,
        z.toJSONSchema(s),
      ]),
    ),
  );
  routes.push(
    [
      'put',
      '/notifications/devices/{id}',
      'registerNotificationDevice',
      'RegisterNotificationDevice',
      false,
      200,
      'NotificationDevice',
    ],
    [
      'post',
      '/notifications/devices/{id}/revoke',
      'revokeNotificationDevice',
      'RevokeNotificationDevice',
      false,
      200,
      'NotificationDevice',
    ],
    [
      'get',
      '/notifications/devices',
      'listNotificationDevices',
      null,
      false,
      200,
      'NotificationDevices',
    ],
    [
      'get',
      '/notifications/inbox',
      'listNotificationInbox',
      null,
      false,
      200,
      'NotificationInboxPage',
    ],
    [
      'put',
      '/notifications/inbox/{id}/read',
      'readNotification',
      'ReadNotification',
      false,
      200,
      'NotificationInboxItem',
    ],
  );
}
export function decorateNotificationPaths(paths) {
  for (const [path, methods] of Object.entries(paths)) {
    if (!path.startsWith('/notifications/')) continue;
    for (const op of Object.values(methods)) {
      op.tags = ['Notifications'];
      op['x-enabled-by-default'] = false;
      op.description =
        'M7.3 private local-only notifications. Requires explicit NOTIFICATIONS_ENABLED and notifications=m7_3 marker. Installation proof is client-generated and never returned; LOCAL accepts dummy tokens only. Inbox contains generic activity with no job/thread/body/token. No provider/phone delivery claim.';
      if (op.operationId === 'listNotificationInbox') {
        op.parameters ??= [];
        op.parameters.push(
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        );
      }
      for (const response of Object.values(op.responses))
        response.headers = {
          ...(response.headers ?? {}),
          'Cache-Control': {
            schema: { const: 'no-store' },
            description: 'Private metadata; no token/proof in responses.',
          },
        };
    }
  }
}
