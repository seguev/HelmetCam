import { useState } from 'react';
import { Alert } from 'react-native';

import { Command, Mode, sendCommand, type CommandResult } from '@/camera/client';
import { Button } from '@/components/button';
import { ButtonRow, Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

type Step = () => Promise<CommandResult>;
type Action = { label: string; steps: Step[] | (() => Step[]); confirm?: string };
type LogEntry = { id: number; label: string; text: string; ok: boolean };

const MAX_LOG_ENTRIES = 30;
const SLOW_COMMAND_TIMEOUT_MS = 60000;

const pad = (value: number) => String(value).padStart(2, '0');

function clockSteps(): Step[] {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return [
    () => sendCommand(Command.setDate, { str: date }),
    () => sendCommand(Command.setTime, { str: time }),
  ];
}

const stopRecording: Step = () => sendCommand(Command.record, { par: 0 });

const GROUPS: { title: string; actions: Action[] }[] = [
  {
    title: 'Recording',
    actions: [
      { label: 'Start recording', steps: [() => sendCommand(Command.record, { par: 1 })] },
      { label: 'Stop recording', steps: [stopRecording] },
      {
        label: 'Take photo',
        steps: [
          () => sendCommand(Command.mode, { par: Mode.photo }),
          () => sendCommand(Command.capturePhoto),
          () => sendCommand(Command.mode, { par: Mode.video }),
        ],
      },
    ],
  },
  {
    title: 'Status',
    actions: [
      { label: 'Battery', steps: [() => sendCommand(Command.battery)] },
      { label: 'Free space', steps: [() => sendCommand(Command.freeSpace)] },
      { label: 'Recording time', steps: [() => sendCommand(Command.recordingTime)] },
      { label: 'Firmware', steps: [() => sendCommand(Command.firmwareVersion)] },
      { label: 'All settings', steps: [() => sendCommand(Command.allSettings)] },
    ],
  },
  {
    title: 'Setup',
    actions: [
      { label: 'Sync clock to phone', steps: clockSteps },
      { label: 'Microphone on', steps: [() => sendCommand(Command.microphone, { par: 1 })] },
      { label: 'Microphone off', steps: [() => sendCommand(Command.microphone, { par: 0 })] },
      { label: 'Date stamp on', steps: [() => sendCommand(Command.dateStamp, { par: 1 })] },
      { label: 'Date stamp off', steps: [() => sendCommand(Command.dateStamp, { par: 0 })] },
    ],
  },
  {
    title: 'Danger',
    actions: [
      {
        label: 'Delete all files',
        confirm: 'Deletes every recording on the camera. This cannot be undone.',
        steps: [
          stopRecording,
          () => sendCommand(Command.deleteAllFiles, {}, SLOW_COMMAND_TIMEOUT_MS),
        ],
      },
      {
        label: 'Format SD card',
        confirm: 'Erases the whole SD card. This cannot be undone.',
        steps: [
          stopRecording,
          () => sendCommand(Command.formatCard, { par: 1 }, SLOW_COMMAND_TIMEOUT_MS),
        ],
      },
    ],
  },
];

function describe(result: CommandResult): { text: string; ok: boolean } {
  if (result.cmd === Command.allSettings) {
    const pairs = [...result.raw.matchAll(/<Cmd>(\d+)<\/Cmd>\s*<Status>(-?\d+)<\/Status>/gi)];
    if (pairs.length > 0) {
      return { text: pairs.map((pair) => `${pair[1]}=${pair[2]}`).join('  '), ok: true };
    }
  }
  if (result.status === null) {
    return { text: `cmd ${result.cmd}: no status in reply · ${result.raw.slice(0, 120)}`, ok: false };
  }
  const value = result.value ? ` · value ${result.value}` : '';
  return { text: `cmd ${result.cmd}: status ${result.status}${value}`, ok: result.status === 0 };
}

export default function ControlsScreen() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const addToLog = (label: string, text: string, ok: boolean) =>
    setLog((entries) =>
      [{ id: Date.now() + Math.random(), label, text, ok }, ...entries].slice(0, MAX_LOG_ENTRIES),
    );

  async function run(action: Action) {
    const steps = typeof action.steps === 'function' ? action.steps() : action.steps;
    setBusy(true);
    try {
      for (const step of steps) {
        const { text, ok } = describe(await step());
        addToLog(action.label, text, ok);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      addToLog(action.label, `no answer from camera (${reason})`, false);
    } finally {
      setBusy(false);
    }
  }

  function press(action: Action) {
    if (!action.confirm) return run(action);
    Alert.alert(action.label, action.confirm, [
      { text: 'Cancel', style: 'cancel' },
      { text: action.label, style: 'destructive', onPress: () => run(action) },
    ]);
  }

  return (
    <Screen title="Controls" scrollable>
      {GROUPS.map((group) => (
        <Card key={group.title}>
          <ThemedText type="smallBold">{group.title}</ThemedText>
          <ButtonRow>
            {group.actions.map((action) => (
              <Button
                key={action.label}
                label={action.label}
                variant={action.confirm ? 'danger' : 'primary'}
                disabled={busy}
                onPress={() => press(action)}
              />
            ))}
          </ButtonRow>
        </Card>
      ))}

      <Card>
        <ThemedText type="smallBold">Camera replies (newest first)</ThemedText>
        {log.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            Tap a button. Status 0 means the camera accepted it.
          </ThemedText>
        )}
        {log.map((entry) => (
          <ThemedText key={entry.id} type="code" selectable>
            {entry.ok ? 'OK' : 'FAILED'} · {entry.label} · {entry.text}
          </ThemedText>
        ))}
      </Card>
    </Screen>
  );
}
