// S4: lajur quick, amend, promote, next, dan pintu knowledge. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');

function mkProject(cfgPatch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qk-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cfgPath = path.join(root, 'harness.config.json');
  const cfg = { ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')), services: ['svc-a', 'svc-b'], align: { required: false }, ...cfgPatch };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  for (const s of cfg.services) { fs.mkdirSync(path.join(root, 'source-code', s), { recursive: true }); spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: path.join(root, 'source-code', s) }); }
  return root;
}
const run = (root, script, payload) => spawnSync('node', [path.join(root, '.claude', 'hooks', script)], { input: JSON.stringify({ session_id: 's1', cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude', 'hooks', 'harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const prompt = (root, text) => run(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: text });
const edit = (root, rel) => run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, rel), old_string: 'a', new_string: 'b' } });
const bash = (root, command) => run(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const plan = (root, slug) => fs.readFileSync(path.join(root, 'docs/work', slug, 'plan.md'), 'utf8');
const quick = (root, text = 'perbaiki typo pesan error login di handler') => {
  const r = prompt(root, `/harness:quick ${text}`);
  const slug = /Item quick (\S+) dibuat/.exec(r.stdout)?.[1];
  assert.ok(slug, `item quick tidak dibuat: ${r.stdout}`);
  return slug;
};

test('/harness:quick: ketikan manusia membuat item approved, lajur quick, AC1 dari permintaan', () => {
  const root = mkProject();
  const slug = quick(root);
  const t = plan(root, slug);
  assert.match(t, /lane: quick/); assert.match(t, /status: approved/); assert.match(t, /approved_by: /);
  assert.match(t, /- AC1: perbaiki typo pesan error login/);
  assert.ok(fs.existsSync(path.join(root, 'docs/work', slug, 'progress.md')));
  assert.match(cli(root, 'list').stdout, /\| quick \| approved \|/);
});

test('/harness:quick: permintaan kosong atau terlalu pendek ditolak', () => {
  const root = mkProject();
  for (const p of ['/harness:quick', '/harness:quick   ', '/harness:quick x']) assert.match(prompt(root, p).stdout, /"decision":"block"/, p);
  assert.equal(fs.readdirSync(path.join(root, 'docs/work'), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).length, 0);
});

test('agent tidak bisa membuat item quick sendiri lewat shell', () => {
  const root = mkProject();
  assert.equal(bash(root, 'node .claude/hooks/harness.mjs quick perbaiki sesuatu yang kecil').status, 2);
});

test('quick: edit pertama mengikat ke satu service dan mencatat file; service lain diblokir', () => {
  const root = mkProject();
  const slug = quick(root);
  assert.equal(edit(root, 'source-code/svc-a/src/x.ts').status, 0);
  const t = plan(root, slug);
  assert.match(t, /services: \[svc-a\]/); assert.match(t, /files: \[source-code\/svc-a\/src\/x\.ts\]/);
  const r = edit(root, 'source-code/svc-b/src/y.ts');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Lajur quick hanya 1 service/); assert.match(r.stderr, /promote/);
});

test('quick: file ke-N+1 diblokir (quick.max_files), file yang sama berulang tidak dihitung', () => {
  const root = mkProject({ quick: { max_files: 2 } });
  quick(root);
  assert.equal(edit(root, 'source-code/svc-a/1.ts').status, 0);
  assert.equal(edit(root, 'source-code/svc-a/1.ts').status, 0);
  assert.equal(edit(root, 'source-code/svc-a/2.ts').status, 0);
  const r = edit(root, 'source-code/svc-a/3.ts');
  assert.equal(r.status, 2); assert.match(r.stderr, /dibatasi 2 file/);
});

test('quick: batas bawaan 5 file', () => {
  const root = mkProject();
  quick(root);
  for (let n = 1; n <= 5; n++) assert.equal(edit(root, `source-code/svc-a/f${n}.ts`).status, 0, `file ${n}`);
  assert.equal(edit(root, 'source-code/svc-a/f6.ts').status, 2);
});

test('quick: perubahan skema ditolak', () => {
  const root = mkProject();
  quick(root);
  const r = edit(root, 'source-code/svc-a/db/migrations/001.sql');
  assert.equal(r.status, 2); assert.match(r.stderr, /tidak boleh menyentuh skema/);
});

test('quick: done tanpa bukti ditolak; dengan bukti dan file berubah lulus tanpa review.md', () => {
  const root = mkProject();
  const slug = quick(root);
  assert.equal(cli(root, 'set-status', slug, 'done').status, 2, 'tanpa bukti');
  edit(root, 'source-code/svc-a/x.ts');
  const early = cli(root, 'set-status', slug, 'done');
  assert.equal(early.status, 2); assert.match(early.stderr, /AC1: belum ada catatan verifikasi/);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '## Verifikasi\n- AC1: curl /login salah password → pesan baru tampil, 401\n');
  const ok = cli(root, 'set-status', slug, 'done');
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(plan(root, slug), /status: done/);
  assert.equal(fs.existsSync(path.join(root, 'docs/work', slug, 'review.md')), false);
});

