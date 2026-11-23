import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { RidesFacade } from '../../rides/rides.facade.js';
import { DeliveriesFacade } from '../../deliveries/deliveries.facade.js';
import { NotificationsFacade } from '../../notifications/notifications.facade.js';
import { CallRepository } from './call.repository.js';
import type { CallDevice } from '../contracts/call.schemas.js';
import type { CallRecord } from '../contracts/call-records.js';
@Injectable()
export class CallAccessService {
  constructor(
    @Inject(IdentityFacade) readonly identity: IdentityFacade,
    @Inject(RidesFacade) private readonly rides: RidesFacade,
    @Inject(DeliveriesFacade) private readonly deliveries: DeliveriesFacade,
    @Inject(NotificationsFacade) readonly devices: NotificationsFacade,
    @Inject(CallRepository) readonly repo: CallRepository,
  ) {}
  async job(
    c: TransactionContext,
    a: Actor,
    type: 'RIDE' | 'DELIVERY',
    id: string,
    peer: string,
  ) {
    const result =
      type === 'RIDE'
        ? await this.rides.callingContext(c, a, id, peer)
        : await this.deliveries.callingContext(c, a, id, peer);
    return (
      result.eligible && (await this.identity.notificationEligible(c, peer))
    );
  }
  async initial(c: TransactionContext, a: Actor, id: string) {
    const r = await this.repo.get(c, id);
    if (!r || ![r.callerUserId, r.calleeUserId].includes(a.userId))
      throw new BusinessError('NOT_FOUND', 'Call not found');
    return r;
  }
  async original(c: TransactionContext, a: Actor, id: string) {
    const first = await this.initial(c, a, id);
    await this.identity.authorize(c, a, [], false, [
      first.callerUserId,
      first.calleeUserId,
    ]);
    const r = await this.repo.get(c, id, true);
    if (!r) throw new BusinessError('NOT_FOUND', 'Call not found');
    return r;
  }
  async current(c: TransactionContext, a: Actor, id: string) {
    const first = await this.initial(c, a, id),
      peer =
        a.userId === first.callerUserId
          ? first.calleeUserId
          : first.callerUserId;
    const eligible = await this.job(c, a, first.jobType, first.jobId, peer),
      r = await this.repo.get(c, id, true);
    if (!r) throw new BusinessError('NOT_FOUND', 'Call not found');
    const now = await this.repo.now(c);
    const caller =
      (await this.identity.notificationEligible(
        c,
        r.callerUserId,
        r.callerSessionId,
      )) &&
      (await this.devices.currentCallDevice(
        c,
        r.callerUserId,
        r.callerSessionId,
        r.callerDeviceId,
        r.callerDeviceGeneration,
        now,
      ));
    const callee =
      !r.calleeSessionId ||
      !r.calleeDeviceId ||
      !r.calleeDeviceGeneration ||
      ((await this.identity.notificationEligible(
        c,
        r.calleeUserId,
        r.calleeSessionId,
      )) &&
        (await this.devices.currentCallDevice(
          c,
          r.calleeUserId,
          r.calleeSessionId,
          r.calleeDeviceId,
          r.calleeDeviceGeneration,
          now,
        )));
    return { call: r, eligible: eligible && caller && callee };
  }
  async device(c: TransactionContext, a: Actor, input: CallDevice, now: Date) {
    await this.devices.assertCallDevice(
      c,
      a,
      input.deviceId.toLowerCase(),
      input.deviceGeneration,
      input.proof,
      now,
    );
  }
  assertClaim(r: CallRecord, a: Actor, d: CallDevice) {
    const caller = a.userId === r.callerUserId;
    if (
      (caller ? r.callerSessionId : r.calleeSessionId) !== a.sessionId ||
      (caller ? r.callerDeviceId : r.calleeDeviceId) !==
        d.deviceId.toLowerCase() ||
      (caller ? r.callerDeviceGeneration : r.calleeDeviceGeneration) !==
        d.deviceGeneration
    )
      throw new BusinessError(
        'CALL_DEVICE_NOT_CLAIMED',
        'Use the claimed call device',
      );
  }
}
