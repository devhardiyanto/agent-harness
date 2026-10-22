// Uji installer end-to-end pada project contoh. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const installer = path.join(here, '..', 'install.mjs');
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const install = (dir, ...a) => sh('node', [installer, dir, '--repo', 'devhardiyanto/agent-harness', ...a], dir);
const hx = (dir, ...a) => spawnSync('node', [path.join(dir, '.claude/hooks/harness.mjs'), ...a], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
const hook = (dir, script, payload) => spawnSync('node', [path.join(dir, '.claude/hooks', script)], { input: JSON.stringify({ session_id: 's', cwd: dir, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });

function gitRepo(dir, branch = 'main') {
  fs.mkdirSync(dir, { recursive: true });
  sh('git', ['init', '-q', '-b', branch], dir);
  sh('git', ['config', 'user.name', 't'], dir); sh('git', ['config', 'user.email', 't@t.t'], dir); sh('git', ['config', 'commit.gpgsign', 'false'], dir);
}
function existingProject() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ins-')), 'astra');
  gitRepo(root);
  for (const d of ['.claude/agents', '.claude/hooks', 'docs/knowledge', 'docs/other', 'scripts', 'ops']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const w = (p, c = 'x') => fs.writeFileSync(path.join(root, p), c);
  w('CLAUDE.md'); w('AGENTS.md'); w('.claude/settings.json', '{}'); w('.claude/settings.local.json', '{"keep":1}'); w('.claude/agents/x.md');
  w('docs/knowledge/a.md'); w('docs/other/note.md', 'keep'); w('scripts/check-git-gate.sh'); w('scripts/my-deploy.sh', 'keep'); w('ops/README.md');
  w('.mcp.json', '{"mcpServers":{"plane":{}}}'); w('.gitignore', 'node_modules/\nsource-code/\n');
  for (const s of ['ce-api', 'ce-web']) { gitRepo(path.join(root, 'source-code', s)); fs.writeFileSync(path.join(root, 'source-code', s, 'package.json'), '{}'); }
  sh('git', ['add', '-A'], root); sh('git', ['commit', '-qm', 'init'], root);
  return root;
}

test('dry-run tidak mengubah apa pun', () => {
  const root = existingProject();
  const before = sh('git', ['status', '--porcelain'], root).stdout + fs.readdirSync(root).join();
  const r = install(root, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /DIBUANG/);
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout + fs.readdirSync(root).join(), before);
  assert.equal(fs.existsSync(path.join(root, '.harness-staging')), false);
});
test('tanpa --yes dan tanpa TTY: berhenti', () => {
  const root = existingProject();
  const r = install(root);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--yes/);
});
test('existing: ganti penuh, tag cadangan, branch, yang lain dipertahankan', () => {
  const root = existingProject();
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(sh('git', ['tag'], root).stdout, /harness-pre-v1-/);
  assert.equal(sh('git', ['branch', '--show-current'], root).stdout.trim(), 'harness-v1');
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout.trim(), '');
  assert.equal(fs.existsSync(path.join(root, '.claude/agents/x.md')), false);
  assert.equal(fs.existsSync(path.join(root, '.claude/agents/explorer.md')), true);
  assert.equal(fs.readFileSync(path.join(root, 'docs/other/note.md'), 'utf8'), 'keep');
  assert.equal(fs.readFileSync(path.join(root, 'scripts/my-deploy.sh'), 'utf8'), 'keep');
  assert.equal(fs.existsSync(path.join(root, 'scripts/check-git-gate.sh')), false);
  assert.equal(fs.readFileSync(path.join(root, '.claude/settings.local.json'), 'utf8'), '{"keep":1}');
  assert.equal(fs.existsSync(path.join(root, '.harness-staging')), false);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.config.json'), 'utf8'));
  assert.deepEqual(cfg.services, ['ce-api', 'ce-web']);
  assert.equal(cfg.plane.enabled, true);
  const st = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
  assert.equal(st.enabledPlugins['harness@harness-marketplace'], true);
  assert.equal(hx(root, 'doctor').status, 0, hx(root, 'doctor').stdout);
  // tag benar-benar berisi harness lama
  assert.match(sh('git', ['show', `${sh('git', ['tag'], root).stdout.trim()}:.claude/agents/x.md`], root).stdout, /x/);
});
test('hasil instalasi langsung menegakkan gerbang; alur lengkap approve→build→done', () => {
  const root = existingProject();
  assert.equal(install(root, '--yes').status, 0);
  const file = path.join(root, 'source-code/ce-api/src/a.ts');
  const edit = () => hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: 'a', new_string: 'b' } });
  assert.equal(edit().status, 2);
  const slug = path.basename(hx(root, 'new', 'feature', 'Endpoint baru').stdout.trim());
  const p = path.join(root, 'docs/work', slug, 'plan.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('services: []', 'services: [ce-api]').replace('- AC1:', '- AC1: GET /x 200'));
  const ap = hook(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: `/harness:approve ${slug}` });
  assert.equal(ap.status, 0);
  assert.equal(edit().status, 0);
  assert.equal(hx(root, 'start', slug).status, 0);
  assert.equal(hx(root, 'set-status', slug, 'in-review').status, 0);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '- AC1: curl localhost:3000/x -> 200 OK\n');
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'review.md'), '---\nverdict: clean\n---\n');
  assert.equal(hx(root, 'set-status', slug, 'done').status, 0);
  // git gate di service: commit di branch main diblokir
  const svc = path.join(root, 'source-code/ce-api');
  const g = hook(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: svc, tool_input: { command: 'git commit -m x' } });
  assert.equal(g.status, 2);
});
test('idempoten: pasang ulang (ganti penuh) pada project ber-harness v1', () => {
  const root = existingProject();
  assert.equal(install(root, '--yes').status, 0);
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(hx(root, 'doctor').status, 0);
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout.trim(), '');
  assert.match(sh('git', ['branch'], root).stdout, /harness-v1-/);
});
test('perubahan tracked belum commit: ditolak', () => {
  const root = existingProject();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'diubah');
  const r = install(root, '--yes');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /belum di-commit/);
  assert.equal(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), 'diubah');
});
test('project baru tanpa git: cadangan tidak perlu, service terdeteksi', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ins-')), 'baru');
  for (const s of ['alpha', 'beta']) { gitRepo(path.join(root, 'source-code', s)); fs.writeFileSync(path.join(root, 'source-code', s, 'go.mod'), 'module x'); }
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /mode \| new/);
  assert.equal(hx(root, 'doctor').status, 0);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.config.json'), 'utf8'));
  assert.deepEqual(cfg.services, ['alpha', 'beta']);
  assert.match(fs.readFileSync(path.join(root, 'docs/_map.md'), 'utf8'), /alpha \| go/);
});
test('project baru ber-git tanpa commit: tanpa tag, tetap jalan', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ins-')), 'baru2');
  gitRepo(root); gitRepo(path.join(root, 'source-code', 'svc'));
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(sh('git', ['tag'], root).stdout.trim(), '');
});
test('layout single: semua kode di-gate, docs bebas', () => {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ins-')), 'mono');
  gitRepo(root); fs.writeFileSync(path.join(root, 'package.json'), '{}');
  assert.equal(install(root, '--yes', '--no-commit').status, 0);
  const e = (rel) => hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, rel), old_string: 'a', new_string: 'b' } }).status;
  assert.equal(e('src/app.js'), 2);
  assert.equal(e('docs/note.md'), 0);
});
test('folder installer sendiri ditolak', () => {
  const r = sh('node', [installer, path.join(here, '..'), '--yes'], here);
  assert.notEqual(r.status, 0);
});

