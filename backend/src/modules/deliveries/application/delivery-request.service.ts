import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class DeliveryRequestService {
  constructor(
    @Inject(DeliveryRepository) private readonly repository: DeliveryRepository,
  ) {}
  fingerprint(fields: readonly unknown[]) {
    return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  }
  async replay(
    c: TransactionContext,
    user: string,
    action: string,
    key: string,
    fingerprint: string,
  ) {
    const old = await this.repository.request(c, user, action, key);
    if (!old) return null;
    if (old.requestFingerprint !== fingerprint)
      throw new BusinessError(
        'IDEMPOTENCY_CONFLICT',
        'Request key has different input',
      );
    const d = await this.repository.get(old.deliveryId, c);
    if (!d) throw new Error('Missing delivery request aggregate');
    if (
      d.completedAt &&
      Date.now() >=
        Math.max(d.completedAt.getTime(), old.createdAt.getTime()) + 86400000
    )
      throw new BusinessError(
        'IDEMPOTENCY_KEY_EXPIRED',
        'Retrieve the existing delivery',
        d.id,
      );
    return d;
  }
}
