// 1.12.0: tabel keputusan dibuat kode (F1), plan diblokir sebelum aligned (F2), langkah berikutnya dari kode (F3), versi plugin di doctor (F4).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { project, hx, hook, wr, rd, jr, commitAll } from './helpers.mjs';

const ctx = (r) => (r.stdout ? JSON.parse(r.stdout) : {});
const add = (r) => ctx(r).hookSpecificOutput?.additionalContext || '';
const newItem = (root, title, type = 'feature') => { const r = hx(root, 'new', type, title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const ALIGN = (claims, decisions = '') => `---\nverdict: open\nrounds: 1\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n${claims}\n\n## Keputusan terbuka\n| # | pertanyaan | opsi | jawaban |\n|---|---|---|---|\n${decisions}\n\n## Debat\n\n## Parking lot\n-\n`;
const CLAIMS = '| C1 | api punya list | a.ts:1 | terverifikasi |\n| C2 | nomor asing diawali 8 | phone.ts:12 | bertentangan |\n| C3 | hanya admin | - | dugaan |';
const DEC = '| D1 | Bahasa email? | a) EN · b) ID | a |\n| D2 | Kuota per event? | a) 300 · b) tanpa batas | |';
const short = (slug) => slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
const touch = (root, slug, sid = 's') => wr(root, `.harness/state/touched-${sid}.json`, JSON.stringify({ slugs: [slug] }));

test('decide: tabel dibuat kode dari align.md (bertentangan, dugaan, D tanpa jawaban), baris Berikutnya sesuai keadaan, slug pendek', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Exporters');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC));
  let r = hx(root, 'decide', slug);
  assert.equal(r.status, 0, r.stderr);
  const t = r.stdout;
  assert.match(t, /\| C2 \| bertentangan \| Kode berkata lain: "nomor asing diawali 8" \(bukti phone\.ts:12\)/);
  assert.match(t, /\| C3 \| dugaan \| Belum ada bukti di kode: "hanya admin"/);
  assert.match(t, /\| D2 \| keputusan \| Kuota per event\? \| a\) 300 · b\) tanpa batas \| "D2: <pilihan>" \|/);
  assert.doesNotMatch(t, /\| D1 \|/, 'D1 sudah dijawab');
  assert.doesNotMatch(t, /\| C1 \|/, 'klaim terverifikasi tidak ditanyakan');
  assert.match(t, new RegExp(`Berikutnya \\(kamu\\): jawab tabel di atas\\. "align ok ${short(slug)}" baru diterima setelah C2 dikoreksi, atau ketik "align ok ${short(slug)} terima C2"`));
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS.replace('bertentangan', 'dikoreksi (user)'), DEC));
  assert.match(hx(root, 'decide').stdout, new RegExp(`jawab tabel di atas \\(cukup kode \\+ jawaban, mis\\. "C3 a"\\), lalu ketik "align ok ${short(slug)}"`));
  wr(root, `docs/work/${slug}/align.md`, ALIGN('| C1 | a | a.ts:1 | terverifikasi |', '| D1 | x? | a | a |'));
  assert.match(hx(root, 'decide').stdout, new RegExp(`\\(0 terbuka\\):\\nBerikutnya \\(kamu\\): bila sepaham, ketik "align ok ${short(slug)}"`));
});

test('next (F3): langkah dari isi align.md; "keputusan" dan "sisa" memakai sumber yang sama', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Dua');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC));
  assert.match(hx(root, 'next').stdout, new RegExp(`\\| kamu \\| jawab tabel keputusan \\(harness\\.mjs decide ${short(slug)}\\): koreksi klaim bertentangan, atau "align ok ${short(slug)} terima <Cn>"`));
  let r = hook(root, 'prompt.mjs', { prompt: 'apa yang harus aku jawab?' });
  assert.match(add(r), /APA ADANYA[\s\S]*\| C2 \| bertentangan/);
  r = hook(root, 'prompt.mjs', { prompt: `keputusan ${short(slug)}` });
  assert.match(add(r), /\| D2 \| keputusan/);
  r = hook(root, 'prompt.mjs', { prompt: 'sisa' });
  assert.match(add(r), /\| klaim bertentangan \| C2: Kode berkata lain/); assert.match(add(r), /\| keputusan \| D2: Kuota per event/);
});

test('pesan tolak "align ok" memakai tabel keputusan yang sama', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Tiga');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC));
  const r = hook(root, 'prompt.mjs', { prompt: `align ok ${short(slug)}` });
  assert.match(ctx(r).reason, /1 klaim masih "bertentangan" dengan kode\.\nKeputusan untuk .*\(3 terbuka\):\n\| # \| jenis/);
});

