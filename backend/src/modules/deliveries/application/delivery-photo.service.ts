import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRepository } from './delivery.repository.js';
import { PackagePhotoStorage } from './delivery-providers.port.js';
import { DeliveryAccessService } from './delivery-access.service.js';
import { IdentityFacade } from '../../identity/identity.facade.js';
import { UnitOfWork } from '../../../shared/contracts/unit-of-work.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import type { PhotoInput } from '../contracts/delivery.schemas.js';
import { DeliveriesConfig } from '../deliveries.config.js';
import { BusinessError } from '../../../shared/errors/business-error.js';
@Injectable()
export class DeliveryPhotoService {
  constructor(
    @Inject(DeliveryRepository) private readonly repo: DeliveryRepository,
    @Inject(PackagePhotoStorage) private readonly storage: PackagePhotoStorage,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(UnitOfWork) private readonly tx: UnitOfWork,
    @Inject(DeliveryAccessService)
    private readonly access: DeliveryAccessService,
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {}
  async intent(a: Actor, input: PhotoInput) {
    this.config.assertEnabled();
    this.config.assertMedia();
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      if ((await this.repo.recentPhotoCount(c, a.userId)) >= 20)
        throw new BusinessError('PHOTO_LIMIT', 'Package photo limit reached');
      const p = await this.repo.createPhoto(c, a.userId, input);
      return {
        id: p.id,
        byteLength: p.byteLength,
        uploadExpiresAt: p.uploadExpiresAt,
      };
    });
  }
  async uploadIntent(a: Actor, id: string) {
    this.config.assertMedia();
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      const p = await this.repo.photo(id, c);
      if (!p || p.ownerUserId !== a.userId)
        throw new BusinessError('NOT_FOUND', 'Photo not found');
      if (p.uploadExpiresAt <= new Date())
        throw new BusinessError(
          'UPLOAD_EXPIRED',
          'Create another photo intent',
        );
      return p;
    });
  }
  async upload(a: Actor, id: string, bytes: Uint8Array) {
    const p = await this.uploadIntent(a, id),
      b = Buffer.from(bytes);
    const signature =
      p.contentType === 'image/png'
        ? b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (
      bytes.length !== p.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== p.contentSha256 ||
      !signature
    )
      throw new BusinessError(
        'VALIDATION_ERROR',
        'Photo bytes do not match the intent',
      );
    // Create-only identical retries are safe. A later DB failure leaves a private orphan.
    await this.storage.write(p.objectKey, bytes);
    return this.tx.run(async (c) => {
      await this.identity.authorize(c, a);
      await this.repo.lockPhoto(c, id);
      const current = await this.repo.photo(id, c);
      if (
        !current ||
        current.ownerUserId !== a.userId ||
        current.uploadExpiresAt <= new Date()
      )
        throw new BusinessError('UPLOAD_EXPIRED', 'Photo intent expired');
      await this.repo.storePhoto(c, id);
      return { id, status: 'STORED' };
    });
  }
  async download(a: Actor, id: string) {
    this.config.assertMedia();
    const p = await this.tx.run(async (c) => {
      const d = await this.repo.deliveryByPhoto(id);
      if (d) {
        const current = await this.access.authorize(c, a, d.id);
        if (current.courierUserId === a.userId && current.completedAt)
          throw new BusinessError('NOT_FOUND', 'Photo not found');
      } else await this.identity.authorize(c, a);
      const photo = await this.repo.photo(id, c);
      if (
        !photo ||
        photo.status !== 'STORED' ||
        (!d && photo.ownerUserId !== a.userId)
      )
        throw new BusinessError('NOT_FOUND', 'Photo not found');
      return photo;
    });
    return {
      bytes: await this.storage.read(p.objectKey),
      contentType: p.contentType,
    };
  }
}
