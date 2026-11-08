// 1.11.0: profil user per orang (~/.harness/USER.md), playbook (prosedur yang dipelajari), ID rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { project, hx, hook, wr, rd, jr, commitAll, sh } from './helpers.mjs';

const ctx = (r) => (r.stdout ? JSON.parse(r.stdout) : {});
const add = (r) => ctx(r).hookSpecificOutput?.additionalContext || '';
const freshHome = () => { process.env.HARNESS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-')); return process.env.HARNESS_HOME; };
const PB = (name, desc, body = '## Langkah\n1. jalankan x\n## Verifikasi\n- y\n') => `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`;

test('profil user: "ingat user:" ditulis di HARNESS_HOME (bukan repo), dimuat di awal sesi, "lupakan U1" menghapus', () => {
  const home = freshHome();
  const root = project({ v1: true });
  let r = hook(root, 'prompt.mjs', { prompt: 'ingat user: jawab dalam bahasa Indonesia, tabel dulu baru penjelasan' });
  assert.match(add(r), /Profil user U1 disimpan/);
  assert.match(fs.readFileSync(path.join(home, 'USER.md'), 'utf8'), /tabel dulu/);
  assert.equal(fs.existsSync(path.join(root, 'docs/memory/USER.md')), false, 'profil tidak masuk repo');
  r = hook(root, 'prompt.mjs', { prompt: 'ingat: service api memakai Postgres 16' });
  assert.match(add(r), /Memori M1 disimpan/, '"ingat:" tetap memori project');
  r = hook(root, 'session.mjs', { source: 'startup' });
  assert.match(add(r), /PROFIL USER[\s\S]*U1\. jawab dalam bahasa Indonesia[\s\S]*MEMORI project[\s\S]*M1\./);
  r = hook(root, 'prompt.mjs', { prompt: 'lupakan U1' });
  assert.match(add(r), /dihapus/);
  assert.doesNotMatch(fs.readFileSync(path.join(home, 'USER.md'), 'utf8'), /tabel dulu/);
  assert.match(rd(root, 'docs/memory/MEMORY.md'), /Postgres 16/, 'memori project tidak tersentuh');
});

test('profil user: agent menulis lewat CLI --user (gaya Hermes); batas user_max_chars; user_enabled=false menolak', () => {
  freshHome();
  const root = project({ v1: true });
  let r = hook(root, 'guard-bash.mjs', { tool_name: 'Bash', tool_input: { command: 'node .claude/hooks/harness.mjs memory add --user suka jawaban singkat' } });
  assert.equal(r.status, 0, r.stderr);
  r = hx(root, 'memory', 'add', '--user', 'User suka jawaban singkat berbentuk tabel');
  assert.match(r.stdout, /U1 disimpan \(\d+\/1375\)/);
  r = hx(root, 'memory', 'list');
  assert.match(r.stdout, /USER\.md \(per orang\)[\s\S]*U1\. User suka jawaban singkat/);
  const c = jr(root, 'harness.config.json'); c.memory.user_max_chars = 60; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  r = hx(root, 'memory', 'add', '--user', 'Preferensi kedua yang cukup panjang untuk melewati batas');
  assert.equal(r.status, 2); assert.match(r.stderr, /profil user penuh/);
  c.memory.user_enabled = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  r = hook(root, 'prompt.mjs', { prompt: 'ingat user: apa saja yang panjangnya cukup' });
  assert.match(ctx(r).reason, /user_enabled=false/);
  r = hook(root, 'session.mjs', { source: 'startup' });
  assert.doesNotMatch(add(r), /PROFIL USER/);
});

test('playbook: yang valid masuk daftar awal sesi (nama + deskripsi saja); yang rusak tidak, dihitung; lint exit 2', () => {
  freshHome();
  const root = project({ v1: true });
  wr(root, 'docs/memory/playbooks/rilis-hotfix-api.md', PB('rilis-hotfix-api', 'Saat perlu hotfix service api ke production tanpa menunggu rilis mingguan.', '## Langkah\n1. RAHASIA-ISI-LANGKAH\n## Verifikasi\n- cek\n'));
  wr(root, 'docs/memory/playbooks/salah-nama.md', PB('nama-lain', 'Deskripsi yang cukup panjang di sini.'));
  wr(root, 'docs/memory/playbooks/besar.md', PB('besar', 'Playbook yang terlalu besar untuk dimuat.', '## Langkah\n' + 'x'.repeat(7000)));
  let r = hook(root, 'session.mjs', { source: 'startup' });
  const t = add(r);
  assert.match(t, /PLAYBOOK[\s\S]*- rilis-hotfix-api: Saat perlu hotfix/);
  assert.doesNotMatch(t, /RAHASIA-ISI-LANGKAH/, 'isi tidak dimuat (progressive disclosure)');
  assert.doesNotMatch(t, /- besar:|- salah-nama:/);
  assert.match(t, /2 playbook tidak didaftarkan/);
  r = hx(root, 'playbook', 'lint');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /GAGAL besar[\s\S]*terlalu besar/); assert.match(r.stdout, /GAGAL salah-nama[\s\S]*harus sama dengan nama berkas/); assert.match(r.stdout, /OK {4}rilis-hotfix-api/);
  r = hx(root, 'playbook', 'list');
  assert.match(r.stdout, /\| rilis-hotfix-api \| \d+ \| OK \|/);
  r = hx(root, 'recall', 'hotfix', 'production');
  assert.match(r.stdout, /playbooks\/rilis-hotfix-api\.md/);
});

test('playbook: saran (bukan error) bila tanpa Langkah/Verifikasi atau berbentuk log PR; playbooks.enabled=false = tidak dimuat', () => {
  freshHome();
  const root = project({ v1: true });
  wr(root, 'docs/memory/playbooks/catatan.md', PB('catatan', 'Contoh playbook tanpa bagian wajib.', 'isi #1 #2 #3 #4 #5 #6 #7 #8 #9\n'));
  let r = hx(root, 'playbook', 'lint');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /saran tidak ada bagian "## Langkah"/); assert.match(r.stdout, /saran banyak nomor PR/);
  const c = jr(root, 'harness.config.json'); c.playbooks.enabled = false; wr(root, 'harness.config.json', JSON.stringify(c)); commitAll(root);
  r = hook(root, 'session.mjs', { source: 'startup' });
  assert.doesNotMatch(add(r), /PLAYBOOK/);
});

test('kernel: rule playbook path-scoped, ID rule unik, reviewer mengutip kolom aturan, config playbooks', () => {
  const root = project({ v1: true });
  assert.match(rd(root, '.claude/rules/playbook.md'), /paths:\n {2}- "docs\/memory\/playbooks\/\*\*"/);
  assert.match(rd(root, '.claude/rules/security.md'), /^- S-02\. Secret/m);
  assert.match(rd(root, '.claude/agents/reviewer.md'), /\| aturan \|/);
  assert.match(rd(root, 'docs/work/_TEMPLATE/review.md'), /\| severity \| aturan \|/);
  const c = jr(root, 'harness.config.json');
  assert.equal(c.playbooks.enabled, true); assert.equal(c.memory.user_enabled, true); assert.equal(c.memory.user_max_chars, 1375);
  const chk = sh('node', [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'scripts', 'check-repo.mjs')], process.cwd());
  assert.equal(chk.status, 0, chk.stdout);
});
