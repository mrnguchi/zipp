export type Role = 'CUSTOMER' | 'DRIVER' | 'SUPPORT' | 'FINANCE' | 'ADMIN';
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly Role[];
  readonly mfaEnabled: boolean;
  readonly mfaVerifiedAt: Date | null;
}

export function hasRecentMfa(actor: Actor, now = new Date()): boolean {
  return (
    actor.mfaEnabled &&
    actor.mfaVerifiedAt !== null &&
    actor.mfaVerifiedAt.getTime() <= now.getTime() &&
    now.getTime() - actor.mfaVerifiedAt.getTime() <= 300_000
  );
}
