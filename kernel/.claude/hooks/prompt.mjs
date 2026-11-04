// UserPromptSubmit: persetujuan plan oleh MANUSIA. Prompt "/harness:approve <slug>" diketik user;
// agent tidak bisa memalsukannya. Hook inilah yang menulis status: approved.
import fs from 'node:fs';
import {
  readStdinJson, projectRoot, loadConfig, resolveSlug, readItem, checkTransition, setFmKey, context, audit, contextWarning, createQuick,
  readAlign, alignExempt, updateTicketPath,
} from './lib.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyService, approveProposal, formatLint } from './knowledge.mjs';
import { issueTicket } from './ship.mjs';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
const prompt = String(payload.prompt || '');
const m = /^\s*\/(?:harness:)?approve\s+([\w.\-]+)/i.exec(prompt);
// /harness:knowledge verify <svc> dan /harness:knowledge patterns <slug> <ids> (bentuk lama tanpa kata "knowledge" tetap diterima untuk kompatibilitas)
const mv = /^\s*\/(?:harness:)?(?:knowledge\s+)?verify\s+([\w.\-]+)\s*$/i.exec(prompt);
const mp = /^\s*\/(?:harness:)?(?:knowledge\s+)?patterns\s+([\w.\-]+)\s+(all|P\d+(?:\s*,\s*P\d+)*)\s*$/i.exec(prompt);
const mq = /^\s*\/(?:harness:)?quick(?:\s+([\s\S]*))?$/i.exec(prompt);
const ms = /^\s*\/(?:harness:)?ship\s+([\w.\-]+)\s*$/i.exec(prompt);
const ma = /^\s*\/(?:harness:)?align\s+([\w.\-]+)\s+ok\s*$/i.exec(prompt);
// /harness:update [all|rollback] atau kalimat "tolong root nya di update ke main": ketikan manusia = izin menjalankan `harness.mjs update` (tiket, 30 menit)
const mu = /^\s*\/(?:harness:)?update(?:\s+(all|rollback))?\s*$/i.exec(prompt)
  || (prompt.trim().length <= 120 && /root\s*nya\s+di\s*update\s+ke\s+main/i.test(prompt) ? [prompt, undefined] : null);
