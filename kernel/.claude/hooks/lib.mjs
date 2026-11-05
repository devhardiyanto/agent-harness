// Harness — pustaka bersama untuk hook dan CLI. Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['draft', 'approved', 'in-progress', 'in-review', 'done', 'merged'];

export const DEFAULT_CONFIG = {
  harness_version: '1.8.1',
  project: '',
  root_branch: 'main',
  layout: 'multi-repo', // 'multi-repo' (services_dir berisi repo git) | 'single' (satu repo)
  services_dir: 'source-code',
  services: [],
  // 'single': semua path di luar allow_paths dianggap kode dan di-gate
  allow_paths: ['docs/**', '.claude/rules/**', '.claude/audit/**', '.harness/**', 'AGENTS.md', 'CLAUDE.md', '.gitignore'],
  protected_paths: ['.claude/hooks/**', '.claude/settings.json', '.claude/agents/**', 'harness.config.json', '.claude/state/merge-tickets/**', '.claude/state/update-ticket.json', '.harness/evidence/**'],
  schema_paths: ['**/migrations/**', '**/migration/**', '**/*.sql', '**/schema.prisma'],
  protected_branches: ['main', 'master', 'develop', 'production', 'staging', 'release/*'],
  deny_commands: [
    'npm\\s+publish', 'terraform\\s+(apply|destroy)', 'kubectl\\s+(delete|drain)', 'docker\\s+push',
    '\\bDROP\\s+(TABLE|DATABASE|SCHEMA)\\b', '\\bTRUNCATE\\s+TABLE\\b', 'gh\\s+pr\\s+merge', 'gh\\s+repo\\s+delete',
  ],
  gate: { test_command: null, test_required: false, test_timeout_sec: 300, require_checks: false },
  checks: {},                // per service: { "api": { "lint": "npm run lint", "test": "npm test", "build": null } }; kosong = TIDAK DIPERIKSA
  quick: { max_files: 5 },   // lajur cepat: 1 service, bukan skema, maksimal N file
  amend: { max: 3 },         // tambahan AC kecil per work item tanpa approve ulang
  // pengiriman: base PR per service ({"api": "feat/s2"} = PR bertumpuk), metode merge, umur tiket merge. Data project, bukan bagian repo harness.
  ship: { base: {}, merge_method: 'merge', ticket_ttl_min: 30 },
  context: { window_tokens: 1000000, warn_tokens: 400000 },
  knowledge: { summary_max_lines: 80, patterns_max_lines: 150, stale_warn_commits: 15 },
  baseline: {}, // override per service: { "ce-api": "production" } (bawaan: origin/HEAD → production → main → master)
  store: { backend: 'local' },  // penyimpanan work item: 'local' (docs/work). Backend lain didaftarkan di store.mjs.
  // align: gerbang sebelum approve. Item standard butuh align.md berverdict "aligned" (ditulis hook saat manusia mengetik /harness:align <slug> ok). Debat maks max_rounds ronde.
  align: { required: true, max_rounds: 3, exempt_types: ['onboard', 'analysis'] },
  // gerbang Stop: sesi tidak boleh berhenti bila item yang baru dikerjakan siap review tetapi bukti test / review belum ada. max_blocks = batas penolakan per sesi (anti-loop).
  stop_gate: { enabled: true, max_blocks: 2, recent_hours: 12 },
  handoff: { max_chars: 6000 },
  update: { autoPush: false },  // `harness update`: push ke origin/root_branch hanya bila true
};

// True bila modul ini dijalankan sebagai skrip (bukan di-import). JANGAN membandingkan import.meta.url dengan
// `file://${process.argv[1]}`: di Windows (C:\\... vs file:///C:/...) dan pada path berspasi/berkarakter khusus
// (URL-encoded) keduanya tidak pernah sama, hook keluar 0 tanpa memeriksa apa pun (gagal-terbuka).
// Bila pembandingan gagal karena error, anggap "dijalankan sebagai skrip" agar gerbang tetap berlaku (gagal-tertutup).
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    const real = fs.realpathSync.native || fs.realpathSync;
    return real(fileURLToPath(metaUrl)) === real(argv1);
  } catch {
    return true;
  }
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function projectRoot(payload = {}) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd());
}

