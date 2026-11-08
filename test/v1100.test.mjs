// 1.10.0: intent tanpa slash, align "terima Cn", tabel belum selesai, memori project, recall, ref:<slug>, rekap Stop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { project, hx, hook, wr, rd, jr, commitAll } from './helpers.mjs';

const ctx = (r) => (r.stdout ? JSON.parse(r.stdout) : {});
const add = (r) => ctx(r).hookSpecificOutput?.additionalContext || '';
const newItem = (root, title) => { const r = hx(root, 'new', 'feature', title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const ALIGN = (rows) => `---\nverdict: open\nrounds: 1\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n${rows}\n\n## Debat\n\n## Parking lot\n-\n`;

test('kernel: flag intent/recap/memory ada; MEMORY.md dilindungi', () => {
  const root = project({ v1: true });
  const c = jr(root, 'harness.config.json');
  assert.equal(c.intent.enabled, true); assert.equal(c.recap.on_stop, true); assert.equal(c.memory.write_approval, false); assert.equal(c.ship.merge_on_request, true); assert.equal(c.align.accept_contradictions, true);
  const r = hook(root, 'gate.mjs', { tool_name: 'Write', tool_input: { file_path: path.join(root, 'docs/memory/MEMORY.md'), content: 'x' } });
  assert.equal(r.status, 2, 'agent tidak boleh menulis MEMORY.md langsung');
});

test('align: pesan blok berbentuk tabel + opsi; "align ok <slug> terima C2" menutup dan mencatat', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Ekspor CSV');
  wr(root, `docs/work/${slug}/align.md`, ALIGN('| C1 | a | x.ts:1 | terverifikasi |\n| C2 | data kecil | y.ts:9 | bertentangan |\n| C3 | admin | - | bertentangan |'));
  let r = hook(root, 'prompt.mjs', { prompt: `align ok ${slug}` });
  const reason = ctx(r).reason;
  assert.match(reason, /\| C2 \| data kecil/); assert.match(reason, /terima C2,C3/);
  r = hook(root, 'prompt.mjs', { prompt: `/harness:align ${slug} ok terima C2` });
  assert.match(ctx(r).reason, /C3/, 'C3 masih bertentangan → tetap ditolak');
  assert.match(rd(root, `docs/work/${slug}/align.md`), /verdict: open/);
  r = hook(root, 'prompt.mjs', { prompt: `align ok ekspor-csv terima semua` });
  assert.match(add(r), /ALIGNED/);
  const t = rd(root, `docs/work/${slug}/align.md`);
  assert.match(t, /verdict: aligned/); assert.match(t, /C2, C3: bertentangan dengan kode, risikonya DITERIMA/); assert.doesNotMatch(t, /\| bertentangan \|/);
});

test('align: accept_contradictions=false menolak "terima"', () => {
  const root = project({ v1: true });
  const c = jr(root, 'harness.config.json'); c.align.accept_contradictions = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  const slug = newItem(root, 'X satu');
  wr(root, `docs/work/${slug}/align.md`, ALIGN('| C1 | a | x.ts:1 | bertentangan |'));
  const r = hook(root, 'prompt.mjs', { prompt: `align ok ${slug} terima C1` });
  assert.match(ctx(r).reason, /accept_contradictions=false/);
});

test('intent: "setuju <potongan slug>" = approve; kalimat biasa diteruskan; slug tak dikenal diteruskan; intent mati = diteruskan', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Fitur dua');
  let r = hook(root, 'prompt.mjs', { prompt: 'setuju fitur-dua' });
  assert.match(ctx(r).reason || '', /approve ditolak/, 'masuk jalur approve (ditolak karena belum aligned/plan)');
  r = hook(root, 'prompt.mjs', { prompt: 'setuju tidak-ada-item' });
  assert.equal(r.stdout, '');
  r = hook(root, 'prompt.mjs', { prompt: 'aku setuju fitur-dua harus dibuat lebih cepat dan rapi ya' });
  assert.equal(r.stdout, '');
  const c = jr(root, 'harness.config.json'); c.intent.enabled = false; wr(root, 'harness.config.json', JSON.stringify(c));
  r = hook(root, 'prompt.mjs', { prompt: 'setuju fitur-dua' });
  assert.equal(r.stdout, '');
  assert.ok(slug);
});

test('intent: "quick: ..." membuat item quick; "kirim <slug>" tanpa PR meminta /harness:ship', () => {
  const root = project({ v1: true });
  let r = hook(root, 'prompt.mjs', { prompt: 'quick: api ganti teks tombol simpan' });
  assert.match(add(r) + (ctx(r).reason || ''), /quick/);
  const slug = newItem(root, 'Kirim tes');
  r = hook(root, 'prompt.mjs', { prompt: 'kirim kirim-tes' });
  assert.match(ctx(r).reason, /berstatus draft; ship hanya untuk item "done"/);
});

