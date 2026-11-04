import {useState} from 'react';
import {View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AppText as Text} from '../../components/AppText';
import {ActionButton} from '../../components/ActionButton';
import {useDriverOnboarding} from '../../contexts/DriverOnboardingContext';
import {useDriverWorkspace} from '../../contexts/DriverWorkspaceContext';
import {useProfile} from '../../contexts/ProfileContext';
import {useActivity} from '../../contexts/ActivityContext';
import {applicationDestination} from '../../services/roleApplication';
import {activeDriverJob} from '../../services/driverWorkspace';
import {colors} from '../../constants/colors';
import type {RootStackParamList} from '../../navigation/types';
import {RoleGuideArtwork,g} from './RoleGuideDesign';
import {OnboardingFrame,s} from './OnboardingUI';

type Props=NativeStackScreenProps<RootStackParamList,'RoleRequirements'>;
export function RoleApplicationScreen({route,navigation}:Props){
  const {role}=route.params;const bike=role==='rider';const kind=bike?'bike':'vehicle';
  const {application,chooseKind,update}=useDriverOnboarding();const {profile}=useProfile();const {state}=useDriverWorkspace();
  const {records}=useActivity();
  const [error,setError]=useState('');
  const existing=!!application.kind;
  const requirements=[
    ['person-outline','Your identity','Use your legal name and a phone number where you can be reached.'],
    [bike?'bicycle-outline':'car-sport-outline',bike?'A road-ready motorcycle':'A road-ready vehicle',bike?'Prepare your helmet, delivery bag, registration and insurance.':'Prepare your vehicle details, registration and insurance. Keep the car clean and safe.'],
    ['documents-outline','Clear documents','Have both sides of your ID, your driving licence, registration and insurance ready.'],
    ['scan-outline','A live selfie video','You’ll use the front camera and follow the on-screen prompts.'],
  ] as const;
  function start(){
    if(activeDriverJob(state.job)||records.some(record=>record.status==='active')){setError('Finish your current trip before changing your driver setup.');return;}
    if(!profile?.phone){navigation.navigate('SignupCustomer');return;}
    // An existing application belongs to this same account. Resume it rather than
    // silently clearing documents when a different home guide was opened.
    if(existing){navigation.navigate(applicationDestination(application));return;}
    chooseKind(kind);update({fullName:profile.name||profile.firstName||'',phone:profile.phone});navigation.navigate('DriverDetails');
  }
  return <OnboardingFrame title={bike?'Become a Zipp rider':'Become a Zipp driver'} footer={<>{!!error&&<Text translate accessibilityRole="alert" style={s.error}>{error}</Text>}<ActionButton accessibilityLabel={existing?'Resume application':'Start application'} onPress={start}>{existing?'Resume application':'Start application'}</ActionButton></>}>
    <View style={g.intro}><Text translate style={g.eyebrow}>Getting started</Text><Text translate style={g.title}>What you’ll need</Text><Text translate style={g.body}>{bike?'Deliver packages with your motorcycle using your existing Zipp account.':'Drive passengers using your existing Zipp account.'}</Text></View>
    <RoleGuideArtwork bike={bike} compact/>
    <View style={g.list}>{requirements.map(([icon,title,copy],index)=><View key={title} style={[g.row,index>0&&g.divider]}><View style={g.icon}><Ionicons name={icon} size={23} color={colors.primaryDark}/></View><View style={s.copy}><Text translate style={s.rowTitle}>{title}</Text><Text translate style={s.body}>{copy}</Text></View></View>)}</View>
    <Text translate style={s.small}>Your documents and vehicle must meet the requirements for your location. Work becomes available after verification approval.</Text>
  </OnboardingFrame>;
}
