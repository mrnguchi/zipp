import { StyleSheet, View } from 'react-native';

import { AppText as Text } from './AppText';
import { useAppTheme } from '../hooks/useAppTheme';

type ServiceCardProps = {
  title: string;
  description: string;
  marker: string;
};

export function ServiceCard({ title, description, marker }: ServiceCardProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.white },
      ]}
    >
      <View style={[styles.marker, { backgroundColor: colors.primarySoft }]}>
        <Text style={[styles.markerText, { color: colors.primary }]}>{marker}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.mutedText }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  marker: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
});
