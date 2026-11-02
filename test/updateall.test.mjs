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
const old = (root, v = '1.0.0') => { const f = '.claude/harness.version'; wr(root, f, JSON.stringify({ ...jr(root, f), version: v })); commitAll(root, 'turunkan versi uji'); };

test('install mendaftarkan project; --list menampilkannya', () => {
  const root = project({ v1: true });
  const home = homeDir();
  const r = run(home, '--add', root);
  assert.equal(r.status, 0, r.stderr);
  const l = run(home, '--list');
  assert.match(l.stdout, new RegExp(path.basename(root)));
  assert.match(l.stdout, new RegExp(VERSION.replace(/\./g, '\\.')));
});

test('update-all: project lama diperbarui di branch harness-update; yang terbaru dilewati', () => {
  const a = project({ v1: true, name: 'a' });
  const b = project({ v1: true, name: 'b' });
  old(a);
  const home = homeDir();
  run(home, '--add', a, b);
  const r = run(home);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`1\\.0\\.0 → ${VERSION.replace(/\./g, '\\.')}`));
  assert.match(r.stdout, /terbaru/);
  assert.equal(jr(a, '.claude/harness.version').version, VERSION);
  assert.equal(sh('git', ['branch', '--show-current'], a).stdout.trim(), 'harness-update');
});

test('update-all: pohon kotor ditolak installer dan dilaporkan, exit 1', () => {
  const a = project({ v1: true, name: 'k' });
  old(a);
  wr(a, 'README.md', 'diubah user\n'); // tracked + belum di-commit
  const home = homeDir();
  run(home, '--add', a);
  const r = run(home);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /GAGAL/);
  assert.match(r.stdout, /perubahan tracked/, 'catatan memuat alasan dari stderr installer');
  assert.doesNotMatch(r.stdout, /DIBIARKAN|Cadangan:/, 'tidak menampilkan rencana stdout');
});

test('update-all: folder hilang dan non-harness dilaporkan; --remove membersihkan', () => {
  const home = homeDir();
  const gone = path.join(os.tmpdir(), 'tidak-ada-' + Date.now());
  fs.writeFileSync(path.join(home, 'projects.json'), JSON.stringify({ projects: [gone] }));
  const r = run(home);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HILANG/);
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

test('update-all menandai project yang masih mendaftarkan plugin di tingkat project', () => {
  const a = project({ v1: true, name: 'reg' });
  const st = jr(a, '.claude/settings.json'); st.enabledPlugins = { 'harness@harness-marketplace': true };
  wr(a, '.claude/settings.json', JSON.stringify(st, null, 2)); commitAll(a, 'daftar plugin lama');
  const home = homeDir();
  run(home, '--add', a);
  const r = run(home);
  assert.match(r.stdout, /terbaru/);
  assert.match(r.stdout, /masih mendaftarkan plugin di tingkat project/);
});
