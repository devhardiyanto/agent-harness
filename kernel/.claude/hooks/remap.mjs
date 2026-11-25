// Remap (2.0, K3, K15–K17, K22): merapikan docs/ lama ke bentuk 2.0.
//   bertanggal < N bulan  → docs/topics/YYYY-MM-DD/<slug>/ (work item, topik datar, laporan) atau docs/sessions/YYYY-MM-DD/<slug>.md
//   bertanggal >= N bulan → docs/_legacy/YYYY-MM-DD/<slug>/ + baris di docs/_legacy/INDEX.md
//   arsip lama dan sisa harness 1.x → docs/_legacy/_lama/
// Tanggal diambil dari nama (YYYY-MM-DD di depan); tanpa tanggal: commit git terakhir berkas itu, lalu mtime.
// Hanya docs/ yang dipindah. State harness dan folder tool lain hanya didaftar sebagai skrip hapus; tidak dijalankan.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { today } from './lib.mjs';

const DATED = /^(\d{4}-\d{2}-\d{2})(?:_\d{6}_SESSION_|[_-])?(.*)$/i;
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'tanpa-nama';
const ls = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };

export function cutoffDate(months, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  return today(d);
}

function fileDate(root, rel) {
  const r = spawnSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: root, encoding: 'utf8' });
  const d = r.status === 0 ? r.stdout.trim() : '';
  if (DATE_DIR.test(d)) return d;
  try { return today(fs.statSync(path.join(root, rel)).mtime); } catch { return today(); }
}

function parse(root, rel, name) {
  const m = DATED.exec(name);
  if (m && m[2]) return { date: m[1], slug: clean(m[2]) };
  if (m) return { date: m[1], slug: clean(name.slice(10)) || 'tanpa-nama' };
  return { date: fileDate(root, rel), slug: clean(name) };
}

// Daftar unit yang dipindah. kind menentukan tujuan.
export function collect(root) {
  const units = [];
  const add = (rel, kind, extra = {}) => {
    const name = path.posix.basename(rel);
    units.push({ src: rel, kind, name, ...parse(root, rel, name), ...extra });
  };
  const D = (p) => path.join(root, p);

  // docs/work: item 1.x
  for (const e of ls(D('docs/work'))) {
    const rel = `docs/work/${e.name}`;
    if (e.name === '_TEMPLATE' || e.name === 'README.md') add(rel, 'harness-lama');
    else if (e.name.startsWith('_')) add(rel, 'lama');
    else if (e.isDirectory()) add(rel, 'work');
    else add(rel, 'lama');
  }
  // docs/topics (datar 1.21–1.24 dan bentuk baru) + docs/topik (nama lama)
  for (const top of ['docs/topics', 'docs/topik']) {
    for (const e of ls(D(top))) {
      const rel = `${top}/${e.name}`;
      if (top === 'docs/topics' && e.isDirectory() && DATE_DIR.test(e.name)) {
        for (const s of ls(D(rel))) if (s.isDirectory()) units.push({ src: `${rel}/${s.name}`, kind: 'topic-dir', name: s.name, date: e.name, slug: s.name });
      } else if (e.isDirectory()) add(rel, top === 'docs/topik' ? 'topic-dir-lama' : 'lama');
      else if (/\.md$/i.test(e.name)) add(rel, 'topic-file');
      else add(rel, 'topic-attach');
    }
  }
  // docs/sessions: berbagai format nama 1.x + subfolder bulan
  const walkSessions = (rel) => {
    for (const e of ls(D(rel))) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (rel === 'docs/sessions' && DATE_DIR.test(e.name)) { for (const f of ls(D(r))) if (f.isFile()) units.push({ src: `${r}/${f.name}`, kind: 'session-new', name: f.name, date: e.name, slug: clean(f.name) }); }
        else walkSessions(r);
      } else if (e.name === 'README.md') add(r, 'lama');
      else add(r, 'session');
    }
  };
  walkSessions('docs/sessions');
  // docs/reports/<kategori>/<berkas>
  for (const c of ls(D('docs/reports'))) {
    const rel = `docs/reports/${c.name}`;
    if (!c.isDirectory()) { add(rel, 'report'); continue; }
    for (const f of ls(D(rel))) {
      const r = `${rel}/${f.name}`;
      add(r, 'report');
      const u = units[units.length - 1];
      if (!DATED.exec(f.name) || !/^\d{4}/.test(f.name)) u.slug = clean(`${c.name}-${u.slug}`);
    }
  }
  // arsip lama dan sisa memori 1.x
  for (const p of ['docs/_arsip', 'docs/_archive', 'docs/init']) if (fs.existsSync(D(p))) add(p, 'lama');
  for (const p of ['docs/memory/pending.md', 'docs/memory/playbooks']) if (fs.existsSync(D(p))) add(p, 'memory-lama');
  return units;
}

