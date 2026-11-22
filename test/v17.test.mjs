// Uji 1.7.0: WorkStore, align, gerbang Stop + bukti test, handoff, tiket update, harness-update, measure.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const kernel = path.join(repo, 'kernel');
const sh = (cmd, args, cwd, env = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });

function mk({ align = true, cfg = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v17-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cp = path.join(root, 'harness.config.json');
  const c = { ...JSON.parse(fs.readFileSync(cp, 'utf8')), services: ['svc-a'], ...cfg };
  if (!align) c.align = { required: false };
  fs.writeFileSync(cp, JSON.stringify(c));
  const d = path.join(root, 'source-code', 'svc-a');
  fs.mkdirSync(d, { recursive: true });
  sh('git', ['init', '-q', '-b', 'main'], d);
  return root;
}
const run = (root, script, payload, env = {}) => spawnSync('node', [path.join(root, '.claude', 'hooks', script)], {
  input: JSON.stringify({ session_id: 's1', cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env }, encoding: 'utf8',
});
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude', 'hooks', 'harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const prompt = (root, text) => run(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: text });
const gateWrite = (root, rel, content) => run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, rel), content } });
const gateEdit = (root, rel, o, n) => run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, rel), old_string: o, new_string: n } });
const bash = (root, command) => run(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
// 1.13.1: tes gerbang bukti; rekap dianggap sudah ditampilkan agent (recap.render "assistant" diuji di v1131)
const stop = (root, extra = {}) => run(root, 'stop.mjs', { hook_event_name: 'Stop', last_assistant_message: 'Belum selesai (item sesi ini) (1):', ...extra });
// meniru PostToolUse: sesi menulis berkas di docs/work/<slug>/ (penanda item yang dikerjakan sesi ini)
const touch = (root, slug, session_id = 's1', rel = 'progress.md') => run(root, 'post.mjs', { hook_event_name: 'PostToolUse', session_id, tool_name: 'Write', tool_input: { file_path: path.join(root, 'docs', 'work', slug, rel) } });
const rd = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const wr = (root, p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };

function newItem(root, type = 'feature', title = 'Tambah endpoint') {
  const slug = path.basename(cli(root, 'new', type, title).stdout.trim());
  const p = `docs/work/${slug}/plan.md`;
  wr(root, p, rd(root, p).replace('services: []', 'services: [svc-a]').replace('- AC1:', '- AC1: endpoint mengembalikan 200'));
  return slug;
}
const ALIGNED = (rounds = 1) => `---\nverdict: aligned\nrounds: ${rounds}\n---\n| C1 | klaim | a.ts:1 | terverifikasi |\n`;

// ---------- WorkStore ----------
test('store: backend local bawaan, backend tidak dikenal ditolak jelas', async () => {
  const root = mk({ align: false });
  const slug = newItem(root);
  const { getStore } = await import(pathToFileURL(path.join(root, '.claude/hooks/store.mjs')).href);
  const s = getStore(root, { store: { backend: 'local' } });
  assert.equal(s.backend, 'local');
  assert.deepEqual(s.list().map((i) => i.slug), [slug]);
  assert.equal(s.resolve('tambah-endpoint'), slug);
  assert.throws(() => getStore(root, { store: { backend: 'plane' } }), /tidak dikenal/);
});

// ---------- align ----------
test('align: approve ditolak tanpa align; lajur quick dan tipe onboard/analysis dikecualikan', () => {
  const root = mk();
  const slug = newItem(root);
  const r = prompt(root, `/harness:approve ${slug}`);
  assert.match(r.stdout, /"decision":"block"/);
  assert.match(r.stdout, /align\.md belum aligned|align\.md belum ada/);
  assert.match(rd(root, `docs/work/${slug}/plan.md`), /status: draft/);
  const q = prompt(root, '/harness:quick perbaiki salah ketik pesan error');
  assert.equal(q.status, 0);
  assert.match(q.stdout, /APPROVED/);
  const an = newItem(root, 'analysis', 'Analisa tabel orders');
  assert.match(prompt(root, `/harness:approve ${an}`).stdout, /APPROVED/);
});

test('align: agent tidak bisa menulis verdict aligned; ronde > 3 ditolak; aligned dibekukan', () => {
  const root = mk();
  const slug = newItem(root);
  const p = `docs/work/${slug}/align.md`;
  const w = gateWrite(root, p, ALIGNED());
  assert.equal(w.status, 2);
  assert.match(w.stderr, /hanya oleh manusia/);
  assert.equal(gateWrite(root, p, '---\nverdict: open\nrounds: 3\n---\n').status, 0);
  const r4 = gateWrite(root, p, '---\nverdict: open\nrounds: 4\n---\n');
  assert.equal(r4.status, 2);
  assert.match(r4.stderr, /3 ronde/);
  // setelah manusia menutup, isi tidak boleh diubah diam-diam
  wr(root, p, ALIGNED());
  const e = gateEdit(root, p, 'klaim', 'klaim baru');
  assert.equal(e.status, 2);
  assert.match(e.stderr, /sudah aligned/);
});

test('align: /harness:align <slug> ok butuh klaim, menolak klaim bertentangan, lalu approve lolos', () => {
  const root = mk();
  const slug = newItem(root);
  const p = path.join(root, 'docs/work', slug, 'align.md');
  assert.match(prompt(root, `/harness:align ${slug} ok`).stdout, /BELUM dicatat: tabel klaim vs bukti kode masih kosong/);
  fs.writeFileSync(p, '---\nverdict: open\nrounds: 1\n---\n| C1 | tabel orders ada | - | bertentangan |\n');
  assert.match(prompt(root, `/harness:align ${slug} ok`).stdout, /bertentangan/);
  fs.writeFileSync(p, '---\nverdict: open\nrounds: 2\n---\n| C1 | tabel orders ada | db/schema.sql:4 | terverifikasi |\n');
  const ok = prompt(root, `/harness:align ${slug} ok`);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /ALIGNED/);
  assert.match(fs.readFileSync(p, 'utf8'), /verdict: aligned[\s\S]*aligned_by:/);
  assert.match(prompt(root, `/harness:approve ${slug}`).stdout, /APPROVED/);
});

