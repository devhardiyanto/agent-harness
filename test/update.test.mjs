// S2: harness.version, install --update, doctor, dan jaminan data user selamat. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sh, install, hx, project, gitRepo, commitAll, rd, wr, jr, here } from './helpers.mjs';

const VERSION = fs.readFileSync(path.join(here, '..', 'VERSION'), 'utf8').trim();

function userData(root) {
  wr(root, 'docs/discussion/catatan.md', 'diskusi penting');
  wr(root, 'docs/work/2026-01-01-x/plan.md', '---\ntitle: x\nstatus: done\nservices: [api]\n---\n');
  wr(root, 'docs/knowledge/api/summary.md', 'ringkasan hasil onboard');
  wr(root, 'docs/_map.md', '# peta hasil onboard\n');
  wr(root, '.claude/rules/aturan-saya.md', 'aturan buatan user');
  wr(root, '.claude/agents/agent-saya.md', 'agent buatan user');
  const cfg = jr(root, 'harness.config.json');
  cfg.root_branch = 'production'; cfg.protected_branches = ['production', 'main']; cfg.checks = { api: { test: 'npm test' } };
  wr(root, 'harness.config.json', JSON.stringify(cfg, null, 2));
  commitAll(root, 'data user');
}
const intact = (root) => {
  assert.equal(rd(root, 'docs/discussion/catatan.md'), 'diskusi penting');
  assert.ok(rd(root, 'docs/work/2026-01-01-x/plan.md').includes('status: done'));
  assert.equal(rd(root, 'docs/knowledge/api/summary.md'), 'ringkasan hasil onboard');
  assert.equal(rd(root, 'docs/_map.md'), '# peta hasil onboard\n');
  assert.equal(rd(root, '.claude/rules/aturan-saya.md'), 'aturan buatan user');
  assert.equal(rd(root, '.claude/agents/agent-saya.md'), 'agent buatan user');
  const cfg = jr(root, 'harness.config.json');
  assert.equal(cfg.root_branch, 'production', 'root_branch user tidak direset ke main');
  assert.deepEqual(cfg.protected_branches, ['production', 'main']);
  assert.equal(cfg.checks.api.test, 'npm test');
};

test('pasang menulis harness.version dan manifest; doctor melaporkan versi', () => {
  const root = project({ v1: true });
  const v = jr(root, '.claude/harness.version');
  assert.equal(v.version, VERSION);
  const m = jr(root, '.claude/harness.manifest.json');
  assert.ok(m.files.includes('.claude/hooks/gate.mjs') && m.files.includes('.claude/rules/svc-api.md'));
  const d = hx(root, 'doctor');
  assert.equal(d.status, 0, d.stdout);
  assert.match(d.stdout, /harness\.version terbaca \| OK/);
});

test('doctor: config dan versi terpasang tidak sama → GAGAL dengan petunjuk update', () => {
  const root = project({ v1: true });
  const cfg = jr(root, 'harness.config.json'); cfg.harness_version = '0.0.1';
  wr(root, 'harness.config.json', JSON.stringify(cfg));
  const d = hx(root, 'doctor');
  assert.equal(d.status, 2);
  assert.match(d.stdout, /install --update/);
});

