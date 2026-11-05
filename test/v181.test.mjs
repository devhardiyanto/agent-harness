// 1.8.1: --update tidak menimpa data user di docs/ dan tidak menghapus service yang foldernya tidak ada di mesin ini.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { install, project, commitAll, rd, wr, jr } from './helpers.mjs';

const LOG = '# Catatan init knowledge\n\n| tanggal | service |\n|---|---|\n| 2026-11-02 | api |\n';

test('--update: docs/knowledge/_init.md (log milik user) tidak ditimpa; templat dan README bawaan diperbarui', () => {
  const root = project({ v1: true });
  wr(root, 'docs/knowledge/_init.md', LOG);
  wr(root, 'docs/work/_TEMPLATE/brief.md', 'templat lama');
  wr(root, 'docs/knowledge/README.md', 'readme lama');
  commitAll(root, 'data user');
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(rd(root, 'docs/knowledge/_init.md'), LOG, 'log init milik user utuh');
  assert.notEqual(rd(root, 'docs/work/_TEMPLATE/brief.md'), 'templat lama', 'templat bawaan diperbarui');
  assert.notEqual(rd(root, 'docs/knowledge/README.md'), 'readme lama', 'README bawaan diperbarui');
});

test('--update: folder service tidak ada di disk → services, layout, dan rule svc-*.md dipertahankan', () => {
  const root = project({ v1: true });
  assert.deepEqual(jr(root, 'harness.config.json').services, ['api', 'web']);
  wr(root, '.claude/rules/svc-web.md', '# hasil verifikasi user\n');
  commitAll(root, 'rule user');
  fs.rmSync(path.join(root, 'source-code', 'web'), { recursive: true, force: true }); // klon sebagian
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cfg = jr(root, 'harness.config.json');
  assert.deepEqual(cfg.services, ['api', 'web'], 'web tetap di config');
  assert.equal(cfg.layout, 'multi-repo');
  assert.equal(rd(root, '.claude/rules/svc-web.md'), '# hasil verifikasi user\n', 'rule service yang hilang tidak dibuang');
  assert.match(r.stdout, /DIPERTAHANKAN: web/);
});

test('--update: tidak ada source-code sama sekali (klon) → daftar service tetap, tidak jadi single/kosong', () => {
  const root = project({ v1: true });
  fs.rmSync(path.join(root, 'source-code'), { recursive: true, force: true });
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cfg = jr(root, 'harness.config.json');
  assert.deepEqual(cfg.services, ['api', 'web']);
  assert.equal(cfg.layout, 'multi-repo');
  assert.ok(fs.existsSync(path.join(root, '.claude/rules/svc-api.md')) && fs.existsSync(path.join(root, '.claude/rules/svc-web.md')));
});

test('--update: service baru di disk ditambahkan di belakang urutan lama', () => {
  const root = project({ v1: true });
  const gitRepo = (d) => { fs.mkdirSync(d, { recursive: true }); };
  gitRepo(path.join(root, 'source-code', 'zeta'));
  fs.mkdirSync(path.join(root, 'source-code', 'zeta', '.git'));
  const r = install(root, '--update', '--yes', '--force');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(jr(root, 'harness.config.json').services, ['api', 'web', 'zeta']);
});