test('align: next menunjuk align sebelum plan', () => {
  const root = mk();
  const slug = path.basename(cli(root, 'new', 'feature', 'Fitur baru').stdout.trim());
  // 1.12.0: perintah memakai slug pendek (tanpa awalan tanggal) bila unik
  assert.match(cli(root, 'next').stdout, new RegExp(`${slug} \\| standard \\| draft \\| agent \\| skill align ${slug.replace(/^\d{4}-\d{2}-\d{2}-/, '')}`));
});

// ---------- bukti test + gerbang Stop ----------
function inProgress(root, { check = 'node -e "process.exit(0)"' } = {}) {
  const cp = path.join(root, 'harness.config.json');
  const c = JSON.parse(fs.readFileSync(cp, 'utf8'));
  c.checks = { 'svc-a': { test: check } };
  fs.writeFileSync(cp, JSON.stringify(c));
  const slug = newItem(root);
  assert.match(prompt(root, `/harness:approve ${slug}`).stdout, /APPROVED/);
  assert.equal(cli(root, 'start', slug).status, 0);
  wr(root, `docs/work/${slug}/progress.md`, '- AC1: curl localhost:3000/x -> 200 OK\n');
  touch(root, slug);
  return slug;
}

test('run-checks menulis bukti oleh kode; Stop menolak sampai bukti PASS, lalu mengizinkan', () => {
  const root = mk({ align: false });
  const slug = inProgress(root);
  const s1 = stop(root);
  assert.equal(s1.status, 2);
  assert.match(s1.stderr, /bukti test belum ada/);
  const rc = cli(root, 'run-checks', slug);
  assert.equal(rc.status, 0, rc.stderr);
  const ev = JSON.parse(rd(root, `.harness/evidence/${slug}/tests.json`));
  assert.equal(ev.verdict, 'pass');
  assert.equal(ev.checks[0].name, 'test');
  assert.equal(stop(root).status, 0);
});

