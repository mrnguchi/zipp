import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { availableBalance, updateWallet } from '../services/walletLedger';
import type { WalletState } from '../services/walletLedger';
import { subscribeWalletDeposits } from '../services/walletEvents';
export type WalletTransaction = { id: string; kind: 'deposit' | 'payment'; amount: number; date: number };
const Context = createContext<{ balance: number; available: number; transactions: WalletTransaction[]; simulateDeposit: (id: string, amount: number) => boolean; reserve: (id: string, fare: number) => boolean; settle: (id: string, fare: number) => boolean } | null>(null);
export function WalletProvider({ children }: PropsWithChildren) {
  // Session-only development funds. Live balances must be hydrated and authorized by the server.
  const [wallet, setWallet] = useState<WalletState>({ balance: __DEV__ ? 25500 : 0, holds: {}, settled: {}, deposits: [] });
  const latest = useRef(wallet);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const transact = useCallback((type: 'reserve' | 'settle' | 'deposit', id: string, amount: number) => {
    const next = updateWallet(latest.current, { type, id, amount });
    if (next === latest.current) return false;
    latest.current = next; setWallet(next);
    if (amount > 0 && type !== 'reserve') setTransactions(current => [{ id, kind: type === 'deposit' ? 'deposit' : 'payment', amount, date: Date.now() }, ...current]);
    return true;
  }, []);
  const reserve = useCallback((id: string, amount: number) => transact('reserve', id, amount), [transact]);
  const settle = useCallback((id: string, amount: number) => transact('settle', id, amount), [transact]);
  const simulateDeposit = useCallback((id: string, amount: number) => __DEV__ && transact('deposit', id, amount), [transact]);
  useEffect(() => subscribeWalletDeposits(event => { transact('deposit', event.transactionId, event.amount); }), [transact]);
  return <Context.Provider value={{ balance: wallet.balance, available: availableBalance(wallet), transactions, simulateDeposit, reserve, settle }}>{children}</Context.Provider>;
}
export function useWallet() { const value = useContext(Context); if (!value) throw new Error('WalletProvider required'); return value; }
