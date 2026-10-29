// Harness v1 — pengetahuan (L0–L3): baseline, worktree, lint, kedaluwarsa, verifikasi, usulan pola.
// Semua deterministik dan TANPA token. Tanpa dependency; Node >= 18. Dipakai harness.mjs, session.mjs, prompt.mjs, gate.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { splitFrontmatter, setFmKey, readJson, posix, findSecret } from './lib.mjs';

const KD = { summary_max_lines: 80, patterns_max_lines: 150, stale_warn_commits: 15 };
export const knowledgeCfg = (cfg) => ({ ...KD, ...(cfg.knowledge || {}) });

const git = (cwd, args, timeout = 20000) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
const gout = (cwd, args, timeout) => { const r = git(cwd, args, timeout); return r.status === 0 ? r.stdout.trim() : null; };
const today = () => new Date().toISOString().slice(0, 10);
const trimEnd = (lines) => { const l = lines.slice(); while (l.length && !l[l.length - 1].trim()) l.pop(); return l; };

export const svcDir = (root, cfg, svc) => path.join(root, cfg.services_dir, svc);
export const knowDir = (root, svc) => path.join(root, 'docs', 'knowledge', svc);
export const isRepo = (dir) => fs.existsSync(path.join(dir, '.git'));
const SAFE_SVC = /^[\w][\w.-]*$/;

// ---------- deteksi stack / perintah (dari manifest) ----------
export function detectStack(read) {
  const parts = [];
  const pj = read('package.json');
  if (pj !== null) {
    let d = {}; try { const p = JSON.parse(pj); d = { ...p.dependencies, ...p.devDependencies }; } catch { /* abaikan */ }
    const fw = ['nuxt', 'next', 'vue', 'react', '@nestjs/core', 'hono', 'express', 'fastify', 'svelte'].filter((k) => d[k]);
    parts.push(`node${fw.length ? `(${fw.join('+')})` : ''}`);
  }
  const cj = read('composer.json');
  if (cj !== null) { let lv = false; try { lv = !!JSON.parse(cj).require?.['laravel/framework']; } catch { /* abaikan */ } parts.push(lv ? 'php(laravel)' : 'php'); }
  if (read('go.mod') !== null) parts.push('go');
  if (read('requirements.txt') !== null || read('pyproject.toml') !== null) parts.push('python');
  if (read('Gemfile') !== null) parts.push('ruby');
  if (read('Cargo.toml') !== null) parts.push('rust');
  if (read('Dockerfile') !== null) parts.push('docker');
  return parts.join(', ') || 'UNKNOWN';
}
// Perintah cek yang diusulkan untuk checks.<svc> (hanya usulan; config dilindungi, user yang menyalin).
export function proposeChecksFrom(read, exists) {
  const r = { lint: null, test: null, basis: [] };
  const pj = read('package.json');
  if (pj !== null) {
    let sc = {}; try { sc = JSON.parse(pj).scripts || {}; } catch { /* abaikan */ }
    const pm = exists('pnpm-lock.yaml') ? 'pnpm run' : exists('yarn.lock') ? 'yarn' : (exists('bun.lockb') || exists('bun.lock')) ? 'bun run' : 'npm run';
    const lint = ['lint', 'lint:check', 'typecheck', 'type-check'].find((k) => sc[k]);
    const test = ['test', 'test:unit'].find((k) => sc[k]);
    if (lint) { r.lint = `${pm} ${lint}`; r.basis.push(`package.json scripts.${lint}`); }
    if (test) { r.test = `${pm} ${test}`; r.basis.push(`package.json scripts.${test}`); }
  }
  const cj = read('composer.json');
  if (cj !== null && !r.test) {
    let sc = {}; try { sc = JSON.parse(cj).scripts || {}; } catch { /* abaikan */ }
    const lint = ['lint', 'cs', 'phpcs', 'pint', 'analyse', 'stan'].find((k) => sc[k]);
    if (!r.lint && lint) { r.lint = `composer run ${lint}`; r.basis.push(`composer.json scripts.${lint}`); }
    if (sc.test) { r.test = 'composer run test'; r.basis.push('composer.json scripts.test'); }
    else if (exists('artisan')) { r.test = 'php artisan test'; r.basis.push('artisan'); }
  }
  if (read('go.mod') !== null && !r.test) { r.lint = r.lint || 'go vet ./...'; r.test = 'go test ./...'; r.basis.push('go.mod'); }
  return r;
}

