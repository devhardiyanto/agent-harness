// 1.22.3: opsi pemilih dipecah di penanda a)/b); rekap kosong tidak menahan; status line menampilkan topik.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseOptions } from '../kernel/.claude/hooks/ask.mjs';
import { project, hx, hook } from './helpers.mjs';

test('parseOptions: ";" dan "/" di dalam teks opsi tidak memotong opsi', () => {
  assert.deepEqual(parseOptions('(a) galat validasi: "profil harus berupa objek" untuk `null`/bukan objek; bio null tetap lolos · (b) tetap throw dengan pesan jelas'),
    ['galat validasi: "profil harus berupa objek" untuk `null`/bukan objek; bio null tetap lolos', 'tetap throw dengan pesan jelas']);
  assert.deepEqual(parseOptions('a) benar · b) salah'), ['benar', 'salah']);
  assert.deepEqual(parseOptions('300 lolos · 301 ditolak'), ['300 lolos', '301 ditolak']);
  assert.deepEqual(parseOptions('a) pisahkan fungsi murni (hitung code point + validasi); b) tambah dev dependency (react-dom / testing-lib)'),
    ['pisahkan fungsi murni (hitung code point + validasi)', 'tambah dev dependency (react-dom / testing-lib)']);
});

test('status line: sesi bertopik menampilkan topik', async () => {
  const root = project({ v1: true });
  const rel = hx(root, 'topic', 'new', 'audit validasi profil').stdout.trim();
  hook(root, 'post.mjs', { session_id: 's', tool_name: 'Edit', tool_input: { file_path: path.join(root, rel) } });
  const r = hook(root, 'statusline.mjs', { session_id: 's', workspace: { current_dir: root } });
  assert.match(r.stdout, /topik: audit-validasi-profil/);
});

test('Stop: rekap kosong setelah merged tidak menahan giliran', () => {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'x').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  hook(root, 'post.mjs', { session_id: 's', tool_name: 'Edit', tool_input: { file_path: p } });
  const fs = require_fs();
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^status: draft$/m, 'status: merged'));
  assert.equal(hook(root, 'stop.mjs', { last_assistant_message: 'Item sudah merged.' }).status, 0);
});
import fsMod from 'node:fs';
function require_fs() { return fsMod; }

test('1.22.5 (N9): jawaban "default: …" dari agent tetap terbuka dan ditanyakan', async () => {
  const { decisionRows, readItem } = await import('../kernel/.claude/hooks/lib.mjs');
  delete process.env.HARNESS_ITEM_BENTUK;
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'bio').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  fsMod.writeFileSync(p, fsMod.readFileSync(p, 'utf8').replace(/### Keputusan terbuka\n\| # \| pertanyaan \| opsi \(rekomendasi dulu\) \| jawaban \|\n\|---\|---\|---\|---\|/,
    '### Keputusan terbuka\n| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |\n|---|---|---|---|\n| D1 | Cara hitung | a) bio.length · b) code point | default: `bio.length` |\n| D2 | Pesan | a) teks itu | a) teks itu (pemilih) |'));
  const ids = decisionRows(readItem(root, slug)).map((r) => r.id);
  assert.ok(ids.includes('D1'), 'default = usulan, belum dijawab');
  assert.ok(!ids.includes('D2'));
});