test('--update tanpa harness terpasang: ditolak dan tidak mengubah apa pun', () => {
  const root = project();
  const r = install(root, '--update', '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--update butuh harness terpasang/);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
});

test('--update pada versi yang sama: tidak ada perubahan; --force memasang ulang', () => {
  const root = project({ v1: true });
  const head = sh('git', ['rev-parse', 'HEAD'], root).stdout;
  const r = install(root, '--update', '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Sudah terbaru/);
  assert.equal(sh('git', ['rev-parse', 'HEAD'], root).stdout, head);
  assert.doesNotMatch(sh('git', ['branch'], root).stdout, /harness-update/);
  const f = install(root, '--update', '--yes', '--force');
  assert.equal(f.status, 0, f.stderr + f.stdout);
  assert.match(sh('git', ['branch'], root).stdout, /harness-update/);
});

test('--update menurunkan versi: ditolak tanpa --force', () => {
  const root = project({ v1: true });
  const v = jr(root, '.claude/harness.version'); v.version = '9.0.0';
  wr(root, '.claude/harness.version', JSON.stringify(v));
  commitAll(root, 'versi baru');
  const r = install(root, '--update', '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /lebih baru dari installer/);
});

test('--update dari versi lama: hook diperbarui, data user dan berkas buatan user selamat', () => {
  const root = project({ v1: true });
  userData(root);
  // meniru instalasi lama: versi lebih rendah, hook rusak/usang, berkas usang milik harness
  const v = jr(root, '.claude/harness.version'); v.version = '1.0.0';
  wr(root, '.claude/harness.version', JSON.stringify(v));
  wr(root, '.claude/hooks/gate.mjs', '// versi lama');
  const man = jr(root, '.claude/harness.manifest.json'); man.files.push('.claude/hooks/usang.mjs');
  wr(root, '.claude/harness.manifest.json', JSON.stringify(man));
  wr(root, '.claude/hooks/usang.mjs', '// hook yang sudah tidak ada di kernel');
  commitAll(root, 'meniru instalasi lama');

  const dry = install(root, '--update', '--dry-run');
  assert.match(dry.stdout, new RegExp(`Pembaruan: 1\\.0\\.0 → ${VERSION.replace(/\./g, '\\.')}`));
  assert.match(dry.stdout, /DIBUANG\s*\| \.claude\/hooks\/usang\.mjs/);
  assert.doesNotMatch(dry.stdout, /DIBUANG\s*\| docs/);
  assert.equal(rd(root, '.claude/hooks/gate.mjs'), '// versi lama', 'dry-run tidak mengubah apa pun');

  const r = install(root, '--update', '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(rd(root, '.claude/hooks/gate.mjs').length > 100, 'hook diganti versi kernel');
  assert.equal(fs.existsSync(path.join(root, '.claude/hooks/usang.mjs')), false, 'berkas usang milik harness dibuang');
  intact(root);
  assert.equal(jr(root, '.claude/harness.version').previous, '1.0.0');
  assert.equal(jr(root, 'harness.config.json').harness_version, VERSION);
  assert.match(sh('git', ['tag'], root).stdout, /harness-pre-update-/);
  assert.equal(sh('git', ['branch', '--show-current'], root).stdout.trim(), 'harness-update');
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout.trim(), '');
  assert.equal(hx(root, 'doctor').status, 0);
});

test('--update membawa pengaturan user di settings.json (izin dan kunci lain)', () => {
  const root = project({ v1: true });
  const st = jr(root, '.claude/settings.json');
  st.permissions.allow.push('Bash(npm run lint)'); st.env = { FOO: 'bar' };
  wr(root, '.claude/settings.json', JSON.stringify(st, null, 2));
  const v = jr(root, '.claude/harness.version'); v.version = '1.0.0'; wr(root, '.claude/harness.version', JSON.stringify(v));
  commitAll(root, 'settings user');
  assert.equal(install(root, '--update', '--yes').status, 0);
  const after = jr(root, '.claude/settings.json');
  assert.ok(after.permissions.allow.includes('Bash(npm run lint)'));
  assert.ok(after.permissions.allow.includes('Bash(node .claude/hooks/harness.mjs *)'));
  assert.deepEqual(after.env, { FOO: 'bar' });
  assert.ok(after.hooks.UserPromptSubmit);
});

test('config rusak: installer berhenti, config tidak ditimpa', () => {
  const root = project({ v1: true });
  wr(root, 'harness.config.json', '{ rusak');
  commitAll(root, 'config rusak');
  const r = install(root, '--update', '--yes', '--force');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /tidak bisa dibaca/);
  assert.equal(rd(root, 'harness.config.json'), '{ rusak');
});

test('root pra-v1: dokumentasi yang ada tidak dihapus dan tidak ditimpa', () => {
  const root = project();
  wr(root, 'docs/knowledge/api/summary.md', 'ringkasan lama');
  wr(root, 'docs/knowledge/README.md', 'readme milik user');
  wr(root, 'docs/work/lama/plan.md', 'plan lama');
  wr(root, 'docs/_map.md', '# peta lama\n');
  wr(root, 'docs/_archive/a.md', 'arsip');
  wr(root, 'docs/discussion/d.md', 'diskusi');
  wr(root, 'docs/other/n.md', 'lain');
  wr(root, 'AGENTS.md', 'aturan lama'); wr(root, '.claude/settings.json', '{}');
  commitAll(root, 'harness lama');
  const dry = install(root, '--dry-run');
  assert.doesNotMatch(dry.stdout, /DIBUANG\s*\| docs/);
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const [p, c] of [['docs/knowledge/api/summary.md', 'ringkasan lama'], ['docs/knowledge/README.md', 'readme milik user'], ['docs/work/lama/plan.md', 'plan lama'], ['docs/_map.md', '# peta lama\n'], ['docs/_archive/a.md', 'arsip'], ['docs/discussion/d.md', 'diskusi'], ['docs/other/n.md', 'lain']]) {
    assert.equal(rd(root, p), c, p);
  }
  assert.ok(rd(root, 'AGENTS.md').includes('Harness v1'), 'berkas perangkat tetap diganti');
  assert.ok(fs.existsSync(path.join(root, 'docs/work/_TEMPLATE/plan.md')));
});

test('pasang ulang tanpa --update di atas v1 tetap menjaga root_branch dan data user', () => {
  const root = project({ v1: true });
  userData(root);
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  intact(root);
});

test('--update --dry-run memperingatkan perubahan tracked yang belum di-commit; pemasangan nyata berhenti dengan saran', () => {
  const root = project({ v1: true });
  const v = jr(root, '.claude/harness.version'); v.version = '1.1.0'; wr(root, '.claude/harness.version', JSON.stringify(v)); // meniru instalasi lama
  wr(root, 'docs/note.md', 'catatan\n'); commitAll(root, 'docs');
  wr(root, 'docs/note.md', 'catatan diubah\n'); // tracked, belum di-commit
  const dry = install(root, '--update', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr + dry.stdout);
  assert.match(dry.stdout, /PERINGATAN: pemasangan nyata akan berhenti/); assert.match(dry.stdout, /docs\/note\.md/);
  const real = install(root, '--update', '--yes');
  assert.notEqual(real.status, 0);
  assert.match(real.stderr + real.stdout, /Saran: commit dulu/);
  assert.match(real.stderr + real.stdout, /M docs\/note\.md/, 'status porcelain tidak boleh kehilangan spasi awal baris pertama');
  const ok = install(root, '--update', '--yes', '--allow-dirty');
  assert.equal(ok.status, 0, ok.stderr);
  assert.doesNotMatch(ok.stderr, /DEP0190/, 'tanpa peringatan args+shell di Node 24');
});
