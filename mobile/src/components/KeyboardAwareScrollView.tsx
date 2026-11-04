import {forwardRef,useCallback,useEffect,useImperativeHandle,useRef} from 'react';
import type {ComponentRef} from 'react';
import {Keyboard,Platform,ScrollView,TextInput} from 'react-native';
import type {ScrollViewProps} from 'react-native';

// Keep the focused field inside the actual scroll viewport, including when a
// footer or a modal makes it shorter than the keyboard's top edge.
export const KeyboardAwareScrollView=forwardRef<ComponentRef<typeof ScrollView>,ScrollViewProps>(function KeyboardAwareScrollView(props,forwardedRef){
  const scroll=useRef<ComponentRef<typeof ScrollView>>(null),offset=useRef(0),focused=useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput>>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useImperativeHandle(forwardedRef,()=>scroll.current!,[]);
  const reveal=useCallback(()=>{
    if(Platform.OS!=='android'||!focused.current||!scroll.current)return;
    const input=focused.current;
    if(TextInput.State.currentlyFocusedInput()!==input)return;
    scroll.current.measureInWindow((_x,y,_width,height)=>{
      input.measureInWindow((_ix,inputY,_iw,inputHeight)=>{
        if(TextInput.State.currentlyFocusedInput()!==input||!height)return;
        const bottom=Math.min(y+height,Keyboard.metrics()?.screenY??Infinity)-20;
        const delta=inputY+Math.min(inputHeight,100)-bottom;
        if(delta>0)scroll.current?.scrollTo({y:offset.current+delta,animated:true});
      });
    });
  },[]);
  const schedule=useCallback(()=>{clearTimeout(timer.current);timer.current=setTimeout(reveal,80);},[reveal]);
  useEffect(()=>{const subscription=Keyboard.addListener('keyboardDidShow',schedule);return()=>{subscription.remove();clearTimeout(timer.current);focused.current=null;};},[schedule]);
  return <ScrollView {...props} ref={scroll} keyboardShouldPersistTaps={props.keyboardShouldPersistTaps??'handled'} keyboardDismissMode={props.keyboardDismissMode??'on-drag'} scrollEventThrottle={props.scrollEventThrottle??16}
    onFocus={event=>{focused.current=TextInput.State.currentlyFocusedInput();schedule();props.onFocus?.(event);}}
    onBlur={event=>{focused.current=null;props.onBlur?.(event);}}
    onLayout={event=>{schedule();props.onLayout?.(event);}}
    onScroll={event=>{offset.current=event.nativeEvent.contentOffset.y;props.onScroll?.(event);}}/>;
});
