import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignTables } from '../kernel/.claude/hooks/lib.mjs';

const SRC = 'judul\n| status harness | state Plane | hasil |\n|---|---|---|\n| draft | Backlog | OK |\n| in-review | Review | OK |\n\nInfo: x | y';

test('alignTables box (bawaan): tabel bergaris kotak, teks di luar tabel tidak berubah', () => {
  assert.equal(alignTables(SRC), [
    'judul',
    '┌────────────────┬─────────────┬───────┐',
    '│ status harness │ state Plane │ hasil │',
    '├────────────────┼─────────────┼───────┤',
    '│ draft          │ Backlog     │ OK    │',
    '│ in-review      │ Review      │ OK    │',
    '└────────────────┴─────────────┴───────┘',
    '',
    'Info: x | y',
  ].join('\n'));
});

test('alignTables md: Markdown rata kolom; pipa ter-escape tetap di sel; baris pendek diisi', () => {
  assert.equal(alignTables(SRC, 'md').split('\n')[2], '| -------------- | ----------- | ----- |');
  assert.deepEqual(alignTables('| a | b |\n|---|---|\n| x \\| y | |\n| z |', 'md').split('\n'), ['| a      | b   |', '| ------ | --- |', '| x \\| y |     |', '| z      |     |']);
  assert.match(alignTables('| a | b |\n|---|---|\n| x \\| y | |'), /│ x \| y │     │/);
});

test('alignTables box: tabel lebar dibungkus agar muat HARNESS_TABLE_WIDTH', () => {
  process.env.HARNESS_TABLE_WIDTH = '40';
  try {
    const t = alignTables(`| cek | catatan |\n|---|---|\n| doctor | ${'kata '.repeat(20).trim()} |`);
    for (const l of t.split('\n')) assert.ok([...l].length <= 40, l);
    assert.ok(t.split('\n').length > 6, 'sel panjang menjadi beberapa baris');
  } finally { delete process.env.HARNESS_TABLE_WIDTH; }
});