export function destFor(u, cutoff) {
  const old = u.date < cutoff;
  const L = `docs/_legacy/${u.date}/${u.slug}`;
  const T = `docs/topics/${u.date}/${u.slug}`;
  switch (u.kind) {
    case 'work': return old ? L : T;
    case 'topic-dir': return old ? L : null;
    case 'topic-dir-lama': return old ? L : `${T}/lampiran/${u.name}`;
    case 'topic-file': return old ? `${L}/topic.md` : `${T}/topic.md`;
    case 'topic-attach': return old ? `${L}/lampiran/${u.name}` : `${T}/lampiran/${u.name}`;
    case 'session': return old ? `${L}/session.md` : `docs/sessions/${u.date}/${u.slug}.md`;
    case 'session-new': return old ? `${L}/session.md` : null;
    case 'report': return old ? `${L}/lampiran/${u.name}` : `${T}/lampiran/${u.name}`;
    case 'memory-lama': return `docs/_legacy/_lama/memory/${u.name}`;
    case 'harness-lama': return `docs/_legacy/_lama/harness-1.x/${u.name}`;
    default: return `docs/_legacy/_lama/${u.src.replace(/^docs\//, '').replace(/\//g, '-')}`;
  }
}

// Folder di root yang bukan milik project: state harness 1.x dan folder tool lain. Hanya disarankan dihapus.
const DELETE_SUGGEST = [
  ['.harness', 'state harness 1.x (tidak dipakai 2.0)'], ['.harness-staging', 'sisa installer'],
  ['.claude/state', 'state hook 1.x + cache status line (aman dihapus, dibuat ulang)'], ['.claude/audit', 'log hook 1.x'], ['.claude/worktrees', 'worktree sesi background'],
  ['.codex', 'konfigurasi Codex (di luar harness)'], ['.agents', 'agent lama (di luar harness)'], ['.wt', 'worktree manual'], ['.tmp', 'berkas sementara'],
];
const KNOWN_DOCS = new Set(['work', 'topics', 'topik', 'sessions', 'reports', '_arsip', '_archive', 'init', 'memory', 'knowledge', '_map.md', '_legacy']);

export function plan(root, cfg, { now = new Date() } = {}) {
  const months = Number(cfg.remap?.legacy_months) || 2;
  const cutoff = cutoffDate(months, now);
  const moves = [];
  for (const u of collect(root)) {
    const to = destFor(u, cutoff);
    if (!to || to === u.src) continue;
    moves.push({ ...u, to, legacy: to.startsWith('docs/_legacy/') });
  }
  const untouched = ls(path.join(root, 'docs')).map((e) => e.name).filter((n) => !KNOWN_DOCS.has(n)).map((n) => `docs/${n}`);
  const deletes = DELETE_SUGGEST.filter(([p]) => fs.existsSync(path.join(root, p))).map(([p, why]) => ({ path: p, why }));
  return { cutoff, months, moves, untouched, deletes };
}

function uniq(abs) {
  if (!fs.existsSync(abs)) return abs;
  const ext = path.extname(abs); const base = abs.slice(0, abs.length - ext.length);
  for (let i = 2; ; i++) { const c = `${base}-${i}${ext}`; if (!fs.existsSync(c)) return c; }
}
function moveInto(src, dest) {
  if (fs.statSync(src).isDirectory() && fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
    for (const e of fs.readdirSync(src)) moveInto(path.join(src, e), path.join(dest, e));
    fs.rmdirSync(src);
    return;
  }
  const to = uniq(dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(src, to);
}
function pruneEmpty(dir, stop) {
  let d = dir;
  while (d.startsWith(stop) && d !== stop) {
    try { if (fs.readdirSync(d).length) break; fs.rmdirSync(d); } catch { break; }
    d = path.dirname(d);
  }
}

export function apply(root, p) {
  const done = [];
  for (const m of p.moves) {
    const src = path.join(root, m.src);
    if (!fs.existsSync(src)) continue;
    moveInto(src, path.join(root, m.to));
    pruneEmpty(path.dirname(src), path.join(root, 'docs'));
    done.push(m);
  }
  const leg = done.filter((m) => m.legacy);
  if (leg.length) {
    const f = path.join(root, 'docs', '_legacy', 'INDEX.md');
    let cur = ''; try { cur = fs.readFileSync(f, 'utf8'); } catch { cur = '# Legacy\n\nPekerjaan lama (dipindah skill remap). Dibaca saat dirujuk; tidak dimuat otomatis.\n\n| tanggal | lokasi | asal |\n|---|---|---|\n'; }
    const rows = leg.map((m) => `| ${m.date} | ${m.to} | ${m.src} |`).filter((r) => !cur.includes(r));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `${cur.replace(/\n*$/, '\n')}${rows.join('\n')}${rows.length ? '\n' : ''}`);
  }
  return done;
}

export function deleteScript(p) {
  if (!p.deletes.length) return '';
  return ['# Tinjau dulu, lalu jalankan sendiri di root (Git Bash):', ...p.deletes.map((d) => `rm -rf "${d.path}"   # ${d.why}`)].join('\n');
}