export function loadConfig(root) {
  const user = readJson(path.join(root, 'harness.config.json'), {}) || {};
  const cfg = { ...DEFAULT_CONFIG, ...user };
  for (const k of ['gate', 'context', 'knowledge', 'quick', 'amend', 'ship', 'store', 'align', 'stop_gate', 'handoff', 'update']) cfg[k] = { ...DEFAULT_CONFIG[k], ...(user[k] || {}) };
  return cfg;
}

export async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export const posix = (p) => String(p).replace(/\\/g, '/');

export function relPath(root, p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  return posix(path.relative(root, abs));
}

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export const matchAny = (globs, rel) => (globs || []).some((g) => globToRegex(g).test(rel));

// ---------- frontmatter (subset YAML: key: value, key: [a, b]) ----------
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, raw: '', body: text };
  return { fm: parseFm(m[1]), raw: m[1], body: m[2] };
}
function parseScalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  }
  if (/^(null|~)?$/.test(v)) return null;
  return v.replace(/^["']|["']$/g, '');
}
export function parseFm(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = parseScalar(m[2]);
  }
  return out;
}
export function setFmKey(text, key, value) {
  const { raw, body } = splitFrontmatter(text);
  const line = `${key}: ${value}`;
  if (!raw && !/^---/.test(text)) return `---\n${line}\n---\n${text}`;
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx >= 0) lines[idx] = line; else lines.push(line);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}
export const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// ---------- work item ----------
export function workDir(root) { return path.join(root, 'docs', 'work'); }

export function listItems(root) {
  const dir = workDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => readItem(root, d.name))
    .filter(Boolean);
}
export function readItem(root, slug) {
  const planPath = path.join(workDir(root), slug, 'plan.md');
  if (!fs.existsSync(planPath)) return null;
  const text = fs.readFileSync(planPath, 'utf8');
  const { fm, body } = splitFrontmatter(text);
  return { slug, dir: path.join(workDir(root), slug), planPath, text, fm, body,
    status: fm.status || 'draft', services: asList(fm.services), type: fm.type || 'feature' };
}
export function resolveSlug(root, query) {
  const dir = workDir(root);
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((n) => !n.startsWith('_') && fs.existsSync(path.join(dir, n, 'plan.md')));
  if (names.includes(query)) return query;
  const hits = names.filter((n) => n.includes(query));
  return hits.length === 1 ? hits[0] : null;
}

const AC_LINE = /^\s*[-*]\s*\**(AC\d+)\**\s*[:.–-]\s*(.+?)\s*$/;
export function parseAcs(text) {
  const out = [];
  for (const l of text.split(/\r?\n/)) { const m = AC_LINE.exec(l); if (m) out.push({ id: m[1], text: m[2] }); }
  return out;
}

const PLACEHOLDER = /^(todo|tbd|n\/a|na|-|\.{3}|belum|\?+|<.*>)$/i;

// ---------- ringkasan metadata (untuk list/show/snapshot --json) ----------
// Hanya metadata: tanpa judul, teks AC, isi bukti, isi review, atau email approver.
export function summarizeItem(item) {
  const evidence = new Map();
  const progressPath = path.join(item.dir, 'progress.md');
  if (fs.existsSync(progressPath)) {
    for (const l of fs.readFileSync(progressPath, 'utf8').split(/\r?\n/)) { const m = AC_LINE.exec(l); if (m) evidence.set(m[1], m[2]); }
  }
  const ac = parseAcs(item.body).map((a) => {
    const e = evidence.get(a.id);
    return { id: a.id, evidence: e && e.trim().length >= 8 && !PLACEHOLDER.test(e.trim()) ? 'ok' : 'missing' };
  });
  let review = null;
  const reviewPath = path.join(item.dir, 'review.md');
  if (fs.existsSync(reviewPath)) {
    const { fm, body } = splitFrontmatter(fs.readFileSync(reviewPath, 'utf8'));
    const lines = body.split(/\r?\n/).filter((l) => /blocker/i.test(l));
    review = {
      verdict: String(fm.verdict || 'pending').toLowerCase(),
      blockers_open: lines.filter((l) => /^\s*[-*]\s*\[ \]/.test(l)).length,
      blockers_done: lines.filter((l) => /^\s*[-*]\s*\[[xX]\]/.test(l)).length,
    };
  }
  const has = (f) => fs.existsSync(path.join(item.dir, f));
  return {
    slug: item.slug, type: item.type, status: item.status, services: item.services,
    pr: asList(item.fm.pr), created: item.fm.created || null, updated: item.fm.updated || null, approved_at: item.fm.approved_at || null,
    ac, review, has: { impact: has('impact.md'), progress: has('progress.md'), review: has('review.md') },
  };
}

