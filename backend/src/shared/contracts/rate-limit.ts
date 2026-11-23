export interface Quota {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
}
export abstract class RateLimitPort {
  abstract consume(quotas: readonly Quota[]): Promise<void>;
}
