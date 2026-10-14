#!/usr/bin/env node
// Installer Harness v1. Ganti penuh (bukan update): yang lama dibuang, yang baru dipasang.
// Pakai:  node install.mjs [folder-project] [--yes] [--dry-run] [--branch NAMA] [--repo owner/repo]
//                          [--project-name NAMA] [--root-branch main] [--allow-dirty] [--no-commit]
// Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KERNEL = path.join(HERE, 'kernel');
const VERSION = fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim();

// ---------- argumen ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const valueFlags = new Set(['branch', 'repo', 'project-name', 'root-branch']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !valueFlags.has((argv[i - 1] || '').replace(/^--/, '')));
const target = path.resolve(positional[0] || process.cwd());
const DRY = flag('dry-run');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

// ---------- util ----------
const sh = (cmd, args, cwd = target) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const out = (r) => (r.stdout || '').trim();
const exists = (p) => fs.existsSync(path.join(target, p));
const log = (s = '') => console.log(s);
const table = (head, rows) => {
  log(`| ${head.join(' | ')} |`); log(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) log(`| ${r.join(' | ')} |`);
};
const die = (m) => { console.error(`\nGAGAL: ${m}`); process.exit(1); };

// ---------- 1. prasyarat (dicek, tidak dipasang) ----------
function prereq() {
  const rows = [];
  const add = (n, ok, note, fatal = false) => rows.push({ n, ok, note, fatal });
  add('node >= 18', Number(process.versions.node.split('.')[0]) >= 18, process.versions.node, true);
  const git = sh('git', ['--version'], HERE);
  add('git', git.status === 0, out(git) || 'tidak ditemukan', true);
  const gh = sh('gh', ['--version'], HERE);
  add('gh (cek PR merged, buat PR)', gh.status === 0, gh.status === 0 ? out(gh).split('\n')[0] : 'pasang GitHub CLI lalu gh auth login');
  const cl = sh('claude', ['--version'], HERE);
  const v = /(\d+)\.(\d+)\.(\d+)/.exec(out(cl));
  const okv = v && (+v[1] > 2 || (+v[1] === 2 && (+v[2] > 1 || (+v[2] === 1 && +v[3] >= 295))));
  add('claude >= 2.1.295 (onFailure: block)', !!okv, out(cl) || 'claude tidak ditemukan di PATH');
  const py = sh('python3', ['--version'], HERE);
  add('python3 (opsional, untuk Graphify)', py.status === 0, out(py) || 'opsional');
  log('## Prasyarat'); table(['cek', 'hasil', 'catatan'], rows.map((r) => [r.n, r.ok ? 'OK' : (r.fatal ? 'GAGAL' : 'PERINGATAN'), r.note]));
  if (rows.some((r) => r.fatal && !r.ok)) die('prasyarat wajib belum terpenuhi.');
}

// ---------- 2. deteksi ----------
const OLD_PATHS = [
  '.claude/agents', '.claude/commands', '.claude/skills', '.claude/hooks', '.claude/rules', '.claude/output-styles',
  '.claude/settings.json', 'CLAUDE.md', 'AGENTS.md', 'harness.config.json',
  'docs/_map.md', 'docs/_registry.md', 'docs/knowledge', 'docs/templates', 'docs/_archive', 'docs/work', 'ops',
  'scripts/verify-harness.py', 'scripts/precompact-backup.js', 'scripts/check-token-threshold.js', 'scripts/graphify-build.sh',
  'scripts/check-task-completion.sh', 'scripts/check-session-start.sh', 'scripts/check-merge-tracker-sync.sh',
  'scripts/check-git-gate.sh', 'scripts/check-dependency-gate.sh',
];
const KEEP_PATHS = ['.claude/settings.local.json', '.mcp.json', 'CLAUDE.local.md', 'source-code', 'docs (file lain)', '.gitignore (ditambah)'];

