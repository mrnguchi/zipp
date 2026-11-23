import { createHash } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { DriversConfig } from '../drivers.config.js';
import { DocumentStorage } from '../application/document-storage.port.js';
import { ApiError } from '../../../shared/errors/api-error.js';

@Injectable()
export class LocalDocumentStorage extends DocumentStorage {
  constructor(@Inject(DriversConfig) private readonly config: DriversConfig) {
    super();
  }
  private path(key: string): string {
    this.config.assertUploads();
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        key,
      )
    )
      throw new Error('Invalid storage key');
    return resolve(this.config.storageRoot, key);
  }
  async write(key: string, content: Uint8Array): Promise<void> {
    const target = this.path(key);
    try {
      await mkdir(this.config.storageRoot, { recursive: true, mode: 0o700 });
      await writeFile(target, content, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        // Retry after a stored file/DB acknowledgement loss is safe only for identical bytes.
        const previous = await this.read(key);
        if (
          createHash('sha256').update(previous).digest('hex') ===
          createHash('sha256').update(content).digest('hex')
        )
          return;
      }
      throw new ApiError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        503,
        'Document storage is temporarily unavailable',
      );
    }
  }
  async read(key: string): Promise<Uint8Array> {
    try {
      const handle = await open(this.path(key), 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > 3 * 1024 * 1024)
          throw new Error('Stored object exceeds bounds');
        return await handle.readFile();
      } finally {
        await handle.close();
      }
    } catch {
      throw new ApiError(
        'DOCUMENT_STORAGE_UNAVAILABLE',
        503,
        'Document storage is temporarily unavailable',
      );
    }
  }
}
