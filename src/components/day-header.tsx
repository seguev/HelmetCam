import { StyleSheet } from 'react-native';

import { formatSize } from '@/camera/clips';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { DayState } from '@/hooks/use-clip-library';

type DayHeaderProps = {
  day: string;
  videoCount: number;
  onPhoneCount: number;
  state?: DayState;
  joinedSizeBytes: number | null;
  joinDisabled: boolean;
  onJoin: () => void;
  onStop: () => void;
  onShare: () => void;
};

function joinLabel(state?: DayState): string {
  switch (state?.kind) {
    case 'downloading':
      return 'Downloading clips…';
    case 'joining':
      return `Joining ${state.percent}%`;
    case 'joined':
      return 'Join again';
    default:
      return 'Join day into one video';
  }
}

function summary({ videoCount, onPhoneCount, state, joinedSizeBytes }: DayHeaderProps): string {
  const parts = [`${videoCount} clips`, `${onPhoneCount} on phone`];
  if (state?.kind === 'joined') {
    parts.push(`joined video: ${formatSize(joinedSizeBytes)}`);
    if (state.note) parts.push(state.note);
  }
  return parts.join(' · ');
}

export function DayHeader(props: DayHeaderProps) {
  const { day, videoCount, state, joinDisabled, onJoin, onStop, onShare } = props;
  return (
    <ThemedView style={styles.header}>
      <ThemedText type="default">{day}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {summary(props)}
      </ThemedText>
      {state?.kind === 'failed' && <ThemedText type="code">Failed: {state.message}</ThemedText>}
      <ThemedView style={styles.buttons}>
        <Button label={joinLabel(state)} onPress={onJoin} disabled={joinDisabled || videoCount === 0} />
        {state?.kind === 'downloading' && <Button label="Stop" variant="danger" onPress={onStop} />}
        {state?.kind === 'joined' && <Button label="Save / share" onPress={onShare} />}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
});
