// Satu folder per topik: docs/topics/YYYY-MM-DD/<slug>/{topic.md, plan.md, summary.md, lampiran/}. Status di frontmatter topic.md.
import fs from 'node:fs';
import path from 'node:path';
import { slugify, today, writeAtomic } from './lib.mjs';

export const TOPICS_DIR = 'docs/topics';
const DONE_1X = new Set(['closed', 'promoted', 'merged', 'done']);
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

export function readFm(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  const fm = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const kv = /^([\w-]+):\s*(.*)$/.exec(l); if (kv) fm[kv[1]] = kv[2].trim(); }
  return fm;
}
export function setFm(text, key, value) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return `---\n${key}: ${value}\n---\n${text}`;
  const lines = m[1].split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i >= 0) lines[i] = `${key}: ${value}`; else lines.push(`${key}: ${value}`);
  return text.replace(m[0], `---\n${lines.join('\n')}\n---`);
}

export function listTopics(root) {
  const base = path.join(root, TOPICS_DIR);
  const out = [];
  let days = [];
  try { days = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && DATE_DIR.test(d.name)).map((d) => d.name); } catch { return out; }
  for (const day of days) {
    let subs = [];
    try { subs = fs.readdirSync(path.join(base, day), { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const s of subs) {
      const dir = path.join(base, day, s.name);
      const f = path.join(dir, 'topic.md');
      let text = ''; let mtime = 0;
      try { text = fs.readFileSync(f, 'utf8'); mtime = fs.statSync(f).mtimeMs; } catch { /* folder tanpa topic.md */ }
      const fm = readFm(text);
      const title = (/^#\s+(.+)$/m.exec(text) || [])[1] || s.name;
      // Status 1.x selesai (promoted, merged, done) dihitung ditutup, juga bila hanya tercatat di summary.md.
      // Tanpa status sama sekali = hasil impor remap, bukan topik terbuka.
      let st = fm.status;
      if (!st) { try { st = readFm(fs.readFileSync(path.join(dir, 'summary.md'), 'utf8')).status; } catch { /* tanpa summary */ } }
      const status = DONE_1X.has(st) ? 'closed' : st === 'open' || st === 'closed' ? st : fm.status || 'impor';
      out.push({ date: day, slug: s.name, id: `${day}/${s.name}`, dir, rel: `${TOPICS_DIR}/${day}/${s.name}`, status, ref: fm.ref || '', title, mtime });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

// Topik 2.x terbuka yang topic.md dan plan.md-nya tidak diubah > days hari.
export function staleTopics(root, days = 7, now = Date.now()) {
  const mt = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  return listTopics(root).filter((t) => t.status === 'open' && now - Math.max(t.mtime, mt(path.join(t.dir, 'plan.md'))) > days * 864e5);
}

// Folder topik tanpa berkas berisi (kosong, hanya dotfile, atau subfolder kosong) = sampah.
const hasFiles = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).some((e) => !e.name.startsWith('.') && (e.isFile() || (e.isDirectory() && hasFiles(path.join(dir, e.name))))); } catch { return false; } };
export function junkTopics(root) {
  return listTopics(root).filter((t) => !hasFiles(t.dir));
}
// Topik berisi tapi bernama dari path (c-users-…-appdata-…) atau "tanpa-nama": perlu ganti nama, bukan dihapus.
export function misnamedTopics(root) {
  return listTopics(root).filter((t) => hasFiles(t.dir) && (t.slug === 'tanpa-nama' || /^[a-z]-users-|-appdata-/.test(t.slug)));
}

// Topik aktif = topik terbuka yang topic.md-nya paling baru diubah.
export function activeTopic(root) {
  return listTopics(root).filter((t) => t.status === 'open').sort((a, b) => b.mtime - a.mtime)[0] || null;
}

// Cari topik dari slug, potongan slug, atau "YYYY-MM-DD/slug".
export function findTopic(root, q) {
  const all = listTopics(root);
  const s = String(q || '').replace(/^docs\/topics\//, '').replace(/\/$/, '');
  if (!s) return null;
  return all.find((t) => t.id === s) || all.find((t) => t.slug === s) || (() => { const m = all.filter((t) => t.slug.includes(s)); return m.length === 1 ? m[0] : null; })();
}

const TOPIC_MD = (title, ref, date) => `---
status: open
created: ${date}
ref: ${ref || ''}
---
# ${title}

## Tujuan
<!-- dari pesan pertama user: apa yang ingin dicapai di sesi ini -->

## Lingkup
- Dibahas:
- Di luar lingkup:

## Diskusi dan temuan
| # | temuan | bukti (path:baris) | fakta/dugaan |
|---|---|---|---|

## Keputusan
| # | keputusan | tanggal |
|---|---|---|
`;
const PLAN_MD = (title) => `# Plan: ${title}

## Tugas
| # | tugas | service | agent | status |
|---|---|---|---|---|

## Aksi dan bukti
<!-- per tugas: apa yang dikerjakan, perintah/test, hasil, PR -->
`;

export function newTopic(root, title, { ref = '', date = today() } = {}) {
  const slug = slugify(title);
  const dir = path.join(root, TOPICS_DIR, date, slug);
  const rel = `${TOPICS_DIR}/${date}/${slug}`;
  if (fs.existsSync(path.join(dir, 'topic.md'))) return { created: false, rel, dir, slug };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'topic.md'), TOPIC_MD(String(title).trim() || slug, ref, date));
  fs.writeFileSync(path.join(dir, 'plan.md'), PLAN_MD(String(title).trim() || slug));
  return { created: true, rel, dir, slug };
}

// summary.md ditulis agent (skill topic) sebelum ini dipanggil.
export function closeTopic(root, q, { date = today() } = {}) {
  const t = findTopic(root, q);
  if (!t) return { ok: false, reason: `topik "${q}" tidak ditemukan atau ambigu` };
  const f = path.join(t.dir, 'topic.md');
  let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { text = `# ${t.title}\n`; }
  text = setFm(setFm(text, 'status', 'closed'), 'closed', date);
  fs.writeFileSync(f, text);
  const idx = path.join(root, 'docs', 'memory', 'INDEX.md');
  fs.mkdirSync(path.dirname(idx), { recursive: true });
  let cur = ''; try { cur = fs.readFileSync(idx, 'utf8'); } catch { cur = '# Indeks topik selesai\n\n| ditutup | topik | judul |\n|---|---|---|\n'; }
  if (!cur.includes(`| ${t.rel} |`)) writeAtomic(idx, `${cur.replace(/\n*$/, '\n')}| ${date} | ${t.rel} | ${t.title.replace(/\|/g, '/')} |\n`);
  return { ok: true, topic: t, summary: fs.existsSync(path.join(t.dir, 'summary.md')) };
}

// Topik sesi = path topik terakhir di input tool atau keluaran topic new/use; teks chat tidak dihitung.
// Dibaca bertahap (≤ READ_MAX per refresh, mulai dari ekor untuk sesi besar) agar status line tidak dibatalkan karena lambat.
const TOPIC_PATH = /docs[\\/]+topics[\\/]+(\d{4}-\d{2}-\d{2})[\\/]+([a-z0-9][a-z0-9_-]*)/gi;
const SVC_PATH = /source-code[\\/]+([A-Za-z0-9][\w.-]*)/g;
const READ_MAX = 1024 * 1024;
function topicsIn(text) { const out = []; for (const m of String(text).matchAll(TOPIC_PATH)) out.push(`${m[1]}/${m[2].toLowerCase()}`); return out; }
function evidence(line) {
  const found = { topics: [], svcs: [], skills: [] };
  if (!line.includes('topics') && !line.includes('source-code') && !line.includes('"Skill"') && !line.includes('command-name')) return found;
  let j; try { j = JSON.parse(line); } catch { return found; }
  const mc = j && j.message && j.message.content;
  const content = Array.isArray(mc) ? mc : typeof mc === 'string' ? [{ type: 'text', text: mc }] : [];
  for (const c of content) {
    if (c && c.type === 'tool_use' && c.name === 'Skill' && c.input && c.input.skill) found.skills.push(String(c.input.skill));
    if (c && c.type === 'text' && typeof c.text === 'string') for (const m of c.text.matchAll(/<command-name>\/?([\w:.-]+)<\/command-name>/g)) found.skills.push(m[1]);
    if (c && c.type === 'tool_use') {
      const inp = JSON.stringify(c.input || {});
      found.topics.push(...topicsIn(inp));
      for (const m of inp.matchAll(SVC_PATH)) found.svcs.push(m[1]);
    } else if (c && c.type === 'tool_result') {
      const t = Array.isArray(c.content) ? c.content.map((x) => (x && x.text) || '').join('\n') : String(c.content || '');
      for (const l of t.split(/\r?\n/)) if (/^(dibuat|sudah ada|dipakai): /.test(l)) found.topics.push(...topicsIn(l));
    }
  }
  return found;
}
// Tanggal terakhir tiap skill dipakai, untuk laporan growth (skill usang).
export const skillUsagePath = (root) => path.join(root, '.claude', 'state', 'skill-usage.json');
function recordSkillUse(root, names, date = today()) {
  const f = skillUsagePath(root);
  let u = {}; try { u = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* belum ada */ }
  for (const n of names) u[n.replace(/^.*:/, '')] = date;
  try { writeAtomic(f, JSON.stringify(u)); } catch { /* cache saja */ }
}
export function sessionTopic(root, payload = {}) {
  const tp = payload.transcript_path;
  const sid = String(payload.session_id || '').replace(/[^\w-]/g, '');
  if (!tp || !sid) return null;
  const stateDir = path.join(root, '.claude', 'state');
  const sf = path.join(stateDir, `topic-${sid}.json`);
  let st = { offset: -1, id: null, svcs: [] };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(sf, 'utf8')) }; } catch { /* belum ada */ }
  let size = 0; try { size = fs.statSync(tp).size; } catch { return null; }
  if (st.offset < 0) { st.offset = Math.max(0, size - READ_MAX); st.lead = st.offset > 0; } // pertama kali: sesi besar mulai dari ekor
  else if (st.lead === undefined) st.lead = false;
  if (size < st.offset) st = { offset: 0, id: null, svcs: [] }; // transcript baru/terpotong
  if (size > st.offset) {
    const fd = fs.openSync(tp, 'r');
    try {
      const len = Math.min(size - st.offset, READ_MAX);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.offset);
      // Batas baris dicari di byte, bukan teks: ekor bisa terpotong di tengah karakter UTF-8.
      const skip = st.lead ? buf.indexOf(10) + 1 : 0;
      const end = buf.lastIndexOf(10);
      if (end >= skip && (!st.lead || skip > 0)) {
        const svcs = new Set(st.svcs || []);
        const used = new Set();
        for (const line of buf.subarray(skip, end).toString('utf8').split('\n')) {
          const f = evidence(line);
          if (f.topics.length) { st.id = f.topics[f.topics.length - 1]; svcs.clear(); }
          for (const sv of f.svcs) svcs.add(sv);
          for (const sk of f.skills) used.add(sk);
        }
        if (used.size) recordSkillUse(root, [...used]);
        st.svcs = [...svcs];
        st.offset += end + 1;
        st.lead = false;
        try { writeAtomic(sf, JSON.stringify(st)); } catch { /* cache saja */ }
      } else if (len === READ_MAX) { st.offset += len; st.lead = buf[len - 1] !== 10; try { writeAtomic(sf, JSON.stringify(st)); } catch { /* abaikan */ } } // satu baris > READ_MAX
    } finally { fs.closeSync(fd); }
  }
  if (!st.id) return null;
  const [date, slug] = st.id.split('/');
  const dir = path.join(root, TOPICS_DIR, date, slug);
  return fs.existsSync(dir) ? { date, slug, id: st.id, dir, services: st.svcs || [] } : null;
}

