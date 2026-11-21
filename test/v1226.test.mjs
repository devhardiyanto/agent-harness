// 1.22.6: permintaan beda objective tidak mengubah plan.md; sandbox --reset tidak menghapus foldernya sendiri.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { project, hx, hook } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;
const here = path.dirname(fileURLToPath(import.meta.url));

function withItem(extra = '') {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'audit validasi').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  if (extra) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^align: .*$/m, extra));
  hook(root, 'post.mjs', { session_id: 's', tool_name: 'Edit', tool_input: { file_path: p } });
  return { root, slug };
}

test('LANJUTAN: objective dinilai dulu; beda objective → tanya, jangan ubah plan.md', () => {
  const { root } = withItem();
  const pr = hook(root, 'prompt.mjs', { session_id: 's', prompt: 'tambahkan juga avatar di profil' });
  assert.match(pr.stdout, /Nilai dulu/);
  assert.match(pr.stdout, /JANGAN mengubah plan\.md/);
  assert.match(pr.stdout, /item baru: <judul>/);
  assert.doesNotMatch(pr.stdout, /membuka lagi persetujuan/, 'draft belum aligned: tidak ada persetujuan yang dibuka');
});

test('LANJUTAN: item aligned menyebut gabung membuka lagi persetujuan', () => {
  const { root } = withItem('align: aligned');
  const pr = hook(root, 'prompt.mjs', { session_id: 's', prompt: 'tambahkan juga avatar di profil' });
  assert.match(pr.stdout, /membuka lagi persetujuan yang sudah ada/);
});

test('sandbox --reset: folder dipakai ulang (tidak dihapus), isi lama hilang', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbx-'));
  const mk = (...a) => spawnSync('node', [path.join(here, '..', 'scripts', 'sandbox.mjs'), dir, ...a], { encoding: 'utf8' });
  assert.equal(mk().status, 0);
  const ino = fs.statSync(dir).ino;
  fs.writeFileSync(path.join(dir, 'sisa.txt'), 'x');
  const r = mk('--reset');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.statSync(dir).ino, ino, 'folder yang sama');
  assert.equal(fs.existsSync(path.join(dir, 'sisa.txt')), false);
  assert.ok(fs.existsSync(path.join(dir, '.sandbox/MARKER')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('open --mine: item baru yang hanya disentuh sesi (belum ada event) tetap muncul', () => {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'validasi nama').stdout.trim().split('/').pop();
  hook(root, 'post.mjs', { session_id: 'baru', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'docs/work', slug, 'plan.md') } });
  const r = hx(root, 'open', '--mine');
  assert.match(r.stdout, /validasi-nama/);
});
