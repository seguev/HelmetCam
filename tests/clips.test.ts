import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayOf, formatSize, groupByDay, isVideoClip } from '../src/camera/clips.ts';

const file = (name: string) => ({ name, url: name, sizeBytes: null, time: null });

test('reads the recording day from a file name', () => {
  assert.equal(dayOf('20261120170638_000046.TS'), '2026-11-20');
  assert.equal(dayOf('2026_1120_170638.MP4'), '2026-11-20');
  assert.equal(dayOf('clip.ts'), 'Unknown date');
});

test('only .ts files count as joinable video', () => {
  assert.equal(isVideoClip('A.TS'), true);
  assert.equal(isVideoClip('A.JPG'), false);
});

test('groups newest day first and oldest clip first', () => {
  const sections = groupByDay([
    file('20261119090000_000002.TS'),
    file('20261120100000_000004.TS'),
    file('20261120090000_000003.TS'),
  ]);
  assert.deepEqual(
    sections.map((section) => [section.day, section.data.map((clip) => clip.name)]),
    [
      ['2026-11-20', ['20261120090000_000003.TS', '20261120100000_000004.TS']],
      ['2026-11-19', ['20261119090000_000002.TS']],
    ],
  );
});

test('formats sizes', () => {
  assert.equal(formatSize(1_500_000_000), '1.50 GB');
  assert.equal(formatSize(52_400_000), '52.4 MB');
  assert.equal(formatSize(900_000), '900 KB');
  assert.equal(formatSize(null), '');
});
