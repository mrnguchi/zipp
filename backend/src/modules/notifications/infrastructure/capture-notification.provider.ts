import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotificationProvider } from '../application/notification-provider.port.js';
import type { NotificationDispatch } from '../application/notification-provider.port.js';
import { NotificationsConfig } from '../notifications.config.js';
import { localPushToken } from '../contracts/notification.schemas.js';
@Injectable()
export class CaptureNotificationProvider extends NotificationProvider {
  constructor(
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
  ) {
    super();
  }
  async send(work: NotificationDispatch, signal: AbortSignal) {
    this.config.assertEnabled();
    if (!this.config.dispatchEnabled)
      throw new Error('Capture dispatch disabled');
    const uuid = z.uuid({ version: 'v4' });
    uuid.parse(work.deliveryId);
    uuid.parse(work.notificationId);
    uuid.parse(work.deviceId);
    localPushToken.parse(work.token);
    const body =
      JSON.stringify({
        schemaVersion: 1,
        deliveryId: work.deliveryId,
        notificationId: work.notificationId,
        deviceId: work.deviceId,
        generation: work.generation,
      }) + '\n';
    await mkdir(this.config.captureRoot, { recursive: true, mode: 0o700 });
    const root = await lstat(this.config.captureRoot);
    if (!root.isDirectory() || root.isSymbolicLink())
      throw new Error('Unsafe capture root');
    const file = join(this.config.captureRoot, `${work.deliveryId}.json`);
    try {
      await writeFile(file, body, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
        signal,
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EEXIST'
      )
        throw error;
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024)
        throw new Error('Unsafe capture record', { cause: error });
      if ((await readFile(file, { encoding: 'utf8', signal })) !== body)
        throw new Error('Capture identity mismatch', { cause: error });
    }
    return 'CAPTURED' as const;
  }
}
