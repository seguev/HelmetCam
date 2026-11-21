import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

import TsMerge from '../../modules/ts-merge';
import type { CameraFile } from './client';
import { localFile } from './downloads';

export function mergedFile(day: string): File {
  const directory = new Directory(Paths.document, 'merged');
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return new File(directory, `${day}.mp4`);
}

export async function mergeDay(
  day: string,
  clips: CameraFile[],
  onPercent: (percent: number) => void,
): Promise<File> {
  const inputs = [...clips]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((clip) => localFile(clip).uri);
  const output = mergedFile(day);
  const subscription = TsMerge.addListener('onProgress', ({ progress }) =>
    onPercent(Math.round(progress * 100)),
  );
  try {
    await TsMerge.merge(inputs, output.uri);
  } finally {
    subscription.remove();
  }
  return mergedFile(day);
}

export async function saveToPhotos(file: File): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) throw new Error('Photos access was not allowed');
  await MediaLibrary.Asset.create(file.uri);
}
