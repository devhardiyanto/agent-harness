// 1.22.10: temuan uji event H5–H7.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';
import { proposeChecksFrom } from '../kernel/.claude/hooks/knowledge.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

function inProgress(root, sid = 's') {
  const slug = hx(root, 'new', 'feature', 'pulihkan stok').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  let t = fs.readFileSync(p, 'utf8').replace(/^status: draft$/m, 'status: in-progress').replace(/^services: \[\]$/m, 'services: [api]');
  t = t.replace(/(## 4\.? *Eksekusi[^\n]*\n)/, '$1\n- AC1: stok kembali saat batal\n');
  fs.writeFileSync(p, t);
  hook(root, 'post.mjs', { session_id: sid, tool_name: 'Edit', tool_input: { file_path: p } });
  return { slug, p };
}

test('H6: vitest tanpa "run" diusulkan dengan --run (bukan mode watch)', () => {
  const read = (f) => (f === 'package.json' ? JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .' } }) : null);
  assert.equal(proposeChecksFrom(read, () => false).test, 'npm run test -- --run');
  const read2 = (f) => (f === 'package.json' ? JSON.stringify({ scripts: { test: 'vitest run' } }) : null);
  assert.equal(proposeChecksFrom(read2, () => false).test, 'npm run test');
});

test('H5a: in-progress tanpa bukti apa pun → Stop menahan sekali ("build belum dimulai")', () => {
  const root = project({ v1: true });
  const { slug } = inProgress(root);
  const r1 = hook(root, 'stop.mjs', { session_id: 's', last_assistant_message: 'Status in-progress, tugas dibuat.' });
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /build belum dimulai/);
  assert.match(r1.stderr, new RegExp(slug));
  const r2 = hook(root, 'stop.mjs', { session_id: 's', last_assistant_message: 'Menunggu keputusanmu.' });
  assert.doesNotMatch(r2.stderr, /build belum dimulai/, 'sekali per item per sesi');
});

test('H5b: rekap tidak menahan saat status baru berubah ke in-progress', async () => {
  const { recapFor } = await import('../kernel/.claude/hooks/stop.mjs');
  const { loadConfig } = await import('../kernel/.claude/hooks/lib.mjs');
  const root = project({ v1: true });
  const { p } = inProgress(root);
  const cfg = loadConfig(root);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^status: in-progress$/m, 'status: approved'));
  recapFor(root, cfg, 's');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/^status: approved$/m, 'status: in-progress'));
  const rc = recapFor(root, cfg, 's');
  assert.equal(rc.statusChanged, true);
  assert.equal(rc.startedOnly, true);
});

test('H7: "terima baseline" ditulis hook dari ketikan user; agent tidak bisa menulisnya; gate menandai DITERIMA', async () => {
  const root = project({ v1: true });
  const { slug, p } = inProgress(root);
  // gate.md dengan check gagal (seperti hasil set-status done yang ditolak)
  fs.writeFileSync(path.join(path.dirname(p), 'gate.md'), '---\nverdict: fail\n---\n| item | hasil | catatan |\n|---|---|---|\n| api: lint | FAIL | exit 1 |\n| api: secret di diff | PASS | bersih |\n');
  // agent mencoba menulis penerimaan → ditolak gate.mjs
  const cur = fs.readFileSync(p, 'utf8');
  const forged = hook(root, 'gate.mjs', { session_id: 's', tool_name: 'Write', tool_input: { file_path: p, content: cur.replace(/^status: in-progress$/m, 'status: in-progress\ngate_accept: api:lint') } });
  assert.equal(forged.status, 2);
  assert.match(forged.stderr, /gate_accept hanya ditulis hook/);
  // user mengetik → hook menulis
  const r = hook(root, 'prompt.mjs', { session_id: 's', prompt: `terima baseline ${slug}` });
  assert.match(r.stdout, /MENERIMA kegagalan baseline/);
  const t = fs.readFileSync(p, 'utf8');
  assert.match(t, /^gate_accept: api:lint$/m);
  assert.match(t, /^gate_accept_fp: \w+/m);
  const { gateAccept, readItem, loadConfig } = await import('../kernel/.claude/hooks/lib.mjs');
  const acc = gateAccept(root, loadConfig(root), readItem(root, slug));
  assert.ok(acc.set.has('api:lint'));
  assert.equal(acc.stale, false);
  // kode berubah → penerimaan usang
  fs.writeFileSync(path.join(root, 'source-code/api/baru.js'), 'ubah\n');
  assert.equal(gateAccept(root, loadConfig(root), readItem(root, slug)).stale, true);
});

test('H7: gate menulis DITERIMA untuk check yang diterima; FAIL lagi bila penerimaan usang', async () => {
  const root = project({ v1: true });
  const { slug, p } = inProgress(root);
  fs.writeFileSync(path.join(path.dirname(p), 'gate.md'), '---\nverdict: fail\n---\n| item | hasil | catatan |\n|---|---|---|\n| api: lint | FAIL | exit 1 |\n');
  hook(root, 'prompt.mjs', { session_id: 's', prompt: `terima baseline ${slug}` });
  const { runGate } = await import('../kernel/.claude/hooks/delivery.mjs');
  const { readItem, loadConfig } = await import('../kernel/.claude/hooks/lib.mjs');
  const cfg = { ...loadConfig(root), checks: { api: { lint: 'node -e "process.exit(1)"' } } };
  const row = (g) => g.rows.find((r) => r[0] === 'api: lint');
  assert.equal(row(runGate(root, cfg, readItem(root, slug)))[1], 'DITERIMA');
  assert.match(fs.readFileSync(path.join(path.dirname(p), 'gate.md'), 'utf8'), /DITERIMA sebagai kegagalan baseline/);
  fs.writeFileSync(path.join(root, 'source-code/api/baru.js'), 'ubah\n');
  assert.equal(row(runGate(root, cfg, readItem(root, slug)))[1], 'FAIL');
});
