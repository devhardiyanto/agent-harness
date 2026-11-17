// Memori project berumur panjang (1.10.0), diadaptasi dari pola Hermes Agent: berkas kecil yang dibatasi karakter,
// disuntik sebagai snapshot di awal sesi, tidak dipadatkan diam-diam (penuh = ditolak, manusia yang merapikan).
// Seperti Hermes (bawaan): agent menulis langsung. Opsional memory.write_approval=true: tulisan agent antre di pending.md.
//   docs/memory/MEMORY.md  entri dipisah baris "§" (dilindungi dari Edit/Write agent)
//   docs/memory/pending.md usulan P1, P2, ... (agent boleh menambah lewat CLI)
//   docs/memory/INDEX.md   satu baris per item yang done/merged → summary.md (bahan recall dan "ref:<slug>")
//   ~/.harness/USER.md     (1.11.0) profil user PER ORANG, di luar repo: preferensi gaya kerja (ID U1, U2, ...)
//   docs/memory/playbooks/ (1.11.0) prosedur yang dipelajari (padanan skill Hermes); lihat playbooks.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findSecret, audit, listItems } from './lib.mjs';

export const memDir = (root) => path.join(root, 'docs', 'memory');
const P = (root, f) => path.join(memDir(root), f);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const HEAD = '<!-- Memori project (harness). Entri dipisah baris "§". Ubah lewat: ketik "ingat: <teks>", "lupakan M2", atau node .claude/hooks/harness.mjs memory ... -->';
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// target: 'memory' (project, di repo) | 'user' (profil per orang, ~/.harness/USER.md; HARNESS_HOME untuk tes)
export const userFile = () => path.join(process.env.HARNESS_HOME || path.join(os.homedir(), '.harness'), 'USER.md');
const fileOf = (root, target) => (target === 'user' ? userFile() : P(root, 'MEMORY.md'));
const limitOf = (cfg, target) => (target === 'user' ? cfg.memory.user_max_chars : cfg.memory.max_chars);
const tag = (target) => (target === 'user' ? 'U' : 'M');
const HEAD_USER = '<!-- Profil user (harness, per orang, tidak di repo). Entri dipisah "§". Ubah: "ingat user: <teks>", "lupakan U2". -->';
export function entries(root, target = 'memory') {
  return read(fileOf(root, target)).split(/\r?\n§\r?\n/).map((e) => e.replace(/<!--[\s\S]*?-->/g, '').trim()).filter(Boolean);
}
const used = (list) => list.join('\n§\n').length;
function save(root, list, target = 'memory') {
  const f = fileOf(root, target);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${target === 'user' ? HEAD_USER : HEAD}\n${list.join('\n§\n')}\n`);
}

function validate(text) {
  const t = clean(text);
  if (t.length < 8) return { ok: false, reason: 'entri terlalu pendek (min 8 karakter).' };
  if (t.length > 400) return { ok: false, reason: `entri terlalu panjang (${t.length} > 400 karakter): ringkas jadi satu fakta.` };
  if (findSecret(t)) return { ok: false, reason: 'entri memuat pola secret; tidak disimpan.' };
  return { ok: true, text: t };
}

// Tambah langsung (manusia, atau agent bila write_approval=false). Penuh = ditolak, tidak memotong entri lain.
export function addEntry(root, cfg, text, who = 'unknown', target = 'memory') {
  if (target === 'user' && !cfg.memory.user_enabled) return { ok: false, reason: 'profil user mati (memory.user_enabled=false).' };
  const v = validate(text); if (!v.ok) return v;
  const list = entries(root, target);
  if (list.some((e) => e.toLowerCase() === v.text.toLowerCase())) return { ok: false, reason: 'entri yang sama sudah ada.' };
  const next = [...list, v.text]; const max = limitOf(cfg, target);
  if (used(next) > max) return { ok: false, reason: `${target === 'user' ? 'profil user' : 'memori'} penuh (${used(next)}/${max} karakter). Rapikan dulu: "lupakan ${tag(target)}<n>" atau gabungkan entri, lalu ulangi.` };
  save(root, next, target);
  audit(root, { event: target === 'user' ? 'user-add' : 'memory-add', by: who });
  return { ok: true, id: `${tag(target)}${next.length}`, used: used(next), max };
}

// Hapus berdasarkan nomor (M2 / 2) atau potongan teks unik.
export function removeEntry(root, key, who = 'unknown', target = null) {
  target = target || (/^U\d+$/i.test(String(key).trim()) ? 'user' : 'memory');
  const list = entries(root, target);
  const n = /^[MU]?(\d+)$/i.exec(String(key).trim());
  let idx = -1;
  if (n) idx = Number(n[1]) - 1;
  else { const hits = list.map((e, i) => (e.toLowerCase().includes(String(key).toLowerCase()) ? i : -1)).filter((i) => i >= 0); if (hits.length > 1) return { ok: false, reason: `"${key}" cocok dengan ${hits.length} entri; pakai nomor M<n>.` }; idx = hits[0] ?? -1; }
  if (idx < 0 || idx >= list.length) return { ok: false, reason: `entri "${key}" tidak ada (lihat: harness.mjs memory list).` };
  const [gone] = list.splice(idx, 1);
  save(root, list, target);
  audit(root, { event: 'memory-remove', by: who });
  return { ok: true, removed: gone };
}

// ---------- antrean usulan (pending.md) ----------
const PEND = /^-\s*(P\d+)\s*·\s*([^·]*)·\s*([^·]*)·\s*(.+)$/;
export function pending(root) {
  return read(P(root, 'pending.md')).split(/\r?\n/).map((l) => PEND.exec(l)).filter(Boolean).map((m) => ({ id: m[1], date: m[2].trim(), source: m[3].trim(), text: m[4].trim() }));
}
function savePending(root, list) {
  fs.mkdirSync(memDir(root), { recursive: true });
  fs.writeFileSync(P(root, 'pending.md'), `# Usulan memori (menunggu keputusan manusia)\nTerapkan: ketik "ingat P1,P2" atau "ingat semua". Buang: harness.mjs memory reject <P1|semua>.\n\n${list.map((p) => `- ${p.id} · ${p.date} · ${p.source} · ${p.text}`).join('\n')}\n`);
}
export function stage(root, cfg, text, source = 'agent') {
  const v = validate(text); if (!v.ok) return v;
  const list = pending(root);
  if (list.some((p) => p.text.toLowerCase() === v.text.toLowerCase()) || entries(root).some((e) => e.toLowerCase() === v.text.toLowerCase())) return { ok: false, reason: 'usulan yang sama sudah ada.' };
  const id = `P${list.reduce((m, p) => Math.max(m, Number(p.id.slice(1))), 0) + 1}`;
  list.push({ id, date: new Date().toISOString().slice(0, 10), source: clean(source).replace(/·/g, '-') || 'agent', text: v.text.replace(/·/g, '-') });
  savePending(root, list);
  audit(root, { event: 'memory-stage', source });
  return { ok: true, id, staged: true };
}
const pickIds = (list, ids) => (ids === 'all' ? list : list.filter((p) => ids.includes(p.id)));
export function approvePending(root, cfg, ids, who = 'unknown') {
  const list = pending(root);
  const chosen = pickIds(list, ids);
  if (!chosen.length) return { ok: false, reason: 'tidak ada usulan yang cocok (lihat: harness.mjs memory pending).' };
  const applied = []; const failed = [];
  for (const p of chosen) { const r = addEntry(root, cfg, p.text, who); if (r.ok) applied.push(p.id); else failed.push(`${p.id}: ${r.reason}`); }
  savePending(root, list.filter((p) => !applied.includes(p.id)));
  return { ok: applied.length > 0, applied, failed, reason: failed.join('; ') };
}
export function rejectPending(root, ids) {
  const list = pending(root);
  const gone = pickIds(list, ids).map((p) => p.id);
  savePending(root, list.filter((p) => !gone.includes(p.id)));
  return { ok: gone.length > 0, rejected: gone };
}

