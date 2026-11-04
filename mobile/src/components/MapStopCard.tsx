import {KeyboardAwareScrollView as ScrollView} from './KeyboardAwareScrollView';
import {LocalizedPressable as Pressable, LocalizedTextInput as TextInput} from './LocalizedNative';
import { useEffect, useState } from 'react';
import {ActivityIndicator, Image, Keyboard, StyleSheet, View} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { ActionButton } from './ActionButton';
import { usePlaceSuggestions } from '../hooks/usePlaceSuggestions';
import { colors } from '../constants/colors';
import type { DeliveryStop } from '../services/deliveryFlow';
type Props = { title: string; value?: DeliveryStop; maxHeight: number; saved: boolean; onSelect: (stop?: DeliveryStop) => void; onDone: () => void; onSave: () => void; onHeight: (height: number) => void };
export function MapStopCard({ title, value, maxHeight, saved, onSelect, onDone, onSave, onHeight }: Props) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [expanded, setExpanded] = useState(false);
  const results = usePlaceSuggestions(query, expanded);
  useEffect(() => { if (value) { setQuery(value.label); setExpanded(false); } }, [value]);
  return <View style={[styles.card, { maxHeight }]} onLayout={event => onHeight(event.nativeEvent.layout.height)}>
    <View style={styles.heading}><Text translate style={styles.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse search' : 'Expand search'} onPress={() => { setExpanded(!expanded); Keyboard.dismiss(); }} hitSlop={10}><Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={20} color={colors.navy} /></Pressable></View>
    <View style={styles.field}><Image source={require('../../assets/location.png')} style={styles.icon} resizeMode="contain" /><TextInput accessibilityLabel={title} value={query} onFocus={() => setExpanded(true)} onChangeText={text => { setQuery(text); setExpanded(true); onSelect(undefined); }} placeholder="Search or tap the map" placeholderTextColor={colors.secondaryText} style={styles.input} maxLength={160} /></View>
    {expanded && <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
      {results.status === 'idle' && <Text translate style={styles.copy}>Type at least 3 characters to find a place.</Text>}
      {results.status === 'loading' && <ActivityIndicator color={colors.primary} />}
      {results.status === 'error' && <Pressable accessibilityRole="button" onPress={results.retry}><Text translate style={styles.copy}>Couldn’t load places. Tap to retry.</Text></Pressable>}
      {results.status === 'ready' && !results.places.length && <Text translate style={styles.copy}>No matching places. Try another landmark.</Text>}
      {results.places.map(place => <Pressable key={place.id} accessibilityRole="button" onPress={() => { onSelect({ label: place.label, coordinate: place.coordinate }); Keyboard.dismiss(); setExpanded(false); }} style={styles.result}><Image source={require('../../assets/location.png')} resizeMode="contain" style={styles.icon} /><View style={styles.resultCopy}><Text translate style={styles.name}>{place.title}</Text><Text translate style={styles.copy}>{place.subtitle}</Text></View></Pressable>)}
      {results.places.length > 0 && <Text translate style={styles.copy}>Photon · © OpenStreetMap contributors</Text>}
    </ScrollView>}
    <View style={styles.actions}><View style={styles.flex}><ActionButton accessibilityLabel="Use this location" disabled={!value} onPress={onDone}>Done</ActionButton></View><Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Location saved' : 'Save location'} accessibilityState={{ selected: saved }} disabled={!value} onPress={onSave} style={[styles.save, saved && { backgroundColor: colors.yellow }, !value && { opacity: 0.4 }]}><Image source={require('../../assets/save-location.png')} style={styles.icon} resizeMode="contain" /></Pressable></View>
  </View>;
}
const styles = StyleSheet.create({
  resultCopy: { flex: 1, gap: 3 },
  card: { padding: 18, backgroundColor: colors.white, borderRadius: 26, gap: 14, shadowColor: colors.navy, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 10 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, title: { lineHeight: 26, fontSize: 18, fontWeight: '600', color: colors.navy }, field: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.input }, input: { lineHeight: 24, flex: 1, minHeight: 52, fontSize: 16, fontFamily: 'Poppins_500Medium', color: colors.navy }, icon: { width: 24, height: 24 }, list: { maxHeight: 180, flexShrink: 1 }, results: { gap: 8 }, result: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.input, borderRadius: 15, padding: 12, gap: 10 }, name: { lineHeight: 24, fontSize: 16, fontWeight: '500', color: colors.navy }, copy: { lineHeight: 21, fontSize: 13, fontWeight: '500', color: colors.secondaryText }, actions: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1 }, save: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
});