if (!m && !mv && !mp && !mq && !ms && !ma && !mu) {
  // Peringatan ambang konteks juga di sini (bukan hanya setelah tool): murah, sekali per prompt.
  try { const w = contextWarning(root, cfg, payload); if (w) context('UserPromptSubmit', w); } catch { /* abaikan */ }
  process.exit(0);
}

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] ${mv ? 'verify' : mp ? 'patterns' : mq ? 'quick' : ms ? 'merge' : ma ? 'align' : 'approve'} ditolak: ${reason}` }));
  process.exit(0);
};
const who0 = () => spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';

// /harness:align <slug> ok: manusia menutup debat objective. Ditulis hook (agent tidak boleh menulis verdict aligned).
if (ma) {
  const sa = resolveSlug(root, ma[1]);
  const ia = sa ? readItem(root, sa) : null;
  if (!ia) block(`work item "${ma[1]}" tidak ditemukan / ambigu.`);
  if (alignExempt(ia, cfg)) block(`item ${sa} tidak butuh align (lajur quick, tipe dikecualikan, atau align.required=false).`);
  const a = readAlign(ia);
  if (!a) block(`align.md belum ada. Minta agent menjalankan /harness:align ${sa} dulu.`);
  if (a.claims < 1) block('tabel klaim kosong (baris "| C1 | klaim | bukti path:baris | status |").');
  if (a.contradicted > 0) block(`${a.contradicted} klaim masih berstatus "bertentangan" dengan kode. Selesaikan dulu (ubah klaim atau minta penjelasan), lalu ulangi.`);
  if (a.rounds > cfg.align.max_rounds) block(`ronde ${a.rounds} melewati batas ${cfg.align.max_rounds}.`);
  const ap = path.join(ia.dir, 'align.md');
  let t = fs.readFileSync(ap, 'utf8');
  t = setFmKey(t, 'verdict', 'aligned'); t = setFmKey(t, 'aligned_at', new Date().toISOString()); t = setFmKey(t, 'aligned_by', who0());
  fs.writeFileSync(ap, t);
  audit(root, { event: 'align', session: payload.session_id, slug: sa, by: who0() });
  context('UserPromptSubmit', `[harness] Objective ${sa} ALIGNED oleh ${who0()} (ditulis hook). Berikutnya: /harness:plan ${sa}. Balas satu baris.`);
  process.exit(0);
}
// Update harness di root: hanya jalan dengan tiket dari ketikan manusia (guard-bash menolak tanpa tiket).
if (mu) {
  const mode = mu[1] ? mu[1].toLowerCase() : 'update';
  fs.mkdirSync(path.dirname(updateTicketPath(root)), { recursive: true });
  fs.writeFileSync(updateTicketPath(root), JSON.stringify({ mode, by: who0(), at: new Date().toISOString() }));
  audit(root, { event: 'update-ticket', session: payload.session_id, mode, by: who0() });
  const flag = mode === 'all' ? ' --all' : mode === 'rollback' ? ' --rollback' : '';
  context('UserPromptSubmit', `[harness] ${who0()} meminta ${mode === 'rollback' ? 'ROLLBACK update' : mode === 'all' ? 'update SEMUA project' : 'update root ke main'}. Jalankan HANYA "node .claude/hooks/harness.mjs update${flag}" (satu kali, tiket berlaku 30 menit); jangan commit/push/merge sendiri. Balas ≤5 baris: versi sebelum → sesudah, hasil doctor, apakah di-push, dan masalah bila ada.`);
  process.exit(0);
}

// /harness:ship <slug>: bila PR sudah terbuka, ketikan ini = keputusan merge. Hook memeriksa gate + check PR + akun gh,
// lalu menerbitkan tiket sekali pakai yang dipakai `harness.mjs ship`. Tanpa PR (fase A), perintah diteruskan ke skill.
if (ms) {
  const ss = resolveSlug(root, ms[1]);
  const it = ss ? readItem(root, ss) : null;
  if (it && it.status === 'done' && String(it.fm.pr || '').replace(/null|\[\]/g, '').trim()) {
    const r = issueTicket(root, cfg, it, who0());
    if (!r.ok) block(`\n- ${r.problems.join('\n- ')}`);
    if (r.allMerged) { context('UserPromptSubmit', `[harness] Semua PR ${ss} sudah MERGED. Jalankan "node .claude/hooks/harness.mjs set-status ${ss} merged" lalu jalankan skill summarize untuk ${ss} (ringkasan sesi ke docs/sessions/) dan balas ≤3 baris.`); process.exit(0); }
    audit(root, { event: 'merge-ticket', session: payload.session_id, slug: ss, by: who0(), prs: r.ticket.prs.map((x) => x.url).join(' ') });
    context('UserPromptSubmit', `[harness] ${who0()} memutuskan MERGE ${ss}. Tiket sekali pakai terbit (berlaku ${cfg.ship.ticket_ttl_min} menit) untuk: ${r.ticket.prs.map((x) => `${x.url} [${x.checks}]`).join('; ')}. Jalankan HANYA "node .claude/hooks/harness.mjs ship ${ss}"; jangan gh pr merge. Bila semua PR merged dan status menjadi merged, jalankan skill summarize untuk ${ss} (ringkasan sesi ke docs/sessions/). Balas ≤3 baris: hasil tiap PR, status akhir, path ringkasan.`);
  }
  process.exit(0);
}
// /harness:quick <permintaan>: ketikan manusia = persetujuan. Hook membuat item lajur quick berstatus approved (satu service, batas file di config).
if (mq) {
  const r = createQuick(root, mq[1], who0());
  if (!r.ok) block(r.reason);
  audit(root, { event: 'quick', session: payload.session_id, slug: r.slug, by: who0() });
  context('UserPromptSubmit', `[harness] Item quick ${r.slug} dibuat dan APPROVED oleh ${who0()} (ditulis hook). Kerjakan di sesi ini: baca knowledge service yang kena, ubah minimal (maks ${cfg.quick.max_files} file, satu service, bukan skema), tulis bukti AC di progress.md, lalu "node .claude/hooks/harness.mjs set-status ${r.slug} done". Melebihi batas → "harness.mjs promote ${r.slug}". Balas ≤3 baris saat selesai: apa berubah dan "/harness:ship ${r.slug}".`);
  process.exit(0);
}
// /harness:knowledge verify <svc>: knowledge draft → verified, hanya bila lint bersih. Ditulis hook, bukan agent.
if (mv) {
  const svc = mv[1];
  if (!(cfg.services || []).includes(svc)) block(`service "${svc}" tidak ada di harness.config.json.`);
  const r = verifyService(root, cfg, svc, who0());
  if (!r.ok) block(`knowledge ${svc} tidak lolos lint (${r.lint.errors} ERROR). Jalankan: node .claude/hooks/harness.mjs lint-knowledge ${svc}\n${formatLint([r.lint], { max: 12 })}`);
  audit(root, { event: 'verify-knowledge', session: payload.session_id, service: svc, by: who0() });
  context('UserPromptSubmit', `[harness] Knowledge ${svc} sekarang VERIFIED oleh ${who0()} (ditulis hook): ${r.changed.join(', ')}. Balas satu baris konfirmasi saja.`);
  process.exit(0);
}
// /harness:knowledge patterns <slug> <P1,P3|all>: menerapkan usulan pola yang disetujui manusia ke patterns.md.
if (mp) {
  const ps = resolveSlug(root, mp[1]);
  if (!ps) block(`work item "${mp[1]}" tidak ditemukan / ambigu.`);
  const ids = mp[2].toLowerCase() === 'all' ? 'all' : mp[2].split(',').map((x) => x.trim().toUpperCase());
  const r = approveProposal(root, cfg, ps, ids, who0());
  if (!r.ok) block(`\n- ${r.problems.join('\n- ')}`);
  audit(root, { event: 'patterns-approve', session: payload.session_id, slug: ps, by: who0(), applied: r.applied.join(',') });
  context('UserPromptSubmit', `[harness] Usulan pola disetujui ${who0()} dan DITERAPKAN oleh hook ke patterns.md: ${r.applied.join(', ')}. Balas satu baris konfirmasi; jangan mengedit patterns.md lagi untuk ini.`);
  process.exit(0);
}

const slug = resolveSlug(root, m[1]);
if (!slug) block(`work item "${m[1]}" tidak ditemukan / ambigu. Lihat: node .claude/hooks/harness.mjs list`);
const item = readItem(root, slug);
const problems = checkTransition(root, cfg, item, 'approved', { actor: 'human' });
if (problems.length) block(`\n- ${problems.join('\n- ')}`);

const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
let t = fs.readFileSync(item.planPath, 'utf8');
t = setFmKey(t, 'status', 'approved');
t = setFmKey(t, 'approved_at', new Date().toISOString());
t = setFmKey(t, 'approved_by', who);
fs.writeFileSync(item.planPath, t);
audit(root, { event: 'approve', session: payload.session_id, slug, by: who });
context('UserPromptSubmit', `[harness] Plan ${slug} sekarang APPROVED oleh ${who} (ditulis hook, bukan agent). ` +
  'Balas maksimal 2 baris: konfirmasi dan instruksi membuka sesi baru lalu menjalankan "/harness:build ' + slug + '". Jangan mulai implementasi di sesi planning ini.');
