import {UploadCard} from '../../components/UploadCard';
import {DocumentList,DocumentSourcePicker,SelfieIntroduction,v} from './VerificationDesign';
import {LocalizedPressable as Pressable} from '../../components/LocalizedNative';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator, Image, Modal, Platform, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {useNavigation,useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {AppText as Text} from '../../components/AppText';
import {ActionButton} from '../../components/ActionButton';
import {FormField} from '../../components/FormField';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import {useProfile} from '../../contexts/ProfileContext';
import {useRole} from '../../contexts/RoleContext';
import {applicationProblem,documentProblem,driverDocuments,vehicleConditions,suggestedVehicleCategory} from '../../services/driverOnboarding';
import type {DriverDocumentKey,VerificationFile} from '../../services/driverOnboarding';
import type {RootStackParamList} from '../../navigation/types';
import {colors} from '../../constants/colors';
import {OnboardingFrame,s} from './OnboardingUI';

export function DriverOnboardingScreen(){
  const navigation=useNavigation<NativeStackNavigationProp<RootStackParamList>>();const route=useRoute();
  const {application:app,update,chooseKind,setDocument,saveDraft}=useDriverOnboarding();const {profile}=useProfile();const {selectRole}=useRole();
  const [error,setError]=useState('');const [picker,setPicker]=useState<DriverDocumentKey|null>(null);const [busy,setBusy]=useState(false);
  const mounted=useRef(true),operation=useRef(false);
  const queuedSource=useRef<{source:'camera'|'library'|'file';key:DriverDocumentKey}|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(picker!==null||Platform.OS==='ios')return;const timer=setTimeout(openQueuedSource,350);return()=>clearTimeout(timer);},[picker]);
  function openQueuedSource(){const next=queuedSource.current;queuedSource.current=null;if(next&&mounted.current)void addDocument(next.source,next.key);}
  function chooseSource(source:'camera'|'library'|'file'){if(!picker)return;queuedSource.current={source,key:picker};setPicker(null);}
  const kind=app.kind==='bike'?'bike':'vehicle';
  const details=()=>{update({fullName:app.fullName||profile?.name||profile?.firstName||'',phone:app.phone||profile?.phone||''});navigation.navigate('DriverDetails');};
  const advance=(step:Parameters<typeof applicationProblem>[1],next:'DriverVehicle'|'DriverDocuments'|'DriverSelfieIntro'|'DriverReview')=>{const issue=applicationProblem(app,step);setError(issue||'');if(!issue)navigation.navigate(next);};
  async function addDocument(source:'camera'|'library'|'file',documentKey:DriverDocumentKey){
    if(operation.current)return;const key=documentKey;operation.current=true;setBusy(true);setPicker(null);setError('');
    try{
      let file:VerificationFile|undefined;
      if(source==='file'){
        const result=await DocumentPicker.getDocumentAsync({type:['image/*','application/pdf'],copyToCacheDirectory:true,multiple:false});
        if(!result.canceled){const item=result.assets[0];file={uri:item.uri,name:item.name,mimeType:item.mimeType||'application/pdf',size:item.size};}
      }else{
        if(source==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted)throw Error('Allow camera access to photograph your document, or choose a file instead.');}
        const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],quality:0.85,allowsEditing:false};
        const result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
        if(!result.canceled){const item=result.assets[0];file={uri:item.uri,name:item.fileName||`${key}.jpg`,mimeType:item.mimeType||'image/jpeg',size:item.fileSize};}
      }
      if(!mounted.current||!file)return;const issue=documentProblem(file);if(issue){setError(issue);return;}setDocument(key,file);navigation.navigate('DriverDocumentPreview',{document:key});
    }catch(problem){if(mounted.current)setError(problem instanceof Error?problem.message:'Could not add this document. Please try again.');}
    finally{operation.current=false;if(mounted.current)setBusy(false);}
  }
  const errorNode=!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>;
  if(route.name==='DriverType')return <OnboardingFrame title="Drive with Zipp" footer={<ActionButton accessibilityLabel="Continue with selected transport" disabled={!app.kind} onPress={details}>Continue</ActionButton>}>
    <Text translate style={s.title}>How will you move?</Text><Text translate style={s.body}>Choose the transport you’ll use with Zipp.</Text>
    {([{value:'vehicle',label:'Vehicle',body:'Drive passengers in your car.',image:require('../../../assets/ride booking.png')},{value:'bike',label:'Bike',body:'Deliver packages on your motorcycle.',image:require('../../../assets/delivery.png')}] as const).map(item=><Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:app.kind===item.value}} accessibilityLabel={item.label} onPress={()=>chooseKind(item.value)} style={[s.card,{backgroundColor:app.kind===item.value?colors.yellow:colors.iconBackground}]}><View style={s.row}><View style={s.copy}><Text  style={s.rowTitle}>{item.label}</Text><Text translate style={[s.body,app.kind===item.value&&{color:colors.white}]}>{item.body}</Text></View><Ionicons name={app.kind===item.value?'checkmark-circle':'ellipse-outline'} size={26} color={app.kind===item.value?colors.primaryDark:colors.secondaryText}/></View><Image source={item.image} resizeMode="contain" style={{width:'100%',height:145}}/></Pressable>)}
  </OnboardingFrame>;
  if(route.name==='DriverDetails')return <OnboardingFrame title="Personal details" step={1} footer={<>{errorNode}<ActionButton accessibilityLabel="Continue to vehicle details" onPress={()=>advance('details','DriverVehicle')}>Continue</ActionButton></>}>
    <Text translate style={s.title}>Let’s get to know you.</Text><Text translate style={s.body}>Use the same full name that appears on your identity document.</Text>
    <FormField label="Full legal name" value={app.fullName} autoComplete="name" autoCapitalize="words" maxLength={100} onChangeText={fullName=>update({fullName})} validate={value=>!value.trim()?'Enter your full name.':undefined}/>
    <FormField label="Phone number" value={app.phone} autoComplete="tel" keyboardType="phone-pad" maxLength={18} onChangeText={phone=>update({phone})}/>
    <FormField label="City" value={app.city} placeholder="e.g. Buea" autoCapitalize="words" maxLength={80} onChangeText={city=>update({city})}/>
  </OnboardingFrame>;
  if(route.name==='DriverVehicle')return <OnboardingFrame title={app.kind==='bike'?'Bike details':'Vehicle details'} step={2} footer={<>{errorNode}<ActionButton accessibilityLabel="Continue to documents" onPress={()=>advance('vehicle','DriverDocuments')}>Continue</ActionButton></>}>
    <Text translate style={s.title}>Tell us about your {kind}.</Text><Text translate style={s.body}>These details should match your registration and insurance.</Text>
    <FormField label="Make / brand" value={app.make} placeholder={app.kind==='bike'?'e.g. Honda':'e.g. Toyota'} maxLength={60} onChangeText={make=>update({make})}/>
    <FormField label="Model" value={app.model} maxLength={60} onChangeText={model=>update({model})}/>
    <FormField label="Number plate" value={app.plate} autoCapitalize="characters" maxLength={30} onChangeText={plate=>update({plate:plate.toUpperCase()})}/>
    <FormField label="Colour" value={app.color} maxLength={40} onChangeText={color=>update({color})}/>
    {app.kind==='vehicle'&&<View style={{gap:12}}><Text translate style={s.rowTitle}>Vehicle condition</Text><Text translate style={s.small}>Choose the description that best matches your vehicle.</Text>{vehicleConditions.map(item=><Pressable key={item.value} accessibilityRole="radio" accessibilityState={{checked:app.condition===item.value}} onPress={()=>update({condition:item.value})} style={[v.condition,app.condition===item.value&&{backgroundColor:colors.yellow}]}><View style={s.copy}><Text translate style={s.rowTitle}>{item.title}</Text><Text translate style={[s.small,app.condition===item.value&&{color:colors.white}]}>{item.description}</Text></View><Ionicons name={app.condition===item.value?'radio-button-on':'radio-button-off'} size={23} color={app.condition===item.value?colors.primaryDark:colors.secondaryText}/></Pressable>)}</View>}
    {app.kind==='vehicle'&&!!app.condition&&<View style={v.category}><View style={s.row}><Ionicons name="car-sport-outline" size={23} color={colors.primaryDark}/><Text translate style={[s.rowTitle,s.copy]}>Suggested category</Text><Text translate style={[s.link,{marginLeft:'auto'}]}>{suggestedVehicleCategory(app)}</Text></View><Text translate style={s.small}>Final category is confirmed after vehicle inspection, model and eligibility review.</Text></View>}

  </OnboardingFrame>;
  if(route.name==='DriverDocumentPreview'){
    const key=(route.params as {document:DriverDocumentKey}).document;const file=app.documents[key];
    return <OnboardingFrame title="Check your document" step={3} footer={<ActionButton accessibilityLabel="Keep this document" disabled={!file} onPress={()=>navigation.goBack()}>Keep document</ActionButton>}>
      <Text translate style={s.title}>{driverDocuments.find(item=>item.key===key)?.title}</Text>
      {file&&<UploadCard title="Add document" description="Keep all four corners visible. Avoid blur and reflections." uri={file.uri} fileName={file.name} pdf={file.mimeType==='application/pdf'} selectedLabel="Ready to review"/>}
      <Text translate style={s.body}>{file?.name||'No document selected'}</Text><Text translate style={s.small}>Keep every corner visible. Details should be readable, without glare or blur. The file is attached locally and has not been submitted.</Text>
      <Pressable accessibilityRole="button" onPress={()=>{setDocument(key,undefined);navigation.goBack();}} style={s.secondary}><Text translate style={[s.link,{color:colors.error}]}>Remove and choose another</Text></Pressable>
    </OnboardingFrame>;
  }
  if(route.name==='DriverDocuments')return <OnboardingFrame title="Verification documents" step={3} footer={<>{errorNode}<ActionButton accessibilityLabel="Continue to live selfie" disabled={busy} onPress={()=>advance('documents','DriverSelfieIntro')}>Continue</ActionButton></>}>
    <DocumentList application={app} busy={busy} onSource={(key,source)=>{void addDocument(source,key);}} onRemove={key=>setDocument(key,undefined)} onChoose={key=>app.documents[key]?navigation.navigate('DriverDocumentPreview',{document:key}):setPicker(key)}/>
    {busy&&<View style={s.row}><ActivityIndicator color={colors.primaryDark}/><Text translate style={s.body}>Adding document…</Text></View>}
    <Modal transparent visible={picker!==null} animationType="slide" onDismiss={openQueuedSource} onRequestClose={()=>setPicker(null)}><View style={{flex:1,justifyContent:'flex-end',backgroundColor:'#121B2670'}}><Pressable style={{flex:1}} accessibilityRole="button" accessibilityLabel="Close" onPress={()=>setPicker(null)}/><DocumentSourcePicker title={driverDocuments.find(item=>item.key===picker)?.title||''} onChoose={chooseSource} onClose={()=>setPicker(null)}/></View></Modal>
  </OnboardingFrame>;
  if(route.name==='DriverSelfieIntro')return <OnboardingFrame title="Live selfie" step={4} footer={<ActionButton accessibilityLabel={app.selfie?'Review recorded selfie':'Open front camera'} onPress={()=>navigation.navigate(app.selfie?'DriverSelfieReview':'DriverSelfieCapture')}>{app.selfie?'Review your video':'Open camera'}</ActionButton>}>
    <SelfieIntroduction/>
    <Text translate style={s.small}>Your recording is used for driver verification. Your account is approved only after review.</Text>
  </OnboardingFrame>;
  if(route.name==='DriverReview')return <OnboardingFrame title="Review your application" step={5} footer={<>{errorNode}<ActionButton accessibilityLabel="Save verification draft" onPress={()=>{const issue=saveDraft();setError(issue||'');if(!issue)navigation.replace('DriverVerificationStatus');}}>Save verification draft</ActionButton></>}>
    <Text translate style={s.title}>Take one last look.</Text><Text translate style={s.body}>You can edit any section before saving your setup.</Text>
    {([{title:'Personal details',copy:`${app.fullName}\n${app.phone}\n${app.city}`,screen:'DriverDetails'},{title:app.kind==='bike'?'Bike':'Vehicle',copy:`${app.make} ${app.model}\n${app.plate} · ${app.color}\n${app.kind==='vehicle'?`${app.condition || ''} · `:''}${suggestedVehicleCategory(app) || ''}`,screen:'DriverVehicle'},{title:'Documents',copy:`${driverDocuments.filter(item=>app.documents[item.key]).length} of ${driverDocuments.length} attached`,screen:'DriverDocuments'},{title:'Live selfie video',copy:app.selfie?'Recorded · awaiting verification':'Not recorded',screen:'DriverSelfieIntro'}] as const).map(item=><View key={item.title} style={s.card}><View style={s.row}><Text translate style={[s.rowTitle,s.copy]}>{item.title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} onPress={()=>navigation.navigate(item.screen)} hitSlop={8}><Text translate style={s.link}>Edit</Text></Pressable></View><Text translate style={s.body}>{item.copy}</Text></View>)}
    <View style={s.notice}><Text translate style={s.small}>Verification submission is not connected yet. Saving keeps these documents and your video in this app session; it does not send them to a reviewer or approve your account.</Text></View>
  </OnboardingFrame>;
  if(route.name==='DriverVerificationStatus'){
    const saved=app.status==='draft_saved',approved=app.status==='approved',pending=app.status==='pending',changes=app.status==='needs_changes';
    return <OnboardingFrame title="Verification status" footer={<ActionButton accessibilityLabel="Continue to welcome" onPress={()=>navigation.navigate('SignupWelcome',{role:'driver'})}>Continue</ActionButton>}>
      <View style={s.hero}><View style={s.heroIcon}><Ionicons name={approved?'shield-checkmark-outline':pending?'time-outline':changes?'alert-circle-outline':'document-text-outline'} size={46} color={colors.primaryDark}/></View><Text translate style={[s.title,s.center]}>{approved?'You’re verified!':pending?'Your application is in review':changes?'A few details need attention':saved?'Your setup is saved':'Complete your verification'}</Text><Text translate style={[s.body,s.center]}>{approved?'Your driver verification is approved.':pending?'You can check back here for your review result.':changes?app.reviewNote||'Check your details and replace any unclear documents.':saved?'Your verification draft is ready. It has not been submitted because the review service is not connected yet.':'Add your details, documents, and live selfie video to prepare your application.'}</Text></View>
      <View style={s.card}><Text translate style={s.rowTitle}>{approved?'Approved':pending?'Review in progress':changes?'Changes requested':saved?'Draft saved on this device':'Setup incomplete'}</Text><Text translate style={s.body}>{approved?'Your verification status is ready.':'Verification approval is required before you can accept work on Zipp.'}</Text></View>
      {!approved&&!pending&&<Pressable accessibilityRole="button" accessibilityLabel="Edit verification application" onPress={()=>app.kind?details():navigation.navigate('DriverType')} style={s.secondary}><Text translate style={s.link}>{saved||changes?'Edit application':'Finish setup'}</Text></Pressable>}
    </OnboardingFrame>;
  }
  // Rider welcome and driver setup completion share the same branded endpoint.
  const role=(route.params as {role?:'rider'|'driver'}|undefined)?.role||'rider';
  return <OnboardingFrame title="Welcome" footer={<ActionButton accessibilityLabel="Open your Zipp account" onPress={()=>{selectRole(role);navigation.reset({index:0,routes:[{name:'RoleHome'}]});}}>Let’s go</ActionButton>}>
    <View style={[s.hero,{flex:1,justifyContent:'center'}]}><Image source={require('../../../assets/full logo.png')} resizeMode="contain" style={s.logo}/><View style={s.heroIcon}><Ionicons name={role==='driver'?'car-sport-outline':'sparkles-outline'} size={44} color={colors.primaryDark}/></View><Text style={[s.title,s.center]}>Welcome to Zipp,{ '\n'}{profile?.name?.split(' ')[0]||'Suh'}!</Text><Text translate style={[s.body,s.center]}>{role==='driver'?'Your journey with Zipp starts here. Follow your verification progress from your account.':'Your rides and deliveries, all in one place. Let’s get you moving.'}</Text>{role==='driver'&&app.status!=='approved'&&<View style={s.notice}><Text translate style={s.small}>Your account is not yet verified to accept work.</Text></View>}</View>
  </OnboardingFrame>;
}
