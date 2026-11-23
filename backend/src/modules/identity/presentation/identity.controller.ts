import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  Access,
  CurrentActor,
  ClientIp,
} from '../../../shared/http/auth-context.js';
import type { Actor } from '../../../shared/contracts/actor.js';
import { SchemaPipe } from '../../../shared/http/schema.pipe.js';
import * as schemas from '../contracts/identity.schemas.js';
import { RegistrationService } from '../application/registration.service.js';
import { PasswordService } from '../application/password.service.js';
import { ChallengeService } from '../application/challenge.service.js';
import { SessionService } from '../application/session.service.js';
import { TwoFactorService } from '../application/two-factor.service.js';

@Controller('auth')
export class IdentityController {
  constructor(
    @Inject(RegistrationService)
    private readonly registration: RegistrationService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(ChallengeService) private readonly challenges: ChallengeService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(TwoFactorService) private readonly factors: TwoFactorService,
  ) {}
  @Post('signup')
  @HttpCode(202)
  @Access({ public: true })
  signup(
    @Body(new SchemaPipe(schemas.signupBody))
    input: z.infer<typeof schemas.signupBody>,
    @ClientIp() ip: string,
  ) {
    return this.registration.start(input, ip);
  }
  @Post('signup/verify')
  @HttpCode(200)
  @Access({ public: true })
  verifySignup(
    @Body(new SchemaPipe(schemas.verifyBody))
    input: z.infer<typeof schemas.verifyBody>,
  ) {
    return this.registration.verify(input.challengeId, input.code);
  }
  @Post('login')
  @HttpCode(202)
  @Access({ public: true })
  login(
    @Body(new SchemaPipe(schemas.loginBody))
    input: z.infer<typeof schemas.loginBody>,
    @ClientIp() ip: string,
  ) {
    return this.passwords.login(input.phone, input.password, ip);
  }
  @Post('login/verify')
  @HttpCode(200)
  @Access({ public: true })
  verifyLogin(
    @Body(new SchemaPipe(schemas.verifyBody))
    input: z.infer<typeof schemas.verifyBody>,
  ) {
    return this.passwords.verifyLogin(input.challengeId, input.code);
  }
  @Post('challenges/resend')
  @HttpCode(202)
  @Access({ public: true })
  resend(
    @Body(new SchemaPipe(schemas.resendBody))
    input: z.infer<typeof schemas.resendBody>,
    @ClientIp() ip: string,
  ) {
    return this.challenges.resend(input.challengeId, ip);
  }
  @Post('refresh')
  @HttpCode(200)
  @Access({ public: true })
  refresh(
    @Body(new SchemaPipe(schemas.refreshBody))
    input: z.infer<typeof schemas.refreshBody>,
  ) {
    return this.sessions.refresh(input.refreshToken);
  }
  @Post('logout')
  @HttpCode(204)
  logout(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.logoutBody))
    input: z.infer<typeof schemas.logoutBody>,
  ) {
    return this.sessions.logout(actor, input.allSessions);
  }
  @Post('password/reset')
  @HttpCode(202)
  @Access({ public: true })
  reset(
    @Body(new SchemaPipe(schemas.phoneBody))
    input: z.infer<typeof schemas.phoneBody>,
    @ClientIp() ip: string,
  ) {
    return this.passwords.reset(input.phone, ip);
  }
  @Post('password/reset/confirm')
  @HttpCode(204)
  @Access({ public: true })
  confirmReset(
    @Body(new SchemaPipe(schemas.resetBody))
    input: z.infer<typeof schemas.resetBody>,
  ) {
    return this.passwords.confirmReset(
      input.challengeId,
      input.code,
      input.password,
    );
  }
  @Post('password/change')
  @HttpCode(204)
  change(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.changeBody))
    input: z.infer<typeof schemas.changeBody>,
  ) {
    return this.passwords.change(actor, input.currentPassword, input.password);
  }
  @Post('account-deletion')
  @HttpCode(202)
  async deletion(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.passwordBody))
    input: z.infer<typeof schemas.passwordBody>,
  ) {
    await this.passwords.deleteAccount(actor, input.password);
    return { status: 'deletion_requested' };
  }
  @Get('session')
  session(@CurrentActor() actor: Actor) {
    return {
      userId: actor.userId,
      sessionId: actor.sessionId,
      roles: actor.roles,
      twoFactorEnabled: actor.mfaEnabled,
      mfaVerifiedAt: actor.mfaVerifiedAt?.toISOString() ?? null,
    };
  }
  @Post('2fa/login')
  @HttpCode(200)
  @Access({ public: true })
  factorLogin(
    @Body(new SchemaPipe(schemas.factorBody))
    input: z.infer<typeof schemas.factorBody>,
  ) {
    return this.factors.login(input.challengeId, input.proof);
  }
  @Post('2fa/enroll')
  @HttpCode(200)
  enroll(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.passwordBody))
    input: z.infer<typeof schemas.passwordBody>,
  ) {
    return this.factors.enroll(actor, input.password);
  }
  @Post('2fa/confirm')
  @HttpCode(200)
  confirm(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.codeBody))
    input: z.infer<typeof schemas.codeBody>,
  ) {
    return this.factors.confirm(actor, input.code);
  }
  @Post('2fa/reauthenticate')
  @HttpCode(200)
  reauthenticate(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.secureFactorBody))
    input: z.infer<typeof schemas.secureFactorBody>,
  ) {
    return this.factors.secureAction(
      actor,
      input.password,
      input.proof,
      'reauthenticate',
    );
  }
  @Post('2fa/disable')
  @HttpCode(200)
  disable(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.secureFactorBody))
    input: z.infer<typeof schemas.secureFactorBody>,
  ) {
    return this.factors.secureAction(
      actor,
      input.password,
      input.proof,
      'disable',
    );
  }
  @Post('2fa/recovery-codes')
  @HttpCode(200)
  recovery(
    @CurrentActor() actor: Actor,
    @Body(new SchemaPipe(schemas.secureFactorBody))
    input: z.infer<typeof schemas.secureFactorBody>,
  ) {
    return this.factors.secureAction(
      actor,
      input.password,
      input.proof,
      'recovery',
    );
  }
}