test('Stop: bukti usang (kode berubah) ditolak; test gagal ditolak', () => {
  const root = mk({ align: false });
  const slug = inProgress(root);
  assert.equal(cli(root, 'run-checks', slug).status, 0);
  wr(root, 'source-code/svc-a/x.js', 'export const a = 1;\n');
  const s = stop(root);
  assert.equal(s.status, 2);
  assert.match(s.stderr, /usang/);
  const root2 = mk({ align: false });
  const slug2 = inProgress(root2, { check: 'node -e "process.exit(3)"' });
  assert.equal(cli(root2, 'run-checks', slug2).status, 2);
  const s2 = stop(root2);
  assert.equal(s2.status, 2);
  assert.match(s2.stderr, /GAGAL/);
});

test('Stop: anti-loop (stop_hook_active, batas per sesi), item belum siap, dan dimatikan lewat config', () => {
  const root = mk({ align: false });
  inProgress(root);
  assert.equal(stop(root, { stop_hook_active: true }).status, 0);
  assert.equal(stop(root).status, 2);
  assert.equal(stop(root).status, 0, 'max_blocks=1 (1.20.0) lalu mengalah');
  // sesi lain dihitung sendiri; sesi yang tidak menyentuh item itu tidak ditahan
  assert.equal(stop(root, { session_id: 'lain' }).status, 0);
  touch(root, path.basename(fs.readdirSync(path.join(root, 'docs', 'work')).map((d) => path.join(root, 'docs', 'work', d)).find((d) => fs.existsSync(path.join(d, 'plan.md')))), 'lain');
  assert.equal(stop(root, { session_id: 'lain' }).status, 2);
  // 1.22.10 (H5a): 0 AC berbukti = build belum dimulai → ditahan sekali per item, lalu boleh berhenti
  const r2 = mk({ align: false });
  const s2 = inProgress(r2);
  wr(r2, `docs/work/${s2}/progress.md`, '- AC1:\n');
  const h = stop(r2);
  assert.equal(h.status, 2);
  assert.match(h.stderr, /build belum dimulai/);
  assert.equal(stop(r2).status, 0);
  // dimatikan
  const r3 = mk({ align: false, cfg: { stop_gate: { enabled: false } } });
  inProgress(r3);
  assert.equal(stop(r3).status, 0);
  // tanpa item sama sekali
  assert.equal(stop(mk()).status, 0);
});

test('Stop: item standard in-review tanpa review.md ditolak', () => {
  const root = mk({ align: false });
  const slug = inProgress(root);
  assert.equal(cli(root, 'run-checks', slug).status, 0);
  assert.equal(cli(root, 'set-status', slug, 'in-review').status, 0);
  const s = stop(root);
  assert.equal(s.status, 2);
  assert.match(s.stderr, /review belum dijalankan/);
  wr(root, `docs/work/${slug}/review.md`, '---\nverdict: clean\n---\n');
  assert.equal(stop(root, { session_id: 'baru' }).status, 0);
});

test('bukti test dilindungi dari Edit/Write dan penulisan lewat shell', () => {
  const root = mk({ align: false });
  assert.equal(gateWrite(root, '.harness/evidence/x/tests.json', '{}').status, 2);
  assert.equal(bash(root, 'echo {} > .harness/evidence/x/tests.json').status, 2);
  // .harness lain (handoff) boleh ditulis kode harness, dan tidak dianggap kode service pada layout single
  assert.equal(gateWrite(root, '.harness/handoff.md', 'x').status, 0);
});

