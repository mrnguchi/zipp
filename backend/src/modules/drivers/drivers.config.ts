import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ApiError } from '../../shared/errors/api-error.js';
export class DriversConfig {
  readonly uploadsEnabled: boolean;
  readonly storageRoot: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const flag = env['DRIVER_UPLOADS_ENABLED'] ?? 'false';
    if (!['true', 'false'].includes(flag))
      throw new Error('Invalid DRIVER_UPLOADS_ENABLED');
    this.uploadsEnabled = flag === 'true';
    if (
      this.uploadsEnabled &&
      (env['NODE_ENV'] === 'production' ||
        env['DRIVER_DOCUMENT_STORAGE'] !== 'local')
    )
      throw new Error(
        'Local driver storage requires explicit non-production configuration',
      );
    if (this.uploadsEnabled && !env['DRIVER_DOCUMENT_ROOT'])
      throw new Error('Configure a private persistent DRIVER_DOCUMENT_ROOT');
    this.storageRoot = resolve(
      env['DRIVER_DOCUMENT_ROOT'] ??
        resolve(tmpdir(), 'zipp-private-documents'),
    );
  }
  assertUploads(): void {
    if (!this.uploadsEnabled)
      throw new ApiError(
        'DOCUMENT_STORAGE_NOT_CONFIGURED',
        503,
        'Document storage is not configured',
      );
  }
}
