#!/usr/bin/env node
// Uji M0 (rancangan 1.15, docs/v1.15): memeriksa empat hal yang hanya bisa dilihat di Claude Code asli. Dijalankan MANUSIA
// dari terminal (bukan agent): node .claude/hooks/spike.mjs on | report | off
//   on      pasang hook pencatat sementara di .claude/settings.local.json (dicadangkan dulu) + satu skill uji tersembunyi
//   report  tabel hasil dari .harness/state/spike/log.jsonl
//   off     kembalikan settings.local.json dan hapus berkas uji
// Yang dicatat hanya NAMA kunci payload dan beberapa nilai pendek (jawaban pemilih, nama sesi, penanda agent). Isi berkas,
// perintah, dan path lengkap tidak dicatat. Log tinggal di mesin ini.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const dir = path.join(root, '.harness', 'state', 'spike');
const logF = path.join(dir, 'log.jsonl');
const localF = path.join(root, '.claude', 'settings.local.json');
const backupF = path.join(dir, 'settings.local.backup.json');
const skillDir = path.join(root, '.claude', 'skills', 'uji-tersembunyi');
const SELF = 'node .claude/hooks/spike.mjs';
const short = (v, n = 80) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > n ? `${s.slice(0, n)}…` : s; };
const AGENTISH = /agent|subagent|parent|teammate/i;

async function stdinJson() { try { const c = []; for await (const ch of process.stdin) c.push(ch); return JSON.parse(Buffer.concat(c).toString('utf8') || '{}'); } catch { return {}; } }
const log = (rec) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(logF, `${JSON.stringify({ at: new Date().toISOString(), ...rec })}\n`); } catch { /* abaikan */ } };
const readLog = () => { try { return fs.readFileSync(logF, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const pick = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => AGENTISH.test(k)).map(([k, v]) => [k, short(v, 60)]));

const [cmd, tag] = process.argv.slice(2);

if (cmd === 'log') {
  const p = await stdinJson();
  const rec = { tag, keys: Object.keys(p).sort(), tool: p.tool_name || null, agentish: pick(p) };
  if (tag === 'post-ask') { rec.response = short(p.tool_response, 600); rec.response_type = typeof p.tool_response; }
  log(rec);
  process.exit(0);
}

if (cmd === 'statusline') {
  const p = await stdinJson();
  log({ tag: 'statusline', keys: Object.keys(p).sort(), session_name: short(p.session_name || '', 80) || null, agent: p.agent ? short(p.agent, 120) : null, agentish: pick(p), has_project_dir: !!(p.workspace && p.workspace.project_dir) });
  process.stdout.write(`▌uji M0 · status line proyek tampil · nama sesi: ${p.session_name || '(tidak terkirim)'}\n`);
  process.exit(0);
}

if (cmd === 'on') {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(backupF)) { console.log('Uji sudah aktif. Jalankan "off" dulu bila ingin mengulang.'); process.exit(1); }
  let cur = null; try { cur = JSON.parse(fs.readFileSync(localF, 'utf8')); } catch { /* belum ada */ }
  fs.writeFileSync(backupF, JSON.stringify({ existed: cur !== null, content: cur }, null, 2));
  const next = { ...(cur || {}) };
  const hk = (t) => ({ hooks: [{ type: 'command', command: `${SELF} log ${t}`, timeout: 10 }] });
  next.hooks = { ...(next.hooks || {}) };
  next.hooks.PostToolUse = [...(next.hooks.PostToolUse || []), { matcher: 'AskUserQuestion', ...hk('post-ask') }];
  next.hooks.PreToolUse = [...(next.hooks.PreToolUse || []), { matcher: 'Edit|Write', ...hk('pre-edit') }];
  next.statusLine = { type: 'command', command: `${SELF} statusline`, padding: 0 };
  fs.mkdirSync(path.dirname(localF), { recursive: true });
  fs.writeFileSync(localF, `${JSON.stringify(next, null, 2)}\n`);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: uji-tersembunyi\ndescription: Skill uji M0. Tidak melakukan apa pun.\nuser-invocable: false\n---\nBalas: "skill uji-tersembunyi terpanggil".\n');
  try { fs.rmSync(logF, { force: true }); } catch { /* abaikan */ }
  console.log(`Uji M0 aktif. Buka sesi BARU dengan cara biasamu (claude agents), lalu:

1. Lihat baris status di bawah. Apakah tertulis "uji M0 · status line proyek tampil"? Catat juga nama sesi yang tampil di daftar agents.
2. Ketik:  Tanyakan aku satu pertanyaan memakai tool AskUserQuestion: "Warna?" dengan opsi Merah dan Biru. Jangan lakukan hal lain.
   Pilih salah satu. Lalu ulangi permintaan yang sama dan kali ini pilih "Other", ketik: hijau
3. Ketik:  Tulis kata "uji" ke berkas docs/uji-utama.md.
4. Ketik:  Panggil satu subagent (tool Agent) dan minta dia menulis kata "uji" ke berkas docs/uji-sub.md.
5. Ketik "/" dan lihat daftar: apakah "uji-tersembunyi" muncul?
6. Keluar dari sesi, lalu jalankan:  ${SELF} report
7. Terakhir:  ${SELF} off`);
  process.exit(0);
}