// ---------- gerbang pengiriman (gate.md) ----------
export const serviceDirOf = (root, cfg, svc) => (cfg.layout === 'multi-repo' ? path.join(root, cfg.services_dir, svc) : root);
// Hash isi pohon kerja (termasuk file baru, menghormati .gitignore) lewat index sementara: tidak mengubah index asli,
// dan SAMA sebelum maupun sesudah commit. Gate yang lulus tetap berlaku setelah ship meng-commit hasilnya.
function worktreeHash(d) {
  const g = (a, env) => spawnSync('git', a, { cwd: d, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env });
  const tmp = path.join(os.tmpdir(), `harness-idx-${process.pid}-${Date.now()}`);
  try {
    const idx = g(['rev-parse', '--git-path', 'index']).stdout.trim();
    const abs = idx ? path.resolve(d, idx) : '';
    if (abs && fs.existsSync(abs)) fs.copyFileSync(abs, tmp);
    const env = { GIT_INDEX_FILE: tmp };
    if (g(['add', '-A'], env).status === 0) { const w = g(['write-tree'], env); if (w.status === 0) return w.stdout.trim(); }
  } catch { /* jatuh ke cara lama */ } finally { fs.rmSync(tmp, { force: true }); }
  return `${g(['rev-parse', 'HEAD']).stdout}${g(['diff', 'HEAD']).stdout}${g(['status', '--porcelain']).stdout}`;
}
// Sidik jari masukan gerbang: bukti, review, daftar service, checks, dan keadaan kode tiap service. Berubah = gate.md usang.
export function gateFingerprint(root, cfg, item) {
  const h = crypto.createHash('sha1');
  for (const f of ['progress.md', 'review.md']) { const p = path.join(item.dir, f); h.update(fs.existsSync(p) ? fs.readFileSync(p) : ''); }
  h.update(JSON.stringify(item.services)); h.update(JSON.stringify(cfg.checks || {})); h.update(String(item.fm.lane || ''));
  for (const sv of item.services) {
    const d = serviceDirOf(root, cfg, sv === '*' ? '' : sv);
    if (!fs.existsSync(path.join(d, '.git'))) { h.update(`${sv}:nogit`); continue; }
    h.update(worktreeHash(d));
  }
  return h.digest('hex').slice(0, 16);
}
export function readGate(item) {
  const p = path.join(item.dir, 'gate.md');
  if (!fs.existsSync(p)) return null;
  const { fm, body } = splitFrontmatter(fs.readFileSync(p, 'utf8'));
  return { fm, body, failing: body.split(/\r?\n/).filter((l) => /\|\s*FAIL\s*\|/.test(l)).map((l) => l.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*\|\s*/g, ' · ')) };
}
// Dipakai transisi done (dan ship): gate.md harus ada, pass, dan masih berlaku.
export function gateProblems(root, cfg, item) {
  const g = readGate(item);
  if (!g) return [`gate.md belum ada: jalankan "node .claude/hooks/harness.mjs gate ${item.slug}" ("set-status ${item.slug} done" menjalankannya otomatis).`];
  if (String(g.fm.verdict) !== 'pass') return [`gate.md verdict ${g.fm.verdict || '?'}:\n  ${g.failing.join('\n  ') || '(lihat gate.md)'}`];
  if (String(g.fm.fingerprint) !== gateFingerprint(root, cfg, item)) return [`gate.md usang (kode atau bukti berubah sejak gate dijalankan): jalankan "node .claude/hooks/harness.mjs gate ${item.slug}" lagi.`];
  return [];
}

