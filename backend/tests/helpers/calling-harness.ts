import { Test } from '@nestjs/testing';
import {
  UnitOfWork,
  AuditPort,
} from '../../src/shared/contracts/unit-of-work.js';
import { RateLimitPort } from '../../src/shared/contracts/rate-limit.js';
import type { DatabaseService } from '../../src/platform/database/database.service.js';
import type { DatabaseUnitOfWork } from '../../src/platform/database/database-unit-of-work.js';
import { IdentityFacade } from '../../src/modules/identity/identity.facade.js';
import { RidesFacade } from '../../src/modules/rides/rides.facade.js';
import { DeliveriesFacade } from '../../src/modules/deliveries/deliveries.facade.js';
import { NotificationsFacade } from '../../src/modules/notifications/notifications.facade.js';
import { NotificationsConfig } from '../../src/modules/notifications/notifications.config.js';
import { NotificationsRepository } from '../../src/modules/notifications/application/notifications.repository.js';
import { PrismaNotificationsRepository } from '../../src/modules/notifications/infrastructure/prisma-notifications.repository.js';
import { NotificationCrypto } from '../../src/modules/notifications/application/notification-crypto.port.js';
import { NodeNotificationCrypto } from '../../src/modules/notifications/infrastructure/notification-crypto.js';
import { NotificationDevicesService } from '../../src/modules/notifications/application/notification-devices.service.js';
import { NotificationAdmissionService } from '../../src/modules/notifications/application/notification-admission.service.js';
import { NotificationDeliveryService } from '../../src/modules/notifications/application/notification-delivery.service.js';
import { CallingConfig } from '../../src/modules/calling/calling.config.js';
import { CallRelayConfig } from '../../src/modules/calling/call-relay.config.js';
import { CallRelay } from '../../src/modules/calling/application/call-relay.port.js';
import { CallRelayService } from '../../src/modules/calling/application/call-relay.service.js';
import type { RelayGrant } from '../../src/modules/calling/application/call-relay.port.js';
import { CallRepository } from '../../src/modules/calling/application/call.repository.js';
import { PrismaCallRepository } from '../../src/modules/calling/infrastructure/prisma-call.repository.js';
import { CallAccessService } from '../../src/modules/calling/application/call-access.service.js';
import { CallAdmissionService } from '../../src/modules/calling/application/call-admission.service.js';
import { CallRequestsService } from '../../src/modules/calling/application/call-requests.service.js';
import { CallStateService } from '../../src/modules/calling/application/call-state.service.js';
import { CallCreateService } from '../../src/modules/calling/application/call-create.service.js';
import { CallLifecycleService } from '../../src/modules/calling/application/call-lifecycle.service.js';
import { CallReadService } from '../../src/modules/calling/application/call-read.service.js';
import { CallReaperService } from '../../src/modules/calling/application/call-reaper.service.js';
// Test harness only: owning mobility callbacks are real suite services; no Redis/media claims.
export async function callingHarness(
  db: DatabaseService,
  tx: DatabaseUnitOfWork,
  identity: IdentityFacade,
  audit: AuditPort,
  rideContext: RidesFacade['callingContext'],
  deliveryContext: DeliveriesFacade['callingContext'] = () =>
    Promise.reject(new Error('Delivery fixture required')),
) {
  const repo = new PrismaCallRepository(db, tx),
    notifications = new PrismaNotificationsRepository(db, tx),
    config = new NotificationsConfig({
      NODE_ENV: 'test',
      AUTH_ENABLED: 'true',
      NOTIFICATIONS_ENABLED: 'true',
      NOTIFICATION_DATA_KEY: '44'.repeat(32),
    });
  await repo.assertSchema();
  const module = await Test.createTestingModule({
    providers: [
      CallAccessService,
      CallAdmissionService,
      CallRequestsService,
      CallStateService,
      CallCreateService,
      CallLifecycleService,
      CallReadService,
      CallRelayService,
      { provide: CallRelayConfig, useValue: { assertEnabled: () => {} } },
      {
        provide: CallRelay,
        useValue: {
          // Admission/crypto double only; real DB/job/device authorization below
          // does not establish coturn authentication or delivery interoperability.
          mint: (g: RelayGrant) => ({
            iceServers: [
              {
                urls: [
                  'turn:192.168.1.50:3478?transport=udp',
                  'turn:192.168.1.50:3478?transport=tcp',
                ],
                username: 'unit-opaque',
                credential: 'unit-ephemeral',
              },
            ],
            iceTransportPolicy: 'relay' as const,
            expiresAt: g.expiresAt.toISOString(),
            serverTime: g.serverTime.toISOString(),
            audioAvailable: false as const,
          }),
        },
      },
      NotificationDevicesService,
      NotificationAdmissionService,
      NotificationsFacade,
      { provide: UnitOfWork, useValue: tx },
      { provide: AuditPort, useValue: audit },
      { provide: IdentityFacade, useValue: identity },
      { provide: CallRepository, useValue: repo },
      { provide: RidesFacade, useValue: { callingContext: rideContext } },
      {
        provide: DeliveriesFacade,
        useValue: { callingContext: deliveryContext },
      },
      {
        provide: CallingConfig,
        useValue: new CallingConfig({
          NODE_ENV: 'test',
          AUTH_ENABLED: 'true',
          NOTIFICATIONS_ENABLED: 'true',
          CALLING_ENABLED: 'true',
          CALL_SIGNAL_KEY: '55'.repeat(32),
        }),
      },
      { provide: NotificationsConfig, useValue: config },
      { provide: NotificationsRepository, useValue: notifications },
      {
        provide: NotificationCrypto,
        useValue: new NodeNotificationCrypto(config),
      },
      { provide: NotificationDeliveryService, useValue: {} },
      {
        provide: RateLimitPort,
        useValue: { consume: () => Promise.resolve() },
      },
    ],
  }).compile();
  const workerConfig = new CallingConfig({
    NODE_ENV: 'test',
    SERVICE_ROLE: 'worker',
    NOTIFICATIONS_ENABLED: 'true',
    CALLING_ENABLED: 'true',
    CALLING_REAPER_ENABLED: 'true',
  });
  return {
    repo,
    creates: module.get(CallCreateService),
    life: module.get(CallLifecycleService),
    reads: module.get(CallReadService),
    relay: module.get(CallRelayService),
    devices: module.get(NotificationDevicesService),
    reaper: new CallReaperService(
      tx,
      identity,
      module.get(NotificationsFacade),
      repo,
      module.get(CallStateService),
      workerConfig,
    ),
  };
}
