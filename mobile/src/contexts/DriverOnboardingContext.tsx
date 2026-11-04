import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import type {PropsWithChildren} from 'react';
import {applicationProblem,emptyDriverApplication} from '../services/driverOnboarding';
import type {DriverApplication,DriverKind,DriverDocumentKey,VerificationFile} from '../services/driverOnboarding';
import {useProfile} from './ProfileContext';
type Value={application:DriverApplication;update:(patch:Partial<Pick<DriverApplication,'fullName'|'phone'|'city'|'make'|'model'|'plate'|'color'|'condition'>>)=>void;chooseKind:(kind:DriverKind)=>void;setDocument:(key:DriverDocumentKey,file?:VerificationFile)=>void;setSelfie:(selfie:DriverApplication['selfie'])=>void;saveDraft:()=>string|undefined};
const Context=createContext<Value|null>(null);
export function DriverOnboardingProvider({children}:PropsWithChildren){
  const [application,setApplication]=useState(emptyDriverApplication);
  const {profile}=useProfile();
  const owner=useRef(profile?.phone);
  useEffect(()=>{if(owner.current!==profile?.phone){owner.current=profile?.phone;setApplication(emptyDriverApplication());}},[profile?.phone]);
  const update=useCallback((patch:Parameters<Value['update']>[0])=>setApplication(current=>({...current,...patch,status:'draft'})),[]);
  const chooseKind=useCallback((kind:DriverKind)=>setApplication(current=>current.kind===kind?current:{...emptyDriverApplication(),kind,fullName:current.fullName,phone:current.phone,city:current.city}),[]);
  const setDocument=useCallback((key:DriverDocumentKey,file?:VerificationFile)=>setApplication(current=>({...current,status:'draft',documents:{...current.documents,[key]:file}})),[]);
  const setSelfie=useCallback((selfie:DriverApplication['selfie'])=>setApplication(current=>({...current,selfie,status:'draft'})),[]);
  const saveDraft=()=>{const issue=applicationProblem(application,'review');if(issue)return issue;setApplication(current=>({...current,status:'draft_saved',savedAt:Date.now()}));};
  return <Context.Provider value={{application,update,chooseKind,setDocument,setSelfie,saveDraft}}>{children}</Context.Provider>;
}
export function useDriverOnboarding(){const context=useContext(Context);if(!context)throw Error('DriverOnboardingProvider required');return context;}
