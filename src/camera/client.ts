export const CAMERA_IP = '192.168.1.254';

const BASE_URL = `http://${CAMERA_IP}`;
const MOVIE_FOLDER_URL = `${BASE_URL}/Novatek/Movie`;

export const Command = {
  capturePhoto: 1001,
  record: 2001,
  microphone: 2007,
  dateStamp: 2008,
  recordingTime: 2016,
  mode: 3001,
  setDate: 3005,
  setTime: 3006,
  formatCard: 3010,
  firmwareVersion: 3012,
  allSettings: 3014,
  fileList: 3015,
  freeSpace: 3017,
  battery: 3019,
  deleteFile: 4003,
  deleteAllFiles: 4004,
} as const;

export const Mode = { photo: 0, video: 1 } as const;

export type CameraFile = {
  name: string;
  url: string;
  cameraPath?: string;
  sizeBytes: number | null;
  time: string | null;
};

export type CommandResult = {
  cmd: number;
  status: number | null;
  value: string | null;
  raw: string;
};

export type FileListing = {
  files: CameraFile[];
  source: 'command' | 'folder page';
  raw: string;
};

async function get(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function readTag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1].trim() : null;
}

export function commandUrl(cmd: number, params: { par?: number; str?: string } = {}): string {
  let url = `${BASE_URL}/?custom=1&cmd=${cmd}`;
  if (params.par !== undefined) url += `&par=${params.par}`;
  if (params.str !== undefined) {
    url += `&str=${encodeURIComponent(params.str).replace(/%3A/g, ':')}`;
  }
  return url;
}

export function parseCommandResult(cmd: number, raw: string): CommandResult {
  const status = readTag(raw, 'Status');
  return {
    cmd,
    status: status === null ? null : Number(status),
    value: readTag(raw, 'Value') ?? readTag(raw, 'String'),
    raw,
  };
}

export async function sendCommand(
  cmd: number,
  params: { par?: number; str?: string } = {},
  timeoutMs = 5000,
): Promise<CommandResult> {
  return parseCommandResult(cmd, await get(commandUrl(cmd, params), timeoutMs));
}

export async function ping(): Promise<boolean> {
  try {
    await get(commandUrl(Command.firmwareVersion), 2000);
    return true;
  } catch {
    return false;
  }
}

function cameraPathToUrl(cameraPath: string): string {
  const path = cameraPath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/');
  return BASE_URL + (path.startsWith('/') ? path : `/${path}`);
}

function urlToCameraPath(url: string): string {
  return `A:${decodeURIComponent(url.slice(BASE_URL.length)).replace(/\//g, '\\')}`;
}

export function parseFileListXml(xml: string): CameraFile[] {
  const files: CameraFile[] = [];
  for (const match of xml.matchAll(/<File>([\s\S]*?)<\/File>/gi)) {
    const block = match[1];
    const name = readTag(block, 'NAME');
    const cameraPath = readTag(block, 'FPATH');
    if (!name || !cameraPath) continue;
    const size = readTag(block, 'SIZE');
    files.push({
      name,
      url: cameraPathToUrl(cameraPath),
      cameraPath,
      sizeBytes: size ? Number(size) : null,
      time: readTag(block, 'TIME'),
    });
  }
  return files;
}

export function parseFileListHtml(html: string, folderUrl = MOVIE_FOLDER_URL): CameraFile[] {
  const files: CameraFile[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+\.(?:ts|mp4|mov|jpg))"/gi)) {
    const href = match[1];
    if (/[?&]del=/i.test(href)) continue;
    const url = href.startsWith('http')
      ? href
      : href.startsWith('/')
        ? BASE_URL + href
        : `${folderUrl}/${href}`;
    if (seen.has(url)) continue;
    seen.add(url);
    files.push({
      name: decodeURIComponent(url.split('/').pop() ?? url),
      url,
      cameraPath: urlToCameraPath(url),
      sizeBytes: null,
      time: null,
    });
  }
  return files;
}

export async function listFiles(): Promise<FileListing> {
  try {
    const xml = await get(commandUrl(Command.fileList), 10000);
    const files = parseFileListXml(xml);
    if (files.length > 0) return { files, source: 'command', raw: xml };
  } catch {}
  const html = await get(MOVIE_FOLDER_URL, 10000);
  return { files: parseFileListHtml(html), source: 'folder page', raw: html };
}

export async function deleteFile(file: CameraFile): Promise<boolean> {
  if (!file.cameraPath) return false;
  const result = await sendCommand(Command.deleteFile, { str: file.cameraPath }, 15000);
  if (result.status === 0) return true;
  try {
    await get(`${file.url}?del=1`, 5000);
  } catch {
    return false;
  }
  const remaining = await listFiles();
  return !remaining.files.some((f) => f.name === file.name);
}
