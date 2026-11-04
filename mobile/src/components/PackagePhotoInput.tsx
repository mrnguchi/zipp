import {UploadCard,uploadStyles as styles} from './UploadCard';
import {LocalizedPressable as Pressable} from './LocalizedNative';
import { useEffect, useRef, useState } from 'react';
import {ActivityIndicator, Image, Linking, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import type { PackagePhoto } from '../services/deliveryFlow';

type Props = { photo?: PackagePhoto; onChange: (photo?: PackagePhoto) => void };
export function PackagePhotoInput({ photo, onChange }: Props) {
  const [busy, setBusy] = useState<'camera' | 'gallery' | null>(null);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function pick(source: 'camera' | 'gallery') {
    if (pending.current) return;
    pending.current = true; setBusy(source); setError(''); setShowSettings(false);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!mounted.current) return;
        if (!permission.granted) {
          setError('Allow camera access to take a package photo, or choose one from your gallery.');
          setShowSettings(!permission.canAskAgain); return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 0.8, exif: false, base64: false };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!mounted.current || result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) { setError('Couldn’t open that image. Try another photo.'); return; }
      onChange({ uri: asset.uri, width: asset.width, height: asset.height, mimeType: asset.mimeType, fileName: asset.fileName ?? undefined });
    } catch {
      if (mounted.current) setError(source === 'camera' ? 'Couldn’t open the camera. Try again or choose from your gallery.' : 'Couldn’t open the photo library. Please try again.');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return <View style={styles.section}>
    <View style={styles.heading}><Text translate style={styles.label}>Package photo</Text><Text translate style={styles.optional}>Optional</Text></View>
    <UploadCard title="Show us your package" description="A clear photo helps your courier identify it." uri={photo?.uri} busy={Boolean(busy)} onCamera={()=>{void pick('camera');}} onGallery={()=>{void pick('gallery');}} onRemove={()=>{onChange(undefined);setError('');}}/>
    {Boolean(error) && <Text translate accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {showSettings && <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.settings}><Text translate style={styles.settingsText}>Open camera settings</Text><Ionicons name="arrow-forward" size={16} color={colors.primary} /></Pressable>}
  </View>;
}