// Snapshot untuk SessionStart (dibekukan per sesi, seperti Hermes: perubahan baru terlihat di sesi berikutnya).
export function snapshot(root, cfg) {
  if (!cfg.memory.enabled) return '';
  const list = entries(root); const pend = pending(root).length;
  const ul = cfg.memory.user_enabled ? entries(root, 'user') : [];
  if (!list.length && !pend && !ul.length) return '';
  const L = [];
  if (ul.length) { const u2 = used(ul); L.push(`PROFIL USER [${u2}/${cfg.memory.user_max_chars} karakter] (cara user ingin dilayani; ikuti tanpa disebut):`); ul.forEach((e, i) => L.push(`U${i + 1}. ${e}`)); }
  const u = used(list);
  if (list.length || pend) L.push(`MEMORI project [${Math.round((u / cfg.memory.max_chars) * 100)}% — ${u}/${cfg.memory.max_chars} karakter] (fakta project; pakai, jangan diulang ke user):`);
  list.forEach((e, i) => L.push(`M${i + 1}. ${e}`));
  if (pend) L.push(`(${pend} usulan memori menunggu: user mengetik "ingat P1" / "ingat semua")`);
  return L.join('\n');
}

// ---------- jejak item selesai (INDEX.md) + usulan pelajaran ----------
export function indexItem(root, item, objective) {
  const p = P(root, 'INDEX.md');
  const old = read(p).split(/\r?\n/).filter((l) => l && !l.startsWith('#') && !l.includes(`· ${item.slug} ·`));
  const line = `- ${new Date().toISOString().slice(0, 10)} · ${item.slug} · ${item.status} · ${clean(objective).slice(0, 140)} → docs/work/${item.slug}/summary.md`;
  fs.mkdirSync(memDir(root), { recursive: true });
  fs.writeFileSync(p, `# Indeks pekerjaan selesai (otomatis; sebut "ref:<slug>" di prompt untuk memuat ringkasannya)\n\n${[line, ...old].join('\n')}\n`);
}
// Isi ulang INDEX.md dari item done/merged yang sudah ada (mis. dari versi < 1.10.0). Tidak menulis MEMORY.md.
export function reindex(root, objectiveOf) {
  const done = listItems(root).filter((i) => ['done', 'merged'].includes(i.status));
  for (const it of done) indexItem(root, it, objectiveOf(it));
  return done.length;
}
export const hasIndex = (root) => fs.existsSync(P(root, 'INDEX.md'));

