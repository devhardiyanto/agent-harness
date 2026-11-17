#!/usr/bin/env node
// 1.16.0: pemilih (AskUserQuestion). Pertanyaan DIBUAT KODE dari baris D terbuka (align.md atau bagian 3 berkas tunggal) dan
// disimpan sebagai naskah. Saat user menjawab, hook PostToolUse (matcher AskUserQuestion) mencocokkan teks pertanyaan dengan
// naskah dan menulis jawabannya ke baris D. Pertanyaan yang tidak ada di naskah diabaikan, jadi agent tidak bisa mengarang
// pertanyaan yang berakibat ke berkas item. approve/merge TIDAK pernah lewat pemilih (D33): tetap dari ketikan user.
import fs from 'node:fs';
import path from 'node:path';
import { approvePending, rejectPending } from './memory.mjs';
import { readStdinJson, projectRoot, loadConfig, readItem, readAlign, decisionRows, listItems, isSingle, isMain, audit, shortSlug, nextStep, touchedSlugs, readJson } from './lib.mjs';

const naskahPath = (root, sid) => path.join(root, '.harness', 'state', 'ask', `${String(sid || 'x').replace(/\W/g, '')}.json`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const CLAIM_OPTS = ['benar', 'salah'];
// Nilai yang ditulis ke kolom status klaim (bukan "dugaan" lagi). "salah" = bertentangan: agent wajib mengoreksi teks klaim.
export const claimStatus = (yes, note, via) => (yes ? `dikonfirmasi (user, ${via})` : `bertentangan (user, ${via}${note ? `: ${String(note).replace(/\|/g, '/').trim()}` : ''})`);

// "a) 300 · b) tanpa batas" | "a. X · b. Y (rekomendasi)" → ['300', 'tanpa batas']
export function parseOptions(cell) {
  return String(cell || '').split(/\s+·\s+|\s*;\s*|\s+\/\s+(?=[a-d][.)])/).map((o) => o.replace(/^\s*[a-d][.)]\s*/i, '').trim()).filter(Boolean).slice(0, 4);
}

// Naskah untuk satu item: maksimal 4 pertanyaan (batas AskUserQuestion), masing-masing 2–4 opsi; sisanya tetap lewat tabel.
export function buildQuestions(root, item) {
  const qs = [];
  for (const d of decisionRows(item).filter((x) => x.kind === 'keputusan' || x.kind === 'dugaan')) {
    // 1.19.4: klaim dugaan ikut ditanyakan (benar/salah); jawabannya ditulis ke kolom status klaim
    const opts = d.kind === 'dugaan' ? CLAIM_OPTS : parseOptions(d.options);
    if (opts.length < 2) continue;
    qs.push({ id: d.id, header: clip(`${d.id} ${shortSlug(root, item.slug)}`, 12), question: `${d.id}: ${d.ask}`, options: opts.map((o, i) => ({ label: clip(o, 60), description: d.kind === 'dugaan' ? (i === 0 ? 'klaim dikonfirmasi' : 'agent mengoreksi klaim; jelaskan di chat bila perlu') : i === 0 ? 'rekomendasi' : '' })), multiSelect: false });
    if (qs.length === 4) break;
  }
  return qs;
}

export function saveNaskah(root, sid, slug, questions) {
  const f = naskahPath(root, sid);
  const prev = readJson(f, { items: {} }) || { items: {} };
  prev.items[slug] = questions.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => o.label) }));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(prev, null, 2));
}

export function saveLessonNaskah(root, sid, la) {
  const f = naskahPath(root, sid);
  const prev = readJson(f, { items: {} }) || { items: {} };
  prev.lessons = { question: la.question.question, map: Object.fromEntries(la.question.options.map((o, i) => [norm(o.label), la.ids[i]])), ids: la.ids };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(prev, null, 2));
}

// Teks instruksi untuk agent: panggil AskUserQuestion dengan JSON ini apa adanya.
// 1.19.4: argumen JSON ditulis ke berkas; pesan hook (yang tampil ke user) hanya menyebut path-nya.
export function askInstruction(questions, root = null, sid = null) {
  const arg = JSON.stringify({ questions: questions.map(({ id, ...q }) => q) });
  if (root) {
    const f = path.join(root, '.harness', 'state', 'ask', `args-${String(sid || 'x').replace(/\W/g, '')}.json`);
    try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, arg); return `Tanyakan ${questions.map((q) => q.id).join(', ')} ke user dengan tool AskUserQuestion: baca argumennya dari ${path.relative(root, f).replace(/\\/g, '/')} dan pakai APA ADANYA (jawaban dicatat hook dengan mencocokkan teks pertanyaan). Bila tool itu tidak tersedia, tampilkan tabel keputusan saja.`; } catch { /* jatuh ke bentuk lama */ }
  }
  return `Tanyakan keputusan ini ke user dengan tool AskUserQuestion, memakai argumen JSON berikut APA ADANYA (jangan ubah teks pertanyaan; jawaban dicatat hook dengan mencocokkan teks itu). Bila tool itu tidak tersedia, tampilkan tabel keputusan saja.\n${arg}`;
}

