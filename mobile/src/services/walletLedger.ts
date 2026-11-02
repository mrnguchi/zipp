export type WalletState = { balance: number; holds: Record<string, number>; settled: Record<string, number>; deposits: string[] };
export type WalletAction = { type: 'deposit'; id: string; amount: number } | { type: 'reserve' | 'settle'; id: string; amount: number };
export function availableBalance(state: WalletState) { return state.balance - Object.values(state.holds).reduce((sum, value) => sum + value, 0); }
export function updateWallet(state: WalletState, action: WalletAction): WalletState {
  if (!action.id || !Number.isSafeInteger(action.amount) || action.amount < 0) return state;
  if (action.type === 'deposit') {
    if (!action.amount || state.deposits.includes(action.id) || !Number.isSafeInteger(state.balance + action.amount)) return state;
    return { ...state, balance: state.balance + action.amount, deposits: [...state.deposits, action.id] };
  }
  if (action.id in state.settled) return state;
  if (action.type === 'reserve') {
    if (action.id in state.holds || action.amount <= 0 || availableBalance(state) < action.amount) return state;
    return { ...state, holds: { ...state.holds, [action.id]: action.amount } };
  }
  if (!(action.id in state.holds)) return state;
  const reserved = state.holds[action.id];
  if (action.amount > availableBalance(state) + reserved) return state;
  const holds = { ...state.holds }; delete holds[action.id];
  return { ...state, balance: state.balance - action.amount, holds, settled: { ...state.settled, [action.id]: action.amount } };
}
