// PreToolUse, keamanan saja: perintah destruktif, force push, commit/push di branch dilindungi, secret, env, token.
// Best-effort (regex), bukan sandbox. Exit 2 = blokir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readStdinJson, projectRoot, loadConfig, globToRegex, posix, deny, SECRET_FILE, isMain } from './lib.mjs';

// `git -C <dir>` atau `cd <dir> &&|;` di awal menentukan repo tempat git jalan.
export function gitDir(flat, cwd) {
  const strip = (d) => d.replace(/^["']|["']$/g, '');
  const c = /\bgit\s+-C\s+(\S+)/.exec(flat);
  if (c) return path.resolve(cwd, strip(c[1]));
  const d = /^\s*cd\s+(\S+)\s*(?:&&|;)/.exec(flat);
  return d ? path.resolve(cwd, strip(d[1])) : cwd;
}

function currentBranch(cwd) {
  const r = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
const isProtected = (cfg, b) => !!b && [cfg.root_branch, ...cfg.protected_branches].some((g) => globToRegex(g).test(b));

export function evaluateBash(root, cfg, payload) {
  const cmd = String(payload.tool_input?.command || '');
  const cwd = payload.cwd || root;
  const flat = cmd.replace(/\s+/g, ' ');
  const fail = (reason) => ({ ok: false, reason });

  for (const re of cfg.deny_commands) if (new RegExp(re, 'i').test(flat)) return fail(`perintah cocok dengan daftar larangan (${re}). Lakukan manual.`);
  if (/\bgit\s+(-C\s+\S+\s+)?reset\s+--hard\b/.test(flat) || /\bgit\s+(-C\s+\S+\s+)?clean\s+-[a-z]*f/.test(flat) || /\bgit\s+(-C\s+\S+\s+)?branch\s+-D\b/.test(flat)) return fail('git reset --hard / clean -f / branch -D dilarang. Minta user.');
  if (/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\.\.|\*|\.)(\s|$)/.test(flat)) return fail('rm rekursif pada root/home/parent/wildcard dilarang.');
  if (/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(flat)) return fail('pipe unduhan langsung ke shell dilarang.');
  if (/--no-verify\b/.test(flat) && /\bgit\b/.test(flat)) return fail('--no-verify dilarang.');

  if (/\bgit\b[^;&|]*\bpush\b/.test(flat)) {
    if (/(--force\b|--force-with-lease|\s-f(\s|$)|\s\+\S)/.test(flat.replace(/git\s+push/, 'git push '))) return fail('force push dilarang.');
    const t = /push\s+(?:-\S+\s+)*\S+\s+(?:\S+:)?(\S+)/.exec(flat);
    const named = t ? t[1].replace(/^refs\/heads\//, '') : null;
    if (named && isProtected(cfg, named)) return fail(`push langsung ke ${named} dilarang. Push branch kerja lalu buka PR.`);
    if (!named || named === 'HEAD') { const b = currentBranch(gitDir(flat, cwd)); if (isProtected(cfg, b)) return fail(`sedang di ${b}; push dari branch ini dilarang. Buat branch kerja.`); }
  }
  if (/\bgit\b[^;&|]*\bcommit\b/.test(flat)) {
    const dir = gitDir(flat, cwd);
    // Root (catatan di docs/) boleh commit di root_branch; yang dilindungi repo service.
    const isRoot = path.resolve(dir) === path.resolve(root);
    const b = currentBranch(dir);
    if (!isRoot && isProtected(cfg, b)) return fail(`commit langsung di ${b} dilarang. Buat branch kerja dulu.`);
  }

  const readRe = /\b(cat|less|more|head|tail|bat|grep|rg|awk|sed|cp|source|xxd|strings|base64|type|Get-Content|gc)\b[^|;&]*?(\S*\.env(\.[\w.-]+)?|\S+\.pem|\S*id_(rsa|ed25519)\S*)/g;
  for (const m of flat.matchAll(readRe)) {
    const f = m[2];
    if (SECRET_FILE.test(posix(f).replace(/^.*\//, '')) && !/\.(example|sample|template)$/.test(f)) return fail(`membaca ${f} (berkas rahasia) dilarang.`);
  }
  if (/\b(printenv|env)\s*(\||$|;)/.test(flat) || /\bcat\s+\/proc\/\S*environ/.test(flat) || /\bgh\s+auth\s+token\b(?![^|;&]*\))/.test(flat.replace(/\$\(\s*gh\s+auth\s+token[^)]*\)/g, '').replace(/\bgh\s+auth\s+token\b[^|;&>]*(?:&>|(?<![0-9])1?>)\s*(?:\/dev\/null|nul)\b/gi, ''))) {
    return fail('mencetak environment atau token dilarang. Token gh hanya boleh dipakai di dalam $(...) atau dibuang ke /dev/null, mis. GH_TOKEN="$(gh auth token --user <akun>)" gh pr create ..., atau gh auth token --user <akun> >/dev/null && echo ADA');
  }
  return { ok: true };
}

// Memori dan skill hasil belajar dimuat ke setiap sesi berikutnya: isinya tidak boleh membawa perintah tersembunyi atau secret.
const THREATS = [
  [/\b(ignore|disregard|forget)\b[^\n]{0,40}\b(previous|prior|above|all|semua|sebelumnya)\b[^\n]{0,40}\b(instruction|rule|aturan|instruksi)/i, 'perintah mengabaikan aturan'],
  [/\b(you are now|kamu sekarang adalah|act as|berpura-pura)\b/i, 'pengambilalihan peran'],
  [/\b(curl|wget|Invoke-WebRequest)\b[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD)/i, 'mengirim secret ke luar'],
  [/\b(ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'secret literal'],
  [/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/, 'karakter tak terlihat'],
];
const newText = (payload) => {
  const t = payload.tool_input || {};
  if (typeof t.content === 'string') return t.content;
  if (Array.isArray(t.edits)) return t.edits.map((e) => e.new_string || '').join('\n');
  return String(t.new_string || '');
};
// Isi berkas setelah Edit/Write, untuk memeriksa batas ukuran memori.
function resultText(file, payload) {
  const t = payload.tool_input || {};
  if (typeof t.content === 'string') return t.content;
  let cur = ''; try { cur = fs.readFileSync(file, 'utf8'); } catch { /* berkas baru */ }
  const edits = Array.isArray(t.edits) ? t.edits : [t];
  for (const e of edits) if (typeof e.old_string === 'string') cur = e.replace_all ? cur.split(e.old_string).join(e.new_string || '') : cur.replace(e.old_string, e.new_string || '');
  return cur;
}
const same = (a, b) => (process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));

export function evaluateEdit(root, payload, cfg = loadConfig(root), env = process.env) {
  const raw = payload.tool_input?.file_path || payload.tool_input?.notebook_path || '';
  const f = posix(raw);
  if (f && SECRET_FILE.test(f.replace(/^.*\//, '/').replace(/^\//, ''))) return { ok: false, reason: `menulis ${f} (berkas rahasia) dilarang.` };
  if (!raw) return { ok: true };
  const abs = path.resolve(root, raw);
  const rel = posix(path.relative(root, abs));
  const userMd = path.join(env.HARNESS_HOME || path.join(os.homedir(), '.harness'), 'USER.md');
  const isMemory = rel === 'docs/memory/MEMORY.md' || same(abs, userMd);
  const isSkill = /^\.claude\/skills\/[^/]+\//.test(rel);
  if (isSkill) {
    let owned = [];
    try { owned = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'harness.manifest.json'), 'utf8')).files || []; } catch { /* belum terpasang */ }
    const dir = rel.split('/').slice(0, 3).join('/') + '/';
    if (owned.some((o) => o.startsWith(dir))) return { ok: false, reason: `${dir} adalah skill bawaan harness (ditimpa saat update). Buat skill baru dengan nama lain di .claude/skills/.` };
  }
  if (!isMemory && !isSkill) return { ok: true };
  const text = newText(payload);
  for (const [re, why] of THREATS) if (re.test(text)) return { ok: false, reason: `isi ditolak (${why}): memori dan skill dimuat ke sesi berikutnya. Tulis ulang tanpa itu.` };
  if (isMemory) {
    const limit = same(abs, userMd) ? Number(cfg.learn?.user_chars) || 1500 : Number(cfg.learn?.memory_chars) || 3000;
    const len = resultText(abs, payload).length;
    if (len > limit) return { ok: false, reason: `${path.basename(abs)} akan jadi ${len}/${limit} karakter. Gabungkan atau hapus baris usang dulu, lalu ulangi.` };
  }
  return { ok: true };
}

if (isMain(import.meta.url)) {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  const tool = String(payload.tool_name || '');
  const r = /^(Bash|PowerShell)$/.test(tool) ? evaluateBash(root, loadConfig(root), payload) : evaluateEdit(root, payload, loadConfig(root));
  if (!r.ok) deny(r.reason);
  process.exit(0);
}
