import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../../platform/redis/redis.service.js';
import { ApiError } from '../../../shared/errors/api-error.js';
import { ConnectionLeases } from '../application/connection-leases.port.js';
import type { ConnectionLease } from '../application/connection-leases.port.js';
// One hash slot for all keys. Server time avoids replica clock skew. The noeviction
// Redis keeps admission records until expiry; renew never recreates an expired lease.
export const leaseScript = `
local clock=redis.call('TIME')
local now=tonumber(clock[1])*1000+math.floor(tonumber(clock[2])/1000)
local member=ARGV[1]
local mode=ARGV[2]
if mode=='release' then for _,key in ipairs(KEYS) do redis.call('ZREM',key,member) end return 1 end
for _,key in ipairs(KEYS) do redis.call('ZREMRANGEBYSCORE',key,'-inf',now) end
if mode=='renew' then
 for _,key in ipairs(KEYS) do if not redis.call('ZSCORE',key,member) then return 0 end end
else
 local limits={2,20,500}
 for i,key in ipairs(KEYS) do if redis.call('ZCARD',key)>=limits[i] then return 0 end end
end
for _,key in ipairs(KEYS) do redis.call('ZADD',key,now+20000,member) redis.call('PEXPIRE',key,21000) end
return 1`;
@Injectable()
export class RedisConnectionLeases extends ConnectionLeases {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {
    super();
  }
  private keys(l: ConnectionLease) {
    return [
      `zipp:{live}:actor:${l.actorKey}`,
      `zipp:{live}:ip:${l.ipKey}`,
      'zipp:{live}:global',
    ];
  }
  private async execute(l: ConnectionLease, mode: string) {
    try {
      const result: unknown = await this.redis.queue.eval(
        leaseScript,
        3,
        ...this.keys(l),
        l.id,
        mode,
      );
      if (result !== 0 && result !== 1) throw new Error('Invalid lease result');
      return result === 1;
    } catch {
      throw new ApiError(
        'REALTIME_UNAVAILABLE',
        503,
        'Realtime admission unavailable',
        5,
      );
    }
  }
  async acquire(actorKey: string, ipKey: string) {
    const l = { id: randomUUID(), actorKey, ipKey };
    if (!(await this.execute(l, 'acquire')))
      throw new ApiError(
        'REALTIME_LIMIT',
        429,
        'Realtime connection limit reached',
        20,
      );
    return l;
  }
  renew(l: ConnectionLease) {
    return this.execute(l, 'renew');
  }
  async release(l: ConnectionLease) {
    await this.execute(l, 'release');
  }
}