if (cmd === 'off') {
  let b = null; try { b = JSON.parse(fs.readFileSync(backupF, 'utf8')); } catch { /* tidak ada */ }
  if (!b) { console.log('Uji tidak aktif (tidak ada cadangan).'); process.exit(0); }
  if (b.existed) fs.writeFileSync(localF, `${JSON.stringify(b.content, null, 2)}\n`); else fs.rmSync(localF, { force: true });
  fs.rmSync(backupF, { force: true });
  fs.rmSync(skillDir, { recursive: true, force: true });
  for (const f of ['uji-utama.md', 'uji-sub.md']) fs.rmSync(path.join(root, 'docs', f), { force: true });
  console.log('Uji M0 dimatikan: settings.local.json dikembalikan, skill dan berkas uji dihapus. Log tetap di .harness/state/spike/log.jsonl.');
  process.exit(0);
}

if (cmd === 'report') {
  const L = readLog();
  const ask = L.filter((r) => r.tag === 'post-ask');
  const edits = L.filter((r) => r.tag === 'pre-edit');
  const sl = L.filter((r) => r.tag === 'statusline');
  const allKeys = [...new Set(edits.flatMap((r) => r.keys))];
  const varying = allKeys.filter((k) => edits.some((r) => !r.keys.includes(k)));
  const agentKeys = [...new Set(edits.flatMap((r) => Object.keys(r.agentish || {})))];
  const names = [...new Set(sl.map((r) => r.session_name).filter(Boolean))];
  if (!L.length) { console.log('Log kosong: belum ada sesi Claude yang dijalankan sejak "on". Buka sesi baru, jalankan langkahnya, keluar, lalu jalankan "report" lagi.'); process.exit(0); }
  const rows = [
    ['1', 'hook menerima jawaban pemilih', ask.length ? 'YA' : 'TIDAK ADA DATA', ask.length ? `${ask.length} catatan; tool_response (${ask[0].response_type}): ${ask.map((r) => r.response).join('  ||  ')}` : 'tidak ada catatan PostToolUse untuk AskUserQuestion: pemilih belum dipakai di sesi ini, atau hook tidak terpanggil. Ulangi langkah 2 agar pasti.'],
    ['2', 'hook tahu agent mana yang mengedit', !edits.length ? 'TIDAK ADA DATA' : agentKeys.length || varying.length ? 'MUNGKIN' : 'TIDAK', !edits.length ? 'tidak ada catatan PreToolUse Edit/Write' : `${edits.length} catatan; kunci penanda agent: ${agentKeys.join(', ') || '-'}; kunci yang tidak selalu ada: ${varying.join(', ') || '-'}; nilai: ${short(edits.map((r) => r.agentish), 400)}`],
    ['3a', 'status line proyek tampil', sl.length ? 'YA' : 'TIDAK', sl.length ? `${sl.length} kali dipanggil; kunci: ${sl[sl.length - 1].keys.join(', ')}` : 'skrip status line tidak pernah dipanggil'],
    ['3b', 'nama sesi terkirim ke status line', names.length ? 'YA' : sl.length ? 'TIDAK' : 'TIDAK ADA DATA', names.length ? names.join(' | ') : 'session_name kosong'],
    ['4', 'skill bisa disembunyikan dari daftar "/"', 'ISI SENDIRI', 'apakah "uji-tersembunyi" muncul saat mengetik "/"? muncul = tidak bisa disembunyikan'],
  ];
  console.log(['| # | uji | hasil | bukti |', '|---|---|---|---|', ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, '/').replace(/\s+/g, ' ')).join(' | ')} |`)].join('\n'));
  console.log('\nSalin tabel di atas ke agent (cloud). Tambahkan jawaban uji 4 dan nama sesi yang tampil di daftar agents.');
  process.exit(0);
}

console.log(`pakai: ${SELF} on | report | off`);
