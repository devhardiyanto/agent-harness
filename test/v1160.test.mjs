// 1.16.0: satu berkas per item (bentuk tunggal), gerbang pada bentuk itu, pemilih keputusan (naskah + pencatatan), menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook, wr, rd, jr } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK; // test ini menguji bentuk bawaan (tunggal)
const add = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext || '' : '');
const newItem = (root, title) => { const r = hx(root, 'new', 'feature', title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const P = (slug) => `docs/work/${slug}/plan.md`;
const edit = (root, slug, oldS, newS) => hook(root, 'gate.mjs', { tool_name: 'Edit', tool_input: { file_path: path.join(root, P(slug)), old_string: oldS, new_string: newS } });
const fill = (root, slug, svc) => {
  let t = rd(root, P(slug));
  t = t.replace('services: []', `services: [${svc}]`).replace('<!-- satu kalimat: hasil yang diinginkan user, bukan cara. -->', 'Event organisasi tidak tampil di listing publik.');
  t = t.replace('|---|---|---|---|\n<!-- status', '|---|---|---|---|\n| C1 | listing memakai scope | api/x.ts:3 | terverifikasi |\n<!-- status');
  t = t.replace('| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |\n|---|---|---|---|\n', '| # | pertanyaan | opsi (rekomendasi dulu) | jawaban |\n|---|---|---|---|\n| D1 | Berlaku untuk event lama? | a) ya, semua · b) hanya baru | |\n');
  wr(root, P(slug), t);
};

test('new: satu plan.md empat bagian (tanpa berkas lain); readPart memberi brief/align/progress/review dari bagian-bagiannya', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Sembunyikan event organisasi');
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/work', slug)), ['plan.md']);
  assert.match(rd(root, P(slug)), /bentuk: tunggal[\s\S]*## 1\. Objective[\s\S]*## 2\. Penjelasan[\s\S]*## 3\. Dampak & konfirmasi[\s\S]*## 4\. Eksekusi[\s\S]*### Bukti[\s\S]*### Tinjauan/);
  const svc = jr(root, 'harness.config.json').services[0];
  fill(root, slug, svc);
  const d = hx(root, 'decide', slug).stdout;
  assert.match(d, /\| D1 \| keputusan \| Berlaku untuk event lama\?/);
  assert.match(JSON.parse(hx(root, 'list', '--json').stdout)[0].has ? 'ok' : '', /ok/);
});

test('gerbang bentuk tunggal: align: aligned hanya manusia; AC ditolak sebelum aligned; "align ok" menulis frontmatter; beku setelah approved kecuali Bukti', () => {
  const root = project({ v1: true });
  const svc = jr(root, 'harness.config.json').services[0];
  const slug = newItem(root, 'Sembunyikan event organisasi');
  fill(root, slug, svc);
  assert.equal(edit(root, slug, 'align: open', 'align: aligned').status, 2, 'agent tidak boleh menulis aligned');
  const acAdd = (r) => edit(r, slug, '<!-- AC bernomor, ditulis setelah aligned: - AC1: ... (yang bisa dibuktikan) -->', '- AC1: listing tidak menampilkan event organisasi');
  let r = acAdd(root);
  assert.equal(r.status, 2); assert.match(r.stderr + r.stdout, /belum aligned|belum boleh diisi AC/);
  // jawab D1 lalu manusia menutup align
  wr(root, P(slug), rd(root, P(slug)).replace('| D1 | Berlaku untuk event lama? | a) ya, semua · b) hanya baru | |', '| D1 | Berlaku untuk event lama? | a) ya, semua · b) hanya baru | a |'));
  const short = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  r = hook(root, 'prompt.mjs', { prompt: `align ok ${short}` });
  assert.match(add(r), /ALIGNED/);
  assert.match(rd(root, P(slug)), /^align: aligned$/m);
  assert.equal(fs.existsSync(path.join(root, 'docs/work', slug, 'align.md')), false);
  assert.equal(acAdd(root).status, 0, 'AC boleh setelah aligned');
  wr(root, P(slug), rd(root, P(slug)).replace('<!-- AC bernomor, ditulis setelah aligned: - AC1: ... (yang bisa dibuktikan) -->', '- AC1: listing tidak menampilkan event organisasi'));
  assert.match(add(hook(root, 'prompt.mjs', { prompt: `setuju ${short}` })), /APPROVED/);
  assert.equal(edit(root, slug, '- AC1: listing tidak menampilkan event organisasi', '- AC1: listing kosong').status, 2, 'teks AC beku');
  assert.equal(edit(root, slug, 'Event organisasi tidak tampil di listing publik.', 'Tujuan lain.').status, 2, 'bagian 1 beku');
  assert.equal(edit(root, slug, '<!-- satu baris per AC: - AC1: output nyata / langkah + hasil -->', '- AC1: GET /events tidak memuat org-1 (curl, 200, 0 baris)').status, 0, 'bukti boleh ditulis');
  wr(root, P(slug), rd(root, P(slug)).replace('<!-- satu baris per AC: - AC1: output nyata / langkah + hasil -->', '- AC1: GET /events tidak memuat org-1 (curl, 200, 0 baris)'));
  const s = JSON.parse(hx(root, 'show', slug, '--json').stdout);
  assert.deepEqual(s.ac, [{ id: 'AC1', evidence: 'ok' }], 'bukti di ### Bukti terbaca, dan tidak dihitung sebagai AC kedua');
});

test('pemilih: Stop memberi naskah AskUserQuestion; jawaban dari PostToolUse ditulis ke baris D; pertanyaan karangan diabaikan', () => {
  const root = project({ v1: true });
  const svc = jr(root, 'harness.config.json').services[0];
  const slug = newItem(root, 'Sembunyikan event organisasi');
  fill(root, slug, svc);
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  const st = hook(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'x' });
  assert.equal(st.status, 2);
  assert.match(st.stderr, /AskUserQuestion/);
  const js = JSON.parse(st.stderr.slice(st.stderr.indexOf('{"questions"')).split('\n')[0]);
  assert.equal(js.questions[0].question, 'D1: Berlaku untuk event lama?');
  assert.deepEqual(js.questions[0].options.map((o) => o.label), ['ya, semua', 'hanya baru']);
  const post = (resp) => hook(root, 'ask.mjs', { hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: js, tool_response: resp });
  post({ answers: { 'Pertanyaan karangan?': 'ya' } });
  assert.match(rd(root, P(slug)), /\| D1 \| Berlaku untuk event lama\? \| a\) ya, semua · b\) hanya baru \| \|/);
  const r = post({ questions: js.questions, answers: { 'D1: Berlaku untuk event lama?': 'ya, semua' } });
  assert.match(add(r), /Jawaban dicatat/);
  assert.match(rd(root, P(slug)), /\| D1 \| Berlaku untuk event lama\? \| a\) ya, semua · b\) hanya baru \| ya, semua \(pemilih\) \|/);
  assert.equal(hx(root, 'decide', slug).stdout.includes('| D1 |'), false, 'D1 tidak lagi terbuka');
});

