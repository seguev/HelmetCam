import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { deleteFile, listFiles, ping, type CameraFile } from '@/camera/client';
import { dayOf, groupByDay, isVideoClip } from '@/camera/clips';
import {
  clearPartialDownloads,
  downloadClip,
  isDownloaded,
  listLocalClips,
  MAX_PARALLEL_DOWNLOADS,
  runLimited,
} from '@/camera/downloads';
import { mergeDay, mergedFile, saveToPhotos } from '@/camera/merge';
import { useTransferSpeed } from '@/hooks/use-transfer-speed';

export type CameraState =
  | { kind: 'checking' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'connected'; source: string; raw: string };

export type ClipState =
  | { kind: 'downloading'; percent: number }
  | { kind: 'onPhone' }
  | { kind: 'failed'; message: string };

export type DayState =
  | { kind: 'downloading' }
  | { kind: 'joining'; percent: number }
  | { kind: 'joined'; note?: string }
  | { kind: 'failed'; message: string };

type DownloadOutcome = 'done' | 'stopped' | 'failed';

const JOIN_KEEP_AWAKE_TAG = 'join';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

export function useClipLibrary() {
  const [camera, setCamera] = useState<CameraState>({ kind: 'checking' });
  const [clips, setClips] = useState<CameraFile[]>([]);
  const [clipStates, setClipStates] = useState<Record<string, ClipState>>({});
  const [dayStates, setDayStates] = useState<Record<string, DayState>>({});

  const bytesReceived = useRef(0);
  const clipStoppers = useRef(new Map<string, AbortController>());
  const dayStopper = useRef<AbortController | null>(null);

  const setClipState = (name: string, state: ClipState) =>
    setClipStates((all) => ({ ...all, [name]: state }));
  const setDayState = (day: string, state: DayState) =>
    setDayStates((all) => ({ ...all, [day]: state }));

  async function load() {
    const onPhone = listLocalClips();
    let all = onPhone;
    if (await ping()) {
      try {
        const listing = await listFiles();
        const onCamera = new Set(listing.files.map((f) => f.name));
        all = [...listing.files, ...onPhone.filter((f) => !onCamera.has(f.name))];
        setCamera({ kind: 'connected', source: listing.source, raw: listing.raw });
      } catch (error) {
        setCamera({ kind: 'error', message: errorMessage(error) });
      }
    } else {
      setCamera({ kind: 'offline' });
    }

    const namesOnPhone = new Set(onPhone.map((f) => f.name));
    setClips(all);
    setClipStates((current) => {
      const next = { ...current };
      for (const clip of all) {
        if (next[clip.name]?.kind === 'downloading') continue;
        if (namesOnPhone.has(clip.name) && isDownloaded(clip)) next[clip.name] = { kind: 'onPhone' };
      }
      return next;
    });
    setDayStates((current) => {
      const next = { ...current };
      for (const day of new Set(all.map((f) => dayOf(f.name)))) {
        if (!next[day] && mergedFile(day).exists) next[day] = { kind: 'joined' };
      }
      return next;
    });
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  function refresh() {
    setCamera({ kind: 'checking' });
    load();
  }

  async function download(clip: CameraFile, daySignal?: AbortSignal): Promise<DownloadOutcome> {
    const stopper = new AbortController();
    const stopWithDay = () => stopper.abort();
    daySignal?.addEventListener('abort', stopWithDay);
    clipStoppers.current.set(clip.name, stopper);
    setClipState(clip.name, { kind: 'downloading', percent: 0 });
    await activateKeepAwakeAsync(clip.name);
    try {
      await downloadClip(clip, {
        signal: stopper.signal,
        onPercent: (percent) => setClipState(clip.name, { kind: 'downloading', percent }),
        onBytes: (newBytes) => (bytesReceived.current += newBytes),
      });
      setClipState(clip.name, { kind: 'onPhone' });
      return 'done';
    } catch (error) {
      if (stopper.signal.aborted) {
        setClipStates((all) => without(all, clip.name));
        return 'stopped';
      }
      setClipState(clip.name, { kind: 'failed', message: errorMessage(error) });
      return 'failed';
    } finally {
      daySignal?.removeEventListener('abort', stopWithDay);
      clipStoppers.current.delete(clip.name);
      deactivateKeepAwake(clip.name);
    }
  }

  async function downloadMissing(day: string, missing: CameraFile[]): Promise<'done' | 'stopped'> {
    if (camera.kind !== 'connected') {
      throw new Error(`${missing.length} clips are still on the camera. Connect to it first.`);
    }
    setDayState(day, { kind: 'downloading' });
    const stopper = new AbortController();
    dayStopper.current = stopper;
    let failed = 0;
    let stopped = 0;
    await runLimited(
      missing,
      MAX_PARALLEL_DOWNLOADS,
      async (clip) => {
        const outcome = await download(clip, stopper.signal);
        if (outcome === 'failed') failed++;
        if (outcome === 'stopped') stopped++;
      },
      stopper.signal,
    );
    if (stopper.signal.aborted || stopped > 0) {
      if (clipStoppers.current.size === 0) clearPartialDownloads();
      return 'stopped';
    }
    if (failed > 0) throw new Error(`${failed} clips failed to download.`);
    return 'done';
  }

  async function joinDay(day: string, dayClips: CameraFile[]) {
    const videos = dayClips.filter((f) => isVideoClip(f.name));
    const missing = videos.filter((f) => clipStates[f.name]?.kind !== 'onPhone');
    await activateKeepAwakeAsync(JOIN_KEEP_AWAKE_TAG);
    try {
      if (missing.length > 0 && (await downloadMissing(day, missing)) === 'stopped') {
        setDayStates((all) => without(all, day));
        return;
      }
      setDayState(day, { kind: 'joining', percent: 0 });
      const video = await mergeDay(day, videos, (percent) =>
        setDayState(day, { kind: 'joining', percent }),
      );
      setDayState(day, { kind: 'joined' });
      try {
        await saveToPhotos(video);
        setDayState(day, { kind: 'joined', note: 'saved to Photos' });
      } catch (error) {
        setDayState(day, { kind: 'joined', note: `not saved to Photos (${errorMessage(error)})` });
      }
    } catch (error) {
      setDayState(day, { kind: 'failed', message: errorMessage(error) });
    } finally {
      dayStopper.current = null;
      deactivateKeepAwake(JOIN_KEEP_AWAKE_TAG);
    }
  }

  async function removeFromCamera(clip: CameraFile) {
    if (!(await deleteFile(clip))) throw new Error('The camera refused to delete it.');
    await load();
  }

  const activeDownloads = Object.values(clipStates).filter((s) => s.kind === 'downloading').length;
  const downloadSpeed = useTransferSpeed(bytesReceived, activeDownloads > 0);
  const joinInProgress = Object.values(dayStates).some(
    (s) => s.kind === 'downloading' || s.kind === 'joining',
  );

  return {
    camera,
    sections: groupByDay(clips),
    clipStates,
    dayStates,
    activeDownloads,
    downloadSpeed,
    downloadSlotsFull: activeDownloads >= MAX_PARALLEL_DOWNLOADS,
    joinInProgress,
    refresh,
    download: (clip: CameraFile) => download(clip),
    stopDownload: (clip: CameraFile) => clipStoppers.current.get(clip.name)?.abort(),
    joinDay,
    stopJoin: () => dayStopper.current?.abort(),
    removeFromCamera,
  };
}
