// Topik (2.0, K7–K11): satu folder per topik, docs/topics/YYYY-MM-DD/<slug>/{topic.md, plan.md, summary.md, lampiran/}.
// Menggantikan work item. Status ada di frontmatter topic.md: open | closed.
import fs from 'node:fs';
import path from 'node:path';
import { slugify, today } from './lib.mjs';

export const TOPICS_DIR = 'docs/topics';
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
      out.push({ date: day, slug: s.name, id: `${day}/${s.name}`, dir, rel: `${TOPICS_DIR}/${day}/${s.name}`, status: fm.status || 'open', ref: fm.ref || '', title, mtime });
    }
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : -1));
}

// Topik aktif = topik terbuka yang topic.md-nya paling baru diubah.
export function activeTopic(root) {
  return listTopics(root).filter((t) => t.status !== 'closed').sort((a, b) => b.mtime - a.mtime)[0] || null;
}

// Cari topik dari slug, potongan slug, atau "YYYY-MM-DD/slug".
export function findTopic(root, q) {
  const all = listTopics(root);
  const s = String(q || '').replace(/^docs\/topics\//, '').replace(/\/$/, '');
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

// Menutup topik: status closed + baris di docs/memory/INDEX.md. summary.md ditulis agent (skill topic).
export function closeTopic(root, q, { date = today() } = {}) {
  const t = findTopic(root, q);
  if (!t) return { ok: false, reason: `topik "${q}" tidak ditemukan atau ambigu` };
  const f = path.join(t.dir, 'topic.md');
  let text = fs.readFileSync(f, 'utf8');
  text = setFm(setFm(text, 'status', 'closed'), 'closed', date);
  fs.writeFileSync(f, text);
  const idx = path.join(root, 'docs', 'memory', 'INDEX.md');
  fs.mkdirSync(path.dirname(idx), { recursive: true });
  let cur = ''; try { cur = fs.readFileSync(idx, 'utf8'); } catch { cur = '# Indeks topik selesai\n\n| ditutup | topik | judul |\n|---|---|---|\n'; }
  if (!cur.includes(`| ${t.rel} |`)) fs.writeFileSync(idx, `${cur.replace(/\n*$/, '\n')}| ${date} | ${t.rel} | ${t.title.replace(/\|/g, '/')} |\n`);
  return { ok: true, topic: t, summary: fs.existsSync(path.join(t.dir, 'summary.md')) };
}

// 2.0.3 (T1 a): topik milik SESI ini, dari transcript. Hanya bukti kerja yang dihitung: input tool (path berkas,
// perintah) dan keluaran `topic new` ("dibuat:"/"sudah ada:"). Teks chat dan keluaran lain (mis. tabel remap) diabaikan.
// Dibaca bertahap: posisi terakhir disimpan per sesi, jadi biaya tiap refresh hanya baris baru.
const TOPIC_PATH = /docs[\\/]+topics[\\/]+(\d{4}-\d{2}-\d{2})[\\/]+([a-z0-9][a-z0-9_-]*)/gi;
function topicsIn(text) { const out = []; for (const m of String(text).matchAll(TOPIC_PATH)) out.push(`${m[1]}/${m[2].toLowerCase()}`); return out; }
function evidence(line) {
  let j; try { j = JSON.parse(line); } catch { return []; }
  const content = j && j.message && Array.isArray(j.message.content) ? j.message.content : [];
  const found = [];
  for (const c of content) {
    if (c && c.type === 'tool_use') found.push(...topicsIn(JSON.stringify(c.input || {})));
    else if (c && c.type === 'tool_result') {
      const t = Array.isArray(c.content) ? c.content.map((x) => (x && x.text) || '').join('\n') : String(c.content || '');
      for (const l of t.split(/\r?\n/)) if (/^(dibuat|sudah ada): /.test(l)) found.push(...topicsIn(l));
    }
  }
  return found;
}
export function sessionTopic(root, payload = {}) {
  const tp = payload.transcript_path;
  const sid = String(payload.session_id || '').replace(/[^\w-]/g, '');
  if (!tp || !sid) return null;
  const stateDir = path.join(root, '.claude', 'state');
  const sf = path.join(stateDir, `topic-${sid}.json`);
  let st = { offset: 0, id: null };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(sf, 'utf8')) }; } catch { /* belum ada */ }
  let size = 0; try { size = fs.statSync(tp).size; } catch { return null; }
  if (size < st.offset) st = { offset: 0, id: null }; // transcript baru/terpotong
  if (size > st.offset) {
    const fd = fs.openSync(tp, 'r');
    try {
      const len = Math.min(size - st.offset, 8 * 1024 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.offset);
      const text = buf.toString('utf8');
      const end = text.lastIndexOf('\n');
      if (end >= 0) {
        for (const line of text.slice(0, end).split('\n')) { const f = evidence(line); if (f.length) st.id = f[f.length - 1]; }
        st.offset += Buffer.byteLength(text.slice(0, end + 1));
        try { fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(sf, JSON.stringify(st)); } catch { /* cache saja */ }
      }
    } finally { fs.closeSync(fd); }
  }
  if (!st.id) return null;
  const [date, slug] = st.id.split('/');
  return fs.existsSync(path.join(root, TOPICS_DIR, date, slug)) ? { date, slug, id: st.id } : null;
}
