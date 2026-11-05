// 1.8.5: gc dan doctor mengenali worktree root yang terkunci (Claude Code mengunci worktree buatannya selama sesi hidup).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sh, hx, project } from './helpers.mjs';

const addWt = (root, branch) => { const d = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-')), branch); const r = sh('git', ['worktree', 'add', '-b', branch, d], root); assert.equal(r.status, 0, r.stderr); return d; };
const lock = (root, wt, reason) => { const r = sh('git', ['worktree', 'lock', ...(reason ? ['--reason', reason] : []), wt], root); assert.equal(r.status, 0, r.stderr); };

test('gc: worktree bersih+tergabung tetapi terkunci tidak masuk rencana; laporan menyebut alasan dan cara membuka kunci', () => {
  const root = project({ v1: true });
  const wt = addWt(root, 'wt-sesi');
  lock(root, wt, 'claude session wt-sesi (pid 4242)');
  const plan = hx(root, 'gc');
  assert.doesNotMatch(plan.stdout, /\| worktree di root/, 'terkunci: tidak direncanakan hapus');
  assert.match(plan.stdout, /DITAHAN[^\n]*dikunci \(claude session wt-sesi \(pid 4242\)\)[^\n]*git worktree unlock/);
  hx(root, 'gc', '--yes');
  assert.ok(fs.existsSync(wt), 'gc --yes tidak menyentuh yang terkunci');
});

test('gc: setelah kunci dibuka, worktree yang sama masuk rencana dan dihapus oleh --yes', () => {
  const root = project({ v1: true });
  const wt = addWt(root, 'wt-basi');
  lock(root, wt, 'claude session wt-basi (pid 1)');
  assert.doesNotMatch(hx(root, 'gc').stdout, /\| worktree di root/);
  assert.equal(sh('git', ['worktree', 'unlock', wt], root).status, 0);
  const plan = hx(root, 'gc');
  assert.match(plan.stdout, /worktree di root \(wt-basi\): bersih dan sudah digabung/);
  assert.match(hx(root, 'gc', '--yes').stdout, /dihapus: 1 dari 1/);
  assert.equal(fs.existsSync(wt), false);
});

test('kunci tanpa alasan: laporan tetap menyebut dikunci; doctor menandai [dikunci]', () => {
  const root = project({ v1: true });
  const wt = addWt(root, 'wt-polos');
  lock(root, wt);
  assert.match(hx(root, 'gc').stdout, /DITAHAN[^\n]*dikunci: tutup sesinya/);
  const d = hx(root, 'doctor');
  assert.equal(d.status, 2);
  assert.match(d.stdout, /tidak ada worktree di root[^\n]*GAGAL[^\n]*\[dikunci\]/);
});

test('terkunci dan kotor: kedua alasan dilaporkan', () => {
  const root = project({ v1: true });
  const wt = addWt(root, 'wt-dua');
  fs.writeFileSync(path.join(wt, 'catatan.md'), 'belum di-commit');
  lock(root, wt, 'claude session wt-dua (pid 7)');
  const out = hx(root, 'gc').stdout;
  assert.match(out, /dikunci \(claude session wt-dua \(pid 7\)\)[^\n]*; ada perubahan belum di-commit/);
});