// ---------- tiket update: dibuat hook dari ketikan manusia, dikonsumsi `harness.mjs update` ----------
export const updateTicketPath = (root) => path.join(root, '.claude', 'state', 'update-ticket.json');
export function updateTicket(root, mode, ttlMin = 30) {
  const t = readJson(updateTicketPath(root), null);
  if (!t || !t.at || Date.now() - Date.parse(t.at) > ttlMin * 60000) return null;
  return !mode || t.mode === mode ? t : null;
}

// ---------- align: kesepahaman objective sebelum plan ----------
// align.md: frontmatter `verdict: open|aligned`, `rounds: N`; tabel klaim `| C1 | klaim | bukti path:baris | status |`.
export const CLAIM_ROW = /^\|\s*C\d+\s*\|/;
export function readAlign(item) {
  const p = path.join(item.dir, 'align.md');
  if (!fs.existsSync(p)) return null;
  const { fm, body } = splitFrontmatter(fs.readFileSync(p, 'utf8'));
  return { fm, body, verdict: String(fm.verdict || 'open').toLowerCase(), rounds: Number(fm.rounds || 0), claims: body.split(/\r?\n/).filter((l) => CLAIM_ROW.test(l)).length,
    contradicted: body.split(/\r?\n/).filter((l) => CLAIM_ROW.test(l) && /bertentangan/i.test(l)).length };
}
export const alignExempt = (item, cfg) => isQuick(item) || !cfg.align.required || (cfg.align.exempt_types || []).includes(item.type);
export function alignProblems(item, cfg) {
  if (alignExempt(item, cfg)) return [];
  const a = readAlign(item);
  if (!a) return [`align.md belum ada: jalankan /harness:align ${item.slug} (klaim vs bukti kode), lalu user mengetik /harness:align ${item.slug} ok.`];
  if (a.verdict !== 'aligned') return [`align.md belum aligned (verdict: ${a.verdict}, ronde ${a.rounds}/${cfg.align.max_rounds}): user mengetik /harness:align ${item.slug} ok bila objective sudah sepaham.`];
  return [];
}

// Sidik jari keadaan kode saja (tanpa bukti/review): dipakai bukti test (.harness/evidence) untuk mendeteksi usang.
export function codeFingerprint(root, cfg, item) {
  const h = crypto.createHash('sha1');
  for (const sv of item.services) {
    const d = serviceDirOf(root, cfg, sv === '*' ? '' : sv);
    if (!fs.existsSync(path.join(d, '.git'))) { h.update(`${sv}:nogit`); continue; }
    h.update(worktreeHash(d));
  }
  return h.digest('hex').slice(0, 16);
}
export const evidenceDir = (root, slug) => path.join(root, '.harness', 'evidence', slug);
export function readEvidence(root, slug) { return readJson(path.join(evidenceDir(root, slug), 'tests.json'), null); }