test('Stop (F1): giliran yang menyentuh item belum-aligned ditahan sampai tabel ditampilkan; sekali per isi; stop_hook_active; flag mati', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Empat');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC));
  touch(root, slug);
  let r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /APA ADANYA[\s\S]*\| C2 \| bertentangan[\s\S]*Berikutnya \(kamu\)/);
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop', stop_hook_active: true });
  assert.equal(r.status, 0, 'lanjutan setelah ditahan tidak ditahan lagi');
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 0, 'isi sama → tidak ditahan lagi');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC + '\n| D3 | Domain? | a) nadidsi2026.com | |'));
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 2, 'isi berubah → ditahan lagi'); assert.match(r.stderr, /\| D3 \|/);
  const other = newItem(root, 'Tidak disentuh');
  wr(root, `docs/work/${other}/align.md`, ALIGN(CLAIMS));
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop', session_id: 'lain' });
  assert.equal(r.status, 0, 'sesi yang tidak menyentuh item tidak ditahan');
  const c = jr(root, 'harness.config.json'); c.align.decision_table = false; wr(root, 'harness.config.json', JSON.stringify(c));
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC + '\n| D4 | x? | a | |'));
  r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 0);
});

test('gate (F2): AC di plan.md ditolak sebelum aligned (dengan tabel); lolos setelah aligned; tipe analysis dan flag mati dikecualikan', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar Lima');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS, DEC));
  const pp = path.join(root, 'docs/work', slug, 'plan.md');
  const withAc = rd(root, `docs/work/${slug}/plan.md`).replace(/^- AC1:.*$/m, '- AC1: endpoint /attend mengirim email QR');
  const write = () => hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: pp, content: withAc } });
  let r = write();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /belum boleh diisi AC: objective belum aligned[\s\S]*\| C2 \| bertentangan/);
  r = hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: pp, content: rd(root, `docs/work/${slug}/plan.md`) + '\n## Catatan\n- x\n' } });
  assert.equal(r.status, 0, 'mengubah bagian lain plan (tanpa AC) tetap boleh');
  wr(root, `docs/work/${slug}/align.md`, ALIGN(CLAIMS.replace('bertentangan', 'diterima (manusia)')).replace('verdict: open', 'verdict: aligned'));
  assert.equal(write().status, 0, 'setelah aligned AC boleh ditulis');
  const an = newItem(root, 'Analisa saja', 'analysis');
  const ap = path.join(root, 'docs/work', an, 'plan.md');
  r = hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: ap, content: rd(root, `docs/work/${an}/plan.md`).replace(/^- AC1:.*$/m, '- AC1: laporan selesai') } });
  assert.equal(r.status, 0, 'tipe analysis tidak butuh align');
  const s2 = newItem(root, 'Seminar Enam');
  const c = jr(root, 'harness.config.json'); c.align.block_plan_before_aligned = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  const p2 = path.join(root, 'docs/work', s2, 'plan.md');
  r = hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: p2, content: rd(root, `docs/work/${s2}/plan.md`).replace(/^- AC1:.*$/m, '- AC1: x terjadi') } });
  assert.equal(r.status, 0);
});

test('doctor (F4): versi plugin harness dibandingkan dengan kernel; format tak terbaca = TIDAK DIPERIKSA', () => {
  const root = project({ v1: true });
  const kernelVer = jr(root, 'harness.config.json').harness_version;
  const run = (pluginOut) => {
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-'));
    const js = path.join(shim, 'claude.js');
    fs.writeFileSync(js, `const a=process.argv.slice(2);if(a[0]==='plugin'){process.stdout.write(${JSON.stringify(pluginOut)});}else{console.log('2.1.300 (Claude Code)');}`);
    fs.writeFileSync(path.join(shim, 'claude'), `#!/bin/sh\nexec node "${js}" "$@"\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(shim, 'claude.cmd'), `@node "${js}" %*\r\n`);
    return spawnSync('node', [path.join(root, '.claude/hooks/harness.mjs'), 'doctor'], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, PATH: shim + path.delimiter + process.env.PATH } }).stdout;
  };
  assert.match(run('Installed plugins:\n  ❯ harness@harness-marketplace\n    Version: 1.9.0\n'), /\| plugin skill harness sama versinya dengan kernel \| GAGAL \| plugin 1\.9\.0 ≠ kernel/);
  assert.match(run(`  ❯ harness@harness-marketplace\n    Version: ${kernelVer}\n`), /\| plugin skill harness sama versinya dengan kernel \| OK \|/);
  assert.match(run('No plugins installed\n'), /\| plugin skill harness sama versinya dengan kernel \| TIDAK DIPERIKSA \|/);
});
