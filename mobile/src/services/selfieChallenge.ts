// This checks capture movements, not identity or resistance to presentation attacks.
export type FaceReading={x:number;y:number;width:number;height:number;yaw:number;roll:number;leftEye:number;rightEye:number;trackingId?:number};
export type SelfiePhase='align'|'straight'|'turn'|'centre'|'blink'|'complete';
export type SelfieChallenge={phase:SelfiePhase;since?:number;startedAt?:number;lastAt?:number;lostAt?:number;closedAt?:number;anchor?:{x:number;y:number;yaw:number};blinks:number;trackingId?:number;action?:'start'|'save'|'cancel';hint:string};
export const newSelfieChallenge=():SelfieChallenge=>({phase:'align',blinks:0,hint:'Position your face inside the guide'});
export function advanceSelfieChallenge(previous:SelfieChallenge,faces:FaceReading[],now:number):SelfieChallenge{
 let state={...previous,action:undefined} as SelfieChallenge;
 if(state.phase==='complete')return state;
 const face=faces[0];
 const visible=faces.length===1&&face&&[face.x,face.y,face.width,face.height,face.yaw,face.roll,face.leftEye,face.rightEye].every(Number.isFinite)&&face.leftEye>=0&&face.leftEye<=1&&face.rightEye>=0&&face.rightEye<=1&&face.width>=0.28&&face.width<=0.7&&face.height>=0.32&&face.height<=0.8&&face.x>=0.15&&face.x+face.width<=0.85&&face.y>=0.08&&face.y+face.height<=0.88&&Math.abs(face.x+face.width/2-0.5)<0.12&&Math.abs(face.y+face.height/2-0.48)<0.12&&Math.abs(face.roll)<18;
 if(!visible){
  const lostAt=state.lostAt??now;
  if(state.startedAt!==undefined&&(now-lostAt>900||faces.length>1))return {...newSelfieChallenge(),action:'cancel',hint:faces.length>1?'Only one person should be in the frame':'Face lost. Position yourself and try again.'};
  return {...state,lostAt,since:undefined,closedAt:undefined,hint:faces.length>1?'Only one person should be in the frame':'Position your face inside the guide'};
 }
 if(state.trackingId!==undefined&&face.trackingId!==undefined&&state.trackingId!==face.trackingId)return {...newSelfieChallenge(),action:state.startedAt!==undefined?'cancel':undefined,hint:'Face changed. Please try again.'};
 // A gap in analyzed frames cannot count as continuous alignment or a blink.
 if(state.lastAt!==undefined&&now-state.lastAt>900){if(state.startedAt!==undefined)return {...newSelfieChallenge(),action:'cancel',hint:'Camera paused. Please try again.'};state.since=undefined;}
 state={...state,lastAt:now,lostAt:undefined,trackingId:face.trackingId??state.trackingId};
 if(state.startedAt!==undefined&&now-state.startedAt>30000)return {...newSelfieChallenge(),action:'cancel',hint:'Let’s try again. Follow each prompt.'};
 const forward=Math.abs(face.yaw)<10;
 const held=(condition:boolean,ms:number)=>{if(!condition){state.since=undefined;return false;}state.since??=now;return now-state.since>=ms;};
 if(state.phase==='align'){
  state.hint='Look straight and hold still';
  const point={x:face.x+face.width/2,y:face.y+face.height/2,yaw:face.yaw};
  if(!state.anchor||Math.abs(point.x-state.anchor.x)>0.025||Math.abs(point.y-state.anchor.y)>0.025||Math.abs(point.yaw-state.anchor.yaw)>4){state.anchor=point;state.since=now;}
  if(held(forward&&face.leftEye>0.65&&face.rightEye>0.65,1000))return {...state,phase:'straight',startedAt:now,since:undefined,action:'start',hint:'Look straight at the camera'};
 }else if(state.phase==='straight'){
  state.hint='Look straight at the camera';if(held(forward,1500))return {...state,phase:'turn',since:undefined,hint:'Turn your head slightly to one side'};
 }else if(state.phase==='turn'){
  state.hint='Turn your head slightly to one side';if(held(Math.abs(face.yaw)>20&&Math.abs(face.yaw)<45,400))return {...state,phase:'centre',since:undefined,hint:'Now look back at the camera'};
 }else if(state.phase==='centre'){
  state.hint='Now look back at the camera';if(held(forward,500))return {...state,phase:'blink',since:undefined,hint:'Blink twice slowly'};
 }else if(state.phase==='blink'){
  state.hint=state.blinks===1?'One more blink':'Blink twice slowly';
  if(!forward){state.closedAt=undefined;return {...state,hint:'Look back at the camera to blink'};}
  if(face.leftEye<0.25&&face.rightEye<0.25)state.closedAt??=now;
  else if(face.leftEye>0.65&&face.rightEye>0.65&&state.closedAt!==undefined){const elapsed=now-state.closedAt;state.closedAt=undefined;if(elapsed>=70&&elapsed<=700)state.blinks++;}
  if(state.blinks>=2&&now-(state.startedAt??now)>=7000)return {...state,phase:'complete',action:'save',hint:'All done. Saving your video…'};
 }
 return state;
}
