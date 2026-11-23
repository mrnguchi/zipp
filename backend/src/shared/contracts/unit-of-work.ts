/** Opaque capability, valid only during its owning transaction callback. */
export interface TransactionContext {
  readonly id: string;
}

export abstract class UnitOfWork {
  abstract run<T>(
    operation: (context: TransactionContext) => Promise<T>,
  ): Promise<T>;
}

export abstract class AuditPort {
  abstract record(
    context: TransactionContext,
    actorId: string | null,
    action: string,
    subjectId?: string,
  ): Promise<void>;
}
