import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignTables } from '../kernel/.claude/hooks/lib.mjs';

test('alignTables: kolom rata, baris pemisah selebar kolom, teks di luar tabel tidak berubah', () => {
  const t = alignTables('judul\n| status harness | state Plane | hasil |\n|---|---|---|\n| draft | Backlog | OK |\n| in-review | Review | OK |\n\nInfo: x | y');
  assert.equal(t, [
    'judul',
    '| status harness | state Plane | hasil |',
    '| -------------- | ----------- | ----- |',
    '| draft          | Backlog     | OK    |',
    '| in-review      | Review      | OK    |',
    '',
    'Info: x | y',
  ].join('\n'));
});

test('alignTables: pipa ter-escape tetap di dalam sel; sel kosong dan baris pendek diisi', () => {
  const t = alignTables('| a | b |\n|---|---|\n| x \\| y | |\n| z |');
  assert.deepEqual(t.split('\n'), ['| a      | b   |', '| ------ | --- |', '| x \\| y |     |', '| z      |     |']);
});
