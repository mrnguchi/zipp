import { Image, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import type { PackagePhoto } from '../services/deliveryFlow';
export function PackagePhotoPreview({ photo }: { photo?: PackagePhoto }) {
  if (!photo) return null;
  return <View style={styles.container}><Text style={styles.label}>Package photo</Text><Image accessibilityLabel="Package photo" source={{ uri: photo.uri }} resizeMode="contain" style={styles.image} /></View>;
}
const styles = StyleSheet.create({
  container: { gap: 8 }, label: { fontSize: 10, fontWeight: '500', color: colors.secondaryText }, image: { width: '100%', height: 160, borderRadius: 16, backgroundColor: colors.white },
});
