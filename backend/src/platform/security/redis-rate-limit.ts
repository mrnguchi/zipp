import { createHash } from 'node:crypto';
import { Inject, Injectable, Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { RedisService } from '../redis/redis.service.js';
import { RateLimitPort } from '../../shared/contracts/rate-limit.js';
import type { Quota } from '../../shared/contracts/rate-limit.js';
import { ApiError } from '../../shared/errors/api-error.js';

// All applicable windows are checked before any are charged, atomically across replicas.
const consume = `
local retry = 0
for i,key in ipairs(KEYS) do
  if tonumber(redis.call('GET',key) or '0') >= tonumber(ARGV[(i-1)*2+1]) then
    local ttl = redis.call('PTTL',key)
    retry = math.max(retry, ttl > 0 and ttl or tonumber(ARGV[(i-1)*2+2]))
  end
end
if retry > 0 then return {0, math.ceil(retry/1000)} end
for i,key in ipairs(KEYS) do
  local count = redis.call('INCR',key)
  if count == 1 then redis.call('PEXPIRE',key,ARGV[(i-1)*2+2]) end
end
return {1,0}`;

@Injectable()
export class RedisRateLimit extends RateLimitPort {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {
    super();
  }
  async consume(quotas: readonly Quota[]): Promise<void> {
    if (!quotas.length || quotas.length > 8)
      throw new Error('Invalid quota group');
    const keys = quotas.map(
      (quota) =>
        `zipp:{rate}:${createHash('sha256').update(quota.key).digest('hex')}`,
    );
    let result: unknown;
    try {
      result = await this.redis.cache.eval(
        consume,
        keys.length,
        ...keys,
        ...quotas.flatMap((quota) => [quota.limit, quota.windowMs]),
      );
    } catch {
      throw new ApiError(
        'LIMITER_UNAVAILABLE',
        503,
        'Service temporarily unavailable',
        2,
      );
    }
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      typeof result[0] !== 'number' ||
      typeof result[1] !== 'number'
    )
      throw new ApiError(
        'LIMITER_UNAVAILABLE',
        503,
        'Service temporarily unavailable',
      );
    if (result[0] !== 1)
      throw new ApiError(
        'RATE_LIMITED',
        429,
        'Too many requests',
        Math.max(1, result[1]),
      );
  }
}

@Module({
  imports: [RedisModule],
  providers: [{ provide: RateLimitPort, useClass: RedisRateLimit }],
  exports: [RateLimitPort],
})
export class RateLimitModule {}
