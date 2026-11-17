// 1.19.4: klaim dugaan ikut pemilih; jawaban diketik dicatat hook; naskah pemilih di berkas; "sesi baru" opsional.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook, rd } from './helpers.mjs';
import { parseTypedAnswers } from '../kernel/.claude/hooks/ask.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

test('parseTypedAnswers: beberapa jawaban sekaligus; kalimat biasa bukan jawaban', () => {
  assert.deepEqual(parseTypedAnswers('C4 benar dan C5 benar').map((a) => `${a.id}=${a.val}`), ['C4=benar', 'C5=benar']);
  assert.deepEqual(parseTypedAnswers('C4 a, D1: b').map((a) => `${a.id}=${a.val}`), ['C4=a', 'D1=b']);
  assert.equal(parseTypedAnswers('C2 salah: pakai kolom bio')[0].note, 'pakai kolom bio');
  assert.equal(parseTypedAnswers('semua benar')[0].id, '*C');
  assert.equal(parseTypedAnswers('tolong ubah tombol Save'), null);
  assert.equal(parseTypedAnswers('C4 benar dan tambahkan test'), null);
});

function draftItem(root) {
  const slug = hx(root, 'new', 'feature', 'tombol save').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  let t = fs.readFileSync(p, 'utf8');
  t = t.replace(/### Klaim vs bukti kode\n\| # \| klaim \| bukti path:baris \| status \|\n\|---\|---\|---\|---\|/, '### Klaim vs bukti kode\n| # | klaim | bukti path:baris | status |\n|---|---|---|---|\n| C4 | Runner belum bisa uji TSX | - | dugaan |\n| C5 | Backend tidak terdampak | - | dugaan |');
  t = t.replace(/### Keputusan terbuka\n\| # \| pertanyaan \| opsi \(rekomendasi dulu\) \| jawaban \|\n\|---\|---\|---\|---\|/, '### Keputusan terbuka\n| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |\n|---|---|---|---|\n| D1 | Definisi ada perubahan | a) per field · b) flag dirty | |');
  fs.writeFileSync(p, t);
  return { slug, p };
}

test('prompt: "C4 benar dan C5 benar" lalu "D1: a" dicatat hook ke berkas item', () => {
  const root = project({ v1: true });
  const { p } = draftItem(root);
  const r = hook(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: 'C4 benar dan C5 benar' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DICATAT HOOK/);
  let t = fs.readFileSync(p, 'utf8');
  assert.match(t, /\| C4 \|[^\n]*dikonfirmasi \(user, ketik\)/);
  assert.match(t, /\| C5 \|[^\n]*dikonfirmasi \(user, ketik\)/);
  hook(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: 'D1: a' });
  t = fs.readFileSync(p, 'utf8');
  assert.match(t, /\| D1 \|[^\n]*per field \(ketik\)/);
});

test('pemilih: klaim dugaan ikut ditanyakan; naskah ditulis ke berkas, pesan hook hanya menyebut path', async () => {
  const root = project({ v1: true });
  const { slug } = draftItem(root);
  const { buildQuestions, askInstruction } = await import(path.join(root, '.claude/hooks/ask.mjs'));
  const { readItem } = await import(path.join(root, '.claude/hooks/lib.mjs'));
  const qs = buildQuestions(root, readItem(root, slug));
  assert.deepEqual(qs.map((q) => q.id), ['C4', 'C5', 'D1']);
  assert.deepEqual(qs[0].options.map((o) => o.label), ['benar', 'salah']);
  const msg = askInstruction(qs, root, 'sesi-1');
  assert.doesNotMatch(msg, /"questions"/);
  assert.match(msg, /\.harness\/state\/ask\/args-sesi1\.json/);
  assert.ok(JSON.parse(rd(root, '.harness/state/ask/args-sesi1.json')).questions.length === 3);
});
