import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  commandUrl,
  parseCommandResult,
  parseFileListHtml,
  parseFileListXml,
} from '../src/camera/client.ts';

test('builds a command URL and keeps colons readable', () => {
  assert.equal(
    commandUrl(3006, { str: '10:15:00' }),
    'http://192.168.1.254/?custom=1&cmd=3006&str=10:15:00',
  );
  assert.equal(commandUrl(2001, { par: 1 }), 'http://192.168.1.254/?custom=1&cmd=2001&par=1');
});

test('reads status and value from a command reply', () => {
  const reply = '<Function><Cmd>3019</Cmd><Status>0</Status><Value>5</Value></Function>';
  assert.deepEqual(parseCommandResult(3019, reply), {
    cmd: 3019,
    status: 0,
    value: '5',
    raw: reply,
  });
});

test('reports a missing status as null', () => {
  assert.equal(parseCommandResult(3014, 'not xml').status, null);
});

test('parses the XML file list', () => {
  const xml = `<LIST><ALLFile><File>
    <NAME>20261120101500_000001.TS</NAME>
    <FPATH>A:\\Novatek\\Movie\\20261120101500_000001.TS</FPATH>
    <SIZE>52428800</SIZE>
    <TIME>2026/11/20 10:15:00</TIME>
  </File></ALLFile></LIST>`;
  assert.deepEqual(parseFileListXml(xml), [
    {
      name: '20261120101500_000001.TS',
      url: 'http://192.168.1.254/Novatek/Movie/20261120101500_000001.TS',
      cameraPath: 'A:\\Novatek\\Movie\\20261120101500_000001.TS',
      sizeBytes: 52428800,
      time: '2026/11/20 10:15:00',
    },
  ]);
});

test('parses the folder page, skipping delete links and duplicates', () => {
  const html = `
    <a href="/Novatek/Movie/A.TS">A.TS</a>
    <a href="/Novatek/Movie/A.TS?del=1">delete</a>
    <a href="/Novatek/Movie/A.TS">A.TS</a>
    <a href="B.mp4">B.mp4</a>`;
  const files = parseFileListHtml(html);
  assert.deepEqual(
    files.map((file) => file.url),
    ['http://192.168.1.254/Novatek/Movie/A.TS', 'http://192.168.1.254/Novatek/Movie/B.mp4'],
  );
  assert.equal(files[0].cameraPath, 'A:\\Novatek\\Movie\\A.TS');
});
