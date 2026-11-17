// Stop: gerbang #3. Sesi tidak boleh berhenti bila item yang dikerjakan SESI INI (dicatat post.mjs) sudah "siap" (semua AC berbukti)
// tetapi bukti test (.harness/evidence/<slug>/tests.json) belum ada / gagal / usang, atau (lajur standard, in-review) review.md belum ada.
// Exit 2 = tolak berhenti dan beri alasan ke agent. Anti-loop: stop_hook_active dari Claude Code + penghitung per sesi (stop_gate.max_blocks).
import fs from 'node:fs';
import path from 'node:path';
import {
  readStdinJson, projectRoot, loadConfig, listItems, summarizeItem, readEvidence, codeFingerprint, isQuick, readJson, audit, isMain, touchedSlugs,
  readAlign, alignExempt, formatDecision, planeKick, decisionRows,
} from './lib.mjs';
import { logIntent } from './pilot.mjs';
import { buildQuestions, saveNaskah, askInstruction, saveLessonNaskah } from './ask.mjs';
import { lessonsAsk } from './growth.mjs';
import crypto from 'node:crypto';
import { openRows, formatOpen } from './recap.mjs';

export const WAITING = /(background agent|agen(?:t)? latar|di latar belakang|(?:sedang|masih) (?:mengerjakan|berjalan|bekerja)|menunggu (?:agen|agent|laporan|hasil)|hasilnya belum ada|setelah laporannya masuk)/i;

// 1.10.0: rekap "belum selesai" untuk item yang disentuh sesi ini, ditampilkan ke USER (systemMessage), hanya bila isinya berubah
// sejak rekap terakhir sesi ini (agar tidak berulang tiap giliran).
// 1.12.0 (F1): giliran yang menyentuh item draft belum-aligned harus ditutup dengan tabel keputusan buatan kode.
// Menahan sekali per isi tabel per sesi (anti-loop: stop_hook_active + sidik isi), bukan tiap giliran.
export function decisionFor(root, cfg, payload) {
  if (!cfg.align.decision_table || payload.stop_hook_active) return null;
  const mine = touchedSlugs(root, payload.session_id);
  const parts = []; const slugs = []; const asked = [];
  for (const it of listItems(root)) {
    if (!mine.has(it.slug) || it.status !== 'draft' || alignExempt(it, cfg)) continue;
    const a = readAlign(it);
    if (!a || a.verdict === 'aligned' || !a.claims) continue;
    if (!decisionRows(it).length) continue; // 1.19.2: tanpa keputusan/klaim terbuka tidak ada yang perlu ditanyakan; giliran tidak ditahan
    parts.push(formatDecision(root, it)); if (it.fm.plane_id) slugs.push(it.slug); asked.push(it);
  }
  if (!parts.length) return null;
  const text = parts.join('\n\n');
  const mark = path.join(root, '.harness', 'state', `decision-${String(payload.session_id || 'x').replace(/\W/g, '')}.json`);
  const h = crypto.createHash('sha1').update(text).digest('hex');
  if (readJson(mark, {}).h === h) return null;
  fs.mkdirSync(path.dirname(mark), { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ h, at: new Date().toISOString() }));
  logIntent(root, cfg, { type: 'stop-hold', sid: payload.session_id || 'unknown' });
  // 1.13.0 (D19): keputusan yang menahan pekerjaan juga dikirim ke kartu Plane dengan @mention (latar, sekali per isi tabel)
  if (cfg.plane.enabled) for (const sl of slugs) planeKick(root, ['ask', sl, '--decide']);
  // 1.16.0: keputusan D dengan opsi jelas ditanyakan lewat pemilih; jawabannya dicatat hook ask.mjs
  let pick = '';
  if (cfg.tui.ask) { const qs = []; for (const it of asked) { const q = buildQuestions(root, it); if (q.length) { saveNaskah(root, payload.session_id, it.slug, q); qs.push(...q); } } if (qs.length) pick = `\n\n${askInstruction(qs.slice(0, 4))}`; }
  return `tutup giliran ini dengan tabel keputusan berikut, APA ADANYA (dibuat kode dari align.md). Jangan menambah narasi, jangan menyarankan perintah lain selain baris "Berikutnya". Pertanyaan baru untuk user ditulis dulu sebagai baris D di "## Keputusan terbuka" align.md (atau bagian 3 berkas item).\n\n${text}${pick}`;
}

export function recapFor(root, cfg, sid) {
  if (!cfg.recap.enabled || !cfg.recap.on_stop) return null;
  const mine = touchedSlugs(root, sid);
  if (!mine.size) return null;
  const rows = openRows(root, cfg, { slugs: mine });
  const others = openRows(root, cfg).filter((r) => r.jenis === 'langkah' && !mine.has(r.item)).length;
  const text = `${formatOpen(rows, cfg.recap.max_rows, 'Belum selesai (item sesi ini)')}${others ? `\n+${others} item lain terbuka → ketik "sisa"` : ''}`;
  const mark = path.join(root, '.harness', 'state', `recap-${String(sid || 'x').replace(/\W/g, '')}.json`);
  const h = crypto.createHash('sha1').update(text).digest('hex');
  if (readJson(mark, {}).h === h) return null;
  fs.mkdirSync(path.dirname(mark), { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ h, at: new Date().toISOString() }));
  return text;
}