// Ambil pasangan pertanyaan→jawaban dari tool_response (bentuknya belum pasti; dicari secara longgar).
export function extractAnswers(resp, input) {
  const out = new Map();
  const visit = (o) => {
    if (!o || typeof o !== 'object') return;
    if (o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers)) for (const [k, v] of Object.entries(o.answers)) out.set(norm(k), Array.isArray(v) ? v.join(', ') : String(v));
    if (typeof o.question === 'string' && (typeof o.answer === 'string' || Array.isArray(o.answer))) out.set(norm(o.question), [].concat(o.answer).join(', '));
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  let r = resp;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { /* teks */ } }
  visit(r); visit(input);
  if (!out.size && typeof r === 'string') for (const m of r.matchAll(/"([^"]+)"\s*=\s*"([^"]*)"/g)) out.set(norm(m[1]), m[2]);
  return out;
}

const ROW = /^\|\s*([CD]\d+)\s*\|/;
export function writeAnswer(item, id, answer, mark = '(pemilih)') {
  const single = isSingle(item) && !fs.existsSync(path.join(item.dir, 'align.md'));
  const f = single ? item.planPath : path.join(item.dir, 'align.md');
  if (!fs.existsSync(f)) return false;
  let hit = false;
  const t = fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => {
    const m = ROW.exec(l); if (!m || m[1].toUpperCase() !== id.toUpperCase()) return l;
    const c = l.split('|'); while (c.length < 6) c.splice(c.length - 1, 0, ' ');
    c[4] = ` ${String(answer).replace(/\|/g, '/').trim()}${mark ? ` ${mark}` : ''} `; hit = true; return c.join('|');
  }).join('\n');
  if (hit) fs.writeFileSync(f, t);
  return hit;
}

export function recordAnswers(root, payload) {
  const f = naskahPath(root, payload.session_id);
  const nk = readJson(f, null);
  if (!nk || !nk.items) return [];
  const ans = extractAnswers(payload.tool_response, payload.tool_input);
  const done = [];
  for (const [slug, qs] of Object.entries(nk.items)) {
    const it = readItem(root, slug); if (!it) continue;
    for (const q of qs) {
      const a = ans.get(norm(q.question));
      if (a === undefined || !a.trim()) continue;
      const isClaim = /^C\d+$/i.test(q.id);
      const val = isClaim ? claimStatus(norm(a).startsWith('benar'), '', 'pemilih') : a;
      if (writeAnswer(it, q.id, val, isClaim ? '' : '(pemilih)')) done.push(`${slug} ${q.id}=${a}`);
    }
  }
  if (nk.lessons) {
    const a = ans.get(norm(nk.lessons.question));
    if (a !== undefined) {
      const na = norm(a); // label bisa memuat koma: cocokkan tiap label sebagai potongan jawaban
      const chosen = Object.entries(nk.lessons.map).filter(([lbl]) => na.includes(lbl)).map(([, id]) => id);
      const cfg = loadConfig(root);
      if (chosen.length) { const r = approvePending(root, cfg, chosen, 'user (pemilih)'); if (r.applied && r.applied.length) done.push(`pelajaran disimpan: ${r.applied.join(',')}`); }
      const rest = nk.lessons.ids.filter((id) => !chosen.includes(id));
      if (rest.length) { rejectPending(root, rest); done.push(`pelajaran dibuang: ${rest.join(',')}`); }
      delete nk.lessons; fs.writeFileSync(f, JSON.stringify(nk, null, 2));
    }
  }
  if (done.length) audit(root, { event: 'ask-answer', session: payload.session_id, answers: done.join('; ') });
  return done;
}

