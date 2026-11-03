import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { colors } from '../constants/colors';
const steps = ['Route', 'Package', 'Review'];
export function DeliveryBookingProgress({ step }: { step: number }) {
  return <View style={styles.progress} accessible accessibilityRole="progressbar" accessibilityLabel="Delivery booking progress" accessibilityValue={{ min: 1, max: 3, now: step + 1, text: `Step ${step + 1} of 3: ${steps[step]}` }}>
    {steps.map((label, index) => <Fragment key={label}>
      {index > 0 && <View style={[styles.connector, index <= step && styles.connectorComplete]} />}
      <View style={styles.step}><View style={[styles.circle, index <= step && styles.activeCircle]}><Text style={[styles.number, index <= step && styles.activeNumber]}>{index + 1}</Text></View><Text style={[styles.label, index === step && styles.activeLabel]}>{label}</Text></View>
    </Fragment>)}
  </View>;
}
const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4, marginBottom: 4 },
  step: { width: 70, alignItems: 'center', gap: 7 },
  circle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  activeCircle: { backgroundColor: colors.primary },
  number: { fontSize: 11, fontWeight: '600', color: colors.secondaryText },
  activeNumber: { color: colors.white },
  label: { fontSize: 11, fontWeight: '500', color: colors.secondaryText },
  activeLabel: { fontWeight: '600', color: colors.navy },
  connector: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#FFF0B3', marginTop: 12, marginHorizontal: -21 },
  connectorComplete: { backgroundColor: colors.yellow },
});
