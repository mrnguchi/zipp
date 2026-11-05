import {useEffect,useRef,useState} from 'react';
import {Linking,View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {UploadCard,uploadStyles} from './UploadCard';
import {AppText as Text} from './AppText';
import {LocalizedPressable as Pressable} from './LocalizedNative';

export function ProfilePhotoInput({uri,onChange}:{uri?:string;onChange:(uri?:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[settings,setSettings]=useState(false);
 const pending=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function pick(camera:boolean){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setSettings(false);
  try{
   if(camera){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!mounted.current)return;if(!permission.granted){setError('Allow camera access or choose a photo from Gallery.');setSettings(!permission.canAskAgain);return;}}
   const options:ImagePicker.ImagePickerOptions={mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8,exif:false,base64:false};
   const result=camera?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);
   if(!mounted.current||result.canceled)return;
   const photo=result.assets?.[0];if(photo?.uri)onChange(photo.uri);else setError('Could not open that photo. Try another.');
  }catch{if(mounted.current)setError('Could not open photos. Please try again.');}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return <View style={{gap:10}}><UploadCard title="Your profile photo" description="Take a photo or choose one from your gallery." uri={uri} selectedLabel="Photo selected" busy={busy} onCamera={()=>void pick(true)} onGallery={()=>void pick(false)} onRemove={()=>{onChange(undefined);setError('');}}/>{!!error&&<Text translate accessibilityRole="alert" style={uploadStyles.error}>{error}</Text>}{settings&&<Pressable accessibilityRole="button" onPress={()=>void Linking.openSettings()} style={uploadStyles.settings}><Text translate style={uploadStyles.settingsText}>Open camera settings</Text></Pressable>}</View>;
}
