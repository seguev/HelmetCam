import { StyleSheet, type ViewProps } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export function Card({ style, ...rest }: ViewProps) {
  return <ThemedView type="backgroundElement" style={[styles.card, style]} {...rest} />;
}

export function ButtonRow({ style, ...rest }: ViewProps) {
  return <ThemedView type="backgroundElement" style={[styles.buttonRow, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