// ---------- gerbang 2 ----------
export function checkDone(root, item, cfg) {
  const problems = [];
  const acs = parseAcs(item.body);
  if (!acs.length) problems.push('plan.md tidak punya acceptance criteria (format: "- AC1: ...").');
  const progressPath = path.join(item.dir, 'progress.md');
  if (!fs.existsSync(progressPath)) problems.push('progress.md belum ada.');
  else {
    const ev = new Map();
    for (const l of fs.readFileSync(progressPath, 'utf8').split(/\r?\n/)) {
      const m = AC_LINE.exec(l); if (m) ev.set(m[1], m[2]);
    }
    for (const ac of acs) {
      const e = ev.get(ac.id);
      if (!e || e.length < 8 || PLACEHOLDER.test(e.trim())) problems.push(`${ac.id}: belum ada catatan verifikasi di progress.md (output curl, langkah manual, atau hasil tes).`);
    }
  }
  const reviewPath = path.join(item.dir, 'review.md');
  if (isQuick(item)) {
    if (!asList(item.fm.files).length) problems.push('lajur quick: belum ada file yang diubah (files: kosong). Tidak ada yang perlu di-done.');
  } else if (!fs.existsSync(reviewPath)) problems.push('review.md belum ada.');
  else {
    const rv = fs.readFileSync(reviewPath, 'utf8');
    const { fm, body } = splitFrontmatter(rv);
    if (String(fm.verdict || '').toLowerCase() !== 'clean') problems.push('review.md: verdict harus "clean".');
    if (body.split(/\r?\n/).some((l) => /^\s*[-*]\s*\[ \]/.test(l) && /blocker/i.test(l))) problems.push('review.md masih punya BLOCKER yang belum dicentang.');
  }
  const testCmd = item.fm.test_command || cfg.gate.test_command;
  if (testCmd) {
    const r = spawnSync(testCmd, { shell: true, cwd: root, encoding: 'utf8', timeout: (cfg.gate.test_timeout_sec || 300) * 1000 });
    if (r.status !== 0) problems.push(`test_command gagal (exit ${r.status}): ${testCmd}\n${(r.stdout + r.stderr).slice(-600)}`);
  } else if (cfg.gate.test_required) problems.push('test_command wajib tetapi belum diset.');
  problems.push(...gateProblems(root, cfg, item));
  return problems;
}