// ---------- modul executor & pasang ulang di atas v1 ----------
const haveBash = sh('bash', ['--version'], os.tmpdir()).status === 0 && (sh('python3', ['--version'], os.tmpdir()).status === 0);

test('tanpa --with-executor: modul tidak terpasang', () => {
  const root = existingProject();
  assert.equal(install(root, '--yes').status, 0);
  assert.equal(fs.existsSync(path.join(root, '.gitattributes')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/executor')), false);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'harness.config.json'), 'utf8')).executor, undefined);
});

test('--with-executor: modul terpasang NONAKTIF, checks per service, allow terbatas, gitignore, gerbang melindungi modul', () => {
  const root = existingProject();
  const r = install(root, '--yes', '--with-executor');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of ['scripts/executor/executor.py', 'scripts/executor/dispatch-executor.sh', 'scripts/executor/result.schema.json', 'scripts/executor/templates/brief.md', '.agents/agents/implementer/agent.md']) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'harness.config.json'), 'utf8'));
  assert.equal(cfg.executor.enabled, false);
  assert.deepEqual(cfg.checks['ce-api'], { lint: null, test: null, agent_runs: false });
  assert.ok(cfg.checks['ce-web']);
  const st = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'));
  assert.ok(st.permissions.allow.includes('Bash(bash scripts/executor/dispatch-executor.sh *)'));
  assert.ok(st.permissions.allow.includes('Bash(python3 scripts/executor/executor.py checks *)'));
  assert.ok(!st.permissions.allow.some((a) => /scripts\/executor\/\*\)$/.test(a) && !/dispatch|preflight|checks/.test(a)), 'allow tidak boleh terlalu lebar');
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /\.agents\/hooks\.json/); assert.match(gi, /tasks\/\*\.agy\.log/);
  const ga = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.match(ga, /scripts\/executor\/\*\* text eol=lf/); assert.match(ga, /\.agents\/\*\* text eol=lf/);
  assert.equal(hx(root, 'doctor').status, 0);
  assert.equal(hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'scripts/executor/executor.py'), old_string: 'a', new_string: 'b' } }).status, 2);
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout.trim(), '');
});