// ---------- handoff ----------
test('handoff: PreCompact/SessionEnd menulis, SessionStart menyuntik dan memotong', () => {
  const root = mk({ align: false });
  const slug = inProgress(root);
  wr(root, `docs/work/${slug}/progress.md`, '## Status terkini\n- Selesai: endpoint\n- Berikutnya: tes\n\n## Verifikasi\n- AC1: curl localhost:3000/x -> 200 OK\n');
  assert.equal(run(root, 'handoff.mjs', { hook_event_name: 'PreCompact', trigger: 'auto' }).status, 0);
  const h = rd(root, '.harness/handoff.md');
  assert.match(h, new RegExp(slug));
  assert.match(h, /Selesai: endpoint/);
  assert.match(h, /event: PreCompact \(auto\)/);
  const s = run(root, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' });
  const ctx = JSON.parse(s.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Handoff sesi sebelumnya/);
  assert.match(ctx, /Selesai: endpoint/);
  assert.ok(ctx.length <= 9500);
  // dipotong sesuai config
  const r2 = mk({ align: false, cfg: { handoff: { max_chars: 200 } } });
  inProgress(r2);
  run(r2, 'handoff.mjs', { hook_event_name: 'SessionEnd', reason: 'clear' });
  const c2 = JSON.parse(run(r2, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' }).stdout).hookSpecificOutput.additionalContext;
  assert.match(c2, /dipotong/);
});

test('log: menampilkan handoff dan event terakhir', () => {
  const root = mk({ align: false });
  newItem(root);
  run(root, 'handoff.mjs', { hook_event_name: 'SessionEnd', reason: 'other' });
  const out = cli(root, 'log', '5').stdout;
  assert.match(out, /Handoff otomatis/);
  assert.match(out, /## Event terakhir/);
});

// ---------- tiket update ----------
test('update: ditolak tanpa tiket; tiket dari ketikan manusia; mode harus cocok', () => {
  const root = mk();
  const cmd = 'node .claude/hooks/harness.mjs update';
  const no = bash(root, cmd);
  assert.equal(no.status, 2);
  assert.match(no.stderr, /hanya atas permintaan manusia/);
  const t = prompt(root, '/harness:update');
  assert.equal(t.status, 0);
  assert.match(t.stdout, /update root ke main/);
  assert.equal(bash(root, cmd).status, 0);
  assert.equal(bash(root, `${cmd} --all`).status, 2, 'tiket update biasa tidak berlaku untuk --all');
  prompt(root, '/harness:update rollback');
  assert.equal(bash(root, `${cmd} --rollback`).status, 0);
  fs.rmSync(path.join(root, '.claude/state/update-ticket.json'));
  // kalimat pemicu
  assert.match(prompt(root, 'tolong root nya di update ke main').stdout, /update root ke main/);
  assert.equal(bash(root, cmd).status, 0);
  // kalimat panjang yang kebetulan memuat frasa tidak memicu
  fs.rmSync(path.join(root, '.claude/state/update-ticket.json'));
  const long = `${'x '.repeat(80)} tolong root nya di update ke main`;
  assert.equal(prompt(root, long).stdout, '');
  assert.equal(bash(root, cmd).status, 2);
  // berkas tiket dilindungi dari tulis lewat shell dan Edit
  assert.equal(bash(root, 'echo {} > .claude/state/update-ticket.json').status, 2);
  assert.equal(gateWrite(root, '.claude/state/update-ticket.json', '{}').status, 2);
});

// ---------- harness-update (end-to-end) ----------
function installerCopy(version) {
  const inst = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
  for (const f of ['install.mjs', 'VERSION', 'package.json']) fs.copyFileSync(path.join(repo, f), path.join(inst, f));
  for (const d of ['kernel', 'scripts', 'plugin']) fs.cpSync(path.join(repo, d), path.join(inst, d), { recursive: true });
  fs.writeFileSync(path.join(inst, 'VERSION'), version + '\n');
  return inst;
}
const setVersion = (inst, v) => fs.writeFileSync(path.join(inst, 'VERSION'), v + '\n');
const git = (cwd, ...a) => sh('git', a, cwd);
function installedProject(inst, home) {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-')); git(bare, 'init', '-q', '--bare', '-b', 'main');
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'proj-')), 'astra');
  fs.mkdirSync(root, { recursive: true });
  git(root, 'init', '-q', '-b', 'main'); git(root, 'config', 'user.name', 'dev'); git(root, 'config', 'user.email', 'dev@example.com'); git(root, 'config', 'commit.gpgsign', 'false');
  wr(root, 'README.md', 'x\n');
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'init'); git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-q', 'origin', 'main');
  const r = sh('node', [path.join(inst, 'install.mjs'), root, '--yes', '--no-commit'], root, { HARNESS_HOME: home });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  git(root, 'add', '-A'); git(root, 'commit', '-qm', 'harness awal'); git(root, 'switch', '-q', 'main'); git(root, 'merge', '-q', '--ff-only', 'harness-v1'); git(root, 'push', '-q', 'origin', 'main');
  return { root, bare };
}
const upd = (inst, home, root, ...a) => sh('node', [path.join(inst, 'scripts', 'harness-update.mjs'), root, '--no-pull', '--no-plugin', ...a], root, { HARNESS_HOME: home });
const subject = (root) => git(root, 'log', '-1', '--format=%s').stdout.trim();
const author = (root) => git(root, 'log', '-1', '--format=%an <%ae>%n%b').stdout;
const remoteHead = (bare) => git(bare, 'rev-parse', 'main').stdout.trim();

