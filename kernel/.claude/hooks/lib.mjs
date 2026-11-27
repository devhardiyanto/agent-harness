// Harness 2.x: pustaka bersama hook dan CLI. Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CONFIG = {
  harness_version: '2.1.1',
  project: '',
  root_branch: 'main',
  layout: 'multi-repo', // 'multi-repo' (services_dir berisi repo git) | 'single'
  services_dir: 'source-code',
  services: [],
  protected_branches: ['main', 'master', 'develop', 'production', 'staging', 'release/*'],
  deny_commands: [
    'npm\\s+publish', 'terraform\\s+(apply|destroy)', 'kubectl\\s+(delete|drain)', 'docker\\s+push',
    '\\bDROP\\s+(TABLE|DATABASE|SCHEMA)\\b', '\\bTRUNCATE\\s+TABLE\\b', 'gh\\s+repo\\s+delete', 'gh\\s+pr\\s+merge',
  ],
  // Root memakai akun gh aktif; services = pengecualian per service.
  git: { host: 'github.com', default_account: null, services: {} },
  remap: { legacy_months: 2 },
  tui: { statusline: true, theme: 'kapsul', max_width: 120 }, // kapsul | tenang | kontras | mono
  knowledge_check: { stale_commits: 30 },
  learn: { memory_chars: 3000, user_chars: 1500, skill_unused_days: 60 },
  update: { autoPush: false },
};

const NESTED = ['git', 'remap', 'tui', 'update', 'knowledge_check', 'learn'];

// True bila modul dijalankan sebagai skrip. Gagal membandingkan = anggap skrip (gerbang tetap berlaku).
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try { const real = fs.realpathSync.native || fs.realpathSync; return real(fileURLToPath(metaUrl)) === real(argv1); } catch { return true; }
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
  for (const k of NESTED) cfg[k] = { ...DEFAULT_CONFIG[k], ...(user[k] || {}) };
  if (!Array.isArray(cfg.services)) cfg.services = [];
  if (!Array.isArray(cfg.protected_branches)) cfg.protected_branches = DEFAULT_CONFIG.protected_branches;
  if (!Array.isArray(cfg.deny_commands)) cfg.deny_commands = DEFAULT_CONFIG.deny_commands;
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

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const SECRET_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|[^/]*\.pem|[^/]*\.p12|[^/]*\.pfx|id_(rsa|ed25519|ecdsa)|credentials(\.json)?|\.npmrc|\.netrc)$/;

export function deny(reason) {
  process.stderr.write(`[harness] DIBLOKIR: ${reason}\n`);
  process.exit(2);
}

// Slug pendek dari judul: huruf kecil, tanda hubung, tanpa kata pengisi, maks 48 karakter.
const FILLER = new Set(['tolong', 'oke', 'ok', 'aku', 'ingin', 'kamu', 'yang', 'dan', 'di', 'ke', 'untuk', 'dong', 'ya', 'nya', 'ini', 'itu', 'mau', 'bisa', 'please', 'the', 'a']);
export function slugify(s) {
  const words = String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w && !FILLER.has(w));
  let out = '';
  for (const w of words) { const next = out ? `${out}-${w}` : w; if (next.length > 48) break; out = next; }
  return out || 'topik';
}

export const today = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
