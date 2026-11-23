import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor, Role } from '../contracts/actor.js';
import { invalidCredentials } from '../errors/api-error.js';

export const ACCESS_RULE = 'zipp.access';
export const REQUEST_ACTOR = Symbol('zipp.authenticated-actor');
export interface AuthenticatedRequest extends Request {
  [REQUEST_ACTOR]?: Actor;
}
export interface AccessRule {
  public?: boolean;
  health?: boolean;
  roles?: readonly Role[];
}
export const Access = (rule: AccessRule) => SetMetadata(ACCESS_RULE, rule);
export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const actor = context.switchToHttp().getRequest<AuthenticatedRequest>()[
      REQUEST_ACTOR
    ];
    if (!actor) throw invalidCredentials();
    return actor;
  },
);
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  },
);