function detectStack(dir) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  const parts = [];
  if (has('package.json')) {
    let d = {}; try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); d = { ...p.dependencies, ...p.devDependencies }; } catch { /* abaikan */ }
    const fw = ['nuxt', 'next', 'vue', 'react', '@nestjs/core', 'hono', 'express', 'fastify', 'svelte'].filter((k) => d[k]);
    parts.push(`node${fw.length ? `(${fw.join('+')})` : ''}`);
  }
  if (has('composer.json')) {
    let laravel = false; try { laravel = !!JSON.parse(fs.readFileSync(path.join(dir, 'composer.json'), 'utf8')).require?.['laravel/framework']; } catch { /* abaikan */ }
    parts.push(laravel ? 'php(laravel)' : 'php');
  }
  if (has('go.mod')) parts.push('go');
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) parts.push('java/kotlin');
  if (has('requirements.txt') || has('pyproject.toml')) parts.push('python');
  if (has('Gemfile')) parts.push('ruby');
  if (has('Cargo.toml')) parts.push('rust');
  if (has('Dockerfile')) parts.push('docker');
  return parts.join(', ') || 'UNKNOWN';
}
function detectCommands(dir) {
  const cmds = [];
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const k of ['dev', 'build', 'test', 'lint']) if (p.scripts?.[k]) cmds.push(`npm run ${k}`);
  } catch { /* abaikan */ }
  if (fs.existsSync(path.join(dir, 'artisan'))) cmds.push('php artisan test');
  if (fs.existsSync(path.join(dir, 'go.mod'))) cmds.push('go test ./...');
  if (fs.existsSync(path.join(dir, 'Makefile'))) cmds.push('make (lihat Makefile)');
  return cmds;
}
function detectServices() {
  const dir = path.join(target, 'source-code');
  if (!fs.existsSync(dir)) return { layout: 'single', services: [], skipped: [] };
  const services = []; const skipped = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (!fs.existsSync(path.join(p, '.git'))) { skipped.push(d.name); continue; }
    const br = out(sh('git', ['symbolic-ref', '--short', '-q', 'HEAD'], p)) || 'UNKNOWN';
    const remote = out(sh('git', ['remote', 'get-url', 'origin'], p)).replace(/\/\/[^@/]+@/, '//') || '-';
    services.push({ name: d.name, stack: detectStack(p), branch: br, remote, commands: detectCommands(p) });
  }
  return { layout: services.length ? 'multi-repo' : 'single', services, skipped };
}
function installerRepoSlug() {
  const r = opt('repo');
  if (r) return r;
  const u = out(sh('git', ['remote', 'get-url', 'origin'], HERE));
  const m = /github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/.exec(u);
  return m ? m[1] : null;
}

