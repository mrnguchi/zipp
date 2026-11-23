import { createHash } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Inject, Injectable } from '@nestjs/common';
import { DeliveriesConfig } from '../deliveries.config.js';
import {
  PackagePhotoStorage,
  ContactCodeDelivery,
} from '../application/delivery-providers.port.js';
import type { ContactCodeMessage } from '../application/delivery-providers.port.js';
import { ApiError } from '../../../shared/errors/api-error.js';
const validKey = (value: string) =>
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );
@Injectable()
export class LocalPackagePhotos extends PackagePhotoStorage {
  constructor(
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {
    super();
  }
  private path(key: string) {
    this.config.assertMedia();
    if (!validKey(key)) throw new Error('Invalid private photo key');
    return resolve(this.config.mediaRoot, key);
  }
  async write(key: string, bytes: Uint8Array) {
    const path = this.path(key);
    try {
      await mkdir(this.config.mediaRoot, { recursive: true, mode: 0o700 });
      await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        const previous = await this.read(key);
        if (
          createHash('sha256').update(previous).digest('hex') ===
          createHash('sha256').update(bytes).digest('hex')
        )
          return;
      }
      throw new ApiError(
        'DELIVERY_MEDIA_UNAVAILABLE',
        503,
        'Package photo storage is unavailable',
      );
    }
  }
  async read(key: string) {
    try {
      const file = await open(this.path(key), 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 3145728)
          throw new Error('Invalid private object size');
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch {
      throw new ApiError(
        'DELIVERY_MEDIA_UNAVAILABLE',
        503,
        'Package photo storage is unavailable',
      );
    }
  }
}
@Injectable()
export class LocalContactCodeDelivery extends ContactCodeDelivery {
  constructor(
    @Inject(DeliveriesConfig) private readonly config: DeliveriesConfig,
  ) {
    super();
  }
  async send(message: ContactCodeMessage) {
    this.config.assertEnabled();
    if (!validKey(message.requestId))
      throw new Error('Invalid code request identity');
    const root = resolve(tmpdir(), 'zipp-delivery-codes');
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(
      resolve(root, `${message.requestId}.json`),
      JSON.stringify({
        deliveryId: message.deliveryId,
        purpose: message.purpose,
        code: message.code,
        expiresAt: message.expiresAt.toISOString(),
      }),
      { flag: 'wx', mode: 0o600 },
    );
  }
}
