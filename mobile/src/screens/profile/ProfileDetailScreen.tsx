import { inputStyles } from '../../constants/inputStyles';
import {KeyboardAwareScrollView as ScrollView} from '../../components/KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from '../../components/LocalizedNative';
import { LanguagePicker } from '../../components/LanguagePicker';
import {translateUI} from '../../i18n/ui';
import { AppText as Text } from '../../components/AppText';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { ProfileIcon as Ionicons } from '../../components/ProfileIcon';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {Image, KeyboardAvoidingView, Platform, StyleSheet, Switch, View} from 'react-native';
import type { TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { colors } from '../../constants/colors';
import { FormField } from '../../components/FormField';
import { ActionButton } from '../../components/ActionButton';
import { useProfile } from '../../contexts/ProfileContext';
import { useProfileSettings } from '../../contexts/ProfileSettingsContext';
import { useBiometricLock } from '../../contexts/BiometricContext';
import { notificationEvents, soundOptions } from '../../services/notificationSounds';
import type { SupportDraft } from '../../contexts/ProfileSettingsContext';
import type { RootStackParamList } from '../../navigation/types';
import { ProfileAvatar } from './ProfileScreen';
import {ProfilePhotoInput} from '../../components/ProfilePhotoInput';
import { faqItems, faqSearchText, validatePassword, validateProfile, validateSupport } from './profileData';

type Navigation = NativeStackNavigationProp<RootStackParamList>;
export function ProfileFrame({ title, children }: PropsWithChildren<{ title: string }>) {
  const navigation = useNavigation<Navigation>();
  return <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
    <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={s.back}><Ionicons name="arrow-back" size={23} color={colors.navy} /></Pressable><Text translate style={s.headerTitle}>{title}</Text><View style={[s.back,{backgroundColor:'transparent'}]} /></View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>{children}</ScrollView></KeyboardAvoidingView>
  </SafeAreaView>;
}
function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return <ActionButton accessibilityLabel={label} onPress={onPress} arrow={label === 'Edit request' ? 'arrow-back' : 'arrow-forward'}>{label}</ActionButton>;
}
function Field({ label, ...props }: TextInputProps & { label: string }) {
  const validate = (value: string) => {
    if(label==='Full name'&&!value.trim())return 'Enter your full name.';
    if(label==='Email address'&&value.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))return 'Enter a valid email address.';
    if(label==='Phone number'&&!/^\+?\d{9,15}$/.test(value.replace(/[\s()-]/g,'')))return 'Enter a valid phone number.';
    if(label==='New password'&&value.length<8)return 'Use at least 8 characters.';
    if(label==='Your message'&&value.trim().length<10)return 'Add a little more detail so support can help.';
  };
  return <FormField label={label} {...props} validate={validate}/>;
}
function ErrorMessage({ error }: { error: string }) { return error ? <Text translate accessibilityRole="alert" style={s.error}>{error}</Text> : null; }
function Success({ title, body, onDone }: { title: string; body: string; onDone: () => void }) {
  return <View style={s.success}><View style={s.successIcon}><Ionicons name="checkmark" size={36} color={colors.primary} /></View><Text translate style={s.heading}>{title}</Text><Text translate style={s.body}>{body}</Text><Button label="Done" onPress={onDone} /></View>;
}
function ManageProfile() {
  const navigation = useNavigation<Navigation>();
  const { profile, setProfile } = useProfile();
  const [name, setName] = useState(profile?.name || profile?.firstName || 'Suh');
  const [email, setEmail] = useState(profile?.email || '');
  const [phone, setPhone] = useState(profile?.phone || (__DEV__ ? '600000000' : ''));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [photoUri,setPhotoUri]=useState(profile?.photoUri);
  const [editingPhoto,setEditingPhoto]=useState(false);
  function save() {
    const problem = validateProfile(name, email, phone); setError(problem); if (problem) return;
    setProfile({ ...profile, name: name.trim(), firstName: name.trim().split(/\s+/)[0], username: undefined, email: email.trim(), phone: phone.trim(),photoUri }); setSaved(true);
  }
  return <ProfileFrame title="Manage Profile">{saved ? <Success title="Profile saved" body="Your details have been updated for this session." onDone={() => navigation.goBack()} /> : <>
    <View style={s.avatar}><View style={{position:'relative'}}><ProfileAvatar name={name} uri={photoUri} large /><Pressable accessibilityRole="button" accessibilityLabel="Edit profile photo" accessibilityState={{expanded:editingPhoto}} onPress={()=>setEditingPhoto(!editingPhoto)} style={photoStyles.pencil}><Ionicons name="pencil" size={18} color={colors.navy}/></Pressable></View><Text style={photoStyles.name}>{name||'Your profile'}</Text><Text style={photoStyles.phone}>{phone}</Text></View>
    {editingPhoto&&<ProfilePhotoInput uri={photoUri} onChange={setPhotoUri}/>}
    <Text translate style={photoStyles.heading}>Personal details</Text>
    <View style={s.card}><Field label="Full name" value={name} onChangeText={setName} autoComplete="name" maxLength={80} /><Field label="Email address" value={email} onChangeText={setEmail} placeholder="Add your email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={120} /><Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={18} /></View>
    <ErrorMessage error={error} /><Button label="Save changes" onPress={save} />
  </>}</ProfileFrame>;
}
const photoStyles=StyleSheet.create({pencil:{position:'absolute',right:-3,bottom:0,width:36,height:36,borderRadius:18,backgroundColor:colors.yellow,borderWidth:3,borderColor:colors.white,alignItems:'center',justifyContent:'center'},name:{fontSize:22,lineHeight:31,fontWeight:'600',color:colors.navy,marginTop:14},phone:{fontSize:14,lineHeight:23,color:colors.secondaryText,marginTop:3},heading:{fontSize:18,lineHeight:27,fontWeight:'600',color:colors.navy}});
function PasswordSecurity() {
  const navigation = useNavigation<Navigation>();
  const biometric = useBiometricLock();
  return <ProfileFrame title="Password & Security"><Text translate style={s.intro}>Keep your account secure.</Text><View style={s.group}>
    <Pressable accessibilityRole="button" style={s.row} onPress={() => navigation.navigate('ChangePassword')}><Ionicons name="lock-closed-outline" size={23} color={colors.primary} /><View style={s.flex}><Text translate style={s.rowTitle}>Change password</Text><Text translate style={s.small}>Choose a strong, unique password.</Text></View><Ionicons name="arrow-forward" size={18} color={colors.yellow} /></Pressable>
    <Pressable accessibilityRole="button" style={[s.row,s.divider]} onPress={() => navigation.navigate('BiometricUnlock')}><Ionicons name="finger-print-outline" size={25} color={colors.primary} /><View style={s.flex}><Text translate style={s.rowTitle}>Fingerprint / Face unlock</Text><Text translate style={s.small}>{biometric.enabled ? 'On' : 'Off'} · Unlock Zipp on this device</Text></View><Ionicons name="arrow-forward" size={18} color={colors.yellow} /></Pressable>
  </View><Text translate style={s.sectionTitle}>Protect your account</Text><View style={s.card}><Text translate style={s.body}>Keep your password and verification codes private. Zipp will never ask you to share your trip PIN before you enter the correct vehicle.</Text></View></ProfileFrame>;
}
function ChangePassword() {
  const navigation = useNavigation<Navigation>();
  const { changePreviewPassword } = useProfileSettings();
  const [current, setCurrent] = useState(__DEV__ ? 'ZippDemo123!' : '');
  const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  function save() {
    const problem = validatePassword(current, next, confirm); setError(problem); if (problem) return;
    if (!__DEV__) { setError('Password changes are not available yet. Please try again when account services are available.'); return; }
    if (!changePreviewPassword(current, next)) { setError('Your current password is incorrect.'); return; }
    setCurrent(''); setNext(''); setConfirm(''); setSaved(true);
  }
  return <ProfileFrame title="Change Password">{saved ? <Success title="Password preview updated" body="This change applies to this preview session. Your account password has not been changed." onDone={() => navigation.goBack()} /> : <><Text translate style={s.intro}>Use at least 8 characters. Avoid a password you use elsewhere.</Text><View style={s.card}><Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry={!visible} autoCapitalize="none" autoComplete="current-password" /><Field label="New password" value={next} onChangeText={setNext} secureTextEntry={!visible} autoCapitalize="none" autoComplete="new-password" /><Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry={!visible} autoCapitalize="none" autoComplete="new-password" /><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: visible }} onPress={() => setVisible(!visible)} style={s.row}><Ionicons name={visible ? 'checkbox' : 'square-outline'} size={22} /><Text translate style={s.body}>Show passwords</Text></Pressable></View>{__DEV__ && <Text translate style={s.small}>Development preview · changes last for this session.</Text>}<ErrorMessage error={error} /><Button label="Update password" onPress={save} /></>}</ProfileFrame>;
}
function NotificationSettingsScreen() {
  const navigation = useNavigation<Navigation>();
  const { notifications, setNotifications, sounds } = useProfileSettings();
  const items = [{key: 'ride', title: 'Ride updates', body: 'Driver arrival, trip progress, and receipts.'}, {key: 'wallet', title: 'Wallet updates', body: 'Deposits and payment confirmations.'}, {key: 'info', title: 'Zipp announcements', body: 'News and general updates.'}] as const;
  return <ProfileFrame title="Notifications"><Text translate style={s.intro}>Choose which in-app banners you see.</Text><View style={s.group}>{items.map((item, index) => <View key={item.key} style={[s.toggleRow, index > 0 && s.divider]}><View style={s.flex}><Text translate style={s.rowTitle}>{item.title}</Text><Text translate style={s.small}>{item.body}</Text></View><Switch accessibilityLabel={item.title} value={notifications[item.key]} onValueChange={value => setNotifications({ ...notifications, [item.key]: value })} trackColor={{false:'#DDDFDA',true:colors.primary}} /></View>)}</View>
    <Text translate style={s.sectionTitle}>Notification sounds</Text><Text translate style={s.small}>Set a different sound for each alert, or choose Silent.</Text>
    <View style={s.group}>{notificationEvents.map((event,index) => <Pressable key={event.key} accessibilityRole="button" style={[s.row,index>0&&s.divider,!notifications[event.kind]&&{opacity:0.5}]} onPress={() => navigation.navigate('NotificationSound',{event:event.key})}><View style={s.flex}><Text translate style={s.rowTitle}>{event.label}</Text>{!notifications[event.kind]&&<Text translate style={s.small}>Category muted</Text>}</View><Text translate style={s.small}>{soundOptions.find(sound=>sound.id===sounds[event.key])?.label}</Text><Ionicons name="arrow-forward" size={18} color={colors.yellow} /></Pressable>)}</View>
    <Text translate style={s.small}>Changes apply immediately. Updates remain available in your notification history.</Text></ProfileFrame>;
}
function LanguageSettings() {
  return <ProfileFrame title="Language"><LanguagePicker /></ProfileFrame>;
}
function FAQ() {
  useTranslation();
  const navigation = useNavigation<Navigation>(); const [query,setQuery] = useState('');
  const items = faqItems.filter(item => `${faqSearchText(item)} ${translateUI(item.title)} ${translateUI(item.category)}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <ProfileFrame title="FAQ"><Text translate style={s.intro}>How can we help?</Text><Field label="Search questions" value={query} onChangeText={setQuery} placeholder="Search rides, payments, account…" /><View style={s.group}>{items.map((item,index) => <Pressable key={item.id} accessibilityRole="button" style={[s.row,index>0&&s.divider]} onPress={() => navigation.navigate('FAQArticle',{id:item.id})}><Text translate style={[s.rowTitle,s.flex]}>{item.title}</Text><Ionicons name="arrow-forward" size={18} color={colors.yellow} /></Pressable>)}</View>{!items.length && <Text translate style={s.body}>No matching questions. Try another search or contact support.</Text>}<Button label="Contact Support" onPress={() => navigation.navigate('ContactSupport')} /></ProfileFrame>;
}
function FAQArticle({ id }: { id?: string }) {
  const navigation = useNavigation<Navigation>();
  const item = faqItems.find(item => item.id === id);
  if (!item) return <ProfileFrame title="FAQ"><View style={s.card}><Text translate style={s.heading}>Question not found</Text><Text translate style={s.body}>Return to FAQ to browse the available questions.</Text></View><Button label="Back to FAQ" onPress={() => navigation.goBack()} /></ProfileFrame>;
  const minutes = Math.max(1, Math.ceil(faqSearchText(item).split(/\s+/).length / 180));
  const related = faqItems.filter(article => item.related.includes(article.id));
  return <ProfileFrame title="FAQ">
    <View style={s.articleIntro}>
      <View style={s.articleMeta}><View style={s.articleBadge}><Text translate style={s.articleBadgeText}>{item.category}</Text></View><Text translate style={s.small}>{minutes} min read</Text></View>
      <View style={s.articleIcon}><Ionicons name={item.icon} size={28} color={colors.primary} /></View>
      <Text translate accessibilityRole="header" style={s.articleTitle}>{item.title}</Text>
      <Text translate style={s.articleLead}>{item.answer}</Text>
    </View>
    <View style={s.articleCard}>
      <Text translate accessibilityRole="header" style={s.articleSectionTitle}>Step by step</Text>
      {item.steps.map((step,index) => <View key={step.title} style={s.articleStep}>
        <View style={s.stepNumber}><Text translate style={s.stepNumberText}>{index+1}</Text></View>
        <View style={s.stepCopy}><Text translate style={s.stepTitle}>{step.title}</Text><Text translate style={s.articleBody}>{step.body}</Text></View>
      </View>)}
    </View>
    {item.details.map(detail => <View key={detail.title} style={s.articleCard}><Text translate accessibilityRole="header" style={s.articleSectionTitle}>{detail.title}</Text><Text translate style={s.articleBody}>{detail.body}</Text></View>)}
    <View style={s.articleTip}><Ionicons name="bulb-outline" size={23} color={colors.primaryDark} /><View style={s.stepCopy}><Text translate style={s.tipTitle}>{item.tip.title}</Text><Text translate style={s.articleBody}>{item.tip.body}</Text></View></View>
    {related.length>0&&<View style={s.articleCard}><Text translate accessibilityRole="header" style={s.articleSectionTitle}>Related questions</Text>{related.map((article,index) => <Pressable key={article.id} accessibilityRole="button" style={({pressed}) => [s.relatedRow,index>0&&s.divider,pressed&&{opacity:0.6}]} onPress={() => navigation.replace('FAQArticle',{id:article.id})}><Text translate style={s.relatedTitle}>{article.title}</Text><Ionicons name="arrow-forward" size={18} color={colors.yellow} /></Pressable>)}</View>}
    <View style={s.articleCard}><Text translate accessibilityRole="header" style={s.articleSectionTitle}>Still need help?</Text><Text translate style={s.articleBody}>Tell us what happened and include the relevant trip or payment details so your request is easy to understand.</Text><Button label="Contact Support" onPress={() => navigation.navigate('ContactSupport')} /></View>
  </ProfileFrame>;
}
function ContactSupport() {
  const navigation = useNavigation<Navigation>(); const { profile } = useProfile();
  const { supportDraft, setSupportDraft } = useProfileSettings();
  const [subject,setSubject] = useState(supportDraft.subject); const [email,setEmail] = useState(supportDraft.email || profile?.email || ''); const [message,setMessage] = useState(supportDraft.message); const [error,setError] = useState('');
  function review() { const problem=validateSupport(subject,email,message);setError(problem);if(problem)return;const draft={subject,email:email.trim(),message:message.trim()};setSupportDraft(draft);navigation.navigate('ReviewSupport',{draft}); }
  return <ProfileFrame title="Contact Support"><Text translate style={s.intro}>Tell us what you need help with.</Text><Text translate style={s.sectionTitle}>Topic</Text><View style={s.chips}>{['Ride','Payment','Account','Other'].map(topic => <Pressable key={topic} accessibilityRole="radio" accessibilityState={{checked:subject===topic}} style={[s.chip,subject===topic&&s.selectedChip]} onPress={() => setSubject(topic)}><Text translate style={[s.chipText,subject===topic&&{color:colors.navy}]}>{topic}</Text></Pressable>)}</View><View style={s.card}><Field label="Email address" value={email} onChangeText={setEmail} placeholder="Where can we reach you?" keyboardType="email-address" autoCapitalize="none" maxLength={120} /><Field label="Your message" value={message} onChangeText={setMessage} placeholder="Describe what happened…" multiline maxLength={2000} /><Text translate style={s.small}>{message.length}/2000</Text></View><ErrorMessage error={error} /><Button label="Review request" onPress={review} /></ProfileFrame>;
}
function ReviewSupport({ draft }: { draft?: SupportDraft }) {
  const navigation = useNavigation<Navigation>(); const { supportDraft, setSupportDraft } = useProfileSettings(); const [saved,setSaved] = useState(false);const request=draft||supportDraft;
  return <ProfileFrame title="Review Request">{saved ? <Success title="Draft saved" body="Your request is saved for this app session. It has not been sent to support." onDone={() => navigation.pop(2)} /> : <><Text translate style={s.intro}>Check your request before saving.</Text><View style={s.card}><Text translate style={s.label}>Topic</Text><Text translate style={s.body}>{request.subject}</Text><Text translate style={s.label}>Email address</Text><Text translate style={s.body}>{request.email}</Text><Text translate style={s.label}>Message</Text><Text translate style={s.body}>{request.message}</Text></View><Button label="Save draft" onPress={() => {setSupportDraft(request);setSaved(true);}} /><Button label="Edit request" onPress={() => navigation.goBack()} /></>}</ProfileFrame>;
}
function AboutUs() {
  return <ProfileFrame title="About Us"><View style={s.aboutLogo}><Image source={require('../../../assets/full logo.png')} accessibilityLabel="Zipp" resizeMode="contain" style={s.brand} /><Text translate style={s.small}>Move smarter.</Text></View><View style={s.card}><Text translate style={s.heading}>Rides and deliveries, made simple.</Text><Text translate style={s.body}>Zipp brings ride booking and delivery into one place, built with communities in Cameroon in mind.</Text><Text translate style={s.body}>Choose your pickup and destination, follow your trip, and keep your ride and wallet details together.</Text></View><View style={s.card}><Text translate style={s.label}>App version</Text><Text translate style={s.body}>{Constants.expoConfig?.version || '1.0.0'}</Text></View></ProfileFrame>;
}
export function ProfileDetailScreen() {
  const route=useRoute();const params=route.params as {id?:string;draft?:SupportDraft}|undefined;
  switch(route.name) {
    case 'ManageProfile':return <ManageProfile />;
    case 'PasswordSecurity':return <PasswordSecurity />;
    case 'ChangePassword':return <ChangePassword />;
    case 'ProfileNotifications':return <NotificationSettingsScreen />;
    case 'ProfileLanguage':return <LanguageSettings />;
    case 'ProfileFAQ':return <FAQ />;
    case 'FAQArticle':return <FAQArticle id={params?.id} />;
    case 'ContactSupport':return <ContactSupport />;
    case 'ReviewSupport':return <ReviewSupport draft={params?.draft} />;
    default:return <AboutUs />;
  }
}
const s=StyleSheet.create({
  articleIntro:{gap:16,paddingTop:2,paddingBottom:4},articleMeta:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},articleBadge:{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:12,paddingVertical:6,backgroundColor:colors.input},articleBadgeText:{fontSize:12,fontWeight:'600',color:colors.primaryDark},articleIcon:{width:54,height:54,borderRadius:17,alignItems:'center',justifyContent:'center',marginTop:5,backgroundColor:colors.input},articleTitle:{fontSize:26,fontWeight:'700',lineHeight:34,color:colors.navy},articleLead:{fontSize:16,lineHeight:27,color:'#586154'},
  articleCard:{padding:20,gap:16,backgroundColor:colors.input,borderRadius:18},articleSectionTitle:{fontSize:17,lineHeight:24,fontWeight:'600',color:colors.text},articleBody:{fontSize:14,lineHeight:24,color:'#596153'},articleStep:{flexDirection:'row',alignItems:'flex-start',gap:13,paddingTop:2,paddingBottom:6},stepNumber:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',marginTop:1,backgroundColor:colors.input},stepNumberText:{fontSize:14,fontWeight:'700',color:colors.primaryDark},stepCopy:{flex:1,gap:6},stepTitle:{fontSize:15,lineHeight:23,fontWeight:'600',color:colors.navy},
  articleTip:{flexDirection:'row',alignItems:'flex-start',gap:12,padding:18,borderRadius:14,borderLeftWidth:3,borderLeftColor:colors.yellow,backgroundColor:colors.input},tipTitle:{fontSize:15,lineHeight:23,fontWeight:'600',color:colors.text},relatedRow:{flexDirection:'row',alignItems:'center',gap:14,minHeight:54,paddingVertical:14},relatedTitle:{flex:1,fontSize:14,lineHeight:23,color:colors.text},
  screen:{flex:1,backgroundColor:colors.white},flex:{flex:1},
  header:{height:64,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#FFFFFF',paddingHorizontal:12},back:{width:44,height:44,alignItems:'center',justifyContent:'center',backgroundColor:colors.input,borderRadius:22},headerTitle:{flex:1,fontSize:19,fontWeight:'600',textAlign:'center',color:'#292D2C'},
  content:{padding:20,gap:20,flexGrow:1,paddingBottom:36},intro:{fontSize:16,lineHeight:25,color:'#777D76'},card:{padding:18,gap:18,backgroundColor:colors.input,borderRadius:18},group:{paddingHorizontal:16,backgroundColor:colors.input,borderRadius:18},row:{minHeight:60,flexDirection:'row',alignItems:'center',gap:14,paddingVertical:16},rowTitle:{fontSize:16,fontWeight:'500',color:'#292D2C'},divider:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border},
  heading:{fontSize:23,fontWeight:'600',lineHeight:31,color:colors.text},body:{fontSize:15,lineHeight:24,color:'#50564F'},small:{fontSize:13,lineHeight:20,color:'#8C928A'},sectionTitle:{fontSize:16,fontWeight:'500',color:colors.text},field:{gap:9},label:{fontSize:14,fontWeight:'500',color:'#727970'},input:{ ...inputStyles.field },multiline:{minHeight:150,textAlignVertical:'top'},
  error:{color:'#B42318',fontSize:14,lineHeight:21},avatar:{alignItems:'center',paddingVertical:8},toggleRow:{minHeight:90,flexDirection:'row',alignItems:'center',gap:16,paddingVertical:18},
  success:{flex:1,justifyContent:'center',gap:22,paddingVertical:32},successIcon:{alignSelf:'center',width:80,height:80,borderRadius:40,alignItems:'center',justifyContent:'center',backgroundColor:colors.input},chips:{flexDirection:'row',flexWrap:'wrap',gap:10},chip:{borderColor:'#E1E4DE',borderRadius:20,paddingHorizontal:17,paddingVertical:10,backgroundColor:colors.input,borderWidth:0},selectedChip:{backgroundColor:colors.yellow,borderColor:colors.yellow},chipText:{fontSize:14,color:'#50564F'},aboutLogo:{alignItems:'center',paddingVertical:24,gap:6},brand:{width:180,height:180*725/2170},
});
