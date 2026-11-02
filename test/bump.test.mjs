// bump: satu perintah menaikkan versi di semua tempat. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { here } from './helpers.mjs';

const repo = path.join(here, '..');
const FILES = ['VERSION', 'package.json', 'plugin/.claude-plugin/plugin.json', 'kernel/harness.config.json', 'kernel/.claude/hooks/lib.mjs'];
function copy() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-'));
  for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.copyFileSync(path.join(repo, f), path.join(d, f)); }
  return d;
}
const bump = (d, ...a) => spawnSync('node', [path.join(repo, 'scripts', 'bump.mjs'), ...a, '--no-check'], { encoding: 'utf8', env: { ...process.env, BUMP_ROOT: d } });
const cur = fs.readFileSync(path.join(repo, 'VERSION'), 'utf8').trim();

test('bump patch/minor/eksplisit menulis versi baru di kelima tempat', () => {
  for (const [arg, want] of [['patch', (v) => { const [a, b, c] = v.split('.'); return `${a}.${b}.${+c + 1}`; }], ['minor', (v) => { const [a, b] = v.split('.'); return `${a}.${+b + 1}.0`; }], ['9.8.7', () => '9.8.7']]) {
    const d = copy(); const r = bump(d, arg); const v = want(cur);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(d, 'VERSION'), 'utf8').trim(), v);
    for (const f of FILES.slice(1)) assert.ok(fs.readFileSync(path.join(d, f), 'utf8').includes(v), `${f} memuat ${v}`);
  }
});

test('bump: --dry-run tidak menulis; argumen salah ditolak', () => {
  const d = copy();
  assert.equal(bump(d, 'patch', '--dry-run').status, 0);
  assert.equal(fs.readFileSync(path.join(d, 'VERSION'), 'utf8').trim(), cur);
  assert.equal(bump(d, 'besar').status, 1);
  assert.equal(bump(d, cur).status, 1);
});

test('bump: format berkas tidak berubah selain nomor versi', () => {
  const d = copy(); bump(d, 'patch');
  for (const f of FILES.slice(1)) {
    const a = fs.readFileSync(path.join(repo, f), 'utf8').split('\n'), b = fs.readFileSync(path.join(d, f), 'utf8').split('\n');
    assert.equal(a.length, b.length);
    assert.equal(a.filter((l, i) => l !== b[i]).length, 1, `${f}: tepat satu baris berubah`);
  }
});
