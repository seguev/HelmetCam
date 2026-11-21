import type { CameraFile } from './client';

export type DaySection = { day: string; data: CameraFile[] };

const UNKNOWN_DAY = 'Unknown date';

export function dayOf(fileName: string): string {
  const match = fileName.match(/^(\d{4})_?(\d{2})_?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : UNKNOWN_DAY;
}

export function isVideoClip(fileName: string): boolean {
  return /\.ts$/i.test(fileName);
}

export function groupByDay(files: CameraFile[]): DaySection[] {
  const days = [...new Set(files.map((f) => dayOf(f.name)))].sort().reverse();
  return days.map((day) => ({
    day,
    data: files
      .filter((f) => dayOf(f.name) === day)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function formatSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}
