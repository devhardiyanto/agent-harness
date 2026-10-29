// Harness — pengiriman berantai: rencana ship, cek akun gh, tiket merge sekali pakai, merge berurutan.
// Keputusan merge = ketikan manusia `/harness:ship <slug>` (hook prompt memanggil issueTicket). Agent hanya bisa
// menjalankan `harness.mjs ship <slug>`, yang tidak berbuat apa pun tanpa tiket. `gh pr merge` langsung tetap diblokir guard-bash.
// Base dan rantai PR adalah DATA project (harness.config.json → ship.base), bukan bagian repo ini.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { asList, gateProblems, serviceDirOf, ghRun } from './lib.mjs';
import { baselineOf } from './knowledge.mjs';

const run = (cmd, args, cwd, ms = 60000) => spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: ms });
const git = (cwd, args) => { const r = run('git', args, cwd, 20000); return r.status === 0 ? r.stdout.trim() : null; };
const isProtected = (cfg, b) => [cfg.root_branch, ...(cfg.protected_branches || [])].some((g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(b));

export const ticketPath = (root, slug) => path.join(root, '.claude', 'state', 'merge-tickets', `${slug}.json`);

// ---------- akun dan akses gh ----------
export function ghAccess(cwd) {
  const v = ghRun(['--version'], cwd, 15000);
  if (v.error || v.status !== 0) return { ok: false, note: 'gh (GitHub CLI) tidak ditemukan. Pasang gh lalu "gh auth login".' };
  const who = ghRun(['api', 'user', '-q', '.login'], cwd, 20000);
  const login = who.status === 0 ? who.stdout.trim() : null;
  if (!login) return { ok: false, note: 'gh belum login. Jalankan "gh auth login".' };
  const rv = ghRun(['repo', 'view', '--json', 'nameWithOwner,viewerPermission'], cwd, 30000);
  let j = null; try { j = JSON.parse(rv.stdout); } catch { /* abaikan */ }
  if (rv.status !== 0 || !j) return { ok: false, login, note: `akun gh aktif "${login}" tidak dapat mengakses repo di ${cwd}. Ganti akun: "gh auth switch --user <pemilik repo>" (daftar akun: "gh auth status").` };
  if (!['WRITE', 'MAINTAIN', 'ADMIN'].includes(j.viewerPermission)) return { ok: false, login, repo: j.nameWithOwner, note: `akun gh aktif "${login}" hanya ${j.viewerPermission} di ${j.nameWithOwner}; butuh WRITE. Ganti akun: "gh auth switch --user <akun lain>".` };
  return { ok: true, login, repo: j.nameWithOwner, permission: j.viewerPermission };
}

// ---------- rencana ship per service ----------
export function baseFor(root, cfg, svc) {
  const set = cfg.ship?.base?.[svc];
  if (typeof set === 'string' && set) return { base: set, via: 'config ship.base' };
  const b = svc && svc !== '*' ? baselineOf(root, cfg, svc) : { ok: false };
  if (b.ok) return { base: String(b.ref).replace(/^origin\//, ''), via: 'baseline' };
  return { base: cfg.root_branch, via: 'root_branch' };
}

export function shipPlan(root, cfg, item) {
  const rows = [];
  for (const svc of (item.fm.services?.length ? asList(item.fm.services) : ['*'])) {
    const dir = serviceDirOf(root, cfg, svc === '*' ? '' : svc);
    const branch = git(dir, ['symbolic-ref', '--short', '-q', 'HEAD']);
    const { base, via } = baseFor(root, cfg, svc);
    const dirty = (git(dir, ['status', '--porcelain']) || '').split('\n').filter(Boolean).length;
    const acc = ghAccess(dir);
    const problems = [];
    if (!branch) problems.push('HEAD terlepas (detached); buat branch kerja.');
    else if (isProtected(cfg, branch)) problems.push(`sedang di branch ${branch} (dilindungi); buat branch kerja <feat|fix|chore>/<slug>.`);
    if (branch && branch === base) problems.push(`branch kerja sama dengan base (${base}).`);
    if (!acc.ok) problems.push(acc.note);
    rows.push({ service: svc, dir, branch, base, base_via: via, stacked: !isProtected(cfg, base), dirty, gh: acc.ok ? `${acc.login} (${acc.permission})` : (acc.login || '-'), problems });
  }
  return rows;
}

// ---------- status PR ----------
function classifyChecks(roll) {
  const list = asList(roll);
  let green = 0; let pending = 0; let red = 0;
  for (const c of list) {
    const concl = String(c.conclusion || '').toUpperCase();
    const state = String(c.state || c.status || '').toUpperCase();
    if (c.__typename === 'StatusContext' || (c.state && !c.status)) { if (state === 'SUCCESS') green++; else if (['PENDING', 'EXPECTED'].includes(state)) pending++; else red++; continue; }
    if (state !== 'COMPLETED') { pending++; continue; }
    if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(concl)) green++; else red++;
  }
  return { total: list.length, green, pending, red };
}

const PR_URL = /^https:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
const BRANCH = /^[\w./-]+$/;
export function prView(url, cwd) {
  if (!PR_URL.test(String(url))) return { url, error: 'bukan URL PR GitHub yang valid (https://host/owner/repo/pull/N)' };
  const r = ghRun(['pr', 'view', url, '--json', 'state,isDraft,baseRefName,headRefName,headRefOid,statusCheckRollup'], cwd, 45000);
  if (r.status !== 0) return { url, error: (r.stderr || r.error?.message || 'gh gagal').trim().slice(0, 200) };
  try { const j = JSON.parse(r.stdout); return { url, state: j.state, draft: !!j.isDraft, base: j.baseRefName, head: j.headRefName, sha: j.headRefOid, checks: classifyChecks(j.statusCheckRollup) }; } catch { return { url, error: 'keluaran gh tidak terbaca' }; }
}

// ---------- tiket ----------
export function issueTicket(root, cfg, item, by) {
  const problems = [];
  const prs = asList(item.fm.pr).filter((x) => x && x !== 'null');
  if (item.status !== 'done') return { ok: false, problems: [`status ${item.status}; merge hanya untuk item "done".`] };
  if (!prs.length) return { ok: false, problems: ['pr: belum terisi. Jalankan /harness:ship dulu sampai PR terbuka, tunggu check hijau, lalu ketik /harness:ship lagi.'] };
  problems.push(...gateProblems(root, cfg, item));
  const ap = accessProblems(root, cfg, item);
  problems.push(...ap);
  const views = ap.length ? [] : prs.map((u) => prView(u, root));
  const entries = [];
  for (const v of views) {
    if (v.error) { problems.push(`${v.url}: ${v.error}`); continue; }
    if (v.state === 'MERGED') continue;
    if (v.state !== 'OPEN') { problems.push(`${v.url}: berstatus ${v.state}.`); continue; }
    if (v.draft) problems.push(`${v.url}: masih draft.`);
    if (v.checks.red) problems.push(`${v.url}: ${v.checks.red} check MERAH. Perbaiki dulu.`);
    else if (v.checks.pending) problems.push(`${v.url}: ${v.checks.pending} check masih berjalan. Tunggu hijau.`);
    entries.push({ url: v.url, head: v.head, sha: v.sha, base: v.base, checks: v.checks.total ? 'hijau' : 'TIDAK ADA CHECK' });
  }
  if (!entries.length && !problems.length) return { ok: true, allMerged: true, problems: [], ticket: null };
  if (problems.length) return { ok: false, problems };
  const ttl = Number(cfg.ship?.ticket_ttl_min) || 30;
  const method = ['merge', 'squash', 'rebase'].includes(cfg.ship?.merge_method) ? cfg.ship.merge_method : 'merge';
  const ticket = { slug: item.slug, by, issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttl * 60000).toISOString(), method, prs: entries };
  const p = ticketPath(root, item.slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(ticket, null, 2));
  return { ok: true, problems: [], ticket };
}

// ---------- merge berurutan (butuh tiket; tiket dihapus lebih dulu = sekali pakai) ----------
function order(prs) {
  const left = [...prs]; const out = [];
  while (left.length) {
    const i = left.findIndex((p) => !left.some((q) => q !== p && q.head === p.base)); // PR yang basenya bukan head PR lain dulu
    out.push(...left.splice(i < 0 ? 0 : i, 1));
  }
  return out;
}

// Akun gh harus punya akses tulis ke repo tiap service yang tercakup (repo project induk belum tentu repo PR).
function accessProblems(root, cfg, item) {
  const dirs = [...new Set((item.fm.services?.length ? asList(item.fm.services) : ['*']).map((s) => serviceDirOf(root, cfg, s === '*' ? '' : s)))];
  return [...new Set(dirs.map((d) => ghAccess(d)).filter((a) => !a.ok).map((a) => a.note))];
}

export function runShip(root, cfg, item, log = console.log) {
  const p = ticketPath(root, item.slug);
  if (!fs.existsSync(p)) return { ok: false, problems: [`tidak ada tiket merge untuk ${item.slug}. Keputusan merge hanya dari ketikan manusia: /harness:ship ${item.slug} (setelah PR terbuka dan check hijau).`] };
  let t = null; try { t = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* abaikan */ }
  fs.rmSync(p, { force: true }); // sekali pakai, apa pun hasilnya
  if (t && !['merge', 'squash', 'rebase'].includes(t.method)) t = null;
  if (!t || t.slug !== item.slug || !Array.isArray(t.prs)) return { ok: false, problems: ['tiket rusak; ketik /harness:ship lagi.'] };
  if (Date.parse(t.expires_at) < Date.now()) return { ok: false, problems: ['tiket kedaluwarsa; ketik /harness:ship lagi.'] };
  const gp = gateProblems(root, cfg, item);
  if (gp.length) return { ok: false, problems: gp };
  const ap = accessProblems(root, cfg, item);
  if (ap.length) return { ok: false, problems: ap };

  const merged = [];
  for (const pr of order(t.prs)) {
    const v = prView(pr.url, root);
    if (v.error) return { ok: false, merged, problems: [`${pr.url}: ${v.error}`] };
    if (v.state === 'MERGED') { merged.push(pr); log(`${pr.url}: sudah MERGED`); continue; }
    if (v.state !== 'OPEN') return { ok: false, merged, problems: [`${pr.url}: berstatus ${v.state}.`] };
    if (v.sha !== pr.sha) return { ok: false, merged, problems: [`${pr.url}: commit PR berubah sejak tiket (${String(pr.sha).slice(0, 7)} → ${String(v.sha).slice(0, 7)}). Tunggu check, lalu ketik /harness:ship lagi.`] };
    if (!BRANCH.test(String(v.base)) || !/^\w+$/.test(String(pr.sha))) return { ok: false, merged, problems: [`${pr.url}: nama branch/SHA tidak aman.`] };
    const parent = merged.find((m) => m.head === v.base); // PR induk sudah masuk; arahkan ke base induk supaya perubahan sampai ke branch utama
    if (parent) {
      if (!BRANCH.test(String(parent.base))) return { ok: false, merged, problems: [`${pr.url}: nama branch induk tidak aman.`] };
      const e = ghRun(['pr', 'edit', pr.url, '--base', parent.base], root, 45000);
      if (e.status !== 0) return { ok: false, merged, problems: [`${pr.url}: gagal mengarahkan base ke ${parent.base}: ${(e.stderr || '').trim().slice(0, 200)}`] };
      log(`${pr.url}: base ${v.base} → ${parent.base}`);
      pr.base = parent.base;
    }
    const r = ghRun(['pr', 'merge', pr.url, `--${t.method}`, '--match-head-commit', pr.sha], root, 90000);
    if (r.status !== 0) return { ok: false, merged, problems: [`${pr.url}: merge ditolak gh: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`] };
    log(`${pr.url}: MERGED (${t.method})`);
    merged.push(pr);
  }
  return { ok: true, merged, problems: [] };
}
