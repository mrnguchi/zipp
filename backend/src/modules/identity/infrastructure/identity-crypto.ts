import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import { IdentityConfig } from '../identity.config.js';
import { IdentityCrypto } from '../application/ports/identity-ports.js';
import {
  ApiError,
  invalidCredentials,
} from '../../../shared/errors/api-error.js';

const options = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
const dummy = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;

@Injectable()
export class NodeIdentityCrypto extends IdentityCrypto {
  private hashing = false;
  constructor(@Inject(IdentityConfig) private readonly config: IdentityConfig) {
    super();
  }
  private async derive(password: string, salt: Buffer): Promise<Buffer> {
    this.config.assertEnabled();
    // One 128 MiB derivation per process leaves headroom in the 512 MiB API container.
    if (this.hashing)
      throw new ApiError('AUTH_BUSY', 503, 'Please retry shortly', 1);
    this.hashing = true;
    try {
      return await new Promise<Buffer>((resolve, reject) =>
        scrypt(password, salt, 64, options, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
      );
    } finally {
      this.hashing = false;
    }
  }
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    return `scrypt$${salt.toString('hex')}$${(await this.derive(password, salt)).toString('hex')}`;
  }
  async verifyPassword(
    password: string,
    stored: string | null,
  ): Promise<boolean> {
    const valid =
      typeof stored === 'string' &&
      /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored);
    const parts = (valid ? stored : dummy).split('$');
    const salt = Buffer.from(parts[1] ?? '', 'hex');
    const expected = Buffer.from(parts[2] ?? '', 'hex');
    const actual = await this.derive(password, salt);
    return timingSafeEqual(actual, expected) && valid;
  }
  digest(purpose: string, value: string): string {
    this.config.assertEnabled();
    return createHmac('sha256', this.config.digestKey)
      .update(`${purpose}\0${value}`)
      .digest('hex');
  }
  code(): string {
    this.config.assertEnabled();
    return String(randomInt(1_000_000)).padStart(6, '0');
  }
  matchesDigest(stored: string | null, candidate: string): boolean {
    this.config.assertEnabled();
    if (
      !stored ||
      !/^[a-f0-9]{64}$/.test(stored) ||
      !/^[a-f0-9]{64}$/.test(candidate)
    )
      return false;
    return timingSafeEqual(
      Buffer.from(stored, 'hex'),
      Buffer.from(candidate, 'hex'),
    );
  }
  token(): string {
    this.config.assertEnabled();
    return randomBytes(32).toString('base64url');
  }
  async sign(userId: string, sessionId: string): Promise<string> {
    this.config.assertEnabled();
    return new SignJWT({ purpose: 'access', sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.config.signingKey);
  }
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    this.config.assertEnabled();
    try {
      const { payload } = await jwtVerify(token, this.config.signingKey, {
        algorithms: ['HS256'],
        typ: 'at+jwt',
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['sub', 'sid', 'iat', 'exp', 'purpose'],
        maxTokenAge: '10m',
        clockTolerance: 0,
      });
      const uuid =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
      if (
        payload.purpose !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !uuid.test(payload.sub) ||
        !uuid.test(payload.sid)
      )
        throw invalidCredentials();
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw invalidCredentials();
    }
  }
  createTotp(
    userId: string,
    phone: string,
  ): { encrypted: string; uri: string } {
    this.config.assertEnabled();
    const secret = generateSecret();
    const nonce = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.config.encryptionKey,
      nonce,
    );
    cipher.setAAD(Buffer.from(`zipp-totp-v1:${userId}`));
    const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return {
      encrypted: `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`,
      uri: generateURI({ issuer: 'Zipp', label: phone, secret }),
    };
  }
  async verifyTotp(
    userId: string,
    encrypted: string,
    token: string,
    afterStep: number,
  ): Promise<number | null> {
    this.config.assertEnabled();
    try {
      const [version, iv, tag, body] = encrypted.split('.');
      if (version !== 'v1' || !iv || !tag || !body) return null;
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.config.encryptionKey,
        Buffer.from(iv, 'base64url'),
        { authTagLength: 16 },
      );
      decipher.setAAD(Buffer.from(`zipp-totp-v1:${userId}`));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const secret = Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
      const result = await verifyOtp({
        strategy: 'totp',
        secret,
        token,
        epochTolerance: 30,
        ...(afterStep >= 0 ? { afterTimeStep: afterStep } : {}),
      });
      return result.valid &&
        'timeStep' in result &&
        typeof result.timeStep === 'number'
        ? result.timeStep
        : null;
    } catch {
      return null;
    }
  }
}
