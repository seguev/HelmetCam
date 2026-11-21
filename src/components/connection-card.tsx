import { CAMERA_IP } from '@/camera/client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import type { CameraState } from '@/hooks/use-clip-library';

type ConnectionCardProps = {
  camera: CameraState;
  activeDownloads: number;
  downloadSpeed: number;
  onRefresh: () => void;
};

const TITLES: Record<CameraState['kind'], string> = {
  checking: 'Checking…',
  offline: 'Camera not connected',
  error: 'Connected, but the file list failed',
  connected: 'Connected over Wi-Fi',
};

function detail(camera: CameraState): string {
  switch (camera.kind) {
    case 'offline':
      return `Showing clips already on the phone. To reach the camera, turn on its Wi-Fi, join it in iPhone Settings, then tap Retry. (${CAMERA_IP})`;
    case 'error':
      return camera.message;
    case 'connected':
      return `${CAMERA_IP} · list from ${camera.source}`;
    default:
      return '';
  }
}

export function ConnectionCard({
  camera,
  activeDownloads,
  downloadSpeed,
  onRefresh,
}: ConnectionCardProps) {
  return (
    <Card>
      <ThemedText type="smallBold">{TITLES[camera.kind]}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {detail(camera)}
      </ThemedText>
      {activeDownloads > 0 && (
        <ThemedText type="small">
          Downloading {activeDownloads} at once · {(downloadSpeed / 1e6).toFixed(1)} MB per second
        </ThemedText>
      )}
      <Button
        label={camera.kind === 'connected' ? 'Refresh' : 'Retry'}
        onPress={onRefresh}
        disabled={camera.kind === 'checking'}
      />
    </Card>
  );
}
