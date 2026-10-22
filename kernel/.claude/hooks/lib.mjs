// Harness v1 — pustaka bersama untuk hook dan CLI. Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['draft', 'approved', 'in-progress', 'in-review', 'done', 'merged'];

export const DEFAULT_CONFIG = {
  harness_version: '1.1.0',
  project: '',
  root_branch: 'main',
  layout: 'multi-repo', // 'multi-repo' (services_dir berisi repo git) | 'single' (satu repo)
  services_dir: 'source-code',
  services: [],
  // 'single': semua path di luar allow_paths dianggap kode dan di-gate
  allow_paths: ['docs/**', '.claude/rules/**', '.claude/audit/**', 'AGENTS.md', 'CLAUDE.md', '.gitignore'],
  // .agents/** dan scripts/executor/** = modul executor opsional (aman bila tidak terpasang)
  protected_paths: ['.claude/hooks/**', '.claude/settings.json', '.claude/agents/**', 'harness.config.json', '.agents/**', 'scripts/executor/**'],
  schema_paths: ['**/migrations/**', '**/migration/**', '**/*.sql', '**/schema.prisma'],
  protected_branches: ['main', 'master', 'develop', 'release/*'],
  deny_commands: [
    'npm\\s+publish', 'terraform\\s+(apply|destroy)', 'kubectl\\s+(delete|drain)', 'docker\\s+push',
    '\\bDROP\\s+(TABLE|DATABASE|SCHEMA)\\b', '\\bTRUNCATE\\s+TABLE\\b', 'gh\\s+pr\\s+merge', 'gh\\s+repo\\s+delete',
  ],
  gate: { test_command: null, test_required: false, test_timeout_sec: 300 },
  context: { window_tokens: 1000000, warn_tokens: 400000 },
  plane: { enabled: false, project_id: null, workspace: null },
  graphify: { enabled: false, version: null }, // opsional; aktif hanya setelah uji terukur (lihat plugin/skills/init)
  knowledge: { summary_max_lines: 80, patterns_max_lines: 150, stale_warn_commits: 15 },
  baseline: {}, // override per service: { "ce-api": "production" } (bawaan: origin/HEAD → production → main → master)
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
  for (const k of ['gate', 'context', 'plane', 'graphify', 'knowledge']) cfg[k] = { ...DEFAULT_CONFIG[k], ...(user[k] || {}) };
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
  if (!fs.existsSync(reviewPath)) problems.push('review.md belum ada.');
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
  return problems;
}

export function checkMerged(item) {
  const prs = asList(item.fm.pr);
  if (!prs.length) return ['frontmatter plan.md belum punya "pr:" (URL PR).'];
  const problems = [];
  for (const pr of prs) {
    const r = spawnSync('gh', ['pr', 'view', pr, '--json', 'state', '-q', '.state'], { encoding: 'utf8', timeout: 30000 });
    if (r.error || r.status !== 0) problems.push(`tidak bisa memeriksa ${pr} lewat gh (${(r.stderr || r.error?.message || '').trim().slice(0, 200)}).`);
    else if (r.stdout.trim() !== 'MERGED') problems.push(`${pr} berstatus ${r.stdout.trim()}, belum MERGED.`);
  }
  return problems;
}

// transisi yang boleh dilakukan agent. 'approved' hanya lewat manusia (hook prompt / CLI approve).
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
    return p;
  }
  if (to === 'draft') return []; // reopen: wajib approve ulang
  const key = `${from}>${to}`;
  if (!(key in AGENT_TRANSITIONS)) return [`transisi ${from} → ${to} tidak diizinkan. Alur: draft → approved → in-progress → in-review → done → merged.`];
  const need = AGENT_TRANSITIONS[key];
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

// ---------- audit ----------
export function audit(root, entry) {
  try {
    const dir = path.join(root, '.claude', 'audit');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    const rec = { ts, ...entry };
    for (const k of Object.keys(rec)) if (typeof rec[k] === 'string') rec[k] = redact(rec[k]).slice(0, 400);
    fs.appendFileSync(path.join(dir, ts.slice(0, 10) + '.jsonl'), JSON.stringify(rec) + '\n');
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