export function learnFrom(root, cfg, item, decisions) {
  if (!cfg.memory.enabled || !cfg.memory.learn_from_summary) return [];
  const out = [];
  for (const d of decisions.map((x) => clean(x.replace(/^[-*]\s*/, ''))).filter((x) => x.length >= 12).slice(0, cfg.memory.learn_max)) {
    // gaya Hermes: langsung masuk; penuh/ditolak -> antrean, supaya pelajaran tidak hilang dan terlihat di tabel Belum selesai
    let r = cfg.memory.write_approval ? { ok: false } : addEntry(root, cfg, d, `dari ${item.slug}`);
    if (!r.ok) r = stage(root, cfg, d, `dari ${item.slug}`);
    if (r.ok) out.push(r.id);
  }
  return out;
}

// ---------- recall: pencarian teks lokal, nol token (padanan session_search Hermes) ----------
export function recall(root, query, n = 5) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (!terms.length) return [];
  const files = [];
  for (const it of listItems(root)) for (const f of ['summary.md', 'brief.md', 'align.md']) { const p = path.join(it.dir, f); if (fs.existsSync(p)) files.push(p); }
  // 1.15.2: item arsip tetap bisa dicari
  const arch = path.join(root, 'docs', 'work', '_archive');
  if (fs.existsSync(arch)) for (const d of fs.readdirSync(arch)) for (const f of ['summary.md', 'brief.md']) { const p = path.join(arch, d, f); if (fs.existsSync(p)) files.push(p); }
  for (const d of [path.join(root, 'docs', 'sessions'), memDir(root), path.join(memDir(root), 'playbooks')]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) files.push(path.join(d, f));
  const hits = [];
  for (const f of files) {
    const lines = read(f).split(/\r?\n/);
    let score = 0; let best = ''; let bestN = 0;
    for (const l of lines) { const low = l.toLowerCase(); const k = terms.filter((t) => low.includes(t)).length; score += k; if (k > bestN) { bestN = k; best = l.trim(); } }
    if (score) hits.push({ file: path.relative(root, f).split(path.sep).join('/'), score, line: best.slice(0, 160) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, n);
}

// "ref:<slug>" di prompt: muat ringkasan item (summary.md, atau brief.md bila belum selesai).
export function refText(root, cfg, slug) {
  let dir = path.join(root, 'docs', 'work', slug);
  if (!fs.existsSync(dir)) dir = path.join(root, 'docs', 'work', '_archive', slug); // 1.15.2: item arsip
  const f = ['summary.md', 'brief.md'].map((x) => path.join(dir, x)).find((x) => fs.existsSync(x));
  if (!f) return null;
  return `[ref:${slug}] ${path.relative(root, f).split(path.sep).join('/')}\n${read(f).slice(0, cfg.memory.ref_max_chars)}`;
}
