// UserPromptSubmit: persetujuan plan oleh MANUSIA. Prompt "/harness:approve <slug>" diketik user;
// agent tidak bisa memalsukannya. Hook inilah yang menulis status: approved.
import fs from 'node:fs';
import { isSingle, activeSessionItem, newItemTicketPath, shortSlug,
  readStdinJson, projectRoot, loadConfig, resolveSlug, readItem, checkTransition, setFmKey, context, audit, contextWarning, createQuick,
  readAlign, alignExempt, updateTicketPath, CLAIM_ROW, nextStep, listItems, formatDecision, planeKick,
} from './lib.mjs';
import { logIntent, markMisfire } from './pilot.mjs';
import { takeInbox } from './plane.mjs';
import { intentPath } from './ship.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { verifyService, approveProposal, formatLint } from './knowledge.mjs';
import { issueTicket, writeIntent } from './ship.mjs';
import { parseIntent } from './intent.mjs';
import { addEntry, removeEntry, approvePending, refText } from './memory.mjs';
import { resolveArchived } from './tidy.mjs';
import { menuFor, parseTypedAnswers, applyTypedAnswers } from './ask.mjs';
import { autoRecall, recallText } from './growth.mjs';
import { bidangFromPrompt, setSessionBidang, execText } from './bidang.mjs';
import { openRows, formatOpen } from './recap.mjs';

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
let prompt = String(payload.prompt || '');
const who0 = () => spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
// 1.10.0: kalimat pendek tanpa slash → perintah kanonik; "ref:<slug>" → ringkasan item sebagai konteks.
const soleDone = () => { const d = listItems(root).filter((i) => i.status === 'done'); return d.length === 1 ? d[0].slug : null; };
const intent = parseIntent(prompt, cfg, (q) => resolveSlug(root, q), soleDone);
const refCtx = intent.refs.map((r) => resolveSlug(root, r) || resolveArchived(root, r)).filter(Boolean).map((s) => refText(root, cfg, s)).filter(Boolean);
const sid = payload.session_id || 'unknown';
// 1.17.0: bidang dari ucapan ("backend: …", "ini frontend") → ditandai sejak diskusi; spesialis dipanggil saat eksekusi
if (cfg.bidang.enabled) {
  const ub = bidangFromPrompt(payload.prompt);
  if (ub) { setSessionBidang(root, sid, ub); refCtx.push(`[harness] Bidang pekerjaan: ${ub} (dari ucapan user). Tulis \`bidang: [${ub}]\` di frontmatter item. Spesialis \`${ub}\` dipanggil saat eksekusi ("kerjakan <slug>"), bukan sekarang.`); }
}
// 1.13.0: log pilot (lokal) + peringatan slash usang (D8: di 2.0 hanya init/update yang tampil sebagai slash)
const DEPRECATED = { approve: 'setuju <slug>', status: 'sisa', next: 'sisa', quick: 'quick: <permintaan>' };
const slash = /^\s*\/harness:([\w-]+)/i.exec(String(payload.prompt || ''));
const extra0 = [];
if (slash) {
  logIntent(root, cfg, { type: 'slash', sid, skill: slash[1].toLowerCase() });
  if (DEPRECATED[slash[1].toLowerCase()]) extra0.push(`[harness] /harness:${slash[1]} akan dihapus di 2.0. Mulai sekarang cukup ketik: "${DEPRECATED[slash[1].toLowerCase()]}". Sebutkan ini satu baris ke user.`);
}
if ((intent.command || intent.kind) && !['remember', 'misfire'].includes(intent.kind)) {
  logIntent(root, cfg, { type: 'intent', sid, kind: intent.kind || intent.command.split(/\s+/)[0].replace('/harness:', ''), slug: intent.slug || (intent.command || '').split(/\s+/)[1] || null, prompt: payload.prompt });
}
// 1.13.0: komentar manusia baru dari Plane (ditarik di latar) → konteks, sekali; tarik lagi di latar (dibatasi pull_min_interval_s)
if (cfg.plane.enabled && cfg.plane.pull_comments) {
  try { const inbox = takeInbox(root); if (inbox.length) refCtx.push(`[harness] Komentar baru dari user di Plane (balas di kartu dengan: node .claude/hooks/harness.mjs plane comment <slug> "<balasan>"; keputusan yang menahan pekerjaan: plane ask <slug> --decide):\n${inbox.slice(-8).map((c) => `- ${c.slug} (${c.at}): ${c.text.replace(/\n+/g, ' / ')}`).join('\n')}`); } catch { /* abaikan */ }
  planeKick(root, ['pull', '--auto', '--quiet']);
}
refCtx.push(...extra0);
// 1.18.0: rujukan otomatis untuk prompt biasa (bukan perintah pendek), dicari kode
if (!intent.command && !intent.kind && !slash && cfg.memory.enabled) { try { const rt = recallText(autoRecall(root, cfg, payload.prompt, sid)); if (rt) refCtx.push(rt); } catch { /* abaikan */ } }
// 1.19.4: jawaban tabel keputusan yang diketik ("C4 benar dan C5 benar", "D1: a") dicatat hook, bukan agent
const typed = !intent.command && !intent.kind && !slash ? parseTypedAnswers(payload.prompt) : null;
if (typed) {
  const r = applyTypedAnswers(root, sid, typed);
  if (r.ok) { context('UserPromptSubmit', [...refCtx, `[harness] Jawaban user DICATAT HOOK ke berkas item ${r.slug}: ${r.done.join(', ')}. Jangan menulis ulang jawaban itu. Klaim berstatus "bertentangan (user…)" = koreksi teks klaimnya di berkas. Tutup giliran dengan keluaran "node .claude/hooks/harness.mjs decide ${r.slug} --md" apa adanya (${r.left} masih terbuka).`].join('\n\n')); process.exit(0); }
  refCtx.push(`[harness] Ketikan user tampak seperti jawaban tabel keputusan, tetapi TIDAK dicatat (${r.why}). Sampaikan satu baris ke user.`);
}
if (intent.command) prompt = intent.command;
if (intent.kind) {
  const say = (txt) => { context('UserPromptSubmit', [...refCtx, txt].join('\n\n')); process.exit(0); };
  const stop = (txt) => { process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] ${txt}` })); process.exit(0); };
  if (intent.kind === 'decide') {
    const its = (intent.slug ? [readItem(root, intent.slug)] : listItems(root).filter((i) => i.status === 'draft' && !alignExempt(i, cfg))).filter(Boolean).filter((i) => { const a = readAlign(i); return a && a.verdict !== 'aligned'; });
    say(`[harness] Tampilkan tabel ini APA ADANYA, tanpa narasi tambahan.\n${its.length ? its.map((i) => formatDecision(root, i)).join('\n\n') : 'Tidak ada keputusan align yang terbuka.'}`);
  }
  if (intent.kind === 'misfire') {
    const last = markMisfire(root, cfg, sid);
    if (!last) say('[harness] Tidak ada kalimat pendek yang ditangkap di sesi ini; tidak ada yang dibatalkan. Tanyakan satu baris: maksud user apa.');
    let undo = 'tidak ada efek yang perlu dibatalkan';
    if (last.kind === 'ship' && last.slug) { try { fs.rmSync(intentPath(root, last.slug), { force: true }); undo = `izin merge untuk ${last.slug} dicabut`; } catch { /* abaikan */ } }
    else if (last.kind === 'remember' && last.ref) { const r = removeEntry(root, last.ref, who0()); undo = r.ok ? `memori ${last.ref} dihapus lagi` : `memori ${last.ref} gagal dihapus: ${r.reason}`; }
    else if (last.kind === 'approve' && last.slug) undo = `approve ${last.slug} TIDAK dibatalkan otomatis; bila perlu user mengetik "! node .claude/hooks/harness.mjs reopen ${last.slug}"`;
    else if (['decide', 'open', 'pull'].includes(last.kind)) undo = 'hanya menampilkan tabel; abaikan tabelnya';
    say(`[harness] "${last.prompt || last.kind}" ditandai SALAH TANGKAP (dicatat untuk pilot 2.0). ${undo}. Jangan lanjutkan tindakan dari intent itu; tanyakan satu baris maksud user yang sebenarnya.`);
  }
  if (intent.kind === 'pull') {
    if (!cfg.plane.enabled) stop('Plane mati (plane.enabled=false).');
    const r = spawnSync(process.execPath, [path.join(root, '.claude', 'hooks', 'harness.mjs'), 'plane', 'pull', ...(intent.slug ? [intent.slug] : [])], { cwd: root, encoding: 'utf8', timeout: 40000, env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    const inbox = takeInbox(root);
    say(`[harness] Hasil tarik Plane (cermin: .harness/plane/<slug>.md). Tampilkan tabel apa adanya, lalu tanggapi komentar baru (bila ada) di kartu dengan "node .claude/hooks/harness.mjs plane comment <slug> \"<balasan>\"".\n${(r.stdout || r.stderr || '(tanpa keluaran)').trim().slice(0, 4000)}${inbox.length ? `\nKomentar baru: ${inbox.map((c) => `${c.slug}: ${c.text.replace(/\n+/g, ' / ')}`).join(' ; ').slice(0, 2000)}` : ''}`);
  }
  if (intent.kind === 'menu') {
    const mn = menuFor(root, cfg, sid);
    say(`[harness] User meminta menu. ${cfg.tui.menu ? `Panggil AskUserQuestion dengan argumen JSON ini apa adanya, lalu kerjakan pilihan user: ${JSON.stringify({ questions: mn.questions })}` : 'Tampilkan langkah berikutnya sebagai tabel.'}${mn.typed.length ? ` Sebut juga, sebagai teks (harus diketik user, bukan dipilih): ${mn.typed.join(' · ')}.` : ''}`);
  }
  if (intent.kind === 'build') { const bi = readItem(root, intent.slug); say(`[harness] User meminta eksekusi ${intent.slug}. Jalankan skill harness:build untuk ${intent.slug} (gerbang: item harus approved/in-progress).${cfg.bidang.enabled && bi ? ` ${execText(cfg, bi, root)}` : ''}`); }
  if (intent.kind === 'open') say(`[harness] Tampilkan tabel ini APA ADANYA (tanpa narasi), lalu satu baris: langkah paling penting berikutnya.\n${formatOpen(openRows(root, cfg), cfg.recap.max_rows)}`);
  if (!cfg.memory.enabled) stop('memori mati (memory.enabled=false).');
  if (intent.kind === 'remember') { const r = addEntry(root, cfg, intent.text, who0(), intent.target); if (!r.ok) stop(`ingat ditolak: ${r.reason}`); logIntent(root, cfg, { type: 'intent', sid, kind: 'remember', ref: r.id, prompt: payload.prompt }); say(`[harness] ${intent.target === 'user' ? 'Profil user' : 'Memori'} ${r.id} disimpan oleh ${who0()} (ditulis hook; ${r.used}/${r.max} karakter). ${intent.target === 'user' ? 'Ikuti preferensi ini mulai sekarang; ' : ''}Dimuat otomatis mulai sesi berikutnya. Balas satu baris konfirmasi.`); }
  if (intent.kind === 'remember-approve') { const r = approvePending(root, cfg, intent.ids, who0()); if (!r.ok) stop(`ingat ditolak: ${r.reason}`); say(`[harness] Usulan memori diterapkan: ${r.applied.join(', ')}${r.failed.length ? `; gagal: ${r.failed.join('; ')}` : ''}. Balas satu baris.`); }
  if (intent.kind === 'forget') { const r = removeEntry(root, intent.key, who0()); if (!r.ok) stop(`lupakan ditolak: ${r.reason}`); say(`[harness] Memori dihapus: "${r.removed.slice(0, 80)}". Balas satu baris.`); }
}
const m = /^\s*\/(?:harness:)?approve\s+([\w.\-]+)/i.exec(prompt);
// /harness:knowledge verify <svc> dan /harness:knowledge patterns <slug> <ids> (bentuk lama tanpa kata "knowledge" tetap diterima untuk kompatibilitas)
const mv = /^\s*\/(?:harness:)?(?:knowledge\s+)?verify\s+([\w.\-]+)\s*$/i.exec(prompt);
const mp = /^\s*\/(?:harness:)?(?:knowledge\s+)?patterns\s+([\w.\-]+)\s+(all|P\d+(?:\s*,\s*P\d+)*)\s*$/i.exec(prompt);
const mq = /^\s*\/(?:harness:)?quick(?:\s+([\s\S]*))?$/i.exec(prompt);
const ms = /^\s*\/(?:harness:)?ship\s+([\w.\-]+)\s*$/i.exec(prompt);
const ma = /^\s*\/(?:harness:)?align\s+([\w.\-]+)\s+ok(?:\s+terima\s+(semua|all|C\d+(?:\s*,\s*C\d+)*))?\s*$/i.exec(prompt);
// /harness:update [all|rollback] atau kalimat "tolong root nya di update ke main": ketikan manusia = izin menjalankan `harness.mjs update` (tiket, 30 menit)
const mu = /^\s*\/(?:harness:)?update(?:\s+(all|rollback))?\s*$/i.exec(prompt)
  || (prompt.trim().length <= 120 && /root\s*nya\s+di\s*update\s+ke\s+main/i.test(prompt) ? [prompt, undefined] : null);
if (!m && !mv && !mp && !mq && !ms && !ma && !mu) {
  // Peringatan ambang konteks juga di sini (bukan hanya setelah tool): murah, sekali per prompt.
  const extra = [...refCtx];
  // 1.20.0: satu sesi = satu work item. Prompt biasa di sesi yang sudah punya item aktif = lanjutan item itu.
  if (cfg.session_item.single && !slash && !typed) {
    try {
      const act = activeSessionItem(root, sid);
      const { activeSessionTopic, resolveTopic } = await import('./topic.mjs');
      const top = act ? null : activeSessionTopic(root, sid);
      const jm = /^\s*jadikan\s+(?:work\s+)?item\b\s*([\w.-]+)?/i.exec(payload.prompt);
      const tm = /^\s*topik\s*:\s*(.+)/i.exec(payload.prompt);
      if (jm) {
        const t = (jm[1] && resolveTopic(root, jm[1])) || top;
        fs.mkdirSync(path.dirname(newItemTicketPath(root, sid)), { recursive: true });
        fs.writeFileSync(newItemTicketPath(root, sid), JSON.stringify({ at: new Date().toISOString(), topic: t ? t.slug : null }));
        extra.push(t ? `[harness] User meminta topik ${t.slug} DIJADIKAN WORK ITEM. Jalankan "node .claude/hooks/harness.mjs topic promote ${t.slug} <feature|improvement|hotfix|analysis|cross-repo|schema>", lalu lanjutkan skill impact di item itu: isi bagian 1–3 plan.md dari Pertanyaan/Temuan/Keputusan topik (jangan ditanyakan ulang).`
          : '[harness] User meminta "jadikan item", tetapi sesi ini tidak punya topik terbuka: buat item langsung (skill impact; harness.mjs new diizinkan sekali).');
      } else if (tm) {
        extra.push(`[harness] User membuka TOPIK (diskusi, bukan work item): "${tm[1].trim().slice(0, 120)}". Jalankan "node .claude/hooks/harness.mjs topic new <judul singkat>", lalu isi Pertanyaan/Temuan di berkasnya. Jangan membuat work item.`);
      } else if (/\bitem\s+baru\b/i.test(payload.prompt)) {
        fs.mkdirSync(path.dirname(newItemTicketPath(root, sid)), { recursive: true });
        fs.writeFileSync(newItemTicketPath(root, sid), JSON.stringify({ at: new Date().toISOString(), from: act ? act.slug : null }));
        extra.push(`[harness] User meminta ITEM BARU: boleh satu kali "harness.mjs new" (skill impact)${act ? `; item ${act.slug} tetap tercatat dan tidak ditutup` : ''}.`);
      } else if (act) {
        const sl = shortSlug(root, act.slug);
        const how = act.status === 'draft' ? 'perbarui bagian 1–3 plan.md (objective, penjelasan, klaim, baris D) bila lingkupnya berubah; diskusi dan keputusan dicatat di item ini'
          : ['approved', 'in-progress'].includes(act.status) ? `catat di "### Decision log"; AC tambahan kecil lewat "harness.mjs amend ${sl} --ac ..."; perubahan lingkup besar = user mengetik reopen`
          : 'catat di "### Decision log"; perbaikan kode setelah review/done = AC tambahan (amend) atau reopen';
        extra.push(`[harness] Sesi ini sedang membahas item ${act.slug} (${act.status}). Permintaan ini LANJUTAN item itu, bukan item baru: ${how}. Jangan menjalankan "harness.mjs new" (ditolak hook). Item baru hanya bila user mengetik "item baru".`);
      }
      else if (top) {
        extra.push(`[harness] Sesi ini sedang membahas topik ${top.slug} (docs/topics/${top.slug}.md). Permintaan ini LANJUTAN topik itu: catat temuan (fakta/dugaan/rekomendasi + bukti) dan keputusan final di berkasnya. Bila user meminta perubahan kode, sarankan satu baris: ketik "jadikan item". Jangan "harness.mjs new" (ditolak hook).`);
      }
    } catch { /* tidak boleh mengganggu prompt */ }
  }
  try { const w = contextWarning(root, cfg, payload); if (w) extra.push(w); } catch { /* abaikan */ }
  if (extra.length) context('UserPromptSubmit', extra.join('\n\n'));
  process.exit(0);
}

const ctxOut = (t) => context('UserPromptSubmit', [...extra0, t].join('\n\n'));
const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason: `[harness] ${mv ? 'verify' : mp ? 'patterns' : mq ? 'quick' : ms ? 'merge' : ma ? 'align' : 'approve'} ditolak: ${reason}` }));
  process.exit(0);
};

// /harness:align <slug> ok: manusia menutup debat objective. Ditulis hook (agent tidak boleh menulis verdict aligned).
if (ma) {
  const sa = resolveSlug(root, ma[1]);
  const ia = sa ? readItem(root, sa) : null;
  if (!ia) block(`work item "${ma[1]}" tidak ditemukan / ambigu.`);
  if (alignExempt(ia, cfg)) block(`item ${sa} tidak butuh align (lajur quick, tipe dikecualikan, atau align.required=false).`);
  const a = readAlign(ia);
  // 1.19.6: klaim belum ditulis = pekerjaan agent yang terlewat, bukan kesalahan user. Ketikan tidak ditolak: agent diarahkan
  // menjalankan skill align sekarang; user mengetik "align ok" lagi setelah tabel keputusan tampil.
  if (!a || a.claims < 1) { ctxOut(`[harness] "align ok ${sa}" BELUM dicatat: tabel klaim vs bukti kode masih kosong (pekerjaan agent yang terlewat). Jalankan skill align ${sa} SEKARANG: tulis klaim (baris "| C1 | klaim | bukti path:baris | status |") di ${isSingle(ia) ? '"### Klaim vs bukti kode" bagian 3 plan.md' : 'align.md'}, lalu tutup giliran dengan keluaran "node .claude/hooks/harness.mjs decide ${sa} --md" apa adanya. Beri tahu user satu baris: align ok diketik lagi setelah tabel itu dijawab.`); process.exit(0); }
  const single = isSingle(ia) && !fs.existsSync(path.join(ia.dir, 'align.md')); // 1.16.0: align di plan.md
  const ap = single ? ia.planPath : path.join(ia.dir, 'align.md');
  let t = fs.readFileSync(ap, 'utf8');
  const conflictRows = () => t.split(/\r?\n/).filter((l) => CLAIM_ROW.test(l) && /bertentangan/i.test(l)).map((l) => l.split('|').map((x) => x.trim()));
  // Manusia menerima risiko klaim "bertentangan": baris diubah ke "diterima (manusia)" dan dicatat di Debat.
  if (ma[2] && conflictRows().length) {
    if (!cfg.align.accept_contradictions) block('menerima klaim bertentangan dimatikan (align.accept_contradictions=false).');
    const want = /^(semua|all)$/i.test(ma[2]) ? null : new Set(ma[2].toUpperCase().split(/\s*,\s*/));
    const took = [];
    t = t.split(/\r?\n/).map((l) => { if (!CLAIM_ROW.test(l) || !/bertentangan/i.test(l)) return l; const id = l.split('|')[1].trim().toUpperCase(); if (want && !want.has(id)) return l; took.push(id); return l.replace(/bertentangan/gi, 'diterima (manusia)'); }).join('\n');
    if (!took.length) block(`klaim ${ma[2]} tidak ada atau tidak berstatus bertentangan.`);
    const note = `- ${new Date().toISOString().slice(0, 10)} ${took.join(', ')}: bertentangan dengan kode, risikonya DITERIMA oleh ${who0()}.`;
    if (single) t = /^###\s+Debat.*$/m.test(t) ? t.replace(/^(###\s+Debat.*)$/m, `$1\n${note}`) : t.replace(/^## 4\.? *Eksekusi/m, `### Debat\n${note}\n\n## 4. Eksekusi`);
    else t = /^##\s+Debat.*$/m.test(t) ? t.replace(/^(##\s+Debat.*)$/m, `$1\n${note}`) : `${t.trimEnd()}\n\n## Debat\n${note}\n`;
    fs.writeFileSync(ap, t); // penerimaan risiko = keputusan manusia; tetap tercatat walau align belum bisa ditutup
    audit(root, { event: 'align-accept', session: payload.session_id, slug: sa, by: who0(), claims: took.join(',') });
  }
  const left = conflictRows();
  if (left.length) block(`${left.length} klaim masih "bertentangan" dengan kode.\n${formatDecision(root, readItem(root, sa))}`);
  if (a.rounds > cfg.align.max_rounds) block(`ronde ${a.rounds} melewati batas ${cfg.align.max_rounds}.`);
  t = setFmKey(t, single ? 'align' : 'verdict', 'aligned'); t = setFmKey(t, 'aligned_at', new Date().toISOString()); t = setFmKey(t, 'aligned_by', who0());
  fs.writeFileSync(ap, t);
  audit(root, { event: 'align', session: payload.session_id, slug: sa, by: who0() });
  ctxOut(`[harness] Objective ${sa} ALIGNED oleh ${who0()} (ditulis hook). Berikutnya: skill plan ${sa}. Balas satu baris.`);
  process.exit(0);
}
// Update harness di root: hanya jalan dengan tiket dari ketikan manusia (guard-bash menolak tanpa tiket).
if (mu) {
  const mode = mu[1] ? mu[1].toLowerCase() : 'update';
  fs.mkdirSync(path.dirname(updateTicketPath(root)), { recursive: true });
  fs.writeFileSync(updateTicketPath(root), JSON.stringify({ mode, by: who0(), at: new Date().toISOString() }));
  audit(root, { event: 'update-ticket', session: payload.session_id, mode, by: who0() });
  const flag = mode === 'all' ? ' --all' : mode === 'rollback' ? ' --rollback' : '';
  ctxOut(`[harness] ${who0()} meminta ${mode === 'rollback' ? 'ROLLBACK update' : mode === 'all' ? 'update SEMUA project' : 'update root ke main'}. Jalankan HANYA "node .claude/hooks/harness.mjs update${flag}" (satu kali, tiket berlaku 30 menit); jangan commit/push/merge sendiri. Balas ringkas: versi sebelum → sesudah, hasil doctor, apakah di-push, dan masalah bila ada.`);
  process.exit(0);
}

