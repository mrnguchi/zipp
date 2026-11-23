import { Inject, Injectable } from '@nestjs/common';
import { FinanceConfig } from '../finance.config.js';
import { PaymentProvider } from '../application/payment-provider.port.js';
import type {
  ProviderCommand,
  ProviderResult,
} from '../application/payment-provider.port.js';

/** No network or real payment. Outcome is persisted server configuration, never client input. */
@Injectable()
export class LocalPaymentProvider extends PaymentProvider {
  constructor(@Inject(FinanceConfig) private readonly config: FinanceConfig) {
    super();
  }
  resolve(command: ProviderCommand): Promise<ProviderResult> {
    this.config.assertEnabled();
    const result =
      command.simulatedOutcome === 'success'
        ? 'confirmed'
        : command.simulatedOutcome === 'failure'
          ? 'failed'
          : command.simulatedOutcome === 'pending'
            ? 'pending'
            : command.simulatedOutcome === 'ambiguous'
              ? command.attempt < 2
                ? 'unknown'
                : 'confirmed'
              : 'unknown';
    return Promise.resolve(result);
  }
}
