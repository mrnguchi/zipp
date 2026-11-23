import { Inject, Injectable, Module } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { IdentityModule } from '../../modules/identity/identity.module.js';
import { IdentityFacade } from '../../modules/identity/identity.facade.js';
import { RateLimitModule } from './redis-rate-limit.js';
import { RateLimitPort } from '../../shared/contracts/rate-limit.js';
import { ACCESS_RULE, REQUEST_ACTOR } from '../../shared/http/auth-context.js';
import type {
  AccessRule,
  AuthenticatedRequest,
} from '../../shared/http/auth-context.js';
import { ApiError, invalidCredentials } from '../../shared/errors/api-error.js';
import { hasRecentMfa } from '../../shared/contracts/actor.js';

@Injectable()
export class ApiSecurityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityFacade) private readonly identity: IdentityFacade,
    @Inject(RateLimitPort) private readonly limiter: RateLimitPort,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule =
      this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};
    if (rule.health) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    // Apply before JWT/database work so invalid credentials also share a bound.
    await this.limiter.consume([
      {
        key: `ingress:${this.identity.pseudonym('ip', ip)}`,
        limit: 300,
        windowMs: 60_000,
      },
    ]);
    if (rule.public) {
      await this.limiter.consume([
        {
          key: `anonymous:${this.identity.pseudonym('ip', ip)}`,
          limit: 60,
          windowMs: 60_000,
        },
      ]);
      return true;
    }
    const header = request.headers.authorization;
    if (
      !header ||
      header.length > 4096 ||
      !/^Bearer [A-Za-z0-9_.-]+$/.test(header)
    )
      throw invalidCredentials();
    const actor = await this.identity.authenticate(header.slice(7));
    if (
      rule.roles?.length &&
      !rule.roles.some((role) => actor.roles.includes(role))
    )
      throw new ApiError('FORBIDDEN', 403, 'Permission denied');
    if (
      rule.roles?.some(
        (role) =>
          actor.roles.includes(role) &&
          ['ADMIN', 'SUPPORT', 'FINANCE'].includes(role),
      ) &&
      !hasRecentMfa(actor)
    )
      throw new ApiError(
        'RECENT_MFA_REQUIRED',
        403,
        'Verify two-factor authentication',
      );
    const key = this.identity.pseudonym('actor', actor.userId);
    await this.limiter.consume([
      { key: `actor-minute:${key}`, limit: 120, windowMs: 60_000 },
      { key: `actor-burst:${key}`, limit: 30, windowMs: 10_000 },
    ]);
    Object.defineProperty(request, REQUEST_ACTOR, {
      value: Object.freeze(actor),
      enumerable: false,
    });
    return true;
  }
}

@Module({
  imports: [IdentityModule, RateLimitModule],
  providers: [{ provide: APP_GUARD, useClass: ApiSecurityGuard }],
})
export class SecurityModule {}
