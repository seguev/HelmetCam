import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger';
};

export function Button({ label, onPress, disabled = false, variant = 'primary' }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' && styles.danger,
        (pressed || disabled) && styles.dimmed,
      ]}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  danger: {
    backgroundColor: Colors.danger,
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    color: Colors.onAccent,
  },
});
