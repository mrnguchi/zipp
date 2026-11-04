import {createContext,useCallback,useContext,useRef,useState} from 'react';
import type {PropsWithChildren} from 'react';
import {useWallet} from './WalletContext';
export type MoneyProvider='MTN MoMo'|'Orange Money';
export type DriverTopUp={id:string;amount:number;phone:string;provider:MoneyProvider;createdAt:number;status:'processing'|'completed'|'failed'|'canceled'};
export function topUpProblem(amount:number,phone:string){if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000)return 'Enter an amount between 1 and 1,000,000 XAF.';if(!/^(?:\+?237)?6\d{8}$/.test(phone.replace(/[\s()-]/g,'')))return 'Enter a valid Cameroon mobile money number.';}
type Value={requests:DriverTopUp[];begin:(input:Pick<DriverTopUp,'amount'|'phone'|'provider'>)=>{id?:string;error?:string};finish:(id:string,status:'completed'|'failed'|'canceled')=>boolean};
const Context=createContext<Value|null>(null);let sequence=0;
export function DriverMoneyProvider({children}:PropsWithChildren){
 const [requests,setRequests]=useState<DriverTopUp[]>([]),latest=useRef(requests);const {simulateDeposit}=useWallet();
 const begin=useCallback((input:Pick<DriverTopUp,'amount'|'phone'|'provider'>)=>{
  const error=topUpProblem(input.amount,input.phone);if(error)return {error};
  if(!__DEV__)return {error:'Top-up service is not connected yet.'};
  if(!['MTN MoMo','Orange Money'].includes(input.provider))return {error:'Choose a payment provider.'};
  const existing=latest.current.find(r=>r.status==='processing'&&r.amount===input.amount&&r.phone===input.phone&&r.provider===input.provider);if(existing)return {id:existing.id};
  const request:DriverTopUp={...input,id:`driver-topup-${Date.now()}-${++sequence}`,status:'processing',createdAt:Date.now()};latest.current=[request,...latest.current];setRequests(latest.current);return {id:request.id};
 },[]);
 const finish=useCallback((id:string,status:'completed'|'failed'|'canceled')=>{
  if(!__DEV__)return false;
  const request=latest.current.find(r=>r.id===id);if(!request||request.status!=='processing')return false;
  if(status==='completed'&&!simulateDeposit(request.id,request.amount))return false;
  latest.current=latest.current.map(r=>r.id===id?{...r,status}:r);setRequests(latest.current);return true;
 },[simulateDeposit]);
 return <Context.Provider value={{requests,begin,finish}}>{children}</Context.Provider>;
}
export function useDriverMoney(){const value=useContext(Context);if(!value)throw Error('DriverMoneyProvider required');return value;}
