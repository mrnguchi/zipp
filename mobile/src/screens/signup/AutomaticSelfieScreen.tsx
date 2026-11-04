import {useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Linking,StyleSheet,View} from 'react-native';
import {Camera as NativeCamera,runAsync,useCameraDevice,useCameraFormat,useCameraPermission,useFrameProcessor} from 'react-native-vision-camera';
import {useFaceDetector,type Face} from 'react-native-vision-camera-face-detector';
import {Worklets} from 'react-native-worklets-core';
import {useIsFocused,useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {Ionicons} from '@expo/vector-icons';
import {AppText as Text} from '../../components/AppText';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {ActionButton} from '../../components/ActionButton';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import {advanceSelfieChallenge,newSelfieChallenge} from '../../services/selfieChallenge';
import type {RootStackParamList} from '../../navigation/types';
import {colors} from '../../constants/colors';
import {OnboardingFrame,s} from './OnboardingUI';

export function AutomaticSelfieScreen(){
 const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>(),focused=useIsFocused();
 const {setSelfie}=useDriverOnboarding(),{hasPermission,requestPermission}=useCameraPermission();
 const device=useCameraDevice('front'),camera=useRef<NativeCamera>(null);
 const format=useCameraFormat(device,[{videoResolution:{width:640,height:480}},{fps:30}]);
 const cameraRatio=format?Math.min(format.videoWidth,format.videoHeight)/Math.max(format.videoWidth,format.videoHeight):3/4;
 const challenge=useRef(newSelfieChallenge()),recording=useRef(false),saving=useRef(false),mounted=useRef(true),ready=useRef(false),generation=useRef(0),lastFrame=useRef(0),cancelling=useRef(false);
 const [state,setState]=useState(newSelfieChallenge),[error,setError]=useState(''),[active,setActive]=useState(AppState.currentState==='active'),[size,setSize]=useState({width:1,height:1});
 const enabled=useRef(false);enabled.current=focused&&active&&hasPermission;
 function cancel(hint='Position your face inside the guide'){
  generation.current++;saving.current=false;const wasRecording=recording.current;recording.current=false;
  if(wasRecording){cancelling.current=true;void camera.current?.cancelRecording().catch(()=>{}).finally(()=>{cancelling.current=false;});}
  challenge.current={...newSelfieChallenge(),hint};if(mounted.current)setState(challenge.current);
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel();};},[]);
 useEffect(()=>{if(!focused){ready.current=false;cancel();}},[focused]);
 useEffect(()=>{const sub=AppState.addEventListener('change',value=>{setActive(value==='active');if(value!=='active'){ready.current=false;cancel();}});return()=>sub.remove();},[]);
 useEffect(()=>{const timer=setInterval(()=>{if(recording.current&&!saving.current&&Date.now()-lastFrame.current>1500)cancel('Camera paused. Please try again.');},500);return()=>clearInterval(timer);},[]);
 function facesDetected(faces:Face[]){
  if(!mounted.current||!enabled.current||!ready.current||saving.current||cancelling.current)return;
  const now=Date.now();lastFrame.current=now;
  const next=advanceSelfieChallenge(challenge.current,faces.map(face=>({x:face.bounds.x/size.width,y:face.bounds.y/size.height,width:face.bounds.width/size.width,height:face.bounds.height/size.height,yaw:face.yawAngle,roll:face.rollAngle,leftEye:face.leftEyeOpenProbability,rightEye:face.rightEyeOpenProbability,trackingId:face.trackingId})),now);
  const previous=challenge.current;challenge.current=next;
  if(next.phase!==previous.phase||next.hint!==previous.hint||next.blinks!==previous.blinks)setState(next);
  if(next.action==='cancel'){cancel(next.hint);return;}
  if(next.action==='start'&&!recording.current){
   if(!camera.current)return;recording.current=true;setError('');setSelfie(undefined);const current=++generation.current;
   try{camera.current.startRecording({fileType:'mp4',videoCodec:'h264',onRecordingFinished:video=>{
    if(!mounted.current||current!==generation.current||!saving.current||challenge.current.phase!=='complete')return;
    recording.current=false;saving.current=false;
    if(video.duration<7){cancel();setError('The video ended too soon. Please try again.');return;}
    setSelfie({uri:video.path.startsWith('file://')?video.path:`file://${video.path}`,durationSeconds:video.duration,capturedAt:Date.now(),captureMode:'automatic',completedChallenges:['straight','turn','centre','blink-twice']});
    navigation.replace('DriverReview');
   },onRecordingError:()=>{if(mounted.current&&current===generation.current){cancel();setError('Could not save the selfie. Please try again.');}}});}
   catch{cancel();setError('Could not start recording. Please try again.');}
  }
  if(next.action==='save'&&recording.current){saving.current=true;void camera.current?.stopRecording().catch(()=>{cancel();setError('Could not save the selfie. Please try again.');});}
 }
 const detectorOptions=useMemo(()=>({performanceMode:'fast' as const,classificationMode:'all' as const,trackingEnabled:true,autoMode:true,cameraFacing:'front' as const,windowWidth:size.width,windowHeight:size.height}),[size.width,size.height]);
 const {detectFaces,stopListeners}=useFaceDetector(detectorOptions);
 useEffect(()=>()=>stopListeners(),[stopListeners]);
 const receiveFaces=useMemo(()=>Worklets.createRunOnJS(facesDetected),[size.width,size.height]);
 const frameProcessor=useFrameProcessor(frame=>{
  'worklet';
  runAsync(frame,()=>{'worklet';receiveFaces(detectFaces(frame));});
 },[detectFaces,receiveFaces]);
 const step=state.phase==='align'?0:state.phase==='straight'?1:state.phase==='turn'||state.phase==='centre'?2:3;
 return <OnboardingFrame title="Live selfie" step={4} footer={hasPermission?<><View style={a.footerNote}><Ionicons name="lock-closed-outline" size={16} color={colors.primaryDark}/><Text translate style={s.small}>Recorded without sound · Saved automatically</Text></View>{recording.current&&<Pressable accessibilityRole="button" accessibilityLabel="Cancel selfie recording" onPress={()=>cancel()} style={s.secondary}><Text translate style={[s.link,{color:colors.error}]}>Cancel recording</Text></Pressable>}</>:<ActionButton accessibilityLabel="Allow camera" onPress={()=>void requestPermission().then(granted=>{if(!granted)void Linking.openSettings();})}>Allow camera</ActionButton>}>
  <View style={a.heading}><Text translate style={a.kicker}>{saving.current?'SAVING YOUR SELFIE':recording.current?'RECORDING':'READY WHEN YOU ARE'}</Text><Text translate accessibilityLiveRegion="polite" style={a.instruction}>{state.hint}</Text></View>
  <View style={[a.camera,{aspectRatio:cameraRatio}]} onLayout={event=>setSize(event.nativeEvent.layout)}>{hasPermission&&device&&focused&&active&&<NativeCamera ref={camera} device={device} format={format} fps={30} isActive={focused&&active} video audio={false} pixelFormat="yuv" style={StyleSheet.absoluteFill} resizeMode="contain" frameProcessor={frameProcessor} onInitialized={()=>{ready.current=true;}} onError={()=>{ready.current=false;cancel();setError('Camera unavailable. Please reopen this screen.');}}/>}<View pointerEvents="none" style={[a.oval,{borderColor:step>0?colors.primary:'#FFFFFFCC'}]}/><View style={a.cameraBadge}><Ionicons name={recording.current?'radio-button-on':'scan-outline'} size={17} color={recording.current?colors.yellow:colors.white}/><Text translate style={a.badgeText}>{recording.current?'Follow the prompt':'Align your face to begin'}</Text></View></View>
  <View style={a.progress}>{[0,1,2].map(index=><View key={index} style={[a.segment,{backgroundColor:step>index?colors.primaryDark:'#E8ECEA'}]}/>)}</View>
  <View style={a.prompt}><View style={a.promptIcon}><Ionicons name={state.phase==='blink'?'eye-outline':state.phase==='turn'?'return-up-forward-outline':'scan-outline'} size={25} color={colors.primaryDark}/></View><View style={{flex:1,gap:4}}><Text translate style={s.rowTitle}>{state.phase==='align'?'Automatic capture':state.phase==='blink'?`${state.blinks} of 2 blinks detected`:state.phase==='complete'?'Movements completed':`Step ${step} of 3`}</Text><Text translate style={s.small}>{state.phase==='align'?'Hold still in the guide. Recording starts when your face is aligned.':'The next instruction appears when this movement is detected.'}</Text></View></View>
  {!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}{!device&&<Text translate style={s.error}>Front camera unavailable on this device.</Text>}
 </OnboardingFrame>;
}
const a=StyleSheet.create({heading:{alignItems:'center',gap:10},kicker:{fontSize:11,fontWeight:'700',letterSpacing:1.6,color:colors.primaryDark},instruction:{fontSize:22,lineHeight:31,fontWeight:'600',color:colors.navy,textAlign:'center',minHeight:62},camera:{width:'100%',borderRadius:30,overflow:'hidden',backgroundColor:colors.iconBackground},oval:{position:'absolute',alignSelf:'center',top:'8%',width:'70%',height:'80%',borderRadius:150,borderWidth:3},cameraBadge:{position:'absolute',bottom:12,alignSelf:'center',flexDirection:'row',gap:7,alignItems:'center',paddingHorizontal:13,paddingVertical:8,borderRadius:20,backgroundColor:'#121B26BB'},badgeText:{fontSize:12,color:colors.white},progress:{flexDirection:'row',gap:7},segment:{flex:1,height:5,borderRadius:4},prompt:{flexDirection:'row',gap:13,alignItems:'center',padding:16,borderRadius:20,backgroundColor:colors.iconBackground},promptIcon:{width:42,height:42,alignItems:'center',justifyContent:'center'},footerNote:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7}});
