export type WalletDepositEvent = { transactionId: string; amount: number };
const listeners = new Set<(event: WalletDepositEvent) => void>();
// Call only after the server confirms a successful deposit. Opening a top-up
// screen or tapping a payment button must never publish a success event.
export function publishWalletDeposit(event: WalletDepositEvent) {
  if (!event.transactionId || !Number.isSafeInteger(event.amount) || event.amount <= 0) return;
  listeners.forEach(listener => listener(event));
}
export function subscribeWalletDeposits(listener: (event: WalletDepositEvent) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