// ---------- 3. bangun staging ----------
function render(det, mode) {
  const stage = path.join(target, '.harness-staging', stamp);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.cpSync(KERNEL, stage, { recursive: true });
  // config
  const cfgP = path.join(stage, 'harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  cfg.harness_version = VERSION;
  cfg.project = opt('project-name') || path.basename(target);
  cfg.root_branch = opt('root-branch') || 'main';
  cfg.layout = det.layout;
  cfg.services = det.services.map((s) => s.name);
  if (exists('.mcp.json') && /plane/i.test(fs.readFileSync(path.join(target, '.mcp.json'), 'utf8'))) cfg.plane.enabled = true;
  fs.writeFileSync(cfgP, JSON.stringify(cfg, null, 2) + '\n');
  // peta draft
  const mapP = path.join(stage, 'docs', '_map.md');
  let map = fs.readFileSync(mapP, 'utf8');
  const rows = det.services.map((s) => `| ${s.name} | ${s.stack} | UNKNOWN | UNKNOWN | UNKNOWN | ${s.branch} |`).join('\n');
  map = map.replace('|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|\n${rows}${rows ? '\n' : ''}`).replace('updated: null', `updated: ${new Date().toISOString().slice(0, 10)}`);
  fs.writeFileSync(mapP, map);
  // rule per service
  for (const s of det.services) {
    const body = `---\npaths:\n  - "source-code/${s.name}/**"\n---\n# Service: ${s.name}\n\n- Stack (terdeteksi installer, belum diverifikasi): ${s.stack}\n- Branch default: ${s.branch}\n` +
      `- Sebelum mengedit: baca \`docs/knowledge/${s.name}/summary.md\` dan \`patterns.md\` bila ada; bila belum ada, jalankan \`/harness:onboard ${s.name}\`.\n` +
      `- Perintah terdeteksi: ${s.commands.length ? s.commands.map((c) => `\`${c}\``).join(', ') : 'UNKNOWN'}\n- Edit hanya lewat work item approved yang mencakup service ini (hook menegakkan).\n`;
    fs.writeFileSync(path.join(stage, '.claude', 'rules', `svc-${s.name}.md`), body);
  }
  // pendaftaran plugin
  const slug = installerRepoSlug();
  const setP = path.join(stage, '.claude', 'settings.json');
  const st = JSON.parse(fs.readFileSync(setP, 'utf8'));
  if (slug) {
    st.extraKnownMarketplaces = { 'harness-marketplace': { source: { source: 'github', repo: slug } } };
    st.enabledPlugins = { 'harness@harness-marketplace': true };
  }
  fs.writeFileSync(setP, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(stage, '.claude', 'harness.version'), JSON.stringify({ version: VERSION, installed_at: new Date().toISOString(), installer_repo: slug, mode }, null, 2) + '\n');
  // verifikasi staging
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'harness.config.json', '.claude/settings.json', '.claude/hooks/gate.mjs', '.claude/hooks/lib.mjs', 'docs/_map.md', 'docs/work/_TEMPLATE/plan.md']) {
    if (!fs.existsSync(path.join(stage, f))) die(`staging tidak lengkap: ${f}`);
  }
  JSON.parse(fs.readFileSync(setP, 'utf8')); JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  return { stage, slug };
}

// ---------- 4. terapkan ----------
const GITIGNORE = ['.harness-staging/', '.harness-backup-*/', '.claude/audit/', '.claude/state/', 'docs/knowledge/graph/', '.claude/settings.local.json', 'CLAUDE.local.md'];
function applyGitignore(isGit) {
  const p = path.join(target, '.gitignore');
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const lines = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const add = [...GITIGNORE];
  if (exists('source-code') && !(isGit && out(sh('git', ['ls-files', '--', 'source-code']))) ) add.push('/source-code/');
  const missing = add.filter((l) => !lines.has(l));
  if (missing.length) fs.writeFileSync(p, cur.replace(/\n*$/, '\n') + `\n# harness v1\n${missing.join('\n')}\n`);
}

async function confirm(q) {
  if (flag('yes')) return true;
  if (!process.stdin.isTTY) die('tidak ada TTY: jalankan ulang dengan --yes setelah meninjau rencana (atau --dry-run).');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase(); rl.close();
  return a === 'ganti' || a === 'y' || a === 'ya';
}

// ---------- main ----------
log(`# Harness v1 installer ${VERSION}\nproject: ${target}${DRY ? '  (DRY RUN: tidak ada yang diubah)' : ''}\n`);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) die(`folder tidak ada: ${target}`);
if (path.resolve(target) === path.resolve(HERE)) die('jangan jalankan di folder installer sendiri; arahkan ke folder project.');
prereq();

const top = out(sh('git', ['rev-parse', '--show-toplevel']));
const isGit = !!top && path.resolve(top) === target;
if (top && !isGit) die(`${target} berada di dalam repo git lain (${top}). Jalankan di root project itu.`);
const existing = OLD_PATHS.filter(exists);
const mode = existing.length ? 'existing' : 'new';
const det = detectServices();

log(`\n## Deteksi\n- mode: **${mode}**${mode === 'existing' ? ' (harness lama ditemukan)' : ''}\n- git root project: ${isGit ? 'ya' : 'TIDAK (cadangan berupa salinan folder)'}\n- layout: ${det.layout}`);
if (det.services.length) { log(''); table(['service', 'stack', 'branch', 'remote'], det.services.map((s) => [s.name, s.stack, s.branch, s.remote])); }
if (det.skipped.length) log(`\nDilewati (bukan repo git): ${det.skipped.join(', ')}`);
if (!det.services.length) log('\nPeringatan: tidak ada source-code/<repo git>. Layout "single": semua file di luar docs/ dan .claude/ dianggap kode yang di-gate.');

log('\n## Rencana');
table(['aksi', 'path'], [
  ...existing.map((p) => ['DIBUANG', p]),
  ...KEEP_PATHS.filter((p) => !p.includes(' ') ? exists(p) : true).map((p) => ['DIPERTAHANKAN', p]),
  ['DIPASANG', 'AGENTS.md, CLAUDE.md, harness.config.json, .claude/{settings.json,hooks,rules,agents}, docs/{_map.md,knowledge,work/_TEMPLATE}'],
]);
log(`\nCadangan: ${isGit ? `tag git harness-pre-v1-${stamp} di HEAD, lalu branch ${opt('branch', 'harness-v1')}` : `salinan di .harness-backup-${stamp}/`}`);

if (DRY) { log('\nDry run selesai.'); process.exit(0); }

