import * as Sharing from 'expo-sharing';
import { Alert, SectionList, StyleSheet } from 'react-native';

import type { CameraFile } from '@/camera/client';
import { isVideoClip } from '@/camera/clips';
import { mergedFile } from '@/camera/merge';
import { ClipRow } from '@/components/clip-row';
import { ConnectionCard } from '@/components/connection-card';
import { DayHeader } from '@/components/day-header';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useClipLibrary } from '@/hooks/use-clip-library';

export default function HomeScreen() {
  const library = useClipLibrary();
  const { camera, clipStates, dayStates } = library;
  const cameraConnected = camera.kind === 'connected';

  function confirmDelete(clip: CameraFile) {
    Alert.alert('Delete from camera', `${clip.name} will be removed from the camera's SD card.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          library
            .removeFromCamera(clip)
            .catch((error) => Alert.alert('Delete failed', String(error.message ?? error))),
      },
    ]);
  }

  return (
    <Screen title="HelmetCam">
      <ConnectionCard
        camera={camera}
        activeDownloads={library.activeDownloads}
        downloadSpeed={library.downloadSpeed}
        onRefresh={library.refresh}
      />
      <SectionList
        style={styles.list}
        sections={library.sections}
        keyExtractor={(clip) => clip.name}
        extraData={[clipStates, dayStates, library.downloadSlotsFull]}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
        ListEmptyComponent={
          camera.kind === 'connected' ? (
            <ThemedText type="code">
              No files recognised. Camera replied:{'\n'}
              {camera.raw.slice(0, 800)}
            </ThemedText>
          ) : undefined
        }
        renderSectionHeader={({ section }) => {
          const videos = section.data.filter((clip) => isVideoClip(clip.name));
          const state = dayStates[section.day];
          return (
            <DayHeader
              day={section.day}
              videoCount={videos.length}
              onPhoneCount={videos.filter((clip) => clipStates[clip.name]?.kind === 'onPhone').length}
              state={state}
              joinedSizeBytes={state?.kind === 'joined' ? mergedFile(section.day).size : null}
              joinDisabled={library.joinInProgress}
              onJoin={() => library.joinDay(section.day, section.data)}
              onStop={library.stopJoin}
              onShare={() => Sharing.shareAsync(mergedFile(section.day).uri)}
            />
          );
        }}
        renderItem={({ item }) => (
          <ClipRow
            clip={item}
            state={clipStates[item.name]}
            cameraConnected={cameraConnected}
            downloadDisabled={library.downloadSlotsFull}
            onDownload={() => library.download(item)}
            onStop={() => library.stopDownload(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  separator: {
    height: Spacing.two,
  },
});