// ---------- baseline ----------
// Aturan: config.baseline[svc] → origin/HEAD → production → main → master. Remote-tracking (origin/<b>) didahulukan atas
// branch lokal (yang bisa berisi WIP atau tertinggal). Tanpa jaringan kecuali --fetch.
export function baselineOf(root, cfg, svc, { fetch = false } = {}) {
  const dir = svcDir(root, cfg, svc);
  const res = { service: svc, ok: false };
  if (!SAFE_SVC.test(svc)) return { ...res, note: 'nama service tidak valid' };
  if (!fs.existsSync(dir)) return { ...res, note: `${cfg.services_dir}/${svc} tidak ada` };
  if (!isRepo(dir)) return { ...res, note: 'bukan repo git' };
  const override = cfg.baseline && typeof cfg.baseline[svc] === 'string' ? cfg.baseline[svc] : null;
  const originHead = (gout(dir, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']) || '').replace(/^refs\/remotes\/origin\//, '');
  const cands = override ? [[override, 'config']] : [[originHead, 'origin/HEAD'], ['production', 'nama'], ['main', 'nama'], ['master', 'nama']].filter((c) => c[0]);
  for (const [b, why] of cands) {
    if (fetch) git(dir, ['fetch', '--quiet', 'origin', b], 60000);
    for (const ref of [`refs/remotes/origin/${b}`, `refs/heads/${b}`]) {
      const sha = gout(dir, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
      if (!sha) continue;
      const local = gout(dir, ['rev-parse', '--verify', '-q', `refs/heads/${b}^{commit}`]);
      const cur = gout(dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
      const dirty = !!gout(dir, ['status', '--porcelain', '--untracked-files=no']);
      return { service: svc, ok: true, branch: b, ref: ref.replace(/^refs\/(remotes|heads)\//, ''), sha, via: why, checkout: cur || '(detached)', on_baseline: cur === b, dirty,
        note: ref.startsWith('refs/remotes/') && local && local !== sha ? `branch lokal ${b} berbeda dari origin/${b}; baseline memakai origin/${b}` : '' };
    }
  }
  return { ...res, note: `branch baseline tidak ditemukan (dicoba: ${cands.map((c) => c[0]).join(', ') || '-'}); set "baseline": { "${svc}": "<branch>" } di harness.config.json` };
}

const wtPath = (root, svc) => path.join(root, '.claude', 'state', 'worktrees', svc);
export function worktreeAdd(root, cfg, svc) {
  const b = baselineOf(root, cfg, svc);
  if (!b.ok) return { ok: false, note: b.note };
  const dir = svcDir(root, cfg, svc); const wt = wtPath(root, svc);
  worktreeRm(root, cfg, svc);
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  const r = git(dir, ['worktree', 'add', '--detach', '--quiet', wt, b.sha], 120000);
  if (r.status !== 0) return { ok: false, note: `git worktree add gagal: ${(r.stderr || '').trim().slice(0, 300)}` };
  return { ok: true, path: posix(path.relative(root, wt)), sha: b.sha, ref: b.ref };
}
export function worktreeRm(root, cfg, svc) {
  const dir = svcDir(root, cfg, svc); const wt = wtPath(root, svc);
  if (isRepo(dir)) { git(dir, ['worktree', 'remove', '--force', wt]); git(dir, ['worktree', 'prune']); }
  fs.rmSync(wt, { recursive: true, force: true });
  return { ok: true };
}

// ---------- membaca isi repo pada commit tertentu ----------
function mkReader(dir) {
  const cache = new Map();
  return (ref, rel) => {
    const k = `${ref}:${rel}`;
    if (cache.has(k)) return cache.get(k);
    const r = git(dir, ['show', `${ref}:${rel}`], 20000);
    const v = r.status === 0 ? r.stdout : null;
    cache.set(k, v);
    return v;
  };
}

// ---------- sitasi path:baris ----------
const NOT_FILE_EXT = new Set(['com', 'net', 'org', 'io', 'dev', 'app', 'local', 'test', 'id', 'co', 'vn', 'ai', 'cloud', 'internal', 'lan']);
const SEG = String.raw`(?:\([\w.\-]+\)|[\w@.\-\[\]+~])+`; // segmen jalur; "(grup)" Next/Nuxt boleh, "(" liar tidak
const CITE = new RegExp(String.raw`(?<![\w/.:@-])((?:${SEG}\/)*${SEG}\.([A-Za-z0-9]{1,8})):(\d{1,6})(?:[-–](\d{1,6}))?(?:@([0-9a-f]{7,40}))?`, 'g');
const BACKTICK = /`([^`\n]+)`/g;
const WORD = /[A-Za-z_$][\w$]{2,}/g;

export function citationsOf(line) {
  const out = [];
  for (const m of line.matchAll(CITE)) {
    if (NOT_FILE_EXT.has(m[2].toLowerCase())) continue;
    out.push({ text: m[0], file: m[1].replace(/^\.\//, ''), from: +m[3], to: m[4] ? +m[4] : +m[3], sha: m[5] || null });
  }
  return out;
}

// Memeriksa semua sitasi pada `text`. Setiap sitasi harus: ada di ref, barisnya ada, dan simbol backtick sebaris ditemukan di sekitarnya.
export function checkCitations({ root, cfg, svc, text, defaultRef, read, fileLabel, lineOffset = 0 }) {
  const findings = []; const stats = { cites: 0, ok: 0 };
  const lines = text.split(/\r?\n/);
  const prefix = `${posix(cfg.services_dir)}/${svc}/`;
  lines.forEach((ln, i) => {
    const L = i + 1 + lineOffset;
    const cites = citationsOf(ln);
    if (!cites.length) return;
    const unknownLine = /\bUNKNOWN\b/.test(ln);
    // simbol yang diklaim: span backtick sebaris yang bukan sitasi/jalur/perintah
    const claims = [];
    for (const b of ln.matchAll(BACKTICK)) {
      const span = b[1].trim();
      if (/\s/.test(span) || /:\d+/.test(span) || /^[./\w@-]+\/[\w./@-]*\.\w+$/.test(span)) continue;
      const words = span.match(WORD) || [];
      if (words.length) claims.push({ span, words });
    }
    const wins = []; let valid = 0;
    for (const c of cites) {
      stats.cites++;
      const file = c.file.startsWith(prefix) ? c.file.slice(prefix.length) : c.file;
      const ref = c.sha || defaultRef;
      const label = `${fileLabel}:${L}`;
      const content = read(ref, file);
      if (content === null) { findings.push({ sev: 'ERROR', at: label, msg: `${c.text}: ${file} tidak ada di ${String(ref).slice(0, 8)}` }); continue; }
      const src = content.split(/\r?\n/);
      const total = src.length && !src[src.length - 1] ? src.length - 1 : src.length;
      if (c.from < 1 || c.from > total || c.to > total || c.to < c.from) { findings.push({ sev: 'ERROR', at: label, msg: `${c.text}: baris di luar file (${total} baris) pada ${String(ref).slice(0, 8)}` }); continue; }
      valid++;
      wins.push(src.slice(Math.max(0, c.from - 1 - 3), Math.min(src.length, c.to + 3)).join('\n'));
    }
    // klaim simbol lolos bila ditemukan di sekitar SALAH SATU sitasi pada baris itu
    let claimFail = false;
    if (!unknownLine && wins.length) {
      for (const cl of claims) {
        if (!wins.some((w) => cl.words.some((x) => w.includes(x)))) {
          findings.push({ sev: 'ERROR', at: `${fileLabel}:${L}`, msg: `${cites.map((c) => c.text).join(', ')}: simbol \`${cl.span}\` tidak ditemukan di baris yang dikutip (±3 baris)` });
          claimFail = true;
        }
      }
    }
    if (!claimFail) stats.ok += valid;
  });
  return { findings, stats };
}

