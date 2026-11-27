// PreToolUse, keamanan saja: perintah destruktif, force push, commit/push di branch dilindungi, secret, env, token.
// Best-effort (regex), bukan sandbox. Exit 2 = blokir.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readStdinJson, projectRoot, loadConfig, globToRegex, posix, deny, SECRET_FILE, isMain } from './lib.mjs';

// Path dari perintah shell ke path OS: Git Bash `/c/x` → `C:/x`, `~` → home.
export function nativePath(p, platform = process.platform) {
  let x = String(p);
  if (x === '~' || x.startsWith('~/')) x = path.join(os.homedir(), x.slice(1));
  else if (/^\$\{?HOME\}?(\/|$)/.test(x)) x = path.join(os.homedir(), x.replace(/^\$\{?HOME\}?/, ''));
  if (platform === 'win32') { const m = /^\/([a-zA-Z])(\/.*)?$/.exec(x); if (m) x = `${m[1].toUpperCase()}:${m[2] || '/'}`; }
  return x;
}

// Pecah perintah menjadi segmen (&&, ||, ;, |, &, baris baru, subshell), menghormati kutip. `2>&1` dan `&>` bukan pemisah.
export function segments(cmd) {
  const out = []; let cur = ''; let q = null;
  const s = String(cmd);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '\\' && i + 1 < s.length) { cur += c + s[++i]; continue; }
    const amp = c === '&' && (s[i - 1] === '>' || s[i + 1] === '>');
    if (!amp && (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')')) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Kata dalam satu segmen, kutip dibuang. Awalan VAR=x, sudo, command, exec, time dilewati.
export function words(seg) {
  const out = []; let cur = ''; let q = null; let has = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
    cur += c;
  }
  if (cur || has) out.push(cur);
  while (out.length && (/^[A-Za-z_]\w*=/.test(out[0]) || ['sudo', 'command', 'exec', 'time', 'nohup'].includes(out[0]))) out.shift();
  return out;
}

// Perintah git di satu segmen: direktori kerja (-C), subcommand, argumen.
function gitCall(w, cwd, platform) {
  if (w[0] !== 'git') return null;
  let dir = cwd; let i = 1;
  for (; i < w.length; i++) {
    if (w[i] === '-C') { dir = path.resolve(dir, nativePath(w[++i] || '.', platform)); continue; }
    if (w[i] === '-c' || w[i] === '--git-dir' || w[i] === '--work-tree') { i++; continue; }
    if (w[i].startsWith('-')) continue;
    break;
  }
  return { dir, sub: w[i] || '', args: w.slice(i + 1) };
}

function currentBranch(cwd) {
  const r = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
const isProtected = (cfg, b) => !!b && [cfg.root_branch, ...cfg.protected_branches].some((g) => globToRegex(g).test(b));
const shortFlag = (a, ch) => /^-[a-zA-Z]+$/.test(a) && a.includes(ch);
const DANGER_RM = new Set(['/', '/*', '~', '~/', '~/*', '$HOME', '$HOME/', '$HOME/*', '${HOME}', '..', '../', '../*', '.', './', './*', '*']);
const MEMORY_PATH = /(^|[\\/])(docs[\\/]+memory[\\/]+MEMORY\.md|\.harness[\\/]+USER\.md)$/i;

function checkGit(g, cfg, root, flagsAll) {
  const { dir, sub, args } = g;
  if (args.includes('--no-verify') || flagsAll.includes('--no-verify')) return 'git --no-verify dilarang.';
  if (sub === 'reset' && args.includes('--hard')) return 'git reset --hard dilarang. Minta user.';
  if (sub === 'clean' && args.some((a) => a === '--force' || shortFlag(a, 'f'))) return 'git clean -f dilarang. Minta user.';
  if (sub === 'branch' && (args.some((a) => shortFlag(a, 'D')) || (args.includes('--delete') && args.includes('--force')))) return 'git branch -D dilarang. Minta user.';
  if (sub === 'push') {
    if (args.some((a) => a === '--force' || a.startsWith('--force-with-lease') || a === '--force-if-includes' || shortFlag(a, 'f'))) return 'force push dilarang.';
    if (args.includes('--all') || args.includes('--mirror')) return 'push semua branch (--all/--mirror) dilarang. Push branch kerja saja.';
    const pos = []; for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === '-o' || a === '--push-option' || a === '--repo') { i++; continue; } if (!a.startsWith('-')) pos.push(a); }
    const refs = pos.slice(1);
    if (refs.some((r) => r.startsWith('+'))) return 'force push (+refspec) dilarang.';
    for (const r of refs) {
      const dst = (r.includes(':') ? r.slice(r.indexOf(':') + 1) : r).replace(/^refs\/heads\//, '');
      if (dst === 'HEAD' || !dst) continue;
      if (isProtected(cfg, dst)) return r.startsWith(':') ? `menghapus branch ${dst} di remote dilarang.` : `push langsung ke ${dst} dilarang. Push branch kerja lalu buka PR.`;
    }
    if (!refs.length || refs.includes('HEAD')) {
      const b = currentBranch(dir);
      if (isProtected(cfg, b)) return `sedang di ${b}; push dari branch ini dilarang. Buat branch kerja.`;
    }
  }
  if (sub === 'commit') {
    // Root (catatan di docs/) boleh commit di root_branch; yang dilindungi repo service.
    const isRoot = path.resolve(dir) === path.resolve(root);
    const b = currentBranch(dir);
    if (!isRoot && isProtected(cfg, b)) return `commit langsung di ${b} dilarang. Buat branch kerja dulu.`;
  }
  return null;
}