test('--with-executor: tes bawaan modul lulus di project terpasang (tanpa agy asli)', { skip: !haveBash && 'butuh bash + python3' }, () => {
  const root = existingProject();
  assert.equal(install(root, '--yes', '--with-executor').status, 0);
  const r = sh('bash', ['scripts/executor/test-executor.sh'], root);
  assert.equal(r.status, 0, r.stdout.slice(-1500) + r.stderr.slice(-500));
  assert.match(r.stdout, /gagal=0/);
});

test('pasang ulang di atas v1: work item, knowledge, peta, executor & checks dipertahankan', () => {
  const root = existingProject();
  assert.equal(install(root, '--yes', '--with-executor').status, 0);
  // data user setelah pemasangan pertama
  fs.mkdirSync(path.join(root, 'docs/work/2026-01-01-x'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/work/2026-01-01-x/plan.md'), '---\ntitle: x\nstatus: done\nservices: [ce-api]\n---\n');
  fs.mkdirSync(path.join(root, 'docs/knowledge/ce-api'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/knowledge/ce-api/summary.md'), 'ringkasan hasil onboard');
  fs.writeFileSync(path.join(root, 'docs/_map.md'), '# peta hasil onboard\n');
  const cp = path.join(root, 'harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cp, 'utf8'));
  cfg.executor.enabled = true; cfg.executor.sandbox = false; cfg.checks['ce-api'].test = 'npm test';
  fs.writeFileSync(cp, JSON.stringify(cfg, null, 2));
  sh('git', ['add', '-A'], root); sh('git', ['commit', '-qm', 'data user'], root);
  const r = install(root, '--yes', '--with-executor');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.readFileSync(path.join(root, 'docs/work/2026-01-01-x/plan.md'), 'utf8').includes('status: done'), true);
  assert.equal(fs.readFileSync(path.join(root, 'docs/knowledge/ce-api/summary.md'), 'utf8'), 'ringkasan hasil onboard');
  assert.equal(fs.readFileSync(path.join(root, 'docs/_map.md'), 'utf8'), '# peta hasil onboard\n');
  const after = JSON.parse(fs.readFileSync(cp, 'utf8'));
  assert.equal(after.executor.enabled, true); assert.equal(after.executor.sandbox, false);
  assert.equal(after.checks['ce-api'].test, 'npm test');
  assert.ok(fs.existsSync(path.join(root, 'docs/work/_TEMPLATE/plan.md')));
  assert.equal((fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').match(/scripts\/executor\/\*\* text eol=lf/g) || []).length, 1, '.gitattributes tidak boleh digandakan');
  assert.equal(hx(root, 'doctor').status, 0);
});

test('backup/ di root diabaikan otomatis; file lain yang belum di-track TIDAK ikut ter-commit', () => {
  const root = existingProject();
  fs.mkdirSync(path.join(root, 'backup'));
  fs.writeFileSync(path.join(root, 'backup', 'dump.sql'), 'rahasia');
  fs.writeFileSync(path.join(root, 'scratch.txt'), 'catatan pribadi');
  const dry = install(root, '--dry-run');
  assert.match(dry.stdout, /DIABAIKAN[^|]*\| backup/);
  const r = install(root, '--yes');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(sh('git', ['ls-files', 'backup', 'scratch.txt'], root).stdout.trim(), '', 'backup/ dan scratch.txt tidak boleh ter-track');
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /^\/backup\/$/m);
  assert.equal(sh('git', ['status', '--porcelain'], root).stdout.trim(), '?? scratch.txt');
  assert.equal(fs.readFileSync(path.join(root, 'backup', 'dump.sql'), 'utf8'), 'rahasia');
  // harness-nya sendiri tetap ter-commit
  assert.match(sh('git', ['ls-files', 'AGENTS.md', 'harness.config.json'], root).stdout, /AGENTS\.md[\s\S]*harness\.config\.json/);
});
test('--ignore: beberapa nama, dan --no-auto-ignore mematikan deteksi backup/', () => {
  const root = existingProject();
  fs.mkdirSync(path.join(root, 'arsip')); fs.writeFileSync(path.join(root, 'arsip', 'a.txt'), 'x');
  fs.mkdirSync(path.join(root, 'backup')); fs.writeFileSync(path.join(root, 'backup', 'b.txt'), 'x');
  const r = install(root, '--yes', '--ignore', 'arsip', '--no-auto-ignore');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^\/arsip\/$/m);
  assert.doesNotMatch(gi, /^\/backup\/$/m);
});
test('--ignore menolak path berbahaya atau direktori milik harness', () => {
  const root = existingProject();
  for (const bad of ['../x', 'a/b', 'docs', 'source-code', '*.zip']) {
    const r = install(root, '--dry-run', '--ignore', bad);
    assert.notEqual(r.status, 0, bad);
    assert.match(r.stderr, /--ignore/);
  }
});
