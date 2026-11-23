export type ProviderResult = 'confirmed' | 'failed' | 'pending' | 'unknown';
export interface ProviderCommand {
  providerReference: string;
  operationType: 'TOP_UP' | 'WITHDRAWAL';
  amountXaf: bigint;
  simulatedOutcome: string;
  attempt: number;
}
export abstract class PaymentProvider {
  /** Same stable reference must identify one provider effect across retries/status queries. */
  abstract resolve(command: ProviderCommand): Promise<ProviderResult>;
}
