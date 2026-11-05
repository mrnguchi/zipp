import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';

export function useDriverOfferSimulation(enabled:boolean,onOffer:()=>void){
  const callback=useRef(onOffer);callback.current=onOffer;
  useEffect(()=>{
    if(!__DEV__||!enabled)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let delivered=false;
    function clear(){if(timer!==undefined){clearTimeout(timer);timer=undefined;}}
    function schedule(state:string|null|undefined){
      clear();if(state!=='active'||delivered)return;
      timer=setTimeout(()=>{timer=undefined;if(AppState.currentState==='active'&&!delivered){delivered=true;callback.current();}},8000);
    }
    schedule(AppState.currentState);
    const subscription=AppState.addEventListener('change',schedule);
    return()=>{clear();subscription.remove();};
  },[enabled]);
}
