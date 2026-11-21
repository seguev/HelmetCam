import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type ScreenProps = {
  title: string;
  scrollable?: boolean;
  children: ReactNode;
};

export function Screen({ title, scrollable = false, children }: ScreenProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {scrollable ? (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <ThemedText type="subtitle">{title}</ThemedText>
            {children}
          </ScrollView>
        ) : (
          <ThemedView style={styles.fixedContent}>
            <ThemedText type="subtitle">{title}</ThemedText>
            {children}
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  fixedContent: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
});