test('harness-update: di main, commit "chore(harness): update to vX.Y.Z", tanpa push dan tanpa kredit; data user utuh', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const inst = installerCopy('9.0.0');
  const { root, bare } = installedProject(inst, home);
  wr(root, 'docs/discussion/d.md', 'diskusi'); wr(root, 'docs/work/lama/plan.md', 'plan lama'); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'data'); git(root, 'push', '-q', 'origin', 'main');
  const before = remoteHead(bare);
  setVersion(inst, '9.0.1');
  const r = upd(inst, home, root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(subject(root), 'chore(harness): update to v9.0.1');
  assert.doesNotMatch(author(root), /claude|anthropic|co-authored/i);
  assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim(), 'main');
  assert.equal(git(root, 'branch', '--list', 'harness-update*').stdout.trim(), '', 'tidak ada branch baru');
  assert.equal(remoteHead(bare), before, 'tanpa autoPush tidak di-push');
  assert.equal(rd(root, 'docs/discussion/d.md'), 'diskusi');
  assert.equal(rd(root, 'docs/work/lama/plan.md'), 'plan lama');
  assert.match(rd(root, '.claude/harness.version'), /9\.0\.1/);
  assert.match(r.stdout, /doctor: /);
  assert.match(rd(root, '.gitignore'), /\.harness\//);
  // versi sama → tidak ada commit baru
  const head = git(root, 'rev-parse', 'HEAD').stdout;
  const again = upd(inst, home, root);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /sudah terbaru/);
  assert.equal(git(root, 'rev-parse', 'HEAD').stdout, head);
});

test('harness-update: autoPush / --push mendorong ke origin main; rollback = git revert', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const inst = installerCopy('9.0.0');
  const { root, bare } = installedProject(inst, home);
  const cp = path.join(root, 'harness.config.json');
  const c = JSON.parse(fs.readFileSync(cp, 'utf8')); c.update = { autoPush: true }; fs.writeFileSync(cp, JSON.stringify(c, null, 2)); git(root, 'commit', '-qam', 'autoPush aktif'); git(root, 'push', '-q', 'origin', 'main');
  setVersion(inst, '9.0.1');
  const r = upd(inst, home, root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(remoteHead(bare), git(root, 'rev-parse', 'HEAD').stdout.trim(), 'di-push');
  const rb = upd(inst, home, root, '--rollback');
  assert.equal(rb.status, 0, rb.stdout + rb.stderr);
  assert.match(subject(root), /^Revert "chore\(harness\): update to v9\.0\.1"/);
  assert.match(rd(root, '.claude/harness.version'), /9\.0\.0/);
  assert.notEqual(remoteHead(bare), git(root, 'rev-parse', 'HEAD').stdout.trim(), 'rollback tidak di-push');
});