export function problemsFor(root, cfg, sid) {
  const mine = touchedSlugs(root, sid);
  const out = [];
  for (const item of listItems(root)) {
    if (!['in-progress', 'in-review'].includes(item.status)) continue;
    if (!mine.has(item.slug)) continue; // bukan item yang dikerjakan sesi ini
    const sum = summarizeItem(item);
    if (!sum.ac.length || sum.ac.some((a) => a.evidence !== 'ok')) continue; // belum siap: boleh berhenti
    const ev = readEvidence(root, item.slug);
    if (!ev) out.push(`${item.slug}: bukti test belum ada. Panggil agent runner (atau: node .claude/hooks/harness.mjs run-checks ${item.slug}).`);
    else if (ev.verdict === 'fail') out.push(`${item.slug}: test GAGAL (${(ev.checks || []).filter((c) => !c.ok).map((c) => `${c.service}:${c.name}`).join(', ')}). Perbaiki, lalu jalankan runner lagi.`);
    else if (ev.verdict === 'unchecked' && cfg.gate.require_checks) out.push(`${item.slug}: tidak ada checks terkonfigurasi tetapi gate.require_checks aktif.`);
    else if (ev.code_fingerprint !== codeFingerprint(root, cfg, item)) out.push(`${item.slug}: bukti test usang (kode berubah setelah test dijalankan). Jalankan runner lagi.`);
    if (!isQuick(item) && item.status === 'in-review' && (!sum.review || sum.review.verdict === 'pending')) out.push(`${item.slug}: review belum dijalankan (review.md kosong/pending). Jalankan skill review ${item.slug} (agent reviewer).`);
  }
  return out;
}

export function evaluate(root, cfg, payload) {
  if (!cfg.stop_gate.enabled) return { ok: true };
  if (payload.stop_hook_active) return { ok: true, why: 'stop_hook_active' };
  const mark = path.join(root, '.harness', 'state', `stop-${String(payload.session_id || 'x').replace(/\W/g, '')}.json`);
  const prev = readJson(mark, { blocks: 0 });
  if ((prev.blocks || 0) >= cfg.stop_gate.max_blocks) return { ok: true, why: 'batas penolakan per sesi tercapai' };
  const problems = problemsFor(root, cfg, payload.session_id);
  if (!problems.length) return { ok: true };
  fs.mkdirSync(path.dirname(mark), { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ blocks: (prev.blocks || 0) + 1, at: new Date().toISOString() }));
  return { ok: false, reason: `belum boleh berhenti (${(prev.blocks || 0) + 1}/${cfg.stop_gate.max_blocks}):\n- ${problems.join('\n- ')}` };
}

if (isMain(import.meta.url)) {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  const cfg = loadConfig(root);
  let r = { ok: true };
  try { r = evaluate(root, cfg, payload); } catch { /* gerbang Stop tidak boleh menjebak sesi bila rusak */ }
  if (!r.ok) {
    audit(root, { event: 'stop-block', session: payload.session_id, reason: r.reason });
    process.stderr.write(`[harness] ${r.reason}\n`);
    process.exit(2);
  }
  let dec = null; try { dec = decisionFor(root, cfg, payload); } catch { /* tidak boleh menjebak sesi */ }
  if (dec) {
    audit(root, { event: 'stop-decision', session: payload.session_id });
    process.stderr.write(`[harness] ${dec}\n`);
    process.exit(2);
  }
  // 1.18.0: pelajaran dari item sesi ini ditawarkan lewat pemilih (sekali per set usulan)
  try {
    const la = lessonsAsk(root, cfg, payload.session_id);
    if (la && !payload.stop_hook_active) {
      saveLessonNaskah(root, payload.session_id, la);
      process.stderr.write(`[harness] Tawarkan pelajaran ini ke user dengan tool AskUserQuestion, argumen JSON APA ADANYA (yang dipilih disimpan ke memori project, sisanya dibuang; dicatat hook). Bila tool tidak tersedia, tampilkan daftar dan minta user mengetik "ingat P1,P2".\n${JSON.stringify({ questions: [la.question] })}\n`);
      process.exit(2);
    }
  } catch { /* pelajaran tidak boleh menjebak sesi */ }
  // 1.13.1 (recap.render): "assistant" = giliran ditahan sekali agar agent menutup dengan tabel Markdown (dirender TUI);
  // "system" = perilaku lama (systemMessage, tampil sebagai teks polos). Tidak ditahan bila sudah ditahan di giliran ini
  // atau pesan terakhir agent sudah memuat tabelnya.
  // 1.19.2: giliran yang hanya menunggu agent latar belakang tidak ditahan dan rekapnya tidak "dipakai" (muncul di giliran
  // berikutnya), agar tabel tidak tampil dua kali di tengah pekerjaan. Heuristik dari pesan terakhir agent.
  if (WAITING.test(String(payload.last_assistant_message || ''))) process.exit(0);
  try {
    const t = recapFor(root, cfg, payload.session_id);
    if (t) {
      const last = String(payload.last_assistant_message || '');
      if (cfg.recap.render === 'assistant' && !payload.stop_hook_active && !/Belum selesai[^\n]*\(\d+\)/.test(last)) {
        process.stderr.write(`[harness] Tutup giliran ini dengan tabel berikut sebagai Markdown, APA ADANYA (dibuat kode). Tanpa narasi tambahan, tanpa mengulang isi giliran.\n\n${t}\n`);
        process.exit(2);
      }
      if (cfg.recap.render !== 'assistant') process.stdout.write(JSON.stringify({ systemMessage: `[harness] ${t}` }));
    }
  } catch { /* rekap tidak boleh mengganggu */ }
  process.exit(0);
}