// Kolom "service" di tabel tugas plan.md.
export function planServices(dir) {
  let t = ''; try { t = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'); } catch { return []; }
  const lines = t.split(/\r?\n/).filter((l) => /^\|/.test(l));
  const head = lines.find((l) => /\|\s*service\s*\|/i.test(l));
  if (!head) return [];
  const idx = head.split('|').map((x) => x.trim().toLowerCase()).indexOf('service');
  const out = [];
  for (const l of lines.slice(lines.indexOf(head) + 1)) {
    const c = (l.split('|')[idx] || '').trim();
    if (!c || /^-+$/.test(c) || c === '-') continue;
    for (const v of c.split(/[,+/]/)) { const x = v.replace(/`/g, '').trim(); if (x && !out.includes(x)) out.push(x); }
  }
  return out;
}

// Skor: kata di slug/judul ×3, di isi ×1.
const STOP = new Set(['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'mengenai', 'tentang', 'topik', 'lanjut', 'bagian', 'itu', 'ini', 'aja', 'ya', 'the', 'of']);
export function findTopics(root, query, { limit = 5 } = {}) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];
  const cands = listTopics(root).map((t) => ({ ...t, where: 'topics' }));
  const leg = path.join(root, 'docs', '_legacy');
  try {
    for (const d of fs.readdirSync(leg, { withFileTypes: true })) {
      if (!d.isDirectory() || !DATE_DIR.test(d.name)) continue;
      for (const s of fs.readdirSync(path.join(leg, d.name), { withFileTypes: true })) if (s.isDirectory()) cands.push({ date: d.name, slug: s.name, id: `${d.name}/${s.name}`, dir: path.join(leg, d.name, s.name), rel: `docs/_legacy/${d.name}/${s.name}`, status: 'legacy', title: s.name, where: 'legacy' });
    }
  } catch { /* belum ada legacy */ }
  const scored = cands.map((t) => {
    let body = '';
    for (const f of ['topic.md', 'summary.md', 'plan.md', 'session.md']) { try { body += fs.readFileSync(path.join(t.dir, f), 'utf8').toLowerCase().slice(0, 20000); } catch { /* tidak ada */ } }
    const head = `${t.slug} ${t.title}`.toLowerCase();
    let score = 0;
    for (const w of words) { if (head.includes(w)) score += 3; else if (body.includes(w)) score += 1; }
    return { ...t, score };
  }).filter((t) => t.score > 0);
  return scored.sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1)).slice(0, limit);
}

// Topik closed dibuka lagi.
export function useTopic(root, q) {
  const t = findTopic(root, q);
  if (!t) return { ok: false, reason: `topik "${q}" tidak ada di docs/topics (atau ambigu). Cari: harness.mjs topic find <kata>` };
  if (t.status === 'closed') { const f = path.join(t.dir, 'topic.md'); fs.writeFileSync(f, setFm(fs.readFileSync(f, 'utf8'), 'status', 'open')); }
  return { ok: true, topic: t, reopened: t.status === 'closed' };
}