test('tabel belum selesai: pertanyaan terbuka, klaim, usulan memori; "sisa" dan CLI open', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Laporan bulanan');
  const bp = `docs/work/${slug}/brief.md`;
  wr(root, bp, rd(root, bp).replace(/## Open questions\n-/, '## Open questions\n- Format tanggal ikut zona waktu siapa?'));
  wr(root, `docs/work/${slug}/align.md`, ALIGN('| C1 | data harian ada | - | dugaan |'));
  const c = jr(root, 'harness.config.json'); c.memory.write_approval = true; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  hx(root, 'memory', 'add', 'Laporan dikirim via email tiap tanggal 1');
  const r = hook(root, 'prompt.mjs', { prompt: 'yang belum selesai apa?' });
  const t = add(r);
  assert.match(t, /\| pertanyaan \| Format tanggal/); assert.match(t, /klaim dugaan/); assert.match(t, /usulan memori/); assert.match(t, /langkah/);
  const o = hx(root, 'open', '--json');
  assert.equal(o.status, 0, o.stderr);
  assert.ok(JSON.parse(o.stdout).length >= 4);
});

test('memori (write_approval=true): ingat langsung (manusia), antrean agent, batas karakter, lupakan, snapshot di SessionStart', () => {
  const root = project({ v1: true });
  const c = jr(root, 'harness.config.json'); c.memory.max_chars = 120; c.memory.write_approval = true; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  let r = hook(root, 'prompt.mjs', { prompt: 'ingat: deploy staging tiap Kamis sore' });
  assert.match(add(r), /M1 disimpan/);
  r = hx(root, 'memory', 'add', 'Service web memakai Next.js 15 app router');
  assert.match(r.stdout, /P1 masuk antrean/);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat: ' + 'x'.repeat(90) });
  assert.match(ctx(r).reason, /memori penuh/);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat: token=ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  assert.match(ctx(r).reason, /secret/);
  r = hook(root, 'session.mjs', { source: 'startup' });
  assert.match(add(r), /M1\. deploy staging tiap Kamis sore/); assert.match(add(r), /1 usulan memori menunggu/);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat P1' });
  assert.match(add(r), /diterapkan: P1/);
  r = hook(root, 'prompt.mjs', { prompt: 'lupakan M1' });
  assert.match(add(r), /dihapus/);
  assert.doesNotMatch(rd(root, 'docs/memory/MEMORY.md'), /Kamis/);
  r = hook(root, 'guard-bash.mjs', { tool_name: 'Bash', tool_input: { command: 'node .claude/hooks/harness.mjs memory forget 1' } });
  assert.equal(r.status, 2);
});

test('done: INDEX.md + usulan pelajaran dari Decision log (modul memory terpasang)', async () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Paginasi produk');
  const m = await import(pathToFileURL(path.join(root, '.claude/hooks/memory.mjs')).href);
  const cfg = { memory: { enabled: true, learn_from_summary: true, learn_max: 2, max_chars: 2200, write_approval: true } };
  const item = { slug, status: 'done' };
  m.indexItem(root, item, 'Daftar produk bisa dipaginasi');
  m.indexItem(root, item, 'Daftar produk bisa dipaginasi (ulang)');
  const idx = rd(root, 'docs/memory/INDEX.md');
  assert.equal((idx.match(new RegExp(slug, 'g')) || []).length, 2, 'satu baris per item (baris lama diganti)');
  const ids = m.learnFrom(root, cfg, item, ['- Pakai cursor pagination, bukan offset', '- Batas 100 per halaman demi memori', '- Ketiga tidak diambil karena learn_max']);
  assert.deepEqual(ids, ['P1', 'P2']);
  assert.match(rd(root, 'docs/memory/pending.md'), /P1 · .* · dari .*paginasi-produk · Pakai cursor pagination/);
  assert.equal(m.entries(root).length, 0, 'usulan tidak langsung masuk MEMORY.md');
});

test('memori gaya Hermes (bawaan): agent menulis dan menghapus sendiri; pelajaran done langsung masuk, penuh → antrean', async () => {
  const root = project({ v1: true });
  let r = hx(root, 'memory', 'add', 'Service web memakai Next.js 15 app router');
  assert.match(r.stdout, /M1 disimpan/);
  r = hook(root, 'guard-bash.mjs', { tool_name: 'Bash', tool_input: { command: 'node .claude/hooks/harness.mjs memory forget 1' } });
  assert.equal(r.status, 0, 'agent boleh merapikan memori sendiri');
  const m = await import(pathToFileURL(path.join(root, '.claude/hooks/memory.mjs')).href);
  const cfg = { memory: { enabled: true, learn_from_summary: true, learn_max: 3, max_chars: 120, write_approval: false } };
  const ids = m.learnFrom(root, cfg, { slug: 'x', status: 'done' }, ['- Pakai cursor pagination, bukan offset', '- ' + 'y'.repeat(90)]);
  assert.deepEqual(ids, ['M2', 'P1'], 'yang muat langsung masuk; yang membuat penuh diantrekan');
  r = hx(root, 'memory', 'forget', '1');
  assert.equal(r.status, 0, r.stderr);
});

test('ref:<slug> menyuntik ringkasan; Stop menampilkan rekap sekali per perubahan', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Cache katalog');
  wr(root, `docs/work/${slug}/summary.md`, '# Ringkasan — Cache katalog\n\nRedis TTL 5 menit dipilih.\n');
  let r = hook(root, 'prompt.mjs', { prompt: 'lanjutkan seperti ref:cache-katalog tapi untuk harga' });
  assert.match(add(r), /\[ref:.*cache-katalog\][\s\S]*Redis TTL 5 menit/);
  r = hx(root, 'recall', 'redis', 'ttl');
  assert.match(r.stdout, /summary\.md/);
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(ctx(r).systemMessage, /Belum selesai \(item sesi ini\)/);
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.stdout, '', 'isi sama → tidak diulang');
});