test('harness-update: pindah ke main bila bersih; berhenti bila kotor; .harness/ diabaikan', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const inst = installerCopy('9.0.0');
  const { root } = installedProject(inst, home);
  setVersion(inst, '9.0.1');
  git(root, 'switch', '-q', '-c', 'feat/x');
  wr(root, 'README.md', 'ubah\n');
  const dirty = upd(inst, home, root);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stdout, /perubahan tracked/);
  assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim(), 'feat/x', 'tidak berpindah saat kotor');
  git(root, 'checkout', '-q', '--', 'README.md');
  wr(root, '.harness/handoff.md', 'sementara'); // diabaikan
  const ok = upd(inst, home, root);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.equal(git(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim(), 'main');
  assert.match(ok.stdout, /pindah feat\/x → main/);
});

test('harness-update --dry-run tidak mengubah apa pun; non-harness ditolak', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const inst = installerCopy('9.0.0');
  const { root } = installedProject(inst, home);
  setVersion(inst, '9.0.1');
  const head = git(root, 'rev-parse', 'HEAD').stdout;
  const r = upd(inst, home, root, '--dry-run');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(git(root, 'rev-parse', 'HEAD').stdout, head);
  assert.match(rd(root, '.claude/harness.version'), /9\.0\.0/);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
  const x = upd(inst, home, plain);
  assert.equal(x.status, 1);
  assert.match(x.stdout, /bukan root ber-harness/);
});

test('harness.mjs update memakai installer.json dan menghabiskan tiket; tanpa installer.json gagal jelas', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const inst = installerCopy('9.0.0');
  const { root } = installedProject(inst, home); // install.mjs mencatat installer.json
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'installer.json'), 'utf8')).path, inst);
  setVersion(inst, '9.0.1');
  prompt(root, '/harness:update');
  const r = sh('node', [path.join(root, '.claude/hooks/harness.mjs'), 'update', '--dry-run', '--no-pull', '--no-plugin'], root, { CLAUDE_PROJECT_DIR: root, HARNESS_HOME: home });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dry run/);
  assert.equal(fs.existsSync(path.join(root, '.claude/state/update-ticket.json')), false, 'tiket sekali pakai');
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-'));
  const f = sh('node', [path.join(root, '.claude/hooks/harness.mjs'), 'update'], root, { CLAUDE_PROJECT_DIR: root, HARNESS_HOME: empty });
  assert.equal(f.status, 2);
  assert.match(f.stderr, /installer belum tercatat/);
});

