import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import BleScan, {
  type AudioDevice,
  type BleConnection,
  type BleDevice,
  type BleState,
} from '../../modules/ble-scan';
import { Button } from '@/components/button';
import { ButtonRow, Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const STATE_TEXT: Record<BleState, string> = {
  poweredOn: 'Bluetooth is on',
  poweredOff: 'Bluetooth is off. Turn it on in Control Centre.',
  unauthorized: 'Bluetooth permission was denied. Allow it in Settings → Apps → HelmetCam.',
  unsupported: 'This device has no Bluetooth LE.',
  resetting: 'Bluetooth is restarting…',
  unknown: 'Checking Bluetooth…',
};

const CAMERA_NAME_PATTERN = /free\s?conn|fdc|r3|helmet|cam/i;

function sortForDisplay(devices: BleDevice[]): BleDevice[] {
  const rank = (device: BleDevice) =>
    CAMERA_NAME_PATTERN.test(device.name) ? 0 : device.name ? 1 : 2;
  return [...devices].sort((a, b) => rank(a) - rank(b) || (b.rssi ?? 0) - (a.rssi ?? 0));
}

function describeDevice(device: BleDevice): string {
  const parts = [device.alreadyConnectedToPhone ? 'already connected to iPhone' : `signal ${device.rssi}`];
  if (device.services.length > 0) parts.push(`services ${device.services.join(', ')}`);
  if (!device.connectable) parts.push('not connectable');
  return parts.join(' · ');
}

function describeAudio(audio: AudioDevice[] | null): string {
  if (audio === null) {
    return 'If the camera is paired as a headset in iPhone Settings, it shows here while sound is routed to it.';
  }
  if (audio.length === 0) return 'No Bluetooth audio device is in use right now.';
  return audio.map((device) => `${device.name} (${device.type})`).join('\n');
}

export default function BluetoothScreen() {
  const [state, setState] = useState<BleState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Record<string, BleDevice>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connection, setConnection] = useState<BleConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<AudioDevice[] | null>(null);

  useEffect(() => {
    const subscriptions = [
      BleScan.addListener('onState', ({ state: next }) => {
        setState(next);
        if (next !== 'poweredOn' && next !== 'unknown' && next !== 'resetting') setScanning(false);
      }),
      BleScan.addListener('onDevice', (device) =>
        setDevices((all) => ({ ...all, [device.id]: device })),
      ),
      BleScan.addListener('onDisconnect', ({ id }) =>
        setConnection((current) => (current?.id === id ? null : current)),
      ),
    ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      BleScan.stopScan();
    };
  }, []);

  async function toggleScan() {
    setError(null);
    if (scanning) {
      await BleScan.stopScan();
      setScanning(false);
    } else {
      setDevices({});
      await BleScan.startScan();
      setScanning(true);
    }
  }

  async function connect(device: BleDevice) {
    setError(null);
    setConnectingId(device.id);
    try {
      const result = await BleScan.connect(device.id);
      setConnection({ ...result, name: result.name || device.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectingId(null);
    }
  }

  async function disconnect() {
    if (connection) await BleScan.disconnect(connection.id);
    setConnection(null);
  }

  const sorted = sortForDisplay(Object.values(devices));
  const headline = connection
    ? `Connected over Bluetooth LE: ${connection.name || 'unnamed device'}`
    : state
      ? STATE_TEXT[state]
      : 'Tap Scan to look for the camera';

  return (
    <Screen title="Bluetooth" scrollable>
      <Card>
        <ThemedText type="smallBold">{headline}</ThemedText>
        {error && <ThemedText type="code">Failed: {error}</ThemedText>}
        <ButtonRow>
          <Button label={scanning ? 'Stop scan' : 'Scan'} onPress={toggleScan} />
          {connection && <Button label="Disconnect" onPress={disconnect} />}
        </ButtonRow>
      </Card>

      {connection && (
        <Card>
          <ThemedText type="smallBold">
            What it offers ({connection.services.length} services)
          </ThemedText>
          {connection.services.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No services. Nothing can be controlled over Bluetooth LE on this device.
            </ThemedText>
          )}
          {connection.services.map((service) => (
            <ThemedView key={service.uuid} type="backgroundElement">
              <ThemedText type="code" selectable>
                Service {service.uuid}
              </ThemedText>
              {service.characteristics.map((characteristic) => (
                <ThemedText
                  key={characteristic.uuid}
                  type="code"
                  themeColor="textSecondary"
                  selectable>
                  {'  '}
                  {characteristic.uuid} · {characteristic.properties.join(', ')}
                </ThemedText>
              ))}
            </ThemedView>
          ))}
        </Card>
      )}

      <Card>
        <ThemedText type="smallBold">Bluetooth audio (headset / intercom)</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {describeAudio(audio)}
        </ThemedText>
        <Button label="Check audio" onPress={async () => setAudio(await BleScan.audioDevices())} />
      </Card>

      {(scanning || sorted.length > 0) && (
        <ThemedText type="small" themeColor="textSecondary">
          {sorted.length} devices nearby. Tap one to connect. Signal closer to 0 means nearer.
        </ThemedText>
      )}
      {sorted.map((device) => (
        <Pressable
          key={device.id}
          onPress={() => connect(device)}
          disabled={connectingId !== null}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.row}>
            <ThemedView type="backgroundElement" style={styles.rowText}>
              <ThemedText type="small">{device.name || 'Unnamed device'}</ThemedText>
              <ThemedText type="code" themeColor="textSecondary">
                {describeDevice(device)}
              </ThemedText>
            </ThemedView>
            <ThemedText type="smallBold">
              {connectingId === device.id
                ? 'Connecting…'
                : connection?.id === device.id
                  ? 'Connected ✓'
                  : ''}
            </ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: Spacing.one,
  },
});