export function evaluateBash(root, cfg, payload, { platform = process.platform } = {}) {
  const cmd = String(payload.tool_input?.command || '');
  let cwd = payload.cwd || root;
  const flat = cmd.replace(/\s+/g, ' ');
  const fail = (reason) => ({ ok: false, reason });

  for (const re of cfg.deny_commands) {
    let rx; try { rx = new RegExp(re, 'i'); } catch { continue; } // pola rusak dilewati (doctor melaporkannya)
    if (rx.test(flat)) return fail(`perintah cocok dengan daftar larangan (${re}). Lakukan manual.`);
  }
  if (/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(flat)) return fail('pipe unduhan langsung ke shell dilarang.');

  for (const seg of segments(cmd)) {
    const w = words(seg);
    if (!w.length) continue;
    if ((w[0] === 'cd' || w[0] === 'pushd') && w[1] && !w[1].startsWith('-')) { cwd = path.resolve(cwd, nativePath(w[1], platform)); continue; }
    if (w[0] === 'rm') {
      const flags = w.slice(1).filter((a) => a.startsWith('-'));
      const rec = flags.some((a) => a === '--recursive' || a === '--force' || shortFlag(a, 'r') || shortFlag(a, 'R') || shortFlag(a, 'f'));
      if (rec && w.slice(1).some((a) => DANGER_RM.has(a))) return fail('rm rekursif pada root/home/parent/wildcard dilarang.');
    }
    if (/(^|\s)(>>?|tee(\s+-a)?|sed\s+-i\S*)\s*\S*/.test(seg) && w.some((a) => MEMORY_PATH.test(a.replace(/^>+/, '')))) return fail('memori ditulis lewat Edit/Write (dicek batas dan isinya), bukan lewat shell.');
    const g = gitCall(w, cwd, platform);
    if (g) { const why = checkGit(g, cfg, root, w); if (why) return fail(why); }
  }

  const readRe = /\b(cat|less|more|head|tail|bat|grep|rg|awk|sed|cp|source|xxd|strings|base64|type|Get-Content|gc)\b[^|;&]*?(\S*\.env(\.[\w.-]+)?|\S+\.pem|\S*id_(rsa|ed25519)\S*)/g;
  for (const m of flat.matchAll(readRe)) {
    const f = m[2];
    if (SECRET_FILE.test(posix(f).replace(/^.*\//, '')) && !/\.(example|sample|template)$/.test(f)) return fail(`membaca ${f} (berkas rahasia) dilarang.`);
  }
  // Token gh boleh hanya sebagai nilai variabel (VAR="$(gh auth token …)") atau dibuang ke /dev/null.
  const tok = flat
    .replace(/\b[A-Za-z_]\w*=(["']?)\$\(\s*gh\s+auth\s+token[^)]*\)\1/g, '')
    .replace(/\bgh\s+auth\s+token\b[^|;&>]*(?:&>|(?<![0-9])1?>)\s*(?:\/dev\/null|nul)\b/gi, '');
  if (/\b(printenv|env)\s*(\||$|;)/.test(flat) || /\bcat\s+\/proc\/\S*environ/.test(flat) || /\bgh\s+auth\s+token\b/.test(tok) || /\b(echo|printf)\b[^|;&]*\$\{?(GH_TOKEN|GITHUB_TOKEN)\b/.test(flat)) {
    return fail('mencetak environment atau token dilarang. Token gh hanya boleh jadi nilai variabel, mis. GH_TOKEN="$(gh auth token --user <akun>)" gh pr create ..., atau dibuang: gh auth token --user <akun> >/dev/null && echo ADA');
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
  const isMemory = same(abs, path.join(root, 'docs', 'memory', 'MEMORY.md')) || same(abs, userMd);
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
