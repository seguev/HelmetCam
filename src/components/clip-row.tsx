import { StyleSheet } from 'react-native';

import type { CameraFile } from '@/camera/client';
import { formatSize } from '@/camera/clips';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ClipState } from '@/hooks/use-clip-library';

type ClipRowProps = {
  clip: CameraFile;
  state?: ClipState;
  cameraConnected: boolean;
  downloadDisabled: boolean;
  onDownload: () => void;
  onStop: () => void;
  onDelete: () => void;
};

export function ClipRow({
  clip,
  state,
  cameraConnected,
  downloadDisabled,
  onDownload,
  onStop,
  onDelete,
}: ClipRowProps) {
  const downloading = state?.kind === 'downloading';
  const canDownload = cameraConnected && !downloading && state?.kind !== 'onPhone';
  const canDelete = cameraConnected && !downloading && clip.cameraPath !== undefined;

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedView type="backgroundElement" style={styles.text}>
        <ThemedText type="small">{clip.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[clip.time, formatSize(clip.sizeBytes)].filter(Boolean).join(' · ')}
        </ThemedText>
        {state?.kind === 'failed' && <ThemedText type="code">Failed: {state.message}</ThemedText>}
      </ThemedView>
      {state?.kind === 'onPhone' && <ThemedText type="smallBold">On phone ✓</ThemedText>}
      {downloading && (
        <>
          <ThemedText type="smallBold">{state.percent}%</ThemedText>
          <Button label="Stop" variant="danger" onPress={onStop} />
        </>
      )}
      {canDownload && (
        <Button
          label={state?.kind === 'failed' ? 'Retry' : 'Download'}
          onPress={onDownload}
          disabled={downloadDisabled}
        />
      )}
      {canDelete && <Button label="Delete" variant="danger" onPress={onDelete} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.one,
  },
});