// Menjalankan CLI lewat shell di Windows (agar claude.cmd/gh.cmd ikut ter-resolve). Argumen dijaga ketat dan
// digabung menjadi satu string perintah: `spawn(cmd, args, {shell:true})` memicu DEP0190 di Node 24.
export function runCli(cmd, args, opts = {}) {
  if (process.platform !== 'win32') return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (args.some((a) => /[\s&|<>^"%'`;()]/.test(String(a)))) return { status: 1, stdout: '', stderr: 'argumen mengandung karakter terlarang', error: new Error('argumen tidak aman') };
  return spawnSync([cmd, ...args].join(' '), { encoding: 'utf8', ...opts, shell: true });
}
export const ghRun = (args, cwd, timeout = 45000) => runCli('gh', args, { cwd, timeout });
export function checkMerged(item) {
  const prs = asList(item.fm.pr);
  if (!prs.length) return ['frontmatter plan.md belum punya "pr:" (URL PR).'];
  const problems = [];
  for (const pr of prs) {
    const r = ghRun(['pr', 'view', pr, '--json', 'state', '-q', '.state'], undefined, 30000);
    if (r.error || r.status !== 0) problems.push(`tidak bisa memeriksa ${pr} lewat gh (${(r.stderr || r.error?.message || '').trim().slice(0, 200)}).`);
    else if (r.stdout.trim() !== 'MERGED') problems.push(`${pr} berstatus ${r.stdout.trim()}, belum MERGED.`);
  }
  return problems;
}

export const isQuick = (item) => String(item.fm?.lane || '') === 'quick';
// transisi yang boleh dilakukan agent. 'approved' hanya lewat manusia (hook prompt / CLI approve).
// Lajur quick tidak punya in-review (tanpa review subagent): gerbang pengiriman + checks yang menggantikannya.
const QUICK_TRANSITIONS = {
  'approved>in-progress': null,
  'approved>done': 'done',
  'in-progress>done': 'done',
  'done>in-progress': null,
  'done>merged': 'merged',
};
const AGENT_TRANSITIONS = {
  'approved>in-progress': null,
  'in-progress>in-review': 'progress',
  'in-review>in-progress': null,
  'in-review>done': 'done',
  'done>in-progress': null,
  'done>merged': 'merged',
};
export function checkTransition(root, cfg, item, to, { actor = 'agent' } = {}) {
  const from = item.status;
  if (from === to) return [];
  if (!STATUSES.includes(to)) return [`status "${to}" tidak dikenal. Pilihan: ${STATUSES.join(', ')}.`];
  if (to === 'approved') {
    if (actor !== 'human') return ['status "approved" hanya boleh diberikan manusia: ketik /harness:approve <slug> di prompt (atau "! node .claude/hooks/harness.mjs approve <slug>").'];
    if (from !== 'draft') return [`approve hanya dari draft (sekarang: ${from}).`];
    const p = [];
    if (!parseAcs(item.body).length) p.push('plan.md belum punya acceptance criteria ("- AC1: ...").');
    if (!item.services.length) p.push('frontmatter plan.md belum punya "services: [..]".');
    p.push(...alignProblems(item, cfg));
    return p;
  }
  if (to === 'draft') return []; // reopen: wajib approve ulang
  const key = `${from}>${to}`;
  const table = isQuick(item) ? QUICK_TRANSITIONS : AGENT_TRANSITIONS;
  if (!(key in table)) return [isQuick(item)
    ? `transisi ${from} → ${to} tidak diizinkan untuk lajur quick. Alur: approved → in-progress → done → merged (tanpa in-review).`
    : `transisi ${from} → ${to} tidak diizinkan. Alur: draft → approved → in-progress → in-review → done → merged.`];
  const need = table[key];
  if (need === 'progress' && !fs.existsSync(path.join(item.dir, 'progress.md'))) return ['progress.md belum ada.'];
  if (need === 'done') return checkDone(root, item, cfg);
  if (need === 'merged') return checkMerged(item);
  return [];
}

export function coversService(item, svc) {
  return item.services.includes('*') || item.services.includes(svc);
}
export function activeItems(root) {
  return listItems(root).filter((i) => i.status === 'approved' || i.status === 'in-progress');
}

// ---------- path -> service ----------
export function serviceOf(cfg, rel) {
  if (cfg.layout === 'multi-repo') {
    const pre = posix(cfg.services_dir).replace(/\/$/, '') + '/';
    if (!rel.startsWith(pre)) return null;
    const svc = rel.slice(pre.length).split('/')[0];
    return svc || null;
  }
  if (matchAny(cfg.allow_paths, rel) || rel.startsWith('.git/') || rel.startsWith('.claude/')) return null;
  return '*';
}

// ---------- secret scan ----------
export const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['API key (sk-)', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const GENERIC = /(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;
const BENIGN = /(process\.env|os\.getenv|getenv\(|\$\{|<[^>]+>|example|changeme|placeholder|your[_-]|xxxx|\*{4,}|harness:allow-secret)/i;
export function findSecret(text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (/harness:allow-secret/.test(line)) continue;
    for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) return name;
    const g = GENERIC.exec(line);
    if (g && !BENIGN.test(line)) return `kredensial literal (${g[1]})`;
  }
  return null;
}
export function redact(text) {
  let t = String(text);
  for (const [, re] of SECRET_PATTERNS) t = t.replace(new RegExp(re.source, 'g'), '[REDACTED]');
  return t.replace(new RegExp(GENERIC.source, 'gi'), (m) => m.replace(/(["'])[^"'\s]{12,}\1/, '"[REDACTED]"'));
}
export const SECRET_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|[^/]*\.pem|[^/]*\.p12|[^/]*\.pfx|id_(rsa|ed25519|ecdsa)|credentials(\.json)?|\.npmrc|\.netrc)$/;

// ---------- audit + event log ----------
// audit(): jejak lengkap per hari (.claude/audit/*.jsonl). Event bermakna (bukan tiap tool call) juga masuk .harness/events.jsonl
// yang dibaca `harness log` dan `harness watch`. Keduanya di-redact dan tidak pernah menjatuhkan hook.
const NOISY_EVENTS = new Set(['PostToolUse', 'InstructionsLoaded']);
export const eventsPath = (root) => path.join(root, '.harness', 'events.jsonl');
export function emit(root, rec) {
  if (process.env.HARNESS_BENCH) return;
  try {
    const f = eventsPath(root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 1_000_000) fs.renameSync(f, f + '.1'); } catch { /* belum ada */ }
    const out = { ...rec };
    for (const k of Object.keys(out)) if (typeof out[k] === 'string') out[k] = redact(out[k]).slice(0, 300);
    fs.appendFileSync(f, JSON.stringify(out) + '\n');
  } catch { /* event log tidak boleh menjatuhkan hook */ }
}
export function readEvents(root, n = 15) {
  try { return fs.readFileSync(eventsPath(root), 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
export function audit(root, entry) {
  if (process.env.HARNESS_BENCH) return;
  try {
    const dir = path.join(root, '.claude', 'audit');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    const rec = { ts, ...entry };
    for (const k of Object.keys(rec)) if (typeof rec[k] === 'string') rec[k] = redact(rec[k]).slice(0, 400);
    fs.appendFileSync(path.join(dir, ts.slice(0, 10) + '.jsonl'), JSON.stringify(rec) + '\n');
    if (!NOISY_EVENTS.has(entry.event)) emit(root, { ts, event: entry.event, slug: entry.slug, by: entry.by, to: entry.to, from: entry.from, tool: entry.tool, reason: entry.reason });
  } catch { /* audit tidak boleh menjatuhkan hook */ }
}

// ---------- output helper ----------
export function deny(root, payload, reason, extra = {}) {
  audit(root, { event: 'deny', hook: payload.hook_event_name, session: payload.session_id, tool: payload.tool_name,
    target: payload.tool_input?.file_path || payload.tool_input?.command, reason, ...extra });
  process.stderr.write(`[harness] DIBLOKIR: ${reason}\n`);
  process.exit(2);
}
export function context(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

// ---------- peringatan ambang konteks (dipakai post.mjs dan prompt.mjs) ----------
export function contextWarning(root, cfg, payload) {
  const tp = payload.transcript_path;
  if (!tp || !fs.existsSync(tp)) return null;
  const stateDir = path.join(root, '.claude', 'state');
  const mark = path.join(stateDir, `ctx-${String(payload.session_id || 'x').replace(/\W/g, '')}.json`);
  const size = fs.statSync(tp).size;
  const fd = fs.openSync(tp, 'r');
  const len = Math.min(size, 262144);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').reverse();
  let tokens = 0;
  for (const l of lines) {
    if (!l.includes('"usage"')) continue;
    try {
      const u = JSON.parse(l)?.message?.usage;
      if (u) { tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); break; }
    } catch { /* baris terpotong */ }
  }
  if (tokens < cfg.context.warn_tokens) return null;
  const prev = (() => { try { return JSON.parse(fs.readFileSync(mark, 'utf8')); } catch { return {}; } })();
  if (prev.warned && tokens - prev.warned < 100000) return null;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ warned: tokens }));
  return `[harness] Konteks sesi ±${Math.round(tokens / 1000)}k token (ambang ${Math.round(cfg.context.warn_tokens / 1000)}k dari ${Math.round(cfg.context.window_tokens / 1000)}k). ` +
    'Segera: tulis status terkini ke progress.md (apa selesai, apa berikutnya, keputusan), selesaikan langkah yang sedang jalan, lalu sarankan user membuka sesi baru dan melanjutkan dengan /harness:build <slug>.';
}

// ---------- langkah berikutnya (untuk /harness:next dan pesan blokir) ----------
function alignNext(item, cfg) {
  const sl = item.slug;
  const hasPlan = parseAcs(item.body).length > 0;
  const a = readAlign(item);
  const needAlign = cfg ? alignProblems(item, cfg).length > 0 : !a || a.verdict !== 'aligned';
  if (needAlign) return a && a.claims > 0 ? ['kamu', `jawab temuan di align.md; sepaham → ketik /harness:align ${sl} ok`] : ['agent', `/harness:align ${sl}`];
  if (!hasPlan) return ['agent', `/harness:plan ${sl}`];
  return ['kamu', `tinjau plan.md; bila setuju ketik /harness:approve ${sl}`];
}
export function nextStep(item, cfg = null) {
  const sl = item.slug;
  const q = isQuick(item);
  const rows = {
    draft: q ? ['kamu', `/harness:plan ${sl}, lalu /harness:approve ${sl} (item quick dipromosikan ke standard)`] : alignNext(item, cfg),
    approved: q ? ['agent', `kerjakan di sesi ini; bukti per AC di progress.md; lalu set-status ${sl} done`] : ['kamu', `buka sesi baru, ketik /harness:build ${sl}`],
    'in-progress': q ? ['agent', `lengkapi bukti AC di progress.md; set-status ${sl} done`] : ['agent', `lanjut /harness:build ${sl}; semua AC berbukti → set-status ${sl} in-review`],
    'in-review': ['agent', `/harness:review ${sl}`],
    done: asList(item.fm.pr).length ? ['kamu', `tunggu check PR hijau, lalu ketik /harness:ship ${sl} (= keputusan merge)`] : ['kamu', `ketik /harness:ship ${sl} (buka PR)`],
    merged: ['-', 'selesai'],
  };
  const [who, cmd] = rows[item.status] || ['?', `status "${item.status}" tidak dikenal`];
  return { who, cmd };
}

// ---------- lajur quick: dibuat hook dari ketikan manusia ----------
const slugify = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'item';
export function createQuick(root, text, who) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 8) return { ok: false, reason: 'uraikan permintaan (minimal 8 karakter): apa yang harus berubah dan bagaimana dibuktikan.' };
  const m = /^(hotfix|improvement)\s+(.+)$/i.exec(raw);
  const type = m ? m[1].toLowerCase() : 'hotfix';
  const body = (m ? m[2] : raw).slice(0, 240);
  const day = new Date().toISOString().slice(0, 10);
  let slug = `${day}-${slugify(body.split(' ').slice(0, 7).join(' '))}`;
  for (let n = 2; fs.existsSync(path.join(workDir(root), slug)); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`;
  const dir = path.join(workDir(root), slug);
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const title = body.slice(0, 80);
  fs.writeFileSync(path.join(dir, 'plan.md'), `---\ntitle: ${title.replace(/:/g, ' -')}\ntype: ${type}\nlane: quick\nstatus: approved\nservices: []\nfiles: []\ncreated: ${day}\nupdated: ${day}\napproved_at: ${now}\napproved_by: ${who}\ntest_command: null\npr: null\n---\n# Plan (quick) — ${title}\n\nLajur quick: satu service (terikat pada edit pertama), maksimal file sesuai config, bukan skema, tanpa review subagent.\n\n## Acceptance criteria\n- AC1: ${body}\n`);
  fs.writeFileSync(path.join(dir, 'progress.md'), `# Progress — ${title}\n\n## Verifikasi\n- AC1:\n\n## Status terkini\n- dibuat oleh /harness:quick (${day})\n`);
  return { ok: true, slug, type };
}

// ---------- amend: tambahan AC kecil tanpa approve ulang ----------
export function amendItem(root, cfg, item, acText) {
  const text = String(acText || '').replace(/\s+/g, ' ').trim();
  if (!['approved', 'in-progress', 'in-review'].includes(item.status)) return { ok: false, reason: `amend hanya untuk item approved/in-progress/in-review (sekarang: ${item.status}). Item draft: edit plan langsung.` };
  if (text.length < 8 || text.length > 240) return { ok: false, reason: 'AC harus 8–240 karakter, satu kalimat yang bisa diverifikasi.' };
  const done = Number(item.fm.amendments || 0);
  if (done >= cfg.amend.max) return { ok: false, reason: `batas amend ${cfg.amend.max} tercapai. Perubahan lebih besar: "harness.mjs reopen ${item.slug}" lalu /harness:approve ulang.` };
  const ids = parseAcs(item.text).map((a) => Number(a.id.slice(2)));
  const id = `AC${Math.max(0, ...ids) + 1}`;
  let t = item.text;
  if (!/^## Amandemen\s*$/m.test(t)) t = t.replace(/\s*$/, '\n\n## Amandemen\nTambahan kecil setelah approve (hanya menambah AC; tidak mengubah service, skema, atau AC yang ada).\n');
  t = t.replace(/\s*$/, `\n- ${id}: ${text}\n`);
  t = setFmKey(t, 'amendments', done + 1);
  t = setFmKey(t, 'updated', new Date().toISOString().slice(0, 10));
  fs.writeFileSync(item.planPath, t);
  audit(root, { event: 'amend', slug: item.slug, ac: id });
  return { ok: true, id };
}
