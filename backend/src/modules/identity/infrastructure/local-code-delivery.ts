import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Inject, Injectable } from '@nestjs/common';
import { IdentityConfig } from '../identity.config.js';
import { CodeDelivery } from '../application/ports/identity-ports.js';
import type { DeliveryMessage } from '../application/ports/identity-ports.js';

@Injectable()
export class LocalCodeDelivery extends CodeDelivery {
  constructor(@Inject(IdentityConfig) private readonly config: IdentityConfig) {
    super();
  }
  async send(message: DeliveryMessage): Promise<void> {
    this.config.assertEnabled();
    if (process.env['NODE_ENV'] === 'production')
      throw new Error('Local delivery is prohibited');
    const directory = join(tmpdir(), 'zipp-local-otp');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    // Deliberate private development mailbox, not a log, HTTP endpoint or test artifact.
    await writeFile(
      join(directory, `${message.challengeId}.json`),
      JSON.stringify({
        challengeId: message.challengeId,
        purpose: message.purpose,
        code: message.code,
        expiresAt: message.expiresAt.toISOString(),
      }),
      { mode: 0o600, flag: 'wx' },
    );
  }
}
