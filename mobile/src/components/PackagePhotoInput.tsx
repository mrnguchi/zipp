import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
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
    <View style={styles.heading}><Text style={styles.label}>Package photo</Text><Text style={styles.optional}>Optional</Text></View>
    <View style={[styles.mediaCard, photo && styles.selectedCard]}>
      {photo ? <View style={styles.previewWrap}><Image accessibilityLabel="Selected package photo" source={{ uri: photo.uri }} resizeMode="contain" style={styles.preview} /><Pressable accessibilityRole="button" accessibilityLabel="Remove package photo" disabled={Boolean(busy)} onPress={() => { onChange(undefined); setError(''); }} style={styles.remove}><Ionicons name="close" size={20} color={colors.navy} /></Pressable><View style={styles.photoBadge}><Ionicons name="checkmark-circle" size={15} color={colors.primary} /><Text style={styles.badgeText}>Photo added</Text></View></View>
        : <Pressable accessibilityRole="button" accessibilityLabel="Take a package photo" disabled={Boolean(busy)} onPress={() => { void pick('camera'); }} style={styles.captureArea}><View style={styles.cameraCircle}><Ionicons name="camera-outline" size={31} color={colors.primary} /><View style={styles.plusBadge}><Ionicons name="add" size={13} color={colors.navy} /></View></View><Text style={styles.title}>Show us your package</Text><Text style={styles.copy}>A clear photo helps your courier identify it.</Text></Pressable>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={photo ? 'Retake package photo' : 'Take package photo'} disabled={Boolean(busy)} onPress={() => { void pick('camera'); }} style={[styles.action, styles.cameraAction, busy && styles.disabled]}>{busy === 'camera' ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="camera-outline" size={20} color={colors.white} />}<Text style={styles.cameraLabel}>{photo ? 'Retake' : 'Take photo'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose package photo from gallery" disabled={Boolean(busy)} onPress={() => { void pick('gallery'); }} style={[styles.action, styles.galleryAction, busy && styles.disabled]}>{busy === 'gallery' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="images-outline" size={20} color={colors.primary} />}<Text style={styles.galleryLabel}>Gallery</Text></Pressable>
      </View>
    </View>
    {Boolean(error) && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {showSettings && <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.settings}><Text style={styles.settingsText}>Open camera settings</Text><Ionicons name="arrow-forward" size={16} color={colors.primary} /></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, label: { fontSize: 12, fontWeight: '600', color: colors.navy }, optional: { fontSize: 10, fontWeight: '500', color: colors.secondaryText }, mediaCard: { backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CAD5CE', overflow: 'hidden', padding: 12, gap: 14 }, selectedCard: { borderStyle: 'solid', borderColor: colors.border }, captureArea: { minHeight: 167, alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 16 }, cameraCircle: { width: 64, height: 64, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }, plusBadge: { position: 'absolute', bottom: -3, right: -3, width: 23, height: 23, borderRadius: 12, backgroundColor: colors.yellow, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 14, fontWeight: '600', color: colors.navy }, copy: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText, textAlign: 'center' }, actions: { flexDirection: 'row', gap: 10 }, action: { flex: 1, minHeight: 46, borderRadius: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10 }, cameraAction: { backgroundColor: colors.primary }, cameraLabel: { fontSize: 11, fontWeight: '600', color: colors.white }, galleryAction: { backgroundColor: colors.input }, galleryLabel: { fontSize: 11, fontWeight: '600', color: colors.navy }, disabled: { opacity: 0.6 }, previewWrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.input }, preview: { width: '100%', aspectRatio: 4 / 3 }, remove: { position: 'absolute', top: 9, right: 9, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }, photoBadge: { position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 5 }, badgeText: { fontSize: 10, fontWeight: '500', color: colors.navy }, error: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.error }, settings: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, settingsText: { fontSize: 11, fontWeight: '600', color: colors.primary },
});
