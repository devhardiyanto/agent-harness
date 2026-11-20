// 1.20.0: satu sesi = satu work item; Stop lebih jarang menahan (menunggu agent latar, rekap hanya saat status berubah).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

function withItem(sid = 's') {
  const root = project({ v1: true });
  const slug = hx(root, 'new', 'feature', 'validasi bio').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  hook(root, 'post.mjs', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: p } });
  return { root, slug, p };
}
const bash = (root, command, sid = 's') => hook(root, 'guard-bash.mjs', { session_id: sid, tool_name: 'Bash', tool_input: { command } });

test('guard: "harness.mjs new" ditolak bila sesi sudah punya item aktif; sesi lain bebas', () => {
  const { root, slug } = withItem();
  const r = bash(root, 'node .claude/hooks/harness.mjs new feature "tambah avatar"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`sudah punya item ${slug}`));
  assert.equal(bash(root, 'node .claude/hooks/harness.mjs new feature "x"', 'lain').status, 0);
});

test('"item baru" dari user = tiket sekali pakai untuk new', () => {
  const { root } = withItem();
  const pr = hook(root, 'prompt.mjs', { prompt: 'item baru: tambah avatar di profil' });
  assert.match(pr.stdout, /ITEM BARU/);
  assert.equal(bash(root, 'node .claude/hooks/harness.mjs new feature "tambah avatar"').status, 0);
  assert.equal(bash(root, 'node .claude/hooks/harness.mjs new feature "lagi"').status, 2, 'tiket terpakai');
});

test('prompt biasa di sesi ber-item aktif: konteks LANJUTAN item itu', () => {
  const { root, slug } = withItem();
  const pr = hook(root, 'prompt.mjs', { prompt: 'oh ya, sekalian tolong pesan galatnya pakai bahasa Indonesia' });
  assert.match(pr.stdout, new RegExp(`sedang membahas item ${slug} \\(draft\\)`));
  assert.match(pr.stdout, /LANJUTAN item itu/);
});

test('item aktif sudah merged: new boleh lagi', () => {
  const { root, p } = withItem();
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^status: draft$/m, 'status: merged'));
  assert.equal(bash(root, 'node .claude/hooks/harness.mjs new feature "x"').status, 0);
});

test('Stop: giliran yang menunggu agent latar tidak ditahan; rekap ditahan hanya saat status berubah', () => {
  const { root, p } = withItem();
  const st = (msg) => hook(root, 'stop.mjs', { last_assistant_message: msg });
  assert.equal(st('Agent reviewer sedang menilai; saya lanjutkan setelah laporannya masuk.').status, 0);
  const first = st('Item dibuat.');
  assert.equal(first.status, 2, 'rekap pertama (status baru) ditahan');
  fs.writeFileSync(p, `${fs.readFileSync(p, 'utf8')}\n<!-- catatan -->\n`);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## 1. Objective', '## 1. Objective\nTujuan baru.'));
  assert.equal(st('Objective diperbarui.').status, 0, 'isi berubah, status sama: tidak ditahan');
});
