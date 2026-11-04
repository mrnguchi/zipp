import {createContext,useContext,useEffect,useReducer,useRef} from 'react';
import type {PropsWithChildren} from 'react';
import {DEMO_DRIVER,driverWorkspaceReducer,emptyDriverWorkspace} from '../services/driverWorkspace';
import type {DriverAction,DriverWorkspace} from '../services/driverWorkspace';
import type {DriverKind} from '../services/driverOnboarding';
import {useProfile} from './ProfileContext';
import {useRole} from './RoleContext';
import {queryClient} from '../query/client';
const Context=createContext<{state:DriverWorkspace;dispatch:(action:DriverAction)=>void;enableDemo:(kind?:DriverKind)=>void}|null>(null);
export function DriverWorkspaceProvider({children}:PropsWithChildren){
 const {profile,startSession}=useProfile();const [state,dispatch]=useReducer(driverWorkspaceReducer,undefined,()=>__DEV__&&profile?.demoDriver?driverWorkspaceReducer(emptyDriverWorkspace(),{type:'enable',kind:profile.demoDriver,now:Date.now()}):emptyDriverWorkspace());const {selectRole}=useRole();const owner=useRef(profile?.phone);
 useEffect(()=>{if(owner.current!==profile?.phone){owner.current=profile?.phone;if(profile?.phone!==DEMO_DRIVER.phone)dispatch({type:'reset'});}},[profile?.phone]);
 function enableDemo(kind:DriverKind='vehicle'){if(!__DEV__)return;queryClient.clear();selectRole('driver');startSession({phone:DEMO_DRIVER.phone,name:DEMO_DRIVER.name,firstName:DEMO_DRIVER.firstName,email:DEMO_DRIVER.email,demoDriver:kind});}
 const visible=__DEV__&&profile?.phone===DEMO_DRIVER.phone?state:emptyDriverWorkspace();
 return <Context.Provider value={{state:visible,dispatch:action=>{if(__DEV__&&profile?.phone===DEMO_DRIVER.phone)dispatch(action);},enableDemo}}>{children}</Context.Provider>;
}
export function useDriverWorkspace(){const value=useContext(Context);if(!value)throw Error('DriverWorkspaceProvider required');return value;}