test('quick: tidak ada transisi in-review; item standard tetap butuh review', () => {
  const root = mkProject();
  const slug = quick(root);
  const r = cli(root, 'set-status', slug, 'in-review');
  assert.equal(r.status, 2); assert.match(r.stderr, /lajur quick/);
  const std = cli(root, 'new', 'feature', 'fitur biasa').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', std, 'plan.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('services: []', 'services: [svc-a]').replace('- AC1:', '- AC1: sesuatu yang diuji'));
  assert.equal(cli(root, 'approve', std).status, 0);
  fs.writeFileSync(path.join(root, 'docs/work', std, 'progress.md'), '## Verifikasi\n- AC1: hasil uji nyata tercatat di sini\n');
  assert.equal(cli(root, 'start', std).status, 0);
  const d = cli(root, 'set-status', std, 'done');
  assert.equal(d.status, 2, 'standard tidak boleh langsung done tanpa in-review');
});

test('amend: menambah AC bernomor, menghitung batas, menolak AC pendek dan item draft', () => {
  const root = mkProject();
  const slug = quick(root);
  const a = cli(root, 'amend', slug, '--ac', 'pesan error juga benar di endpoint register');
  assert.equal(a.status, 0, a.stderr);
  assert.match(plan(root, slug), /## Amandemen[\s\S]*- AC2: pesan error juga benar/);
  assert.match(plan(root, slug), /amendments: 1/);
  assert.equal(cli(root, 'amend', slug, '--ac', 'pendek').status, 2);
  assert.equal(cli(root, 'amend', slug, '--ac', 'tambahan ketiga yang cukup panjang').status, 0);
  assert.equal(cli(root, 'amend', slug, '--ac', 'tambahan keempat yang cukup panjang').status, 0);
  const over = cli(root, 'amend', slug, '--ac', 'tambahan kelima yang cukup panjang');
  assert.equal(over.status, 2); assert.match(over.stderr, /batas amend 3/);
  assert.match(plan(root, slug), /AC4: tambahan keempat/);
  const d = cli(root, 'new', 'feature', 'item draft').stdout.trim().split('/').pop();
  assert.equal(cli(root, 'amend', d, '--ac', 'tambahan pada draft yang tidak boleh').status, 2);
});

test('amend: AC baru wajib berbukti sebelum done; Edit langsung ke plan approved tetap beku', () => {
  const root = mkProject();
  const slug = quick(root);
  cli(root, 'amend', slug, '--ac', 'pesan error juga benar di endpoint register');
  edit(root, 'source-code/svc-a/x.ts');
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '## Verifikasi\n- AC1: bukti nyata pertama yang cukup\n');
  assert.match(cli(root, 'set-status', slug, 'done').stderr, /AC2: belum ada catatan verifikasi/);
  const r = run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'docs/work', slug, 'plan.md'), old_string: 'AC1', new_string: 'AC9' } });
  assert.equal(r.status, 2); assert.match(r.stderr, /beku/);
});

test('promote: quick → standard draft; edit kode diblokir sampai approve ulang', () => {
  const root = mkProject();
  const slug = quick(root);
  edit(root, 'source-code/svc-a/x.ts');
  const r = cli(root, 'promote', slug);
  assert.equal(r.status, 0, r.stderr);
  const t = plan(root, slug);
  assert.match(t, /lane: standard/); assert.match(t, /status: draft/);
  assert.equal(edit(root, 'source-code/svc-a/y.ts').status, 2);
  assert.equal(cli(root, 'promote', slug).status, 1, 'bukan quick lagi');
});

test('next: siapa dan perintah persis per status, lajur quick vs standard', () => {
  const root = mkProject();
  assert.match(cli(root, 'next').stdout, /tidak ada work item terbuka/);
  const q = quick(root);
  const std = cli(root, 'new', 'feature', 'fitur biasa').stdout.trim().split('/').pop();
  const out = cli(root, 'next').stdout;
  assert.match(out, new RegExp(`\\| ${q} \\| quick \\| approved \\| agent \\| kerjakan di sesi ini`));
  assert.match(out, new RegExp(`\\| ${std} \\| standard \\| draft \\| agent \\| /harness:plan ${std}`));
  assert.match(cli(root, 'next', q).stdout, /set-status .* done/);
});

test('knowledge: bentuk /harness:knowledge verify dan patterns diterima hook (bentuk lama tetap)', () => {
  const root = mkProject();
  for (const p of ['/harness:knowledge verify tidak-ada', '/harness:verify tidak-ada']) {
    const r = prompt(root, p);
    assert.match(r.stdout, /"decision":"block"/, p);
    assert.match(r.stdout, /verify ditolak/);
  }
  const r = prompt(root, '/harness:knowledge patterns tidak-ada P1');
  assert.match(r.stdout, /patterns ditolak/);
});

test('skill: tepat 14, pintu knowledge/quick/next ada, skill yang dilebur sudah hilang', () => {
  const dirs = fs.readdirSync(path.join(here, '..', 'plugin', 'skills')).sort();
  assert.deepEqual(dirs, ['align', 'approve', 'build', 'impact', 'init', 'knowledge', 'next', 'plan', 'quick', 'review', 'ship', 'status', 'summarize', 'update']);
});
