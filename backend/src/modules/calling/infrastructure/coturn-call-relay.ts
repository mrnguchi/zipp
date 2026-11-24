import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { CallRelayConfig } from '../call-relay.config.js';
import { CallRelay } from '../application/call-relay.port.js';
import type { RelayGrant } from '../application/call-relay.port.js';
import { ApiError } from '../../../shared/errors/api-error.js';

/** Called only at initialization, never during an authorization transaction. */
export async function readRelayKey(file: string): Promise<Buffer> {
  const bytes = Buffer.alloc(66);
  let handle;
  try {
    const pathInfo = await lstat(file);
    if (!pathInfo.isFile() || pathInfo.isSymbolicLink()) throw new Error();
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.size < 64 ||
      info.size > 65 ||
      info.dev !== pathInfo.dev ||
      info.ino !== pathInfo.ino ||
      (process.platform !== 'win32' &&
        ((info.mode & 0o077) !== 0 ||
          !process.getuid ||
          process.getuid() === 0 ||
          info.uid !== process.getuid()))
    )
      throw new Error();
    let used = 0;
    while (used < bytes.length) {
      const result = await handle.read(bytes, used, bytes.length - used, used);
      if (!result.bytesRead) break;
      used += result.bytesRead;
    }
    const text = bytes.subarray(0, used).toString('utf8');
    if (!/^[a-f0-9]{64}\n?$/.test(text)) throw new Error();
    return Buffer.from(text.slice(0, 64), 'ascii');
  } catch {
    throw new Error('Private relay key is unavailable or invalid');
  } finally {
    bytes.fill(0);
    await handle?.close().catch(() => {
      throw new Error('Private relay key could not be closed safely');
    });
  }
}

@Injectable()
export class CoturnCallRelay
  extends CallRelay
  implements OnModuleInit, OnModuleDestroy
{
  #key: Buffer | undefined;
  constructor(
    @Inject(CallRelayConfig) private readonly config: CallRelayConfig,
  ) {
    super();
  }
  async onModuleInit() {
    if (!this.config.enabled) return;
    const key = await readRelayKey(this.config.secretFile);
    try {
      this.config.assertDedicatedKey(key.toString('ascii'));
      this.#key = key;
    } catch {
      key.fill(0);
      throw new Error('Private relay key configuration is invalid');
    }
  }
  onModuleDestroy() {
    this.#key?.fill(0);
    this.#key = undefined;
  }
  mint(g: RelayGrant) {
    this.config.assertEnabled();
    if (!this.#key)
      throw new ApiError(
        'RELAY_UNAVAILABLE',
        503,
        'Relay credentials unavailable',
        5,
      );
    // Purpose-separated pseudonym binds both claimed endpoints and the exact
    // requesting leg. Raw account/call/device identifiers never enter username.
    const scope = createHmac('sha256', this.#key)
      .update('zipp:turn-scope:v1\0')
      .update(JSON.stringify(g.scope))
      .digest('hex');
    const username = `${Math.floor(g.expiresAt.getTime() / 1000)}:${scope}`;
    // HMAC-SHA1 is coturn's TURN REST protocol, not password hashing. The key
    // is the same ASCII string coturn loads, never the hex-decoded bytes.
    const credential = createHmac('sha1', this.#key)
      .update(username, 'ascii')
      .digest('base64');
    return {
      iceServers: [{ urls: [...this.config.urls], username, credential }],
      iceTransportPolicy: 'relay' as const,
      expiresAt: g.expiresAt.toISOString(),
      serverTime: g.serverTime.toISOString(),
      audioAvailable: false as const,
    };
  }
}
