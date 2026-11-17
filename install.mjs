#!/usr/bin/env node
// Installer Harness. Ganti penuh (bukan update): yang lama dibuang, yang baru dipasang.
// Pakai:  node install.mjs [folder-project] [--yes] [--dry-run] [--branch NAMA] [--repo owner/repo]
//                          [--project-name NAMA] [--root-branch main] [--allow-dirty] [--no-commit]
//                          [--in-place] [--commit-message TEKS]  (update di branch aktif tanpa branch baru; dipakai `harness update`)
//                          [--ignore backup,tmp]  folder/file di root yang diabaikan harness: masuk .gitignore dan TIDAK di-commit
//                                                 (folder bernama backup/ atau backups/ otomatis diabaikan; matikan: --no-auto-ignore)
// Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addProject, setInstaller } from './scripts/projects.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KERNEL = path.join(HERE, 'kernel');
const VERSION = fs.readFileSync(path.join(HERE, 'VERSION'), 'utf8').trim();
const LEGACY_BLOCKS = ['executor'];

// ---------- argumen ----------
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const valueFlags = new Set(['branch', 'repo', 'project-name', 'root-branch', 'ignore', 'commit-message']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !valueFlags.has((argv[i - 1] || '').replace(/^--/, '')));
const target = path.resolve(positional[0] || process.cwd());
const optAll = (n) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1].split(',') : []));
const DRY = flag('dry-run');
const UPDATE = flag('update');
const IN_PLACE = flag('in-place');
const warnings = [];
const semver = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
const cmpVer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

// ---------- util ----------
// claude di Windows adalah claude.cmd: perlu shell. Satu string perintah (bukan args + shell:true, yang memicu DEP0190 di Node 24).
const sh = (cmd, args, cwd = target) => (process.platform === 'win32' && cmd === 'claude' && args.every((a) => /^[\w.=-]+$/.test(a))
  ? spawnSync([cmd, ...args].join(' '), { cwd, encoding: 'utf8', shell: true })
  : spawnSync(cmd, args, { cwd, encoding: 'utf8' }));
