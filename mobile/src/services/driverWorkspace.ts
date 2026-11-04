import type {DriverKind} from './driverOnboarding';
export type DriverJobPhase='offer'|'to_pickup'|'arrived'|'in_progress'|'at_dropoff'|'completed'|'canceled';
export type DriverJob={id:string;kind:'ride'|'delivery';phase:DriverJobPhase;customer:string;pickup:string;destination:string;fare:number;fee:number;createdAt:number;completedAt?:number;rating?:number;cancelReason?:string;package?:string};
export type DriverPayout={id:string;amount:number;provider:'MTN MoMo'|'Orange Money';phone:string;status:'processing'|'paid'|'failed'|'canceled';createdAt:number};
export type DriverWorkspace={enabled:boolean;kind:DriverKind;online:boolean;job?:DriverJob;history:DriverJob[];payouts:DriverPayout[]};
export type DriverAction={type:'enable';kind:DriverKind;now:number}|{type:'online';value:boolean}|{type:'offer';id:string;now:number}|{type:'accept'}|{type:'advance';pin?:string;now:number}|{type:'cancel';reason:string;now:number}|{type:'dismiss'}|{type:'rate';id:string;rating:number}|{type:'kind';kind:DriverKind}|{type:'payout';payout:DriverPayout}|{type:'payout-result';id:string;status:'paid'|'failed'|'canceled'}|{type:'reset'};
export const emptyDriverWorkspace=():DriverWorkspace=>({enabled:false,kind:'vehicle',online:false,history:[],payouts:[]});
export const activeDriverJob=(job?:DriverJob)=>!!job&&!['offer','completed','canceled'].includes(job.phase);
export const driverNet=(job:DriverJob)=>job.fare-job.fee;
export const driverBalance=(state:DriverWorkspace)=>state.history.filter(j=>j.phase==='completed').reduce((total,j)=>total+driverNet(j),0)-state.payouts.filter(p=>p.status==='processing'||p.status==='paid').reduce((total,p)=>total+p.amount,0);
export const DEMO_DRIVER={name:'Bertrand Suh',firstName:'Suh',phone:'699000001',email:'driver.demo@zipp.example',plate:'SW 681 BS',make:'Toyota',model:'Yaris',color:'White',category:'Comfort',rating:'4.9',pin:'4826',deliveryPin:'6291'};
export function payoutProblem(amount:number,phone:string,balance:number){if(!Number.isSafeInteger(amount)||amount<500)return 'Enter at least 500 XAF.';if(amount>balance)return 'The amount exceeds your available earnings.';if(!/^(?:\+?237)?6\d{8}$/.test(phone.replace(/[\s()-]/g,'')))return 'Enter a valid Cameroon mobile money number.';}
export function driverWorkspaceReducer(state:DriverWorkspace,action:DriverAction):DriverWorkspace{
 if(action.type==='reset')return emptyDriverWorkspace();
 if(action.type==='enable'){
  const history:DriverJob[]=[1800,2700,3600].map((net,index)=>({id:`demo-history-${index}`,kind:index===1?'delivery':'ride',phase:'completed',customer:['Marie E.','Daniel M.','Grace A.'][index],pickup:'Molyko Junction, Buea',destination:'University of Buea',fare:net/0.9,fee:net/9,createdAt:action.now-(index+1)*3600000,completedAt:action.now-(index+1)*3600000+1200000,rating:5}));
  return {...emptyDriverWorkspace(),enabled:true,kind:action.kind,history};
 }
 if(!state.enabled)return state;
 if(action.type==='online')return activeDriverJob(state.job)?state:{...state,online:action.value,job:action.value?state.job:undefined};
 if(action.type==='kind')return activeDriverJob(state.job)?state:{...state,kind:action.kind,job:undefined,online:false};
 if(action.type==='offer'){
  if(!state.online||activeDriverJob(state.job)||state.job?.phase==='offer')return state;
  return {...state,job:{id:action.id,kind:state.kind==='bike'?'delivery':'ride',phase:'offer',customer:state.kind==='bike'?'Daniel M.':'Marie E.',pickup:'Molyko Junction, Buea',destination:'University of Buea',fare:state.kind==='bike'?2000:2500,fee:state.kind==='bike'?200:250,createdAt:action.now,...(state.kind==='bike'?{package:'Documents · Small package'}:{})}};
 }
 if(action.type==='payout'){
  const p=action.payout;if(p.status!=='processing'||payoutProblem(p.amount,p.phone,driverBalance(state))||state.payouts.some(item=>item.id===p.id)||!['MTN MoMo','Orange Money'].includes(p.provider))return state;
  return {...state,payouts:[p,...state.payouts]};
 }
 if(action.type==='payout-result')return {...state,payouts:state.payouts.map(p=>p.id===action.id&&p.status==='processing'?{...p,status:action.status}:p)};
 if(action.type==='rate')return Number.isInteger(action.rating)&&action.rating>=1&&action.rating<=5?{...state,history:state.history.map(j=>j.id===action.id&&j.phase==='completed'?{...j,rating:action.rating}:j)}:state;
 const job=state.job;if(!job)return state;
 if(action.type==='dismiss')return activeDriverJob(job)?state:{...state,job:undefined};
 if(action.type==='accept')return job.phase==='offer'&&state.online?{...state,job:{...job,phase:'to_pickup'}}:state;
 if(action.type==='cancel'){
  if(!['offer','to_pickup','arrived'].includes(job.phase)||!action.reason.trim())return state;
  const canceled={...job,phase:'canceled' as const,cancelReason:action.reason,completedAt:action.now};
  return {...state,job:canceled,history:job.phase==='offer'?state.history:[canceled,...state.history.filter(j=>j.id!==job.id)]};
 }
 if(action.type==='advance'){
  if(job.phase==='arrived'&&job.kind==='ride'&&action.pin!==DEMO_DRIVER.pin)return state;
  if(job.phase==='at_dropoff'&&job.kind==='delivery'&&action.pin!==DEMO_DRIVER.deliveryPin)return state;
  const next:Partial<Record<DriverJobPhase,DriverJobPhase>>={to_pickup:'arrived',arrived:'in_progress',in_progress:'at_dropoff',at_dropoff:'completed'};
  const phase=next[job.phase];if(!phase)return state;
  const updated={...job,phase,...(phase==='completed'?{completedAt:action.now}:{})};
  return {...state,job:updated,...(phase==='completed'?{history:[updated,...state.history.filter(j=>j.id!==job.id)]}:{})};
 }
 return state;
}