if (isGit && !flag('allow-dirty')) {
  const dirty = out(sh('git', ['status', '--porcelain', '--untracked-files=no']));
  if (dirty) die(`ada perubahan tracked yang belum di-commit:\n${dirty}\nCommit/stash dulu, atau --allow-dirty (perubahan itu TIDAK tercakup tag cadangan).`);
}
if (!(await confirm(mode === 'existing' ? '\nHarness lama akan DIBUANG dan diganti. Ketik "ganti" untuk lanjut: ' : '\nPasang harness v1? (y/N): '))) die('dibatalkan oleh user.');

const { stage, slug } = render(det, mode);
let branch = null; let tag = null;
try {
  if (isGit) {
    const hasCommit = sh('git', ['rev-parse', '-q', '--verify', 'HEAD']).status === 0;
    if (hasCommit) {
      tag = `harness-pre-v1-${stamp}`;
      for (let n = 2; sh('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status === 0; n++) tag = `harness-pre-v1-${stamp}-${n}`;
      const r = sh('git', ['tag', tag]); if (r.status !== 0) die(`gagal membuat tag: ${r.stderr}`);
    }
    branch = opt('branch', 'harness-v1');
    if (sh('git', ['rev-parse', '--verify', '-q', branch]).status === 0) branch = `${branch}-${stamp}`;
    const sw = sh('git', ['switch', '-c', branch]);
    if (sw.status !== 0) die(`gagal membuat branch ${branch}: ${sw.stderr}`);
  } else {
    const bk = path.join(target, `.harness-backup-${stamp}`);
    for (const p of existing) { fs.mkdirSync(path.dirname(path.join(bk, p)), { recursive: true }); fs.cpSync(path.join(target, p), path.join(bk, p), { recursive: true }); }
  }
  for (const p of existing) fs.rmSync(path.join(target, p), { recursive: true, force: true });
  for (const d of ['scripts', 'docs', '.claude']) { const dp = path.join(target, d); try { if (fs.existsSync(dp) && !fs.readdirSync(dp).length) fs.rmdirSync(dp); } catch { /* abaikan */ } }
  fs.cpSync(stage, target, { recursive: true, force: true });
  for (const d of ['docs/knowledge', 'docs/work']) fs.mkdirSync(path.join(target, d), { recursive: true });
  applyGitignore(isGit);
  fs.rmSync(path.join(target, '.harness-staging'), { recursive: true, force: true });
} catch (e) {
  die(`penerapan gagal: ${e.message}. Staging ada di ${stage}; pulihkan dengan ${tag ? `git switch - && git branch -D ${branch}` : 'salinan .harness-backup-*'}.`);
}

let committed = false;
if (isGit && !flag('no-commit')) {
  sh('git', ['add', '-A']);
  const nm = out(sh('git', ['config', 'user.name'])) ? [] : ['-c', 'user.name=harness-installer', '-c', 'user.email=harness@localhost'];
  const c = sh('git', [...nm, 'commit', '-q', '-m', `chore(harness): ganti ke harness v1 (${VERSION})`]);
  committed = c.status === 0;
  if (!committed) log(`\nPeringatan: commit gagal (${(c.stderr || c.stdout).trim().slice(0, 200)}). Perubahan tetap ada di working tree branch ${branch}.`);
}

log('\n## Selesai');
table(['item', 'nilai'], [
  ['mode', mode], ['service terdeteksi', det.services.map((s) => s.name).join(', ') || '-'],
  ['cadangan', tag ? `tag ${tag}` : isGit ? '(repo tanpa commit)' : `.harness-backup-${stamp}/`],
  ['branch', branch || '-'], ['commit', committed ? 'ya' : 'tidak'],
  ['plugin', slug ? `terdaftar via settings (github:${slug})` : 'BELUM: jalankan manual (lihat di bawah)'],
]);
log('\n## Langkah berikutnya (kamu)');
log('1. Buka Claude Code di folder ini; setujui prompt kepercayaan marketplace/plugin bila muncul.');
if (!slug) log('   Plugin manual:  claude plugin marketplace add <owner>/<repo-installer>  &&  claude plugin install harness@harness-marketplace');
log('2. Cek:  node .claude/hooks/harness.mjs doctor      (atau /harness:status)');
log('3. Isi pengetahuan:  /harness:onboard <satu-service>   → lihat biaya → /harness:onboard all');
log('4. Pakai:  /harness:impact feature <permintaan>');
if (tag) log(`\nKembali ke harness lama kapan saja:  git switch -c lama ${tag}`);
