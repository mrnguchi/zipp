import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../../platform/redis/redis.service.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { CallSignals } from '../application/call-signals.port.js';
import { CallingConfig } from '../calling.config.js';
import type { SignalGrant, CallSide } from '../contracts/call-records.js';
import type { SignalPacket } from '../contracts/call.schemas.js';
import { signalPayload } from '../contracts/call.schemas.js';
// Absolute negotiation deadline; retries do not extend secret retention. Atomic,
// bounded hashes and loops remain small; eviction is an explicit resync boundary.
export const callSignalWriteScript = `
local t=redis.call('TIME')
local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000)
local deadline=tonumber(ARGV[5])
if deadline<=now then return 'EXPIRED' end
local seq=tonumber(ARGV[1])
local previous=redis.call('HGET',KEYS[1],'id:'..ARGV[2])
if previous then if previous==ARGV[3] then return 'OK' else return 'CONFLICT' end end
local last=tonumber(redis.call('HGET',KEYS[1],'last') or '0')
if last==0 and seq~=1 then return 'RESET' end
if seq~=last+1 or seq>64 then return 'CONFLICT' end
redis.call('HSET',KEYS[1],'last',seq,'id:'..ARGV[2],ARGV[3],'n:'..seq,ARGV[4])
redis.call('PEXPIREAT',KEYS[1],math.min(deadline,now+60000))
return 'OK'`;
export const callSignalReadScript = `
local after=tonumber(ARGV[1])
local last=tonumber(redis.call('HGET',KEYS[1],'last') or '0')
if after>last then return {last,1} end
local result={last,0}
for n=after+1,math.min(last,after+32) do
 local item=redis.call('HGET',KEYS[1],'n:'..n)
 if not item then return {last,1} end
 table.insert(result,item)
end
return result`;
const envelope = z
  .object({
    sequence: z.number().int().min(1).max(64),
    messageId: z.uuid({ version: 'v4' }),
    iv: z.string().max(24),
    tag: z.string().max(32),
    ciphertext: z.string().max(24576),
  })
  .strict();
@Injectable()
export class RedisCallSignals extends CallSignals {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(CallingConfig) private readonly config: CallingConfig,
  ) {
    super();
  }
  private key(g: SignalGrant, side = g.side) {
    return `zipp:call-signals:{${g.callId}}:${g.epoch}:${side}`;
  }
  private cryptoKey(purpose: string) {
    this.config.assertSignaling();
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.config.signalKey,
        Buffer.from('zipp-call-signals-v1'),
        Buffer.from(purpose),
        32,
      ),
    );
  }
  private aad(g: SignalGrant, side: CallSide, sequence: number, id: string) {
    return Buffer.from(`${g.callId}:${g.epoch}:${side}:${sequence}:${id}`);
  }
  private seal(g: SignalGrant, p: SignalPacket) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.cryptoKey('encryption'), iv);
    cipher.setAAD(this.aad(g, g.side, p.sequence, p.messageId));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(p.payload), 'utf8'),
      cipher.final(),
    ]);
    return JSON.stringify({
      sequence: p.sequence,
      messageId: p.messageId,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
    });
  }
  private open(g: SignalGrant, side: CallSide, value: string): SignalPacket {
    const raw: unknown = JSON.parse(value),
      e = envelope.parse(raw),
      iv = Buffer.from(e.iv, 'base64url'),
      tag = Buffer.from(e.tag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16)
      throw new Error('Invalid signaling envelope');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      this.cryptoKey('encryption'),
      iv,
    );
    cipher.setAAD(this.aad(g, side, e.sequence, e.messageId));
    cipher.setAuthTag(tag);
    const plain: unknown = JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(e.ciphertext, 'base64url')),
        cipher.final(),
      ]).toString('utf8'),
    );
    return {
      sequence: e.sequence,
      messageId: e.messageId,
      payload: signalPayload.parse(plain),
    };
  }
  async send(g: SignalGrant, p: SignalPacket) {
    this.config.assertSignaling();
    try {
      const fingerprint = createHmac('sha256', this.cryptoKey('fingerprint'))
        .update(JSON.stringify([p.messageId, p.sequence, p.payload]))
        .digest('hex');
      const result: unknown = await this.redis.cache.eval(
        callSignalWriteScript,
        1,
        this.key(g),
        p.sequence,
        p.messageId,
        fingerprint,
        this.seal(g, p),
        g.expiresAt.getTime(),
      );
      if (result === 'EXPIRED')
        throw new ApiError('CALL_EXPIRED', 409, 'Call negotiation expired');
      if (result === 'RESET')
        throw new ApiError(
          'SIGNAL_RESYNC_REQUIRED',
          409,
          'Restart call negotiation',
        );
      if (result === 'CONFLICT')
        throw new ApiError(
          'SIGNAL_SEQUENCE_CONFLICT',
          409,
          'Signal identity or sequence conflicts',
        );
      if (result !== 'OK') throw new Error('Invalid signaling acknowledgement');
      return { acceptedSequence: p.sequence };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('SIGNAL_UNAVAILABLE', 503, 'Signaling unavailable', 2);
    }
  }
  async read(g: SignalGrant, after: number) {
    this.config.assertSignaling();
    const side = g.side === 'CALLER' ? 'CALLEE' : 'CALLER';
    try {
      const raw: unknown = await this.redis.cache.eval(
        callSignalReadScript,
        1,
        this.key(g, side),
        after,
      );
      const values = z
        .tuple([
          z.number().int().min(0).max(64),
          z.union([z.literal(0), z.literal(1)]),
        ])
        .rest(z.string().max(26000))
        .parse(raw);
      const [lastSequence, reset, ...items] = values;
      if (items.length > 32) throw new Error('Signal batch exceeded bound');
      return {
        items: items.map((item) => this.open(g, side, item)),
        lastSequence,
        resyncRequired: reset === 1,
      };
    } catch {
      throw new ApiError('SIGNAL_UNAVAILABLE', 503, 'Signaling unavailable', 2);
    }
  }
}
