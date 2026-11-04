import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import Constants from 'expo-constants';
import {useEffect,useRef,useState} from 'react';
import {AppState, Linking, StyleSheet, View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {useVideoPlayer,VideoView} from 'expo-video';
import {useIsFocused,useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {AppText as Text} from '../../components/AppText';
import {ActionButton} from '../../components/ActionButton';
import {colors} from '../../constants/colors';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import type {RootStackParamList} from '../../navigation/types';
import {OnboardingFrame,s} from './OnboardingUI';

export function DriverSelfieCaptureScreen(){
  if(Constants && Constants.executionEnvironment!=='storeClient'){
    const Automatic=require('./AutomaticSelfieScreen').AutomaticSelfieScreen;
    return <Automatic/>;
  }
  return <GuidedSelfieCaptureScreen/>;
}
export function GuidedSelfieCaptureScreen(){
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();const focused=useIsFocused();
  const {setSelfie}=useDriverOnboarding();const [permission,requestPermission]=useCameraPermissions();
  const camera=useRef<CameraView>(null);const [ready,setReady]=useState(false),[recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[active,setActive]=useState(AppState.currentState==='active');
  const [cameraEpoch,setCameraEpoch]=useState(0);
  const mounted=useRef(true),capturing=useRef(false),generation=useRef(0),duration=useRef(0);
  function stop(){generation.current++;capturing.current=false;try{camera.current?.stopRecording();}catch{}if(mounted.current)setRecording(false);}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[]);
  useEffect(()=>{if(!focused){stop();setReady(false);}},[focused]);
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>{setActive(state==='active');if(state!=='active'){if(capturing.current)setError('Recording interrupted. Please record the full video again.');stop();setReady(false);}});return()=>subscription.remove();},[]);
  async function record(){
    if(!ready||!camera.current||capturing.current||!active||!focused)return;
    const current=++generation.current;capturing.current=true;duration.current=0;setSeconds(0);setError('');setRecording(true);setSelfie(undefined);
    try{
      const video=await camera.current.recordAsync({maxDuration:9,maxFileSize:15*1024*1024,progressUpdateInterval:0.25});
      if(!mounted.current||current!==generation.current)return;
      if(!video?.uri||duration.current<7){setError('The video ended too soon. Follow the prompts and record again.');return;}
      setSelfie({uri:video.uri,durationSeconds:duration.current,capturedAt:Date.now()});navigation.replace('DriverSelfieReview');
    }catch{if(mounted.current&&current===generation.current)setError('Could not record the video. Check camera access and try again.');}
    finally{if(mounted.current&&current===generation.current){capturing.current=false;setRecording(false);}}
  }
  const instruction=!recording?'Position your face inside the guide':seconds<3?'Look straight at the camera':seconds<6?'Turn your head slightly left, then centre':'Blink twice and look at the camera';
  return <OnboardingFrame title="Record live selfie" step={4} footer={permission?.granted?<>{!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}{!!error&&!ready&&active&&<Pressable accessibilityRole="button" accessibilityLabel="Retry camera" onPress={()=>{setError('');setCameraEpoch(value=>value+1);}} style={s.secondary}><Text translate style={s.link}>Retry camera</Text></Pressable>}{recording?<Pressable accessibilityRole="button" accessibilityLabel="Cancel selfie recording" onPress={()=>{stop();setSeconds(0);}} style={s.secondary}><Text translate style={[s.link,{color:colors.error}]}>Cancel recording</Text></Pressable>:<ActionButton accessibilityLabel="Start selfie recording" disabled={!ready||!active||!focused} onPress={()=>void record()}>{ready?'Start recording':'Preparing camera…'}</ActionButton>}</>:<ActionButton accessibilityLabel={permission?.canAskAgain===false?'Open camera settings':'Allow camera for live selfie'} onPress={()=>{if(permission?.canAskAgain===false){void Linking.openSettings();return;}void requestPermission().catch(()=>setError('Could not request camera permission.'));}}>{permission?.canAskAgain===false?'Open camera settings':'Allow camera'}</ActionButton>}>
    <Text translate accessibilityLiveRegion="polite" style={[s.rowTitle,s.center]}>{instruction}</Text>
    <View style={local.cameraFrame}>{permission?.granted&&focused&&active?<CameraView key={cameraEpoch} ref={camera} facing="front" mode="video" mute videoQuality="480p" style={StyleSheet.absoluteFill} onCameraReady={()=>setReady(true)} onMountError={()=>{setReady(false);setError('Camera unavailable. Close other camera apps and try again.');}} onRecordingProgress={progress=>{if(!capturing.current)return;duration.current=progress.duration;setSeconds(Math.floor(progress.duration));}}/>:<View style={[s.hero,{flex:1,justifyContent:'center'}]}><Text translate style={[s.body,s.center]}>Camera access is needed for your live selfie. You can continue after allowing it in your phone settings.</Text></View>}<View pointerEvents="none" style={local.faceGuide}/>{recording&&<View style={local.recordBadge}><View style={local.recordDot}/><Text translate style={local.recordLabel}>{Math.min(seconds,9)} / 9 sec</Text></View>}</View>
    <View style={[local.step,{padding:18}]}><Text translate style={[s.rowTitle,s.center]}>{!recording?'Follow one prompt at a time':seconds<3?'Look straight':seconds<6?'Turn slightly':'Blink twice'}</Text><View style={[local.steps,{marginTop:12}]}>{[0,1,2].map(index=><View key={index} style={{flex:1,height:4,borderRadius:2,backgroundColor:recording&&Math.floor(seconds/3)>=index?colors.primaryDark:'#DDE1DF'}}/>)}</View></View>
    <Text translate style={s.small}>Expo Go uses manual recording. Automatic face alignment and movement detection are available in the Zipp development build.</Text>
    {!permission?.granted&&!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}
  </OnboardingFrame>;
}
export function DriverSelfieReviewScreen(){
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();const {application,setSelfie}=useDriverOnboarding();const focused=useIsFocused();
  const player=useVideoPlayer(application.selfie?.uri||null,p=>{p.muted=true;});
  useEffect(()=>{if(!focused)player.pause();const subscription=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>subscription.remove();},[focused,player]);
  return <OnboardingFrame title="Review your selfie" step={4} footer={<><ActionButton accessibilityLabel="Use selfie video" disabled={!application.selfie} onPress={()=>navigation.navigate('DriverReview')}>Use this video</ActionButton><Pressable accessibilityRole="button" onPress={()=>{setSelfie(undefined);navigation.replace('DriverSelfieCapture');}} style={s.secondary}><Text translate style={s.link}>Record again</Text></Pressable></>}>
    <Text translate style={s.title}>Does everything look clear?</Text>{application.selfie?<VideoView player={player} style={local.videoPreview} nativeControls contentFit="contain"/>:<Text translate style={s.body}>No selfie recorded yet. Tap Record again to open your camera.</Text>}
    <View style={s.card}><Text translate style={s.rowTitle}>Video captured</Text><Text translate style={s.body}>Make sure your face is visible and the video includes the guided movements.</Text><Text translate style={s.small}>Identity and liveness verification are still required. No automated check has been passed at this stage.</Text></View>
  </OnboardingFrame>;
}
const local=StyleSheet.create({cameraFrame:{height:360,borderRadius:26,overflow:'hidden',backgroundColor:colors.input},faceGuide:{position:'absolute',alignSelf:'center',top:35,width:220,height:280,borderRadius:110,borderWidth:3,borderColor:'#FFFFFFCC'},recordBadge:{position:'absolute',top:15,left:15,paddingHorizontal:12,paddingVertical:7,borderRadius:20,backgroundColor:'#121B26CC',flexDirection:'row',alignItems:'center',gap:8},recordDot:{width:8,height:8,borderRadius:4,backgroundColor:'#F34F4F'},recordLabel:{fontSize:12,color:colors.white,fontWeight:'600'},steps:{flexDirection:'row',gap:8},step:{flex:1,padding:10,borderRadius:12,backgroundColor:colors.iconBackground,borderWidth:1,borderColor:'transparent'},activeStep:{borderColor:colors.primaryDark},videoPreview:{width:'100%',height:360,borderRadius:24,backgroundColor:colors.input}});