// ---------- lint ----------
const FILES = ['summary.md', 'patterns.md'];
export function lintService(root, cfg, svc) {
  const k = knowledgeCfg(cfg);
  const findings = []; const info = { files: {}, unknown: 0, uncited: 0 };
  const add = (sev, at, msg) => findings.push({ sev, at, msg });
  const dir = svcDir(root, cfg, svc); const kd = knowDir(root, svc);
  if (!SAFE_SVC.test(svc)) { add('ERROR', svc, 'nama service tidak valid'); return finish(svc, findings, info); }
  if (!fs.existsSync(path.join(kd, 'summary.md'))) { add('ERROR', `docs/knowledge/${svc}/summary.md`, 'belum ada (jalankan /harness:init atau /harness:knowledge onboard)'); return finish(svc, findings, info); }
  if (!isRepo(dir)) { add('ERROR', `${cfg.services_dir}/${svc}`, 'bukan repo git: sitasi tidak bisa diperiksa'); return finish(svc, findings, info); }
  const read = mkReader(dir);
  for (const f of FILES) {
    const rel = `docs/knowledge/${svc}/${f}`; const p = path.join(kd, f);
    if (!fs.existsSync(p)) { if (f === 'patterns.md') add('WARN', rel, 'belum ada'); continue; }
    const text = fs.readFileSync(p, 'utf8');
    const { fm, body } = splitFrontmatter(text);
    const hdr = text.length - body.length; const offset = text.slice(0, hdr).split(/\r?\n/).length - 1;
    if (fm.service !== svc) add('ERROR', rel, `frontmatter service harus "${svc}" (ada: ${fm.service ?? 'kosong'})`);
    if (!/^[0-9a-f]{7,40}$/.test(String(fm.source_commit || ''))) add('ERROR', rel, 'frontmatter source_commit (hash commit) wajib');
    else if (git(dir, ['cat-file', '-e', `${fm.source_commit}^{commit}`]).status !== 0) add('ERROR', rel, `source_commit ${fm.source_commit} tidak ada di repo service`);
    if (!['draft', 'verified'].includes(String(fm.status))) add('ERROR', rel, 'frontmatter status harus draft|verified');
    if (!fm.updated) add('WARN', rel, 'frontmatter updated kosong');
    const lines = trimEnd(body.split(/\r?\n/));
    const cap = f === 'summary.md' ? k.summary_max_lines : k.patterns_max_lines;
    if (lines.length > cap) add('ERROR', rel, `${lines.length} baris melebihi batas ${cap}; ringkas (pindahkan rincian ke kode, bukan ke knowledge)`);
    const sec = findSecret(body);
    if (sec) add('ERROR', rel, `memuat ${sec}; knowledge hanya boleh berisi NAMA variabel`);
    const ref = /^[0-9a-f]{7,40}$/.test(String(fm.source_commit || '')) ? fm.source_commit : 'HEAD';
    const c = checkCitations({ root, cfg, svc, text: body, defaultRef: ref, read, fileLabel: rel, lineOffset: offset });
    findings.push(...c.findings);
    // sha non-baseline: info agar di-ground ulang saat refresh
    const pinned = [...body.matchAll(/:\d+(?:[-–]\d+)?@([0-9a-f]{7,40})/g)].length;
    if (pinned) add('INFO', rel, `${pinned} sitasi memakai @sha (dari work item); ground ulang ke source_commit saat /harness:knowledge refresh`);
    // jalur nyata di backtick (peringatan saja; mungkin artefak runtime/build)
    const seen = new Set();
    lines.forEach((ln, i) => {
      for (const b of ln.matchAll(BACKTICK)) {
        const span = b[1].trim();
        if (!/^[\w@./~-]+\/[\w@./~-]*\.[A-Za-z0-9]{1,8}$/.test(span) || /^https?:/.test(span) || seen.has(span)) continue;
        seen.add(span);
        if (read(ref, span.replace(/^\.\//, '')) === null) add('WARN', `${rel}:${i + 1 + offset}`, `jalur \`${span}\` tidak ada di ${ref.slice(0, 8)} (artefak runtime/build? atau salah)`);
      }
    });
    let unk = 0, unc = 0;
    for (const ln of lines) {
      if (/\bUNKNOWN\b/.test(ln)) unk++;
      if (f === 'summary.md' && /^\s*([-*]\s+|\|)/.test(ln) && !/^\s*\|[\s:|-]+\|?\s*$/.test(ln) && !citationsOf(ln).length && !/\bUNKNOWN\b|\?\s*$|\(\?\)/.test(ln) && ln.trim().length > 12) unc++;
    }
    info.unknown += unk; info.uncited += unc;
    info.files[f] = { lines: lines.length, cap, status: fm.status || null, cites: c.stats.cites, ok: c.stats.ok };
  }
  return finish(svc, findings, info);
}
function finish(svc, findings, info) {
  return { service: svc, findings, info, errors: findings.filter((f) => f.sev === 'ERROR').length, warns: findings.filter((f) => f.sev === 'WARN').length };
}
export function formatLint(results, { max = 40 } = {}) {
  const out = ['| service | status | sitasi valid | UNKNOWN | fakta tanpa sitasi | ERROR | WARN |', '|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const s = r.info.files['summary.md'];
    const cites = Object.values(r.info.files).reduce((a, f) => [a[0] + f.ok, a[1] + f.cites], [0, 0]);
    out.push(`| ${r.service} | ${s?.status ?? '-'} | ${cites[0]}/${cites[1]} | ${r.info.unknown} | ${r.info.uncited} | ${r.errors} | ${r.warns} |`);
  }
  const all = results.flatMap((r) => r.findings.filter((f) => f.sev !== 'INFO').map((f) => ({ ...f, svc: r.service })));
  all.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'ERROR' ? -1 : 1));
  if (all.length) {
    out.push('', '| tingkat | lokasi | temuan |', '|---|---|---|');
    for (const f of all.slice(0, max)) out.push(`| ${f.sev} | ${f.at} | ${f.msg} |`);
    if (all.length > max) out.push(`| … | | +${all.length - max} temuan lagi |`);
  }
  for (const r of results) for (const f of r.findings) if (f.sev === 'INFO') out.push(`\n(info ${r.service}) ${f.msg}`);
  return out.join('\n');
}

// ---------- sampel untuk verifikasi manusia ----------
// Memilih n sitasi secara deterministik (seed = source_commit) dan menampilkan klaim + potongan kode, agar manusia cukup memeriksa beberapa.
export function sampleService(root, cfg, svc, n = 6) {
  const dir = svcDir(root, cfg, svc); const read = mkReader(dir);
  const items = [];
  for (const f of FILES) {
    const p = path.join(knowDir(root, svc), f);
    if (!fs.existsSync(p)) continue;
    const { fm, body } = splitFrontmatter(fs.readFileSync(p, 'utf8'));
    const prefix = `${posix(cfg.services_dir)}/${svc}/`;
    trimEnd(body.split(/\r?\n/)).forEach((ln, i) => {
      for (const c of citationsOf(ln)) {
        const file = c.file.startsWith(prefix) ? c.file.slice(prefix.length) : c.file;
        const ref = c.sha || fm.source_commit;
        const content = read(ref, file);
        if (content === null) continue;
        const src = content.split(/\r?\n/);
        items.push({ f, claim: ln.trim().slice(0, 220), cite: c.text, code: src.slice(Math.max(0, c.from - 2), Math.min(src.length, c.to + 1)), key: crypto.createHash('sha1').update(`${fm.source_commit}|${f}|${i}|${c.text}`).digest('hex') });
      }
    });
  }
  items.sort((a, b) => (a.key < b.key ? -1 : 1));
  return items.slice(0, n);
}

// ---------- verifikasi (hanya manusia) ----------
export function verifyService(root, cfg, svc, by) {
  const r = lintService(root, cfg, svc);
  if (r.errors) return { ok: false, lint: r };
  const changed = [];
  for (const f of FILES) {
    const p = path.join(knowDir(root, svc), f);
    if (!fs.existsSync(p)) continue;
    let t = fs.readFileSync(p, 'utf8');
    t = setFmKey(t, 'status', 'verified'); t = setFmKey(t, 'verified_at', new Date().toISOString()); t = setFmKey(t, 'verified_by', by || 'unknown');
    fs.writeFileSync(p, t); changed.push(`docs/knowledge/${svc}/${f}`);
  }
  return { ok: true, lint: r, changed };
}

// ---------- kedaluwarsa (nol token) ----------
export function knowledgeStatus(root, cfg, svc) {
  const k = knowledgeCfg(cfg);
  const row = { service: svc, state: 'missing', status: null, behind: null, files: null, source_commit: null, baseline: null };
  const sp = path.join(knowDir(root, svc), 'summary.md');
  const b = baselineOf(root, cfg, svc);
  if (b.ok) row.baseline = `${b.ref}@${b.sha.slice(0, 8)}`;
  if (!fs.existsSync(sp)) { row.state = b.ok ? 'missing' : 'no-baseline'; return row; }
  const { fm } = splitFrontmatter(fs.readFileSync(sp, 'utf8'));
  row.status = fm.status || null; row.source_commit = fm.source_commit || null; row.updated = fm.updated || null;
  if (!b.ok) { row.state = 'no-baseline'; return row; }
  const dir = svcDir(root, cfg, svc);
  const sc = String(fm.source_commit || '');
  if (!/^[0-9a-f]{7,40}$/.test(sc) || git(dir, ['cat-file', '-e', `${sc}^{commit}`]).status !== 0) { row.state = 'unknown-commit'; return row; }
  const n = gout(dir, ['rev-list', '--count', `${sc}..${b.sha}`]);
  row.behind = n === null ? null : +n;
  if (row.behind) { const f = gout(dir, ['diff', '--name-only', `${sc}..${b.sha}`]); row.files = f ? f.split('\n').length : 0; }
  row.state = row.behind >= k.stale_warn_commits ? 'stale' : row.behind ? 'behind' : 'ok';
  return row;
}
export function knowledgeStatusAll(root, cfg) { return (cfg.services || []).map((s) => knowledgeStatus(root, cfg, s)); }

// ---------- inventaris ----------
export function inventory(root, cfg) {
  const dir = path.join(root, cfg.services_dir);
  const found = []; const skipped = [];
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      const p = path.join(dir, d.name);
      if (!isRepo(p)) { skipped.push(d.name); continue; }
      const b = baselineOf(root, cfg, d.name);
      const read = (f) => { const fp = path.join(p, f); try { return fs.readFileSync(fp, 'utf8'); } catch { return null; } };
      const rb = b.ok ? mkReader(p) : null;
      const readB = b.ok ? (f) => rb(b.sha, f) : read; // stack dari baseline bila ada
      found.push({ service: d.name, stack: detectStack(readB), in_config: (cfg.services || []).includes(d.name), baseline: b.ok ? `${b.ref} (${b.via})` : `— ${b.note}`, checkout: b.ok ? `${b.checkout}${b.on_baseline ? '' : ' ≠ baseline'}${b.dirty ? ' · dirty' : ''}` : '-', ok: b.ok });
    }
  }
  const missing = (cfg.services || []).filter((s) => !found.some((f) => f.service === s));
  return { found, skipped, missing_on_disk: missing, new_services: found.filter((f) => !f.in_config).map((f) => f.service) };
}
export function proposeChecks(root, cfg, svc) {
  const b = baselineOf(root, cfg, svc);
  if (!b.ok) return { ok: false, note: b.note };
  const rd = mkReader(svcDir(root, cfg, svc));
  const read = (f) => rd(b.sha, f);
  const r = proposeChecksFrom(read, (f) => read(f) !== null);
  return { ok: true, checks: { lint: r.lint, test: r.test }, basis: r.basis };
}

