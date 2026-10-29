// S5: Delivery Gate (checks per service + gate.md). Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');
const g = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

function mkProject(cfgPatch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cfgPath = path.join(root, 'harness.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')), services: ['svc-a', 'svc-b'], ...cfgPatch }));
  for (const s of ['svc-a', 'svc-b']) {
    const d = path.join(root, 'source-code', s);
    fs.mkdirSync(d, { recursive: true });
    g(d, 'init', '-q', '-b', 'main'); g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t.t'); g(d, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(d, 'README.md'), 'x\n'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'init');
  }
  return root;
}
const run = (root, script, payload) => spawnSync('node', [path.join(root, '.claude', 'hooks', script)], { input: JSON.stringify({ session_id: 's1', cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude', 'hooks', 'harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const prompt = (root, text) => run(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: text });
const edit = (root, rel, extra = {}) => run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, rel), old_string: 'a', new_string: 'b', ...extra } });
const gateMd = (root, slug) => fs.readFileSync(path.join(root, 'docs/work', slug, 'gate.md'), 'utf8');

// item quick siap done: terikat ke svc-a, satu file berubah, bukti AC1 tertulis
function readyQuick(root, svc = 'svc-a') {
  const r = prompt(root, '/harness:quick ubah teks pesan di halaman login');
  const slug = /Item quick (\S+) dibuat/.exec(r.stdout)[1];
  assert.equal(edit(root, `source-code/${svc}/login.txt`).status, 0);
  fs.writeFileSync(path.join(root, 'source-code', svc, 'login.txt'), 'pesan baru\n');
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '## Verifikasi\n- AC1: halaman login menampilkan pesan baru (dicek manual)\n');
  return slug;
}

test('tanpa checks: gate PASS dengan baris TIDAK DIPERIKSA yang tercatat, done tetap lulus', () => {
  const root = mkProject();
  const slug = readyQuick(root);
  const r = cli(root, 'gate', slug);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /svc-a: checks \| TIDAK DIPERIKSA/);
  assert.match(r.stdout, /1 item TIDAK DIPERIKSA/);
  const md = gateMd(root, slug);
  assert.match(md, /verdict: pass/); assert.match(md, /unchecked: 1/);
  assert.match(md, /review \| TIDAK BERLAKU/);
  assert.equal(cli(root, 'set-status', slug, 'done').status, 0);
});

test('checks lulus: PASS per perintah; set-status done menjalankan gate otomatis', () => {
  const root = mkProject({ checks: { 'svc-a': { lint: 'node -e "process.exit(0)"', test: 'node -e "console.log(1)"' } } });
  const slug = readyQuick(root);
  const r = cli(root, 'set-status', slug, 'done');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const md = gateMd(root, slug);
  assert.match(md, /svc-a: lint \| PASS/); assert.match(md, /svc-a: test \| PASS/); assert.match(md, /unchecked: 0/);
});

test('satu checks gagal: gate FAIL, done dan jalur Edit ditolak dengan alasan', () => {
  const root = mkProject({ checks: { 'svc-a': { test: 'node -e "console.error(\'boom\');process.exit(3)"' } } });
  const slug = readyQuick(root);
  const gt = cli(root, 'gate', slug);
  assert.equal(gt.status, 2);
  assert.match(gt.stdout, /svc-a: test \| FAIL \| exit 3/); assert.match(gt.stdout, /boom/);
  const d = cli(root, 'set-status', slug, 'done');
  assert.equal(d.status, 2); assert.match(d.stderr, /gate\.md verdict fail/); assert.match(d.stderr, /svc-a: test/);
  assert.match(fs.readFileSync(path.join(root, 'docs/work', slug, 'plan.md'), 'utf8'), /status: approved/);
});

test('checks timeout dianggap FAIL', () => {
  const root = mkProject({ checks: { 'svc-a': { test: 'node -e "setTimeout(()=>{},8000)"' } }, gate: { test_timeout_sec: 1 } });
  const slug = readyQuick(root);
  const r = cli(root, 'gate', slug);
  assert.equal(r.status, 2); assert.match(r.stdout, /timeout 1s/);
});

test('gate.require_checks: checks kosong menjadi FAIL', () => {
  const root = mkProject({ gate: { require_checks: true } });
  const slug = readyQuick(root);
  const r = cli(root, 'gate', slug);
  assert.equal(r.status, 2); assert.match(r.stdout, /svc-a: checks \| FAIL/);
});

test('secret baru di diff terhadap baseline membuat gate FAIL', () => {
  const root = mkProject();
  const slug = readyQuick(root);
  fs.appendFileSync(path.join(root, 'source-code/svc-a/login.txt'), `kunci=${'AKIA' + 'ABCDEFGHIJKLMNOP'}\n`);
  g(path.join(root, 'source-code/svc-a'), 'add', '-A');
  const r = cli(root, 'gate', slug);
  assert.equal(r.status, 2); assert.match(r.stdout, /svc-a: secret di diff \| FAIL/);
});

test('gate.md usang: kode berubah setelah gate, done lewat Edit ditolak sampai gate diulang', () => {
  const root = mkProject();
  const slug = readyQuick(root);
  assert.equal(cli(root, 'gate', slug).status, 0);
  const done = () => edit(root, `docs/work/${slug}/plan.md`, { old_string: 'status: approved', new_string: 'status: done' });
  fs.appendFileSync(path.join(root, 'source-code/svc-a/login.txt'), 'perubahan lanjutan\n');
  const r = done();
  assert.equal(r.status, 2); assert.match(r.stderr, /gate\.md usang/);
  assert.equal(cli(root, 'gate', slug).status, 0);
  assert.equal(done().status, 0);
});

test('done lewat Edit tanpa gate.md ditolak dengan petunjuk', () => {
  const root = mkProject();
  const slug = readyQuick(root);
  const r = edit(root, `docs/work/${slug}/plan.md`, { old_string: 'status: approved', new_string: 'status: done' });
  assert.equal(r.status, 2); assert.match(r.stderr, /gate\.md belum ada/);
});

test('item standard: review clean wajib di gate; satu service lain tanpa checks tercatat terpisah', () => {
  const root = mkProject({ checks: { 'svc-a': { test: 'node -e "0"' } } });
  const slug = cli(root, 'new', 'feature', 'fitur dua service').stdout.trim().split('/').pop();
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('services: []', 'services: [svc-a, svc-b]').replace('- AC1:', '- AC1: dua service sinkron'));
  assert.equal(cli(root, 'approve', slug).status, 0);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '## Verifikasi\n- AC1: kontrak antar-service cocok (diperiksa manual)\n');
  let r = cli(root, 'gate', slug);
  assert.equal(r.status, 2); assert.match(r.stdout, /review \| FAIL/);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'review.md'), '---\nverdict: clean\n---\n');
  r = cli(root, 'gate', slug);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /svc-a: test \| PASS/); assert.match(r.stdout, /svc-b: checks \| TIDAK DIPERIKSA/);
});