test('menu: pemilih langkah sah; setuju/push PR + merge disebut sebagai teks, bukan opsi', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Sembunyikan event organisasi');
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  const t = add(hook(root, 'prompt.mjs', { prompt: 'menu' }));
  assert.match(t, /AskUserQuestion/);
  const js = JSON.parse(t.slice(t.indexOf('{"questions"'), t.lastIndexOf('}') + 1).split('}]}')[0] + '}]}');
  assert.ok(js.questions[0].options.length >= 1 && js.questions[0].options.length <= 4);
  assert.ok(js.questions[0].options.every((o) => !/^setuju|push PR \+ merge/.test(o.label)));
});

test('quick bentuk tunggal: satu berkas, AC1 dari permintaan, bukti di ### Bukti dihitung', () => {
  const root = project({ v1: true });
  const r = hook(root, 'prompt.mjs', { prompt: 'quick: ubah teks tombol simpan di halaman profil' });
  const slug = /Item quick (\S+) dibuat/.exec(add(r))[1];
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/work', slug)), ['plan.md']);
  assert.match(rd(root, P(slug)), /bentuk: tunggal[\s\S]*- AC1: ubah teks tombol simpan/);
  wr(root, P(slug), rd(root, P(slug)).replace(/### Bukti\n- AC1:/, '### Bukti\n- AC1: tombol menampilkan "Simpan perubahan" (diperiksa manual)'));
  assert.deepEqual(JSON.parse(hx(root, 'show', slug, '--json').stdout).ac, [{ id: 'AC1', evidence: 'ok' }]);
});