// Menu "lalu apa?": opsi dibuat kode dari langkah sah item yang disentuh sesi ini. Langkah yang harus diketik user
// (setuju, push PR + merge) tidak dijadikan opsi; disebut di teks.
export function menuFor(root, cfg, sid) {
  const items = [...touchedSlugs(root, sid)].map((s) => readItem(root, s)).filter((x) => x && x.status !== 'merged').slice(-3);
  const opts = []; const typed = [];
  for (const it of items) {
    const n = nextStep(it, cfg); const sl = shortSlug(root, it.slug);
    if (n.who === 'kamu' && /setuju|push PR \+ merge|align ok/.test(n.cmd)) typed.push(`${sl}: ${n.cmd}`);
    else opts.push({ label: clip(`${sl}: ${n.who === 'kamu' ? 'jawab keputusan' : 'lanjutkan'}`, 60), description: clip(n.cmd, 120) });
    if (it.status === 'draft' && decisionRows(it).length) opts.push({ label: clip(`${sl}: tabel keputusan`, 60), description: 'tampilkan keputusan yang belum dijawab' });
  }
  opts.push({ label: 'Lihat semua yang belum selesai', description: 'tabel sisa' });
  return { questions: [{ header: 'Lalu apa?', question: 'Langkah berikutnya?', options: opts.slice(0, 4), multiSelect: false }], typed };
}

async function main() {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  try {
    const cfg = loadConfig(root);
    if (!cfg.tui.ask) process.exit(0);
    const done = recordAnswers(root, payload);
    if (done.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `[harness] Jawaban dicatat di berkas item (oleh hook): ${done.join('; ')}. Jangan menulis ulang jawaban itu.` } }));
  } catch { /* pemilih tidak boleh mengganggu */ }
  process.exit(0);
}
if (isMain(import.meta.url)) main();

// 1.19.4: jawaban yang DIKETIK user ("C4 benar dan C5 benar", "C4 a, C5 a", "D1: a", "C2 salah: pakai kolom X", "semua benar")
// dicatat hook UserPromptSubmit langsung ke berkas item, agar tidak bergantung pada agent. Hanya bila SELURUH ketikan berupa jawaban.
const TOKEN = /^([CD]\d+)\s*[:=.)]?\s*(benar|salah|ya|tidak|ok|setuju|[a-d])\b\s*(?:[:\-–]\s*(.+))?$/i;
export function parseTypedAnswers(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 600) return null;
  if (/^semua\s+(benar|ok|setuju)$/i.test(t)) return [{ id: '*C', val: 'benar' }];
  const parts = t.split(/\s*(?:,|;|\n|\bdan\b|&)\s*/i).filter(Boolean);
  const out = [];
  for (const p of parts) { const m = TOKEN.exec(p.trim()); if (!m) return null; out.push({ id: m[1].toUpperCase(), val: m[2].toLowerCase(), note: m[3] ? m[3].trim() : '' }); }
  return out.length ? out : null;
}
export function applyTypedAnswers(root, sid, answers) {
  const mine = touchedSlugs(root, sid);
  const cands = [];
  for (const it0 of listItems(root)) {
    if (it0.status !== 'draft') continue;
    const rows = decisionRows(it0); if (!rows.length) continue;
    cands.push({ it: it0, rows, mine: mine.has(it0.slug) });
  }
  const wantAll = answers.some((a) => a.id === '*C');
  const fits = (c) => (wantAll ? c.rows.some((r) => r.kind === 'dugaan') : answers.every((a) => c.rows.some((r) => r.id === a.id)));
  let pool = cands.filter(fits);
  if (pool.length > 1) pool = pool.filter((c) => c.mine);
  if (pool.length !== 1) return { ok: false, why: pool.length ? 'lebih dari satu item cocok; sebut slug-nya' : 'tidak ada item draft dengan baris itu yang masih terbuka' };
  const { it, rows } = pool[0];
  const list = wantAll ? rows.filter((r) => r.kind === 'dugaan').map((r) => ({ id: r.id, val: 'benar', note: '' })) : answers;
  const done = [];
  for (const a of list) {
    const r = rows.find((x) => x.id === a.id); if (!r) continue;
    const yes = /^(benar|ya|ok|setuju|a)$/.test(a.val);
    let val;
    if (r.kind === 'keputusan') { const opts = parseOptions(r.options); const i = 'abcd'.indexOf(a.val); val = i >= 0 && opts[i] ? opts[i] : a.val; if (a.note) val += ` (${a.note})`; }
    else if (r.kind === 'dugaan') val = claimStatus(yes, a.note, 'ketik');
    else val = yes ? 'bertentangan, risiko diterima (user, ketik)' : `bertentangan (user, ketik${a.note ? `: ${a.note}` : ''})`;
    if (writeAnswer(it, a.id, val, r.kind === 'keputusan' ? '(ketik)' : '')) done.push(`${a.id}=${r.kind === 'keputusan' ? val : yes ? 'benar' : 'salah'}`);
  }
  if (done.length) audit(root, { event: 'typed-answer', session: sid, slug: it.slug, answers: done.join('; ') });
  return { ok: done.length > 0, slug: it.slug, done, left: decisionRows(readItem(root, it.slug) || it).length, why: done.length ? '' : 'tidak ada baris yang bisa ditulis' };
}