// /harness:ship <slug>: bila PR sudah terbuka, ketikan ini = keputusan merge. Hook memeriksa gate + check PR + akun gh,
// lalu menerbitkan tiket sekali pakai yang dipakai `harness.mjs ship`. Tanpa PR (fase A), perintah diteruskan ke skill.
if (ms) {
  const ss = resolveSlug(root, ms[1]);
  const it = ss ? readItem(root, ss) : null;
  if (!it) process.exit(0);
  const ask = cfg.ship.merge_on_request !== false;
  const done = `Setelah status merged: jalankan skill summarize untuk ${ss} dan tampilkan path docs/work/${ss}/summary.md.`;
  if (it.status !== 'done') {
    const n = nextStep(it, cfg);
    block(`${ss} berstatus ${it.status}; ship hanya untuk item "done". Berikutnya (${n.who}): ${n.cmd}`);
  }
  const hasPr = String(it.fm.pr || '').replace(/null|\[\]/g, '').trim();
  if (hasPr) {
    const r = issueTicket(root, cfg, it, who0());
    if (r.ok && r.allMerged) { ctxOut(`[harness] Semua PR ${ss} sudah MERGED. Jalankan "node .claude/hooks/harness.mjs set-status ${ss} merged". ${done} Balas ≤3 baris.`); process.exit(0); }
    if (r.ok) {
      audit(root, { event: 'merge-ticket', session: payload.session_id, slug: ss, by: who0(), prs: r.ticket.prs.map((x) => x.url).join(' ') });
      ctxOut(`[harness] ${who0()} memutuskan MERGE ${ss}. Tiket sekali pakai terbit (berlaku ${cfg.ship.ticket_ttl_min} menit) untuk: ${r.ticket.prs.map((x) => `${x.url} [${x.checks}]`).join('; ')}. Jalankan HANYA "node .claude/hooks/harness.mjs ship ${ss}"; jangan gh pr merge. ${done} Balas ≤3 baris: hasil tiap PR, status akhir, path ringkasan.`);
      process.exit(0);
    }
    if (!ask) block(`\n- ${r.problems.join('\n- ')}`);
    // check belum hijau: ketikan ini tetap keputusan merge, dicatat sebagai izin tertunda
    writeIntent(root, cfg, ss, who0());
    audit(root, { event: 'merge-intent', session: payload.session_id, slug: ss, by: who0() });
    ctxOut(`[harness] ${who0()} memutuskan MERGE ${ss} begitu syarat terpenuhi (izin tertunda ${cfg.ship.intent_ttl_min} menit). Sekarang belum bisa:\n- ${r.problems.join('\n- ')}\nCheck masih berjalan → tunggu dengan Monitor "gh pr checks <url> --watch", lalu jalankan HANYA "node .claude/hooks/harness.mjs ship ${ss}". Check merah / gate gagal → laporkan ke user, jangan memaksa. ${done} Balas ≤3 baris.`);
    process.exit(0);
  }
  // Fase A: belum ada PR. Ketikan ini = buka PR + merge saat hijau + ringkasan (bila ship.merge_on_request).
  if (ask) { writeIntent(root, cfg, ss, who0()); audit(root, { event: 'merge-intent', session: payload.session_id, slug: ss, by: who0() }); }
  ctxOut(`[harness] ${who0()} meminta SHIP ${ss}${ask ? ' (PR + merge saat check hijau + ringkasan; izin merge tercatat oleh hook)' : ''}. Jalankan skill harness:ship untuk ${ss}: Fase A (ship-plan, commit, push, gh pr create, tulis pr: di plan.md).${ask ? ` Lalu tunggu check dengan Monitor "gh pr checks <url> --watch"; semua hijau → jalankan HANYA "node .claude/hooks/harness.mjs ship ${ss}" (merge memakai izin tadi). ${done}` : ` Lalu user mengetik push PR + merge ${ss} lagi setelah check hijau.`} Ada masalah di ship-plan → laporkan dan berhenti.`);
  process.exit(0);
}
// /harness:quick <permintaan>: ketikan manusia = persetujuan. Hook membuat item lajur quick berstatus approved (satu service, batas file di config).
if (mq) {
  const r = createQuick(root, mq[1], who0());
  if (!r.ok) block(r.reason);
  audit(root, { event: 'quick', session: payload.session_id, slug: r.slug, by: who0() });
  ctxOut(`[harness] Item quick ${r.slug} dibuat dan APPROVED oleh ${who0()} (ditulis hook). Kerjakan di sesi ini: baca knowledge service yang kena, ubah minimal (maks ${cfg.quick.max_files} file, satu service, bukan skema), tulis bukti AC di progress.md, lalu "node .claude/hooks/harness.mjs set-status ${r.slug} done". Melebihi batas → "harness.mjs promote ${r.slug}". Balas ≤3 baris saat selesai: apa berubah dan "push PR + merge ${r.slug}".`);
  process.exit(0);
}
// /harness:knowledge verify <svc>: knowledge draft → verified, hanya bila lint bersih. Ditulis hook, bukan agent.
if (mv) {
  const svc = mv[1];
  if (!(cfg.services || []).includes(svc)) block(`service "${svc}" tidak ada di harness.config.json.`);
  const r = verifyService(root, cfg, svc, who0());
  if (!r.ok) block(`knowledge ${svc} tidak lolos lint (${r.lint.errors} ERROR). Jalankan: node .claude/hooks/harness.mjs lint-knowledge ${svc}\n${formatLint([r.lint], { max: 12 })}`);
  audit(root, { event: 'verify-knowledge', session: payload.session_id, service: svc, by: who0() });
  ctxOut(`[harness] Knowledge ${svc} sekarang VERIFIED oleh ${who0()} (ditulis hook): ${r.changed.join(', ')}. Balas satu baris konfirmasi saja.`);
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
  ctxOut(`[harness] Usulan pola disetujui ${who0()} dan DITERAPKAN oleh hook ke patterns.md: ${r.applied.join(', ')}. Balas satu baris konfirmasi; jangan mengedit patterns.md lagi untuk ini.`);
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
ctxOut(`[harness] Plan ${slug} sekarang APPROVED oleh ${who} (ditulis hook, bukan agent). ` +
  'Balas maksimal 2 baris: konfirmasi dan langkah berikutnya: ketik "kerjakan ' + slug + '" (boleh di sesi ini; sesi baru hanya bila konteks > 50%). Jangan mulai implementasi sebelum user mengetiknya.');