// Bandingkan path lewat realpath: di Windows, tmp bisa berbentuk 8.3 (RUNNER~1) sedangkan git mengembalikan nama panjang.
const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
const samePath = (a, b) => (process.platform === 'win32' ? real(a).toLowerCase() === real(b).toLowerCase() : real(a) === real(b));
const out = (r) => (r.stdout || '').trim();
const exists = (p) => fs.existsSync(path.join(target, p));
const log = (s = '') => console.log(s);
// Entri root yang bukan milik harness (mis. backup/). Dinormalisasi; yang berbahaya ditolak.
const AUTO_IGNORE = ['backup', 'backups'];
const IGNORE = (() => {
  const set = new Set();
  for (const raw of optAll('ignore')) {
    const n = raw.trim().replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
    if (!n) continue;
    if (n.includes('..') || n.includes('/') || /[*?\[\]!#]/.test(n)) { console.error(`\nGAGAL: --ignore "${raw}": hanya nama folder/file di root (tanpa "/", "..", atau pola).`); process.exit(1); }
    if (['.git', '.claude', 'docs', 'source-code', 'scripts'].includes(n)) { console.error(`\nGAGAL: --ignore ${n}: itu direktori milik harness/project, tidak boleh diabaikan.`); process.exit(1); }
    set.add(n);
  }
  if (!flag('no-auto-ignore')) for (const n of AUTO_IGNORE) if (fs.existsSync(path.join(target, n))) set.add(n);
  return [...set];
})();
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
  // Pasang ulang/update di atas v1: nilai config milik user menang atas bawaan kernel (root_branch, protected_branches, gate, checks, baseline, blok modul lama, dst.).
  // Kunci baru dari kernel tetap masuk lewat penggabungan mendalam; array diganti utuh oleh nilai user.
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return o; };
  const base = hadV1 ? merge(cfg, oldCfg) : cfg;
  Object.assign(cfg, base);
  cfg.harness_version = VERSION;
  cfg.project = opt('project-name') || (hadV1 && oldCfg.project) || path.basename(target);
  cfg.root_branch = opt('root-branch') || (hadV1 && oldCfg.root_branch) || 'main';
  cfg.services = [...(hadV1 && Array.isArray(oldCfg.services) ? oldCfg.services : []), ...det.services.map((s) => s.name).filter((n) => !(oldCfg.services || []).includes(n))];
  cfg.layout = cfg.services.length ? 'multi-repo' : 'single';
  fs.writeFileSync(cfgP, JSON.stringify(cfg, null, 2) + '\n');
  // peta draft
  const mapP = path.join(stage, 'docs', '_map.md');
  let map = fs.readFileSync(mapP, 'utf8');
  const rows = det.services.map((s) => `| ${s.name} | ${s.stack} | UNKNOWN | UNKNOWN | UNKNOWN | ${s.branch} |`).join('\n');
  map = map.replace('|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|\n${rows}${rows ? '\n' : ''}`).replace('updated: null', `updated: ${new Date().toISOString().slice(0, 10)}`);
  if (exists('docs/_map.md')) map = fs.readFileSync(path.join(target, 'docs', '_map.md'), 'utf8'); // peta hasil onboard milik user
  fs.writeFileSync(mapP, map);
  // rule per service
  for (const s of det.services) {
    const body = `---\npaths:\n  - "source-code/${s.name}/**"\n---\n# Service: ${s.name}\n\n- Stack (terdeteksi installer, belum diverifikasi): ${s.stack}\n- Branch default: ${s.branch}\n` +
      `- Sebelum mengedit: baca \`docs/knowledge/${s.name}/summary.md\` dan \`patterns.md\` bila ada; bila belum ada, jalankan \`/harness:init\`.\n` +
      `- Perintah terdeteksi: ${s.commands.length ? s.commands.map((c) => `\`${c}\``).join(', ') : 'UNKNOWN'}\n- Edit hanya lewat work item approved yang mencakup service ini (hook menegakkan).\n`;
    // svc-*.md hasil verifikasi/penyuntingan user (stack sebenarnya, baseline, perintah terbukti, aturan migrasi) tidak boleh kembali ke templat deteksi.
    const mine = path.join(target, '.claude', 'rules', `svc-${s.name}.md`);
    fs.writeFileSync(path.join(stage, '.claude', 'rules', `svc-${s.name}.md`), hadV1 && fs.existsSync(mine) ? fs.readFileSync(mine) : body);
  }
  // pendaftaran plugin
  const slug = installerRepoSlug();
  const setP = path.join(stage, '.claude', 'settings.json');
  const st = JSON.parse(fs.readFileSync(setP, 'utf8'));
  // Plugin dipasang global (scope user) sekali per mesin, bukan per project: tidak ada pendaftaran plugin di settings.json project.
  if (hadV1) {
    // Pengaturan user di settings.json dibawa: kunci lain di luar kernel, dan izin (allow/ask/deny) digabung. Hook kustom tidak dibawa (dilaporkan).
    let oldSt = {}; try { oldSt = JSON.parse(fs.readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8')); } catch { /* abaikan */ }
    for (const k of Object.keys(oldSt)) if (!(k in st)) st[k] = oldSt[k];
    // Pendaftaran plugin tingkat project dari versi lama dibuang agar tidak ada salinan project yang tertinggal versinya.
    for (const [k, id] of [['enabledPlugins', 'harness@harness-marketplace'], ['extraKnownMarketplaces', 'harness-marketplace']]) {
      if (st[k] && id in st[k]) { delete st[k][id]; if (!Object.keys(st[k]).length) delete st[k]; }
    }
    for (const k of ['allow', 'ask', 'deny']) {
      const u = [...(st.permissions?.[k] || []), ...(oldSt.permissions?.[k] || [])];
      if (u.length) { st.permissions = st.permissions || {}; st.permissions[k] = [...new Set(u)]; }
    }
    const custom = JSON.stringify(oldSt.hooks || {}).match(/"(?:command|args)":\s*"[^"]*"/g) || [];
    if (custom.some((c) => !/\.claude\/hooks\/|"node"/.test(c))) warnings.push('settings.json lama memuat hook kustom; tidak dibawa. Lihat tag/branch cadangan bila perlu.');
  }
  // Layout multi-repo: root selalu di main. Sesi background Claude Code (`claude --bg`, agent view) secara bawaan pindah ke worktree di .claude/worktrees/ sebelum mengedit;
  // matikan isolasi itu di root. Nilai yang sudah dipilih user tidak ditimpa.
  if (cfg.layout === 'multi-repo') {
    const wt = st.worktree && typeof st.worktree === 'object' && !Array.isArray(st.worktree) ? st.worktree : {};
    if (!('bgIsolation' in wt)) st.worktree = { ...wt, bgIsolation: 'none' };
  }
  fs.writeFileSync(setP, JSON.stringify(st, null, 2) + '\n');
  fs.writeFileSync(path.join(stage, '.claude', 'harness.manifest.json'), JSON.stringify({ version: VERSION, files: [...ownedNow()].filter((f) => !/harness\.(version|manifest)/.test(f)).sort() }, null, 2) + '\n');
  fs.writeFileSync(path.join(stage, '.claude', 'harness.version'), JSON.stringify({ version: VERSION, installed_at: new Date().toISOString(), installer_repo: slug, mode: UPDATE ? 'update' : mode, ...(UPDATE && installedVer ? { previous: installedVer } : {}) }, null, 2) + '\n');
  // verifikasi staging
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'harness.config.json', '.claude/settings.json', '.claude/hooks/gate.mjs', '.claude/hooks/lib.mjs', 'docs/_map.md', 'docs/work/_TEMPLATE/plan.md']) {
    if (!fs.existsSync(path.join(stage, f))) die(`staging tidak lengkap: ${f}`);
  }
  JSON.parse(fs.readFileSync(setP, 'utf8')); JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  return { stage, slug };
}

// ---------- 4. terapkan ----------
const GITIGNORE = ['.harness-staging/', '.harness-backup-*/', '.harness/', '.claude/audit/', '.claude/state/', '.claude/worktrees/', '.claude/settings.local.json', 'CLAUDE.local.md'];
function applyGitignore(isGit) {
  const p = path.join(target, '.gitignore');
  const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const lines = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const add = [...GITIGNORE];
  for (const n of IGNORE) add.push(`/${n}${fs.existsSync(path.join(target, n)) && fs.statSync(path.join(target, n)).isFile() ? '' : '/'}`);
  if (exists('source-code') && !(isGit && out(sh('git', ['ls-files', '--', 'source-code']))) ) add.push('/source-code/');
  const missing = add.filter((l) => !lines.has(l));
  if (missing.length) fs.writeFileSync(p, cur.replace(/\n*$/, '\n') + `\n# harness\n${missing.join('\n')}\n`);
}