// ---------- usulan pola (docs/work/<slug>/patterns-proposal.md) ----------
const ITEM_HEAD = /^##\s+(P\d+)\s*[·|-]\s*([\w.-]+)\s*[·|-]\s*(tambah|ganti)\s*$/;
export function parseProposal(text) {
  const { body } = splitFrontmatter(text);
  const items = []; let cur = null;
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = ITEM_HEAD.exec(lines[i]);
    if (m) { cur = { id: m[1], service: m[2], action: m[3], status: 'proposed', evidence: '', replace: null, block: null, headLine: i }; items.push(cur); continue; }
    if (!cur) continue;
    let q;
    if ((q = /^Status:\s*(.+)$/i.exec(lines[i]))) cur.status = q[1].trim();
    else if ((q = /^Bukti:\s*(.*)$/i.exec(lines[i]))) cur.evidence = q[1].trim();
    else if ((q = /^Ganti:\s*(.*)$/i.exec(lines[i]))) cur.replace = q[1].replace(/^`|`$/g, '');
    else if (/^```pola\s*$/.test(lines[i])) { const buf = []; i++; while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]); cur.block = buf.join('\n'); }
  }
  return items;
}
export const proposalPath = (root, slug) => path.join(root, 'docs', 'work', slug, 'patterns-proposal.md');
const statusWord = (s) => String(s).split(/[\s(]/)[0].toLowerCase();
// Status per item di teks proposal (untuk gate: agent tidak boleh menaikkan ke approved/applied)
export function proposalStatuses(text) { return Object.fromEntries(parseProposal(text).map((i) => [i.id, statusWord(i.status)])); }

export function checkProposal(root, cfg, slug, only = null) {
  const problems = [];
  const p = proposalPath(root, slug);
  if (!fs.existsSync(p)) return { problems: [`docs/work/${slug}/patterns-proposal.md belum ada.`], items: [] };
  const items = parseProposal(fs.readFileSync(p, 'utf8'));
  if (!items.length) problems.push('tidak ada item "## P1 · <service> · tambah|ganti".');
  const sel = items.filter((i) => (!only || only.includes(i.id)) && statusWord(i.status) === 'proposed');
  for (const i of sel) {
    const at = `${i.id}`;
    if (!(cfg.services || []).includes(i.service)) { problems.push(`${at}: service "${i.service}" tidak ada di config.`); continue; }
    const pp = path.join(knowDir(root, i.service), 'patterns.md');
    if (!fs.existsSync(pp)) { problems.push(`${at}: docs/knowledge/${i.service}/patterns.md belum ada (jalankan /harness:init atau /harness:knowledge onboard).`); continue; }
    if (i.block === null) problems.push(`${at}: blok \`\`\`pola tidak ada.`);
    else if (i.action === 'tambah' && !i.block.trim()) problems.push(`${at}: blok pola kosong.`);
    else if (i.block.split(/\r?\n/).length > 8) problems.push(`${at}: blok pola > 8 baris; ringkas.`);
    if (i.action === 'tambah' && i.block && !citationsOf(i.block).length) problems.push(`${at}: pola tanpa sitasi path:baris@sha.`);
    if (i.action === 'ganti') {
      const cnt = i.replace ? fs.readFileSync(pp, 'utf8').split(/\r?\n/).filter((l) => l.trim() === i.replace.trim()).length : 0;
      if (cnt !== 1) problems.push(`${at}: "Ganti:" harus persis satu baris yang ada di patterns.md (cocok ${cnt}).`);
    }
    if (i.block) {
      const dir = svcDir(root, cfg, i.service);
      const sc = splitFrontmatter(fs.readFileSync(pp, 'utf8')).fm.source_commit || 'HEAD';
      const c = checkCitations({ root, cfg, svc: i.service, text: i.block, defaultRef: sc, read: mkReader(dir), fileLabel: `${slug}/${i.id}` });
      for (const f of c.findings) problems.push(`${at}: ${f.msg}`);
      const sec = findSecret(i.block); if (sec) problems.push(`${at}: memuat ${sec}.`);
    }
  }
  return { problems, items, selected: sel };
}

