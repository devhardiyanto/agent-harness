// update-all: satu perintah memperbarui semua project terdaftar. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sh, project, commitAll, wr, jr, here } from './helpers.mjs';

const script = path.join(here, '..', 'scripts', 'update-all.mjs');
const VERSION = fs.readFileSync(path.join(here, '..', 'VERSION'), 'utf8').trim();
const run = (home, ...a) => spawnSync('node', [script, '--no-pull', ...a], { encoding: 'utf8', env: { ...process.env, HARNESS_HOME: home } });
const homeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
// Fixture install memakai branch harness-v1; harness-update bekerja di root_branch (main).
const onMain = (root) => sh('git', ['branch', '-M', 'main'], root);
const old = (root, v = '1.0.0') => { onMain(root); const f = '.claude/harness.version'; wr(root, f, JSON.stringify({ ...jr(root, f), version: v })); commitAll(root, 'turunkan versi uji'); };

test('install mendaftarkan project; --list menampilkannya', () => {
  const root = project({ v1: true });
  const home = homeDir();
  const r = run(home, '--add', root);
  assert.equal(r.status, 0, r.stderr);
  const l = run(home, '--list');
  assert.match(l.stdout, new RegExp(path.basename(root)));
  assert.match(l.stdout, new RegExp(VERSION.replace(/\./g, '\\.')));
});

test('update-all = harness-update --all: project lama diperbarui di main (satu commit); yang terbaru dilewati', () => {
  const a = project({ v1: true, name: 'a' });
  const b = project({ v1: true, name: 'b' });
  old(a); onMain(b);
  const home = homeDir();
  run(home, '--add', a, b);
  const r = run(home, '--no-plugin');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`1\\.0\\.0 → ${VERSION.replace(/\./g, '\\.')}`));
  assert.match(r.stdout, /sudah terbaru/);
  assert.equal(jr(a, '.claude/harness.version').version, VERSION);
  assert.equal(sh('git', ['branch', '--show-current'], a).stdout.trim(), 'main', 'tanpa branch tambahan');
  assert.match(sh('git', ['log', '-1', '--format=%s'], a).stdout, new RegExp(`^chore\\(harness\\): update to v${VERSION.replace(/\./g, '\\.')}`));
  assert.match(r.stdout, /doctor: OK/);
});

test('harness-update: pohon kotor ditolak dan dilaporkan, exit 1', () => {
  const a = project({ v1: true, name: 'k' });
  old(a);
  wr(a, 'README.md', 'diubah user\n'); // tracked + belum di-commit
  const home = homeDir();
  run(home, '--add', a);
  const r = run(home, '--no-plugin');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GAGAL: .*perubahan tracked/);
  assert.equal(jr(a, '.claude/harness.version').version, '1.0.0');
});

test('harness-update: folder hilang dilaporkan; --remove membersihkan', () => {
  const home = homeDir();
  const gone = path.join(os.tmpdir(), 'tidak-ada-' + Date.now());
  fs.writeFileSync(path.join(home, 'projects.json'), JSON.stringify({ projects: [gone] }));
  const r = run(home, '--no-plugin');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GAGAL: bukan root ber-harness/);
  assert.match(run(home, '--remove', gone).stdout, /^- /m);
  assert.match(run(home).stdout, /Belum ada project terdaftar/);
});

test('--scan menemukan project ber-harness dan melewati source-code', () => {
  const root = project({ v1: true, name: 'scanme' });
  const base = path.dirname(root);
  const home = homeDir();
  const r = run(home, '--scan', base);
  assert.match(r.stdout, /^\+ /m);
  assert.ok(JSON.parse(fs.readFileSync(path.join(home, 'projects.json'), 'utf8')).projects.some((p) => p.endsWith('scanme')));
});

test('--dry-run tidak mengubah project', () => {
  const a = project({ v1: true, name: 'd' });
  old(a);
  const home = homeDir();
  run(home, '--add', a);
  const r = run(home, '--dry-run');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(jr(a, '.claude/harness.version').version, '1.0.0');
});

test('harness-update: autoPush ke origin, lalu --rollback membatalkan update terakhir', () => {
  const a = project({ v1: true, name: 'p' });
  onMain(a);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-'));
  sh('git', ['init', '-q', '--bare', '-b', 'main'], bare);
  sh('git', ['remote', 'add', 'origin', bare], a);
  sh('git', ['push', '-q', '-u', 'origin', 'main'], a);
  const cfg = jr(a, 'harness.config.json'); cfg.update = { autoPush: true }; wr(a, 'harness.config.json', JSON.stringify(cfg, null, 2));
  old(a);
  sh('git', ['push', '-q', 'origin', 'main'], a);
  const hu = path.join(here, '..', 'scripts', 'harness-update.mjs');
  const env = { ...process.env, HARNESS_HOME: homeDir() };
  const r = spawnSync('node', [hu, a, '--no-pull', '--no-plugin'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /di-push: ya/);
  assert.equal(sh('git', ['rev-parse', 'HEAD'], a).stdout, sh('git', ['rev-parse', 'main'], bare).stdout);
  const rb = spawnSync('node', [hu, a, '--rollback'], { encoding: 'utf8', env });
  assert.equal(rb.status, 0, rb.stdout + rb.stderr);
  assert.match(rb.stdout, /revert [0-9a-f]{8} "chore\(harness\): update to v/);
  assert.equal(jr(a, '.claude/harness.version').version, '1.0.0');
});
