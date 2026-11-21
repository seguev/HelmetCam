import { Directory, File, Paths } from 'expo-file-system';

import type { CameraFile } from './client';

export const MAX_PARALLEL_DOWNLOADS = 4;

const PARTIAL_SUFFIX = '.part';

function clipsDirectory(): Directory {
  const directory = new Directory(Paths.document, 'clips');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function localFile(clip: CameraFile): File {
  return new File(clipsDirectory(), clip.name);
}

export function isDownloaded(clip: CameraFile): boolean {
  const local = localFile(clip);
  if (!local.exists) return false;
  return clip.sizeBytes === null || local.size === clip.sizeBytes;
}

export function listLocalClips(): CameraFile[] {
  return clipsDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File && !entry.name.endsWith(PARTIAL_SUFFIX))
    .map((file) => ({ name: file.name, url: file.uri, sizeBytes: file.size, time: null }));
}

export function clearPartialDownloads(): void {
  for (const entry of clipsDirectory().list()) {
    if (entry instanceof File && entry.name.endsWith(PARTIAL_SUFFIX)) entry.delete();
  }
}

type DownloadCallbacks = {
  onPercent: (percent: number) => void;
  onBytes?: (newBytes: number) => void;
  signal?: AbortSignal;
};

export async function downloadClip(
  clip: CameraFile,
  { onPercent, onBytes, signal }: DownloadCallbacks,
): Promise<File> {
  const directory = clipsDirectory();
  const partial = new File(directory, clip.name + PARTIAL_SUFFIX);
  let lastPercent = -1;
  let lastBytes = 0;

  await File.downloadFileAsync(clip.url, partial, {
    idempotent: true,
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      onBytes?.(bytesWritten - lastBytes);
      lastBytes = bytesWritten;
      const total = totalBytes > 0 ? totalBytes : (clip.sizeBytes ?? 0);
      if (total <= 0) return;
      const percent = Math.min(99, Math.floor((bytesWritten / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        onPercent(percent);
      }
    },
  });

  const complete = new File(directory, clip.name);
  if (complete.exists) complete.delete();
  await partial.move(complete);
  return new File(directory, clip.name);
}

export async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  async function lane() {
    while (next < items.length && !signal?.aborted) {
      await worker(items[next++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