// Hanya manusia (hook prompt / CLI "!"): menerapkan item yang disetujui ke patterns.md dan menandainya applied.
export function approveProposal(root, cfg, slug, ids, by) {
  const p = proposalPath(root, slug);
  const chk = checkProposal(root, cfg, slug, ids === 'all' ? null : ids);
  if (chk.problems.length) return { ok: false, problems: chk.problems };
  if (!chk.selected.length) return { ok: false, problems: ['tidak ada item berstatus proposed yang cocok.'] };
  const missing = ids === 'all' ? [] : ids.filter((id) => !chk.selected.some((i) => i.id === id));
  if (missing.length) return { ok: false, problems: [`item tidak ditemukan / bukan proposed: ${missing.join(', ')}`] };
  const byService = new Map();
  for (const i of chk.selected) byService.set(i.service, [...(byService.get(i.service) || []), i]);
  for (const [svc, its] of byService) {
    const pp = path.join(knowDir(root, svc), 'patterns.md');
    let t = fs.readFileSync(pp, 'utf8');
    const adds = [];
    for (const i of its) {
      if (i.action === 'ganti') {
        const L = t.split(/\r?\n/); const idx = L.findIndex((l) => l.trim() === i.replace.trim());
        if (i.block.trim()) L.splice(idx, 1, ...i.block.split(/\r?\n/)); else L.splice(idx, 1);
        t = L.join('\n');
      } else adds.push(i.block);
    }
    if (adds.length) t = t.replace(/\s*$/, '\n') + `\n## Pola disetujui (${slug}, ${today()}, ${by})\n${adds.join('\n')}\n`;
    t = setFmKey(t, 'updated', today());
    fs.writeFileSync(pp, t);
  }
  let pt = fs.readFileSync(p, 'utf8');
  for (const i of chk.selected) {
    const L = pt.split(/\r?\n/); let inItem = false;
    for (let n = 0; n < L.length; n++) {
      const m = ITEM_HEAD.exec(L[n]);
      if (m) inItem = m[1] === i.id;
      else if (inItem && /^Status:/i.test(L[n])) L[n] = `Status: applied (${by}, ${today()})`;
    }
    pt = L.join('\n');
  }
  fs.writeFileSync(p, pt);
  return { ok: true, applied: chk.selected.map((i) => `${i.id}→${i.service}`) };
}

export const readCfgFile = (root) => readJson(path.join(root, 'harness.config.json'), {});
