import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { availableBalance, updateWallet } from '../services/walletLedger';
import type { WalletState } from '../services/walletLedger';
import { subscribeWalletDeposits } from '../services/walletEvents';
const Context = createContext<{ balance: number; available: number; reserve: (id: string, fare: number) => boolean; settle: (id: string, fare: number) => boolean } | null>(null);
export function WalletProvider({ children }: PropsWithChildren) {
  // Session-only development funds. Live balances must be hydrated and authorized by the server.
  const [wallet, setWallet] = useState<WalletState>({ balance: __DEV__ ? 25500 : 0, holds: {}, settled: {}, deposits: [] });
  const latest = useRef(wallet);
  const transact = useCallback((type: 'reserve' | 'settle' | 'deposit', id: string, amount: number) => {
    const next = updateWallet(latest.current, { type, id, amount });
    if (next === latest.current) return false;
    latest.current = next; setWallet(next); return true;
  }, []);
  const reserve = useCallback((id: string, amount: number) => transact('reserve', id, amount), [transact]);
  const settle = useCallback((id: string, amount: number) => transact('settle', id, amount), [transact]);
  useEffect(() => subscribeWalletDeposits(event => { transact('deposit', event.transactionId, event.amount); }), [transact]);
  return <Context.Provider value={{ balance: wallet.balance, available: availableBalance(wallet), reserve, settle }}>{children}</Context.Provider>;
}
export function useWallet() { const value = useContext(Context); if (!value) throw new Error('WalletProvider required'); return value; }
