import { createContext, useContext, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { createPasswordRecovery } from '../services/passwordRecovery';
import type { RecoveryState } from '../services/passwordRecovery';
import { useProfileSettings } from './ProfileSettingsContext';

type Value={state:RecoveryState;request:(phone:string)=>void;verify:(code:string)=>void;complete:(password:string,confirm:string)=>void;clear:()=>void};
const Context=createContext<Value|null>(null);
export function PasswordRecoveryProvider({children}:PropsWithChildren){
  const flow=useRef(createPasswordRecovery(__DEV__)).current;
  const [state,setState]=useState(flow.snapshot);
  const {resetPreviewPassword}=useProfileSettings();
  const value:Value={state,request:phone=>setState(flow.request(phone)),verify:code=>setState(flow.verify(code)),complete:(password,confirm)=>{const next=flow.complete(password,confirm);resetPreviewPassword(password);setState(next);},clear:()=>setState(flow.clear())};
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePasswordRecovery(){const value=useContext(Context);if(!value)throw Error('PasswordRecoveryProvider required');return value;}
