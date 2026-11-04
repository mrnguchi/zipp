import { inputStyles } from '../constants/inputStyles';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
import { usePlaceSuggestions } from '../hooks/usePlaceSuggestions';
import type { DeliveryStop } from '../services/deliveryFlow';
type Props = { visible: boolean; title: string; value?: DeliveryStop; saved?: (DeliveryStop & { name?: string })[]; onClose: () => void; onSelect: (stop: DeliveryStop) => void; onMap: () => void; onLocate?: () => void; locating?: boolean };
export function PlacePickerSheet({ visible, title, value, saved = [], onClose, onSelect, onMap, onLocate, locating }: Props) {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const results = usePlaceSuggestions(query, visible);
  useEffect(() => { if (visible) setQuery(value?.label ?? ''); }, [visible, value?.label]);
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close location search" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20), maxHeight: '90%' }]} accessibilityViewIsModal>
        <View style={styles.handle} /><View style={styles.heading}><Text style={styles.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}><Ionicons name="close" size={23} color={colors.navy} /></Pressable></View>
        <TextInput autoFocus accessibilityLabel={title} value={query} onChangeText={setQuery} placeholder="Search an address or landmark" placeholderTextColor={colors.secondaryText} style={styles.input} maxLength={160} returnKeyType="search" />
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.results}>
          {results.status === 'loading' && <ActivityIndicator color={colors.primary} />}
          {results.status === 'error' && <Pressable accessibilityRole="button" onPress={results.retry} style={styles.row}><Text style={styles.copy}>Couldn’t load places. Tap to retry.</Text></Pressable>}
          {results.status === 'ready' && !results.places.length && <Text style={styles.copy}>No matching places. Try another landmark or choose on the map.</Text>}
          {results.places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => onSelect({ label: place.label, coordinate: place.coordinate })} style={styles.row}><Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.icon} /><View style={styles.flex}><Text style={styles.name}>{place.title}</Text><Text style={styles.copy}>{place.subtitle}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.secondaryText} /></Pressable>)}
          {results.places.length > 0 && <Text style={styles.credit}>Photon · © OpenStreetMap contributors</Text>}
          {onLocate && <Pressable accessibilityRole="button" disabled={locating} onPress={onLocate} style={styles.row}><Image source={require('../../assets/current-location.png')} style={styles.icon} resizeMode="contain" /><Text style={styles.name}>Use my current location</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={onMap} style={styles.row}><Image source={require('../../assets/map-icon.png')} style={styles.icon} resizeMode="contain" /><Text style={styles.name}>Choose on map</Text></Pressable>
          {saved.length > 0 && <Text style={styles.copy}>Saved locations</Text>}
          {saved.map(place => <Pressable key={`${place.coordinate.latitude}:${place.coordinate.longitude}`} accessibilityRole="button" onPress={() => onSelect(place)} style={styles.row}><Image source={require('../../assets/save-location.png')} style={styles.icon} resizeMode="contain" /><View style={styles.flex}><Text style={styles.name}>{place.name || place.label}</Text>{place.name && <Text style={styles.copy}>{place.label}</Text>}</View></Pressable>)}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  list: { flexShrink: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' }, backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(18,27,38,0.35)' }, sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: colors.white, padding: 20, gap: 14 }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 22, fontWeight: '700', color: colors.navy }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, input: { ...inputStyles.field }, results: { gap: 10, paddingBottom: 8 }, row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 17, backgroundColor: colors.input }, flex: { flex: 1 }, icon: { width: 24, height: 24 }, name: { fontSize: 13, fontWeight: '500', color: colors.navy }, copy: { fontSize: 11, lineHeight: 18, fontWeight: '500', color: colors.secondaryText }, credit: { fontSize: 9, color: colors.secondaryText },
});
