import type { TransactionContext } from '../../../../shared/contracts/unit-of-work.js';
import type { Role } from '../../../../shared/contracts/actor.js';

export type Purpose = 'ENROLL' | 'LOGIN_SMS' | 'LOGIN_MFA' | 'PASSWORD_RESET';
export interface IdentityUser {
  id: string;
  phone: string;
  passwordHash: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETION_REQUESTED';
  roles: Role[];
  twoFactorSecret: string | null;
  pendingTwoFactor: string | null;
  pendingTwoFactorUntil: Date | null;
  lastTotpStep: number;
}
export interface ChallengeRecord {
  id: string;
  userId: string;
  purpose: Purpose;
  codeHash: string | null;
  pendingPasswordHash: string | null;
  pendingDisplayName: string | null;
  attempts: number;
  expiresAt: Date;
  chainExpiresAt: Date;
  usedAt: Date | null;
}
export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
}
export interface RefreshRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}
export abstract class IdentityRepository {
  abstract accountStatus(
    context: TransactionContext,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<void>;
  abstract driverRole(
    context: TransactionContext,
    userId: string,
    enabled: boolean,
  ): Promise<void>;
  abstract findPhone(
    phone: string,
    context?: TransactionContext,
  ): Promise<IdentityUser | null>;
  abstract user(
    id: string,
    context?: TransactionContext,
  ): Promise<IdentityUser | null>;
  abstract pending(
    context: TransactionContext,
    phone: string,
  ): Promise<IdentityUser>;
  abstract lock(context: TransactionContext, userId: string): Promise<void>;
  abstract activate(
    context: TransactionContext,
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<void>;
  abstract challenge(
    id: string,
    context?: TransactionContext,
  ): Promise<ChallengeRecord | null>;
  abstract createChallenge(
    context: TransactionContext,
    value: Omit<ChallengeRecord, 'attempts' | 'usedAt'>,
  ): Promise<void>;
  abstract invalidateChallenges(
    context: TransactionContext,
    userId: string,
    purpose: Purpose | undefined,
    now: Date,
  ): Promise<void>;
  /** Reserves one durable attempt atomically; false includes exhausted/expired/consumed. */
  abstract attempt(
    context: TransactionContext,
    id: string,
    purpose: Purpose,
    now: Date,
  ): Promise<boolean>;
  abstract consume(
    context: TransactionContext,
    id: string,
    now: Date,
  ): Promise<void>;
  abstract createSession(
    context: TransactionContext,
    userId: string,
    tokenHash: string,
    now: Date,
    mfaAt: Date | null,
  ): Promise<SessionRecord>;
  abstract session(
    id: string,
    context?: TransactionContext,
  ): Promise<SessionRecord | null>;
  abstract refresh(
    hash: string,
    context?: TransactionContext,
  ): Promise<RefreshRecord | null>;
  abstract rotate(
    context: TransactionContext,
    oldId: string,
    session: SessionRecord,
    newHash: string,
    now: Date,
  ): Promise<void>;
  abstract revoke(
    context: TransactionContext,
    userId: string,
    now: Date,
    sessionId?: string,
  ): Promise<void>;
  abstract password(
    context: TransactionContext,
    userId: string,
    hash: string,
  ): Promise<void>;
  abstract pendingMfa(
    context: TransactionContext,
    userId: string,
    encrypted: string,
    until: Date,
  ): Promise<void>;
  abstract enrollmentAttempt(
    context: TransactionContext,
    userId: string,
    now: Date,
  ): Promise<boolean>;
  abstract factorAttempt(
    context: TransactionContext,
    userId: string,
    now: Date,
  ): Promise<boolean>;
  abstract factorSuccess(
    context: TransactionContext,
    userId: string,
  ): Promise<void>;
  abstract enableMfa(
    context: TransactionContext,
    userId: string,
    encrypted: string,
    step: number,
  ): Promise<void>;
  abstract acceptTotp(
    context: TransactionContext,
    userId: string,
    step: number,
  ): Promise<boolean>;
  abstract consumeRecovery(
    context: TransactionContext,
    userId: string,
    hash: string,
    now: Date,
  ): Promise<boolean>;
  abstract recoveryCodes(
    context: TransactionContext,
    userId: string,
    hashes: string[],
  ): Promise<void>;
  abstract disableMfa(
    context: TransactionContext,
    userId: string,
  ): Promise<void>;
  abstract markMfa(
    context: TransactionContext,
    sessionId: string,
    now: Date,
  ): Promise<void>;
  abstract deletion(
    context: TransactionContext,
    userId: string,
    now: Date,
  ): Promise<void>;
}
export abstract class IdentityCrypto {
  abstract hashPassword(password: string): Promise<string>;
  abstract verifyPassword(
    password: string,
    stored: string | null,
  ): Promise<boolean>;
  abstract digest(purpose: string, value: string): string;
  abstract matchesDigest(stored: string | null, candidate: string): boolean;
  abstract code(): string;
  abstract token(): string;
  abstract sign(userId: string, sessionId: string): Promise<string>;
  abstract verify(
    token: string,
  ): Promise<{ userId: string; sessionId: string }>;
  abstract createTotp(
    userId: string,
    phone: string,
  ): { encrypted: string; uri: string };
  abstract verifyTotp(
    userId: string,
    encrypted: string,
    token: string,
    afterStep: number,
  ): Promise<number | null>;
}
export interface DeliveryMessage {
  challengeId: string;
  purpose: Purpose;
  phone: string;
  code: string;
  expiresAt: Date;
}
export abstract class CodeDelivery {
  abstract send(message: DeliveryMessage): Promise<void>;
}
