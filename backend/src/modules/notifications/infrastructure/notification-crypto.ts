import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationCrypto } from '../application/notification-crypto.port.js';
import { NotificationsConfig } from '../notifications.config.js';
@Injectable()
export class NodeNotificationCrypto extends NotificationCrypto {
  constructor(
    @Inject(NotificationsConfig) private readonly config: NotificationsConfig,
  ) {
    super();
  }
  private key(purpose: string) {
    this.config.assertEnabled();
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.config.dataKey,
        Buffer.from('zipp-notifications-v1'),
        Buffer.from(purpose),
        32,
      ),
    );
  }
  digest(purpose: string, value: string) {
    return createHmac('sha256', this.key('hash'))
      .update(`${purpose}\0${value}`)
      .digest('hex');
  }
  matches(expected: string, value: string) {
    return (
      /^[a-f0-9]{64}$/.test(expected) &&
      /^[a-f0-9]{64}$/.test(value) &&
      timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value, 'hex'))
    );
  }
  seal(deviceId: string, generation: number, token: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key('encryption'), iv);
    cipher.setAAD(Buffer.from(`${deviceId.toLowerCase()}:${generation}`));
    const value = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${value.toString('base64url')}`;
  }
  open(deviceId: string, generation: number, ciphertext: string) {
    const [version, iv, tag, value, ...extra] = ciphertext.split('.');
    if (
      version !== 'v1' ||
      !iv ||
      !tag ||
      !value ||
      extra.length ||
      ciphertext.length > 1024
    )
      throw new Error('Invalid notification encryption envelope');
    const nonce = Buffer.from(iv, 'base64url'),
      auth = Buffer.from(tag, 'base64url');
    if (nonce.length !== 12 || auth.length !== 16)
      throw new Error('Invalid notification encryption envelope');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.key('encryption'),
      nonce,
    );
    cipher.setAAD(Buffer.from(`${deviceId.toLowerCase()}:${generation}`));
    cipher.setAuthTag(auth);
    return Buffer.concat([
      cipher.update(Buffer.from(value, 'base64url')),
      cipher.final(),
    ]).toString('utf8');
  }
}
