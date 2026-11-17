#!/usr/bin/env node
// 1.16.0: pemilih (AskUserQuestion). Pertanyaan DIBUAT KODE dari baris D terbuka (align.md atau bagian 3 berkas tunggal) dan
// disimpan sebagai naskah. Saat user menjawab, hook PostToolUse (matcher AskUserQuestion) mencocokkan teks pertanyaan dengan
// naskah dan menulis jawabannya ke baris D. Pertanyaan yang tidak ada di naskah diabaikan, jadi agent tidak bisa mengarang
// pertanyaan yang berakibat ke berkas item. approve/merge TIDAK pernah lewat pemilih (D33): tetap dari ketikan user.
import fs from 'node:fs';
import path from 'node:path';
import { approvePending, rejectPending } from './memory.mjs';
import { readStdinJson, projectRoot, loadConfig, readItem, readAlign, decisionRows, isSingle, isMain, audit, shortSlug, nextStep, touchedSlugs, readJson } from './lib.mjs';

const naskahPath = (root, sid) => path.join(root, '.harness', 'state', 'ask', `${String(sid || 'x').replace(/\W/g, '')}.json`);
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// "a) 300 · b) tanpa batas" | "a. X · b. Y (rekomendasi)" → ['300', 'tanpa batas']
export function parseOptions(cell) {
  return String(cell || '').split(/\s+·\s+|\s*;\s*|\s+\/\s+(?=[a-d][.)])/).map((o) => o.replace(/^\s*[a-d][.)]\s*/i, '').trim()).filter(Boolean).slice(0, 4);
}

// Naskah untuk satu item: maksimal 4 pertanyaan (batas AskUserQuestion), masing-masing 2–4 opsi; sisanya tetap lewat tabel.
export function buildQuestions(root, item) {
  const qs = [];
  for (const d of decisionRows(item).filter((x) => x.kind === 'keputusan')) {
    const opts = parseOptions(d.options);
    if (opts.length < 2) continue;
    qs.push({ id: d.id, header: clip(`${d.id} ${shortSlug(root, item.slug)}`, 12), question: `${d.id}: ${d.ask}`, options: opts.map((o, i) => ({ label: clip(o, 60), description: i === 0 ? 'rekomendasi' : '' })), multiSelect: false });
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
export function askInstruction(questions) {
  return `Tanyakan keputusan ini ke user dengan tool AskUserQuestion, memakai argumen JSON berikut APA ADANYA (jangan ubah teks pertanyaan; jawaban dicatat hook dengan mencocokkan teks itu). Bila tool itu tidak tersedia, tampilkan tabel keputusan saja.\n${JSON.stringify({ questions: questions.map(({ id, ...q }) => q) })}`;
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

const ROW = /^\|\s*(D\d+)\s*\|/;
export function writeAnswer(item, id, answer) {
  const single = isSingle(item) && !fs.existsSync(path.join(item.dir, 'align.md'));
  const f = single ? item.planPath : path.join(item.dir, 'align.md');
  if (!fs.existsSync(f)) return false;
  let hit = false;
  const t = fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => {
    const m = ROW.exec(l); if (!m || m[1].toUpperCase() !== id.toUpperCase()) return l;
    const c = l.split('|'); while (c.length < 6) c.splice(c.length - 1, 0, ' ');
    c[4] = ` ${String(answer).replace(/\|/g, '/').trim()} (pemilih) `; hit = true; return c.join('|');
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
      if (writeAnswer(it, q.id, a)) done.push(`${slug} ${q.id}=${a}`);
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