// ---------- measure ----------
test('measure: token per model, panggilan subagent, durasi dari transcript', () => {
  const root = mk();
  const tr = path.join(root, 't.jsonl');
  const line = (o) => JSON.stringify(o);
  fs.writeFileSync(tr, [
    line({ type: 'user', timestamp: '2026-11-05T10:00:00Z', message: { content: 'x' } }),
    line({ type: 'assistant', timestamp: '2026-11-05T10:00:10Z', message: { id: 'm1', model: 'claude-sonnet-5-5', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 }, content: [{ type: 'tool_use', name: 'Task' }] } }),
    line({ type: 'assistant', timestamp: '2026-11-05T10:00:11Z', message: { id: 'm1', model: 'claude-sonnet-5-5', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 }, content: [{ type: 'tool_use', name: 'Bash' }] } }),
    line({ type: 'assistant', isSidechain: true, timestamp: '2026-11-05T10:01:00Z', message: { id: 'm2', model: 'claude-haiku-5-5', usage: { input_tokens: 10, output_tokens: 5 }, content: [] } }),
    line({ type: 'assistant', timestamp: '2026-11-05T10:02:00Z', message: { id: 'm3', model: 'claude-opus-5-5', usage: { input_tokens: 7, output_tokens: 3 }, content: [] } }),
    '{rusak',
  ].join('\n'));
  const r = cli(root, 'measure', tr, '--json', '--label', 'sebelum');
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout);
  assert.equal(m.turns, 3, 'message.id yang sama dihitung sekali');
  assert.equal(m.models.sonnet.input, 100);
  assert.equal(m.models.sonnet.cache_read, 500);
  assert.equal(m.models.haiku.turns, 1);
  assert.equal(m.opus_turns, 1);
  assert.equal(m.subagent_calls, 1);
  assert.equal(m.sidechain_turns, 1);
  assert.equal(m.duration_sec, 120);
  assert.ok(fs.existsSync(path.join(root, '.harness/metrics/sebelum.json')));
  assert.equal(cli(root, 'measure', '/tidak/ada.jsonl').status, 1);
});

// ---------- instalasi: berkas baru terpasang ----------
test('kernel memuat hook dan agent baru; settings: model sonnet dan hook Stop/PreCompact/SessionEnd', () => {
  const st = JSON.parse(fs.readFileSync(path.join(kernel, '.claude/settings.json'), 'utf8'));
  assert.equal(st.model, 'sonnet');
  for (const ev of ['Stop', 'PreCompact', 'SessionEnd']) assert.ok(st.hooks[ev], ev);
  for (const f of ['stop', 'handoff', 'store', 'evidence', 'metrics']) assert.ok(fs.existsSync(path.join(kernel, '.claude/hooks', `${f}.mjs`)), f);
  for (const a of ['scout', 'runner', 'reviewer']) assert.ok(fs.existsSync(path.join(kernel, '.claude/agents', `${a}.md`)), a);
});

test('Stop: sesi yang tidak mengerjakan item tidak ditahan (mtime berkas segar karena git clone/pull bukan penanda)', () => {
  const root = mk({ align: false });
  const slug = inProgress(root); // sesi s1 mengerjakan item; semua AC berbukti, test belum jalan
  const fresh = new Date();
  for (const f of ['plan.md', 'progress.md']) fs.utimesSync(path.join(root, 'docs', 'work', slug, f), fresh, fresh);
  assert.equal(stop(root, { session_id: 'sesi-status' }).status, 0, 'sesi yang hanya menjalankan /harness:status tidak boleh ditolak');
  assert.equal(stop(root, { session_id: 's1' }).status, 2, 'sesi yang mengerjakan item tetap ditahan');
});

test('Stop: perintah shell yang menyebut slug (mis. run-checks) juga menandai item sebagai dikerjakan sesi itu', () => {
  const root = mk({ align: false });
  const slug = inProgress(root);
  run(root, 'post.mjs', { hook_event_name: 'PostToolUse', session_id: 'sesi-bash', tool_name: 'Bash', tool_input: { command: `node .claude/hooks/harness.mjs run-checks ${slug}.` } });
  assert.equal(stop(root, { session_id: 'sesi-bash' }).status, 2);
});

test('post.mjs: penanda tidak dibuat untuk _TEMPLATE atau berkas di luar docs/work', () => {
  const root = mk({ align: false });
  touch(root, '_TEMPLATE', 'sx');
  run(root, 'post.mjs', { hook_event_name: 'PostToolUse', session_id: 'sx', tool_name: 'Write', tool_input: { file_path: path.join(root, 'README.md') } });
  assert.equal(fs.existsSync(path.join(root, '.harness', 'state', 'touched-sx.json')), false);
});
