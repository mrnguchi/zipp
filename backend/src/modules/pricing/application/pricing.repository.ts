import type { TransactionContext } from '../../../shared/contracts/unit-of-work.js';
import type {
  AreaInput,
  PolicyInput,
  QuoteInput,
} from '../contracts/pricing.schemas.js';
import type {
  AreaRecord,
  PolicyRecord,
  QuoteRecord,
  RouteResult,
} from '../contracts/pricing-contracts.js';
export abstract class PricingRepository {
  abstract policyForQuote(
    id: string,
    context: TransactionContext,
  ): Promise<PolicyRecord | null>;
  abstract policy(
    areaId: string,
    serviceClass: QuoteInput['serviceClass'],
    context?: TransactionContext,
  ): Promise<PolicyRecord | null>;
  abstract lockArea(context: TransactionContext, id: string): Promise<void>;
  abstract areas(): Promise<AreaRecord[]>;
  abstract area(
    context: TransactionContext,
    id: string,
  ): Promise<AreaRecord | null>;
  abstract createArea(
    context: TransactionContext,
    input: AreaInput,
  ): Promise<AreaRecord>;
  abstract activateArea(
    context: TransactionContext,
    id: string,
    active: boolean,
  ): Promise<void>;
  abstract publish(
    context: TransactionContext,
    actorId: string,
    input: PolicyInput,
  ): Promise<PolicyRecord>;
  abstract byRequest(
    ownerId: string,
    key: string,
    context?: TransactionContext,
  ): Promise<QuoteRecord | null>;
  abstract quote(
    id: string,
    context?: TransactionContext,
  ): Promise<QuoteRecord | null>;
  abstract createQuote(
    context: TransactionContext,
    ownerId: string,
    key: string,
    fingerprint: string,
    input: QuoteInput,
    policy: PolicyRecord,
    route: RouteResult,
    total: bigint,
    snapshot: Record<string, string | number | boolean>,
  ): Promise<QuoteRecord>;
  abstract lockQuote(context: TransactionContext, id: string): Promise<void>;
  abstract consume(
    context: TransactionContext,
    id: string,
    bookingKey: string,
  ): Promise<void>;
}