async function confirm(q) {
  if (flag('yes')) return true;
  if (!process.stdin.isTTY) die('tidak ada TTY: jalankan ulang dengan --yes setelah meninjau rencana (atau --dry-run).');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(q)).trim().toLowerCase(); rl.close();
  return a === 'ganti' || a === 'y' || a === 'ya';
}

// ---------- main ----------
log(`# Harness installer ${VERSION}\nproject: ${target}${DRY ? '  (DRY RUN: tidak ada yang diubah)' : ''}\n`);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) die(`folder tidak ada: ${target}`);
if (path.resolve(target) === path.resolve(HERE)) die('jangan jalankan di folder installer sendiri; arahkan ke folder project.');
prereq();

const top = out(sh('git', ['rev-parse', '--show-toplevel']));
const isGit = !!top && samePath(top, target);
if (top && !isGit) die(`${target} berada di dalam repo git lain (${top}). Jalankan di root project itu.`);
const existing = OLD_PATHS.filter(exists);
const mode = existing.length ? 'existing' : 'new';
// Pasang ulang di atas harness v1: pengetahuan (docs/knowledge) dan work item (docs/work) adalah DATA user, bukan perangkat; jangan dibuang.
const hadV1 = exists('.claude/harness.version');
// Dokumentasi/data user TIDAK PERNAH dibuang, juga pada root yang belum ber-harness v1 (docs/discussion bahkan tidak ada di daftar buang).
const PRESERVE = ['docs/knowledge', 'docs/work', 'docs/sessions', 'docs/memory', 'docs/_map.md', 'docs/_archive', 'docs/_registry.md'];
const installedVer = hadV1 ? (() => { try { return JSON.parse(fs.readFileSync(path.join(target, '.claude', 'harness.version'), 'utf8')).version || null; } catch { return null; } })() : null;
if (UPDATE) {
  if (!hadV1) die('--update butuh harness terpasang (.claude/harness.version tidak ada). Jalankan tanpa --update untuk memasang.');
  if (installedVer && cmpVer(installedVer, VERSION) > 0 && !flag('force')) die(`terpasang ${installedVer} lebih baru dari installer ${VERSION}. Perbarui installer dulu (git pull), atau --force untuk menurunkan versi.`);
  if (installedVer && cmpVer(installedVer, VERSION) === 0 && !flag('force')) { log(`Sudah terbaru (${VERSION}). Tidak ada yang diubah. Pakai --force untuk memasang ulang berkas harness.`); process.exit(0); }
  log(`Pembaruan: ${installedVer || '(versi tidak terbaca)'} → ${VERSION}\n`);
}
const oldCfg = hadV1 ? (() => {
  const f = path.join(target, 'harness.config.json');
  if (!fs.existsSync(f)) return {};
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { die(`harness.config.json tidak bisa dibaca (${e.message}). Perbaiki dulu; installer tidak menimpa config yang rusak.`); }
})() : {};
const det = detectServices();
// Update tidak boleh menghapus diam-diam service yang tercatat di config hanya karena foldernya tidak ada di mesin ini (klon sebagian, repo belum di-clone, salah branch).
// Service yang hilang dari disk tetap di config dan rule svc-*.md-nya tetap; doctor melaporkannya, user yang memutuskan membuangnya.
const keptSvc = hadV1 && Array.isArray(oldCfg.services) ? oldCfg.services.filter((n) => !det.services.some((s) => s.name === n)) : [];
if (keptSvc.length) warnings.push(`service di config tidak ditemukan di source-code/ pada mesin ini, DIPERTAHANKAN: ${keptSvc.join(', ')}. Hapus manual dari harness.config.json bila memang sudah tidak ada.`);
// Root pra-v1: harness lama diganti penuh (ada tag cadangan), kecuali data user (PRESERVE).
// Root ber-v1 (install ulang/--update): hanya berkas milik harness yang sudah usang yang dibuang; berkas buatan user di .claude/ dan semua dokumen tidak disentuh.
const ownedNow = () => {
  const out = new Set(['.claude/harness.version', '.claude/harness.manifest.json']);
  const walkK = (d) => { for (const e of fs.readdirSync(path.join(KERNEL, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) walkK(r); else out.add(r); } };
  walkK('.claude');
  for (const sv of det.services) out.add(`.claude/rules/svc-${sv.name}.md`);
  for (const n of keptSvc) out.add(`.claude/rules/svc-${n}.md`);
  return out;
};
const obsoleteOwned = () => {
  const now = ownedNow();
  let old = [];
  try { old = JSON.parse(fs.readFileSync(path.join(target, '.claude', 'harness.manifest.json'), 'utf8')).files || []; } catch { /* instalasi 1.2.0 belum punya manifest */ }
  try { for (const f of fs.readdirSync(path.join(target, '.claude', 'rules'))) if (/^svc-.+\.md$/.test(f)) old.push(`.claude/rules/${f}`); } catch { /* abaikan */ }
  return [...new Set(old)].filter((f) => !now.has(f) && exists(f));
};
const removable = hadV1 ? obsoleteOwned() : existing.filter((p) => !PRESERVE.includes(p));
// sisa modul yang sudah dibuang: dideteksi, dilaporkan, TIDAK disentuh
const LEFTOVER = ['scripts/executor', '.agents'].filter(exists);

log(`\n## Deteksi\n- mode: **${mode}**${mode === 'existing' ? ' (harness lama ditemukan)' : ''}\n- git root project: ${isGit ? 'ya' : 'TIDAK (cadangan berupa salinan folder)'}\n- layout: ${det.layout}`);
if (det.services.length) { log(''); table(['service', 'stack', 'branch', 'remote'], det.services.map((s) => [s.name, s.stack, s.branch, s.remote])); }
if (det.skipped.length) log(`\nDilewati (bukan repo git): ${det.skipped.join(', ')}`);
if (!det.services.length && !keptSvc.length) log('\nPeringatan: tidak ada source-code/<repo git>. Layout "single": semua file di luar docs/ dan .claude/ dianggap kode yang di-gate.');

log('\n## Rencana');
table(['aksi', 'path'], [
  ...removable.map((p) => ['DIBUANG', p]),
  ...PRESERVE.filter(exists).map((p) => ['DIPERTAHANKAN', `${p} (data user${hadV1 ? '; hanya _TEMPLATE/README bawaan yang diperbarui' : '; tidak ditimpa'})`]),
  ...(exists('docs/discussion') ? [['DIPERTAHANKAN', 'docs/discussion (data user)']] : []),
  ...KEEP_PATHS.filter((p) => !p.includes(' ') ? exists(p) : true).map((p) => ['DIPERTAHANKAN', p]),
  ...IGNORE.map((n) => ['DIABAIKAN (.gitignore; tidak di-commit, tidak disentuh)', n]),
  ['DIPASANG', 'AGENTS.md, CLAUDE.md, harness.config.json, .claude/{settings.json,hooks,rules,agents}, docs/{_map.md,knowledge,work/_TEMPLATE}'],
  ...LEFTOVER.map((p) => ['DIBIARKAN (sisa modul lama; tidak dipakai lagi sejak 1.4.0, hapus manual bila sudah tidak perlu)', p]),
]);
log(`\nCadangan: ${isGit ? `tag git harness-pre-${UPDATE ? 'update' : 'v1'}-${stamp} di HEAD, ${IN_PLACE ? ', tetap di branch aktif (--in-place)' : `, lalu branch ${opt('branch', UPDATE ? 'harness-update' : 'harness-v1')}`}` : `salinan di .harness-backup-${stamp}/`}`);

const dirtyTracked = () => (isGit ? String(sh('git', ['status', '--porcelain', '--untracked-files=no']).stdout || '').trimEnd() : '');
const DIRTY_HELP = 'Saran: commit dulu (mis. git add -A && git commit -m "wip: docs"), supaya tag cadangan mencakup semuanya. --allow-dirty juga aman bila berkas itu data yang dipertahankan (docs/work, docs/knowledge): perubahan itu tidak disentuh, hanya tidak tercakup tag cadangan.';
if (DRY) {
  const d = flag('allow-dirty') ? '' : dirtyTracked();
  if (d) log(`\nPERINGATAN: pemasangan nyata akan berhenti, ada perubahan tracked yang belum di-commit:\n${d}\n${DIRTY_HELP}`);
  log('\nDry run selesai.'); process.exit(0);
}

if (isGit && !flag('allow-dirty')) {
  const dirty = dirtyTracked();
  if (dirty) die(`ada perubahan tracked yang belum di-commit:\n${dirty}\n${DIRTY_HELP}`);
}
if (!(await confirm(UPDATE ? `\nPerbarui berkas harness ${installedVer || '?'} → ${VERSION}? Data (docs/work, docs/knowledge, docs/sessions, docs/discussion, _map.md, config) dipertahankan. (y/N): ` : mode === 'existing' ? `\nHarness lama ${removable.length ? `akan diganti; ${removable.length} berkas lama DIBUANG (lihat Rencana)` : 'akan diganti di tempat; tidak ada berkas yang dibuang'}. Data user dipertahankan. Ketik "ganti" untuk lanjut: ` : '\nPasang harness v1? (y/N): '))) die('dibatalkan oleh user.');

const { stage, slug } = render(det, mode);
let branch = null; let tag = null;
try {
  if (isGit) {
    const hasCommit = sh('git', ['rev-parse', '-q', '--verify', 'HEAD']).status === 0;
    if (hasCommit) {
      const tagBase = `harness-pre-${UPDATE ? 'update' : 'v1'}-${stamp}`;
      tag = tagBase;
      for (let n = 2; sh('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`]).status === 0; n++) tag = `${tagBase}-${n}`;
      const r = sh('git', ['tag', tag]); if (r.status !== 0) die(`gagal membuat tag: ${r.stderr}`);
    }
    if (IN_PLACE) branch = out(sh('git', ['symbolic-ref', '--short', '-q', 'HEAD'])) || null; // tetap di branch aktif (harness update)
    else {
      branch = opt('branch', UPDATE ? 'harness-update' : 'harness-v1');
      if (sh('git', ['rev-parse', '--verify', '-q', branch]).status === 0) branch = `${branch}-${stamp}`;
      const sw = sh('git', ['switch', '-c', branch]);
      if (sw.status !== 0) die(`gagal membuat branch ${branch}: ${sw.stderr}`);
    }
  } else {
    const bk = path.join(target, `.harness-backup-${stamp}`);
    for (const p of existing) { fs.mkdirSync(path.dirname(path.join(bk, p)), { recursive: true }); fs.cpSync(path.join(target, p), path.join(bk, p), { recursive: true }); }
  }
  for (const p of removable) fs.rmSync(path.join(target, p), { recursive: true, force: true });
  for (const d of ['scripts', 'docs', '.claude']) { const dp = path.join(target, d); try { if (fs.existsSync(dp) && !fs.readdirSync(dp).length) fs.rmdirSync(dp); } catch { /* abaikan */ } }
  const isUserData = (rel) => PRESERVE.some((d) => rel === d || rel.startsWith(d + '/'));
  // Berkas bawaan harness di dalam folder data (templat dan README) diperbarui; berkas lain di PRESERVE yang sudah ada (mis. docs/knowledge/_init.md, log milik user) tidak pernah ditimpa.
  const harnessDoc = (rel) => rel.startsWith('docs/work/_TEMPLATE/') || rel === 'docs/work/README.md' || rel === 'docs/knowledge/README.md';
  fs.cpSync(stage, target, { recursive: true, force: true, filter: (src, dest) => {
    if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) return true;
    const rel = path.relative(target, dest).split(path.sep).join('/');
    if (hadV1 && harnessDoc(rel)) return true;
    return !isUserData(rel);
  } });
  for (const d of ['docs/knowledge', 'docs/work']) fs.mkdirSync(path.join(target, d), { recursive: true });
  applyGitignore(isGit);
  fs.rmSync(path.join(target, '.harness-staging'), { recursive: true, force: true });
} catch (e) {
  die(`penerapan gagal: ${e.message}. Staging ada di ${stage}; pulihkan dengan ${tag ? `git switch - && git branch -D ${branch}` : 'salinan .harness-backup-*'}.`);
}

let committed = false;
if (isGit && !flag('no-commit')) {
  // Hanya path milik harness yang di-stage. JANGAN `git add -A`: itu ikut meng-commit file/folder lain yang belum di-track (backup/, catatan, dump).
  const stagePaths = [...new Set([...removable, 'AGENTS.md', 'CLAUDE.md', 'harness.config.json', '.claude', 'docs/_map.md', 'docs/knowledge', 'docs/work', '.gitignore'])];
  for (const sp of stagePaths) if (exists(sp) || removable.includes(sp)) sh('git', ['add', '-A', '--', sp]);
  const nm = out(sh('git', ['config', 'user.name'])) ? [] : ['-c', 'user.name=harness-installer', '-c', 'user.email=harness@localhost'];
  const c = sh('git', [...nm, 'commit', '-q', '-m', opt('commit-message') || (UPDATE ? `chore(harness): perbarui ke ${VERSION}` : `chore(harness): ganti ke harness v1 (${VERSION})`)]);
  committed = c.status === 0;
  if (!committed) log(`\nPeringatan: commit gagal (${(c.stderr || c.stdout).trim().slice(0, 200)}). Perubahan tetap ada di working tree branch ${branch}.`);
}

try { setInstaller(HERE); } catch { /* opsional */ }
try { addProject(target); } catch (e) { warnings.push(`gagal mendaftarkan project di ~/.harness: ${e.message}`); }
log('\n## Selesai');
table(['item', 'nilai'], [
  ['mode', mode], ['service terdeteksi', det.services.map((s) => s.name).join(', ') || '-'],
  ['cadangan', tag ? `tag ${tag}` : isGit ? '(repo tanpa commit)' : `.harness-backup-${stamp}/`],
  ['branch', branch || '-'], ['commit', committed ? 'ya' : 'tidak'],
  ['plugin', 'global (scope user): dipasang sekali per mesin, bukan per project'],
]);
if (warnings.length) log(`\nPeringatan:\n${warnings.map((w) => `- ${w}`).join('\n')}`);
log('\n## Langkah berikutnya (kamu)');
log('1. Plugin (skill /harness:*) dipasang global sekali per mesin:  node scripts/update-all.mjs --setup-plugin   (atau: claude plugin install harness --marketplace <owner>/<repo-installer> --scope user). Lewati bila sudah.');
log('2. Cek:  node .claude/hooks/harness.mjs doctor');
log('3. Isi pengetahuan (sekali per root):  /harness:init   (satu service dulu → lihat /usage → lanjut all), lalu ketik: verifikasi knowledge <svc>');
log('4. Pakai:  ketik permintaanmu dengan kalimat biasa; ketik "menu" bila ragu langkah berikutnya.');
if (LEFTOVER.length || LEGACY_BLOCKS.some((k) => oldCfg[k])) log(`\nCatatan: sisa modul lama (${[...LEFTOVER, ...LEGACY_BLOCKS.filter((k) => oldCfg[k]).map((k) => `config.${k}`)].join(', ')}) dibiarkan apa adanya. Executor dan dispatch sudah dibuang di harness ini; hapus sendiri bila tidak diperlukan.`);
if (tag) log(`\nKembali ke harness lama kapan saja:  git switch -c lama ${tag}`);
