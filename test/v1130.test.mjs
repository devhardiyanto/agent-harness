// 1.13.0: jembatan ke 2.0 — log pilot + "bukan itu", peringatan slash usang, migrasi align, slug ringkas,
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook, wr, rd, jr, commitAll } from './helpers.mjs';

const ctx = (r) => (r.stdout ? JSON.parse(r.stdout) : {});
const add = (r) => ctx(r).hookSpecificOutput?.additionalContext || '';
const newItem = (root, title, type = 'feature') => { const r = hx(root, 'new', type, title); assert.equal(r.status, 0, r.stderr); return r.stdout.trim().split('/').pop(); };
const log = (root) => { try { return rd(root, '.harness/state/intent-log.jsonl').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };

test('slug dan judul ringkas: kata pengisi di awal dibuang, slug ≤ 40 karakter tanpa tanda hubung menggantung', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'oke, ada feedback dariku untuk formfield - mengenai jabatan itu harus dimunculkan');
  const s = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  assert.ok(s.length <= 40, s);
  assert.doesNotMatch(s, /^(oke|ada)-|dariku|untuk|--|-$/);
  assert.match(s, /^feedback-formfield/);
  const r = hook(root, 'prompt.mjs', { prompt: 'quick: disini aku ingin kamu update config ultra_voucher' });
  assert.match(add(r), /Item quick 2\d{3}-\d\d-\d\d-update-config-ultra_voucher /);
});

test('pilot: frasa dan slash dicatat lokal; slash usang memberi pengganti; "bukan itu" menandai salah tangkap dan membatalkan "ingat"', () => {
  const root = project({ v1: true });
  hook(root, 'prompt.mjs', { prompt: 'sisa' });
  let r = hook(root, 'prompt.mjs', { prompt: '/harness:next' });
  assert.match(add(r), /\/harness:next akan dihapus di 2\.0[\s\S]*"sisa"/);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat: pakai pnpm, bukan npm' });
  assert.match(add(r), /Memori M1 disimpan/);
  r = hook(root, 'prompt.mjs', { prompt: 'bukan itu' });
  assert.match(add(r), /SALAH TANGKAP[\s\S]*memori M1 dihapus lagi/);
  assert.doesNotMatch(rd(root, 'docs/memory/MEMORY.md'), /pnpm/);
  const l = log(root);
  assert.deepEqual(l.map((x) => x.type), ['intent', 'slash', 'intent', 'misfire']);
  assert.equal(l[0].kind, 'open'); assert.equal(l[1].skill, 'next');
  const p = hx(root, 'pilot').stdout;
  assert.match(p, /\| S1 \| .* \| 2 frasa vs 1 slash \| OK \|/);
  assert.match(p, /\| S2 \| salah tangkap ≤ 0 \| 1 \| BELUM \|/);
  assert.match(p, /Slash yang masih dipakai: \/harness:next 1/);
  assert.match(p, /Belum siap 2\.0/);
  const c = jr(root, 'harness.config.json'); c.pilot = { enabled: false }; wr(root, 'harness.config.json', JSON.stringify(c));
  hook(root, 'prompt.mjs', { prompt: 'sisa' });
  assert.equal(log(root).length, 4, 'pilot mati → tidak ada catatan');
});

test('migrate: align.md format lama dilaporkan, diperbaiki otomatis di awal sesi (hanya menambah bagian); flag non-bawaan dilaporkan', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar lama');
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\nrounds: 1\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n| C1 | a | a.ts:1 | dugaan |\n\n## Debat\n- x\n');
  let m = hx(root, 'migrate').stdout;
  assert.match(m, /\| align\.md format lama \| 1 item \|.*\| BELUM \|/);
  const c = jr(root, 'harness.config.json'); c.align.decision_table = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  assert.match(hx(root, 'migrate').stdout, /\| flag yang dikunci di 2\.0 \| align\.decision_table \|/);
  const s = hook(root, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' });
  assert.match(add(s), /Migrasi: 1 align\.md diberi bagian "Keputusan terbuka"/);
  const t = rd(root, `docs/work/${slug}/align.md`);
  assert.match(t, /\| C1 \| a \| a\.ts:1 \| dugaan \|[\s\S]*## Keputusan terbuka\n\| # \| pertanyaan \| opsi \| jawaban \|[\s\S]*## Debat\n- x/);
  assert.match(hx(root, 'migrate').stdout, /\| align\.md format lama \| tidak ada \|/);
  assert.match(hx(root, 'doctor').stdout, /\| siap 2\.0 \(info, tidak menggagalkan\) \| BELUM \|/);
});

test('Stop: penahanan tabel keputusan dicatat untuk pilot (S3)', () => {
  const root = project({ v1: true });
  const slug = newItem(root, 'Seminar tahan');
  wr(root, `docs/work/${slug}/align.md`, '---\nverdict: open\n---\n# Align\n\n## Klaim vs bukti kode\n| # | klaim | bukti | status |\n|---|---|---|---|\n| C1 | x | - | dugaan |\n\n## Keputusan terbuka\n| # | pertanyaan | opsi | jawaban |\n|---|---|---|---|\n');
  wr(root, '.harness/state/touched-s.json', JSON.stringify({ slugs: [slug] }));
  const r = hook(root, 'stop.mjs', { hook_event_name: 'Stop' });
  assert.equal(r.status, 2);
  assert.equal(log(root).filter((x) => x.type === 'stop-hold').length, 1);
  assert.match(hx(root, 'pilot').stdout, /\| S3 \| .* \| 1 penahanan \| OK \|/);
});

test('pilot: jendela bawaan 6 jam; --days dan --hours bisa dipilih', () => {
  const root = project({ v1: true });
  assert.equal(jr(root, 'harness.config.json').pilot.hours, 6);
  wr(root, '.harness/state/intent-log.jsonl', `${JSON.stringify({ ts: new Date(Date.now() - 8 * 3600000).toISOString(), type: 'intent', kind: 'open' })}\n${JSON.stringify({ ts: new Date().toISOString(), type: 'intent', kind: 'open' })}\n`);
  assert.match(hx(root, 'pilot').stdout, /^Pilot 6 jam terakhir \(1 catatan\)/);
  assert.match(hx(root, 'pilot', '--hours', '12').stdout, /^Pilot 12 jam terakhir \(2 catatan\)/);
  assert.match(hx(root, 'pilot', '--days', '2').stdout, /^Pilot 2 hari terakhir \(2 catatan\)/);
});
