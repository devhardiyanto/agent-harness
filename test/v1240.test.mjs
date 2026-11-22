// 1.24.0 (O1): rencana eksekusi tertulis sebelum kode service diedit; harness.mjs tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, hook } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

function approvedItem(root, status = 'in-progress') {
  const slug = hx(root, 'new', 'feature', 'pulihkan stok').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  let t = fs.readFileSync(p, 'utf8').replace(/^status: draft$/m, `status: ${status}`).replace(/^services: \[\]$/m, 'services: [api]').replace(/^align: open$/m, 'align: aligned');
  t = t.replace(/(## 4\.? *Eksekusi[^\n]*\n)/, '$1- AC1: stok kembali saat batal\n');
  fs.writeFileSync(p, t);
  return { slug, p };
}
const edit = (root, file) => hook(root, 'gate.mjs', { session_id: 's', tool_name: 'Write', tool_input: { file_path: path.join(root, file), content: 'x\n' } });
const addTask = (p, row) => fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/(### Rencana eksekusi\n\| # \| tugas \| AC \| agent \| urutan \| status \|\n\|---\|---\|---\|---\|---\|---\|\n)/, `$1${row}\n`));

test('O1: edit kode service ditolak sebelum "### Rencana eksekusi" berisi tugas; diizinkan sesudahnya', () => {
  const root = project({ v1: true });
  const { slug, p } = approvedItem(root);
  const r = edit(root, 'source-code/api/a.js');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /belum punya "### Rencana eksekusi"/);
  assert.match(r.stderr, new RegExp(`tasks ${slug} --md`));
  addTask(p, '| T1 | pulihkan stok | AC1 | backend | 1 | rencana |');
  assert.equal(edit(root, 'source-code/api/a.js').status, 0);
});

test('O1: menulis tabel rencana di plan yang sudah approved/in-progress tidak dianggap mengubah bagian beku', () => {
  const root = project({ v1: true });
  const { p } = approvedItem(root);
  const cur = fs.readFileSync(p, 'utf8');
  const next = cur.replace(/(\|---\|---\|---\|---\|---\|---\|\n)/, '$1| T1 | pulihkan stok | AC1 | backend | 1 | rencana |\n');
  const r = hook(root, 'gate.mjs', { session_id: 's', tool_name: 'Write', tool_input: { file_path: p, content: next } });
  assert.equal(r.status, 0, r.stderr);
});

test('O1: guard shell juga menunggu rencana; lajur quick tidak terkena', () => {
  const root = project({ v1: true });
  approvedItem(root);
  const b = hook(root, 'guard-bash.mjs', { session_id: 's', tool_name: 'Bash', tool_input: { command: 'echo hi > source-code/api/a.txt' } });
  assert.equal(b.status, 2);
  assert.match(b.stderr, /Rencana eksekusi/);
  const root2 = project({ v1: true });
  hook(root2, 'prompt.mjs', { session_id: 's', prompt: 'quick: ubah teks tombol' });
  assert.equal(edit(root2, 'source-code/api/a.js').status, 0, 'quick dikecualikan');
});

test('O1: harness.mjs tasks menampilkan rencana dan jumlah selesai', () => {
  const root = project({ v1: true });
  const { slug, p } = approvedItem(root);
  assert.match(hx(root, 'tasks', slug).stdout, /belum ada "### Rencana eksekusi"/);
  addTask(p, '| T1 | pulihkan stok | AC1 | backend | 1 | selesai |\n| T2 | jalankan checks | AC1 | runner | 2 | rencana |');
  const out = hx(root, 'tasks', slug, '--md').stdout;
  assert.match(out, /1\/2 selesai/);
  assert.match(out, /\| T2 \| jalankan checks \| AC1 \| runner \| 2 \| rencana \|/);
});

test('O1: dimatikan lewat orchestrator.require_plan=false', () => {
  const root = project({ v1: true });
  approvedItem(root);
  const c = JSON.parse(fs.readFileSync(path.join(root, 'harness.config.json'), 'utf8')); c.orchestrator = { require_plan: false };
  fs.writeFileSync(path.join(root, 'harness.config.json'), JSON.stringify(c));
  assert.equal(edit(root, 'source-code/api/a.js').status, 0);
});
