// Harness — pustaka bersama untuk hook dan CLI. Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['draft', 'approved', 'in-progress', 'in-review', 'done', 'merged'];

export const DEFAULT_CONFIG = {
  harness_version: '1.22.10',
  project: '',
  root_branch: 'main',
  layout: 'multi-repo', // 'multi-repo' (services_dir berisi repo git) | 'single' (satu repo)
  services_dir: 'source-code',
  services: [],
  // 'single': semua path di luar allow_paths dianggap kode dan di-gate
  allow_paths: ['docs/**', '.claude/rules/**', '.claude/audit/**', '.harness/**', 'AGENTS.md', 'CLAUDE.md', '.gitignore'],
  protected_paths: ['.claude/hooks/**', '.claude/settings.json', '.claude/agents/**', 'harness.config.json', '.claude/state/merge-tickets/**', '.claude/state/update-ticket.json', '.harness/evidence/**', 'docs/memory/MEMORY.md'],
  schema_paths: ['**/migrations/**', '**/migration/**', '**/*.sql', '**/schema.prisma'],
  protected_branches: ['main', 'master', 'develop', 'production', 'staging', 'release/*'],
  deny_commands: [
    'npm\\s+publish', 'terraform\\s+(apply|destroy)', 'kubectl\\s+(delete|drain)', 'docker\\s+push',
    '\\bDROP\\s+(TABLE|DATABASE|SCHEMA)\\b', '\\bTRUNCATE\\s+TABLE\\b', 'gh\\s+pr\\s+merge', 'gh\\s+repo\\s+delete',
  ],
  gate: { test_command: null, test_required: false, test_timeout_sec: 300, require_checks: false },
  checks: {},                // per service: { "api": { "lint": "npm run lint", "test": "npm test", "build": null } }; kosong = TIDAK DIPERIKSA
  quick: { max_files: 5 },   // lajur cepat: 1 service, bukan skema, maksimal N file
  amend: { max: 3 },         // tambahan AC kecil per work item tanpa approve ulang
  // pengiriman: base PR per service ({"api": "feat/s2"} = PR bertumpuk), metode merge, umur tiket merge. Data project, bukan bagian repo harness.
  // merge_on_request (1.10.0): ketikan ship sebelum PR/check hijau = izin merge tertunda (berlaku intent_ttl_min); merge tetap hanya bila gate pass + check hijau.
  ship: { base: {}, merge_method: 'merge', ticket_ttl_min: 30, merge_on_request: true, intent_ttl_min: 240 },
  context: { window_tokens: 1000000, warn_tokens: 400000 },
  knowledge: { summary_max_lines: 80, patterns_max_lines: 150, stale_warn_commits: 15 },
  baseline: {}, // override per service: { "ce-api": "production" } (bawaan: origin/HEAD → production → main → master)
  store: { backend: 'local' },  // penyimpanan work item: 'local' (docs/work). Backend lain didaftarkan di store.mjs.
  // align: gerbang sebelum approve. Item standard butuh align.md berverdict "aligned" (ditulis hook saat manusia mengetik /harness:align <slug> ok). Debat maks max_rounds ronde.
  // decision_table (1.12.0): Stop menahan giliran yang menyentuh item belum-aligned sampai tabel keputusan (dibuat kode) ditampilkan, sekali per perubahan isi.
  // block_plan_before_aligned (1.12.0): Edit/Write yang menambah AC ke plan.md ditolak selama align belum aligned.
  align: { required: true, max_rounds: 3, exempt_types: ['onboard', 'analysis'], accept_contradictions: true, decision_table: true, block_plan_before_aligned: true },
  // gerbang Stop: sesi tidak boleh berhenti bila item yang baru dikerjakan siap review tetapi bukti test / review belum ada. max_blocks = batas penolakan per sesi (anti-loop).
  stop_gate: { enabled: true, max_blocks: 1, recent_hours: 12 },
  // 1.20.0: satu sesi chat (termasuk subagent-nya) = satu work item. Permintaan lanjutan masuk ke item aktif sesi itu;
  // item baru hanya bila user mengetik "item baru" (tiket sekali pakai) atau item aktif sudah merged.
  session_item: { single: true },
  handoff: { max_chars: 6000 },
  update: { autoPush: false },  // `harness update`: push ke origin/root_branch hanya bila true
  // Plane (opsional, mati bawaan): sinkron status satu arah work item → kartu Plane. Token HANYA dari variabel lingkungan `token_env`, tidak pernah di config.
  // states: status harness → NAMA state di project Plane (astra: "in-review": "In Review").
  plane: {
    enabled: false, base_url: 'https://api.plane.so', workspace: null, project_id: null, token_env: 'PLANE_API_KEY', marker: '[harness]',
    states: { draft: 'Backlog', approved: 'Todo', 'in-progress': 'In Progress', 'in-review': 'Review', done: 'Done', merged: 'Done' },
    // 1.13.0 (jembatan ke 2.0 "satu pintu"): isi kartu (tujuan, konteks, keputusan, checklist AC) ditulis ke Plane; komentar ditarik ke
    // cermin lokal .harness/plane/<slug>.md (hanya dibaca hook). mention_user_id = UUID member Plane yang di-@ saat keputusan menahan pekerjaan.
    push_content: true, pull_comments: true, mention_user_id: null, pull_min_interval_s: 60,
  },
  // 1.13.0: log intent lokal (.harness/state/intent-log.jsonl) untuk mengukur kesiapan 2.0 (`harness.mjs pilot`).
  // hours: jendela pilot (bawaan 6 jam, keputusan user 2026-11-10); `pilot --hours N` / `--days N` untuk melihat jendela lain.
  // 1.15.0: status line harness (settings.json → statusLine). theme: tenang | kontras | mono. statusline:false = tidak mencetak apa pun.
  // 1.15.2: tidy. stale_days: draft/approved/done-tanpa-PR yang tidak disentuh selama itu diarsipkan; merged_days: item merged.
  tidy: { stale_days: 14, merged_days: 30 },
  // 1.16.0: bentuk item baru. tunggal = satu plan.md empat bagian; folder = brief/impact/align/plan/progress/review.md
  item: { bentuk: 'tunggal' },
  // 1.17.0: spesialis per bidang. map: { "<service>": "backend|frontend|devops|dba" }; service tanpa map ditebak dari namanya.
  // enforce: tolak edit kode service berbidang dari sesi utama (butuh payload hook yang menyebut agent; lihat uji M0 nomor 2).
  // 1.18.0: pengetahuan tumbuh. recall: rujukan otomatis per prompt (maks recall_max, skor >= recall_min_score);
  // lessons_via_picker: pelajaran item selesai ditawarkan lewat pemilih alih-alih langsung disimpan; prune_days: usulan buang.
  // 1.19.0: antislop (salinan teks aturan di .claude/skills/antislop*). mode: during | after | ask.
  antislop: { enabled: true, mode: 'during' },
  growth: { recall: true, recall_max: 2, recall_min_score: 3, prune_days: 60, lessons_via_picker: true },
  bidang: { enabled: true, map: {}, fallback_agent: 'implementer', enforce: false },
  tui: { statusline: true, theme: 'tenang', max_width: 120, ask: true, menu: true },
  pilot: { enabled: true, hours: 6, max_misfires: 0, min_ships: 1 },
  // 1.10.0 — feature flag. Semua aditif: perintah /harness:* lama tetap berlaku.
  // intent: kalimat pendek tanpa slash ("setuju <slug>", "sisa", "ingat: ...") dipetakan ke perintah. Hanya prompt <= max_chars; slug harus cocok persis satu item.
  intent: { enabled: true, max_chars: 120 },
  // recap: tabel "belum selesai" (item, pertanyaan terbuka, klaim, AC tanpa bukti, blocker, usulan memori). on_stop = tampil ke user di akhir giliran yang menyentuh item (hanya bila isinya berubah).
  // render (1.13.1): "assistant" = agent menutup giliran dengan tabel Markdown (dirender TUI; +1 giliran pendek saat isi berubah); "system" = teks polos lama.
  // 1.20.0: hold = kapan giliran ditahan untuk menampilkan rekap: 'status' (hanya bila status item sesi ini berubah), 'always', 'never'
  recap: { enabled: true, on_stop: true, max_rows: 12, render: 'assistant', hold: 'status' },
  // memory: catatan project berumur panjang (docs/memory/MEMORY.md, dibatasi max_chars, disuntik di awal sesi). Gaya Hermes (bawaan): agent menulis/menghapus sendiri.
  // write_approval: true = tulisan agent masuk antrean pending, manusia yang menerapkan.
  // learn_from_summary: saat done/merged, keputusan di Decision log diusulkan sebagai pelajaran (antrean, maks learn_max per item) dan item dicatat di docs/memory/INDEX.md.
  memory: { enabled: true, max_chars: 2200, user_enabled: true, user_max_chars: 1375, write_approval: false, learn_from_summary: true, learn_max: 3, ref_max_chars: 3000 },
  // playbooks (1.11.0): prosedur yang dipelajari agent (docs/memory/playbooks/<nama>.md, frontmatter name+description).
  // Awal sesi hanya memuat daftar nama+deskripsi (index_max); isi dibaca saat relevan. Berkas > max_chars atau frontmatter rusak tidak didaftarkan.
  playbooks: { enabled: true, max_chars: 6000, index_max: 20 },
  // align.accept_contradictions: manusia boleh menutup align dengan menerima risiko klaim "bertentangan" ("align ok <slug> terima C2").
};

// True bila modul ini dijalankan sebagai skrip (bukan di-import). JANGAN membandingkan import.meta.url dengan
// `file://${process.argv[1]}`: di Windows (C:\\... vs file:///C:/...) dan pada path berspasi/berkarakter khusus
// (URL-encoded) keduanya tidak pernah sama, hook keluar 0 tanpa memeriksa apa pun (gagal-terbuka).
// Bila pembandingan gagal karena error, anggap "dijalankan sebagai skrip" agar gerbang tetap berlaku (gagal-tertutup).
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    const real = fs.realpathSync.native || fs.realpathSync;
    return real(fileURLToPath(metaUrl)) === real(argv1);
  } catch {
    return true;
  }
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function projectRoot(payload = {}) {
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd());
}

export function loadConfig(root) {
  const user = readJson(path.join(root, 'harness.config.json'), {}) || {};
  const cfg = { ...DEFAULT_CONFIG, ...user };
  for (const k of ['gate', 'context', 'knowledge', 'quick', 'amend', 'ship', 'store', 'align', 'stop_gate', 'handoff', 'update', 'plane', 'intent', 'recap', 'memory', 'playbooks', 'pilot', 'tui', 'tidy', 'item', 'bidang', 'growth', 'antislop', 'session_item']) cfg[k] = { ...DEFAULT_CONFIG[k], ...(user[k] || {}) };
  cfg.plane.states = { ...DEFAULT_CONFIG.plane.states, ...((user.plane && user.plane.states) || {}) };
  return cfg;
}

export async function readStdinJson() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export const posix = (p) => String(p).replace(/\\/g, '/');

export function relPath(root, p) {
  if (!p) return '';
  const abs = path.isAbsolute(p) ? p : path.resolve(root, p);
  return posix(path.relative(root, abs));
}

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export const matchAny = (globs, rel) => (globs || []).some((g) => globToRegex(g).test(rel));

// ---------- frontmatter (subset YAML: key: value, key: [a, b]) ----------
export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, raw: '', body: text };
  return { fm: parseFm(m[1]), raw: m[1], body: m[2] };
}
function parseScalar(v) {
  v = v.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  }
  if (/^(null|~)?$/.test(v)) return null;
  return v.replace(/^["']|["']$/g, '');
}
export function parseFm(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = parseScalar(m[2]);
  }
  return out;
}
export function setFmKey(text, key, value) {
  const { raw, body } = splitFrontmatter(text);
  const line = `${key}: ${value}`;
  if (!raw && !/^---/.test(text)) return `---\n${line}\n---\n${text}`;
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  if (idx >= 0) lines[idx] = line; else lines.push(line);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}
export const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// ---------- work item ----------
export function workDir(root) { return path.join(root, 'docs', 'work'); }

export function listItems(root) {
  const dir = workDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => readItem(root, d.name))
    .filter(Boolean);
}
export function readItem(root, slug) {
  const planPath = path.join(workDir(root), slug, 'plan.md');
  if (!fs.existsSync(planPath)) return null;
  const text = fs.readFileSync(planPath, 'utf8');
  const { fm, body } = splitFrontmatter(text);
  return { slug, dir: path.join(workDir(root), slug), planPath, text, fm, body,
    status: fm.status || 'draft', services: asList(fm.services), type: fm.type || 'feature' };
}
export function resolveSlug(root, query) {
  const dir = workDir(root);
  if (!fs.existsSync(dir)) return null;
  const names = fs.readdirSync(dir).filter((n) => !n.startsWith('_') && fs.existsSync(path.join(dir, n, 'plan.md')));
  if (names.includes(query)) return query;
  const hits = names.filter((n) => n.includes(query));
  return hits.length === 1 ? hits[0] : null;
}

const AC_LINE = /^\s*[-*]\s*\**(AC\d+)\**\s*[:.–-]\s*(.+?)\s*$/;
export function parseAcs(text) {
  const out = [];
  let skip = false; // 1.16.0: baris "- AC1: ..." di bawah "### Bukti" (bentuk tunggal) adalah bukti, bukan definisi AC
  for (const l of String(text || '').split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { skip = /^bukti\b/i.test(h[2].trim()); continue; }
    if (skip) continue;
    const m = AC_LINE.exec(l); if (m) out.push({ id: m[1], text: m[2] });
  }
  return out;
}

// ---------- 1.16.0: satu berkas per item (bentuk: tunggal) ----------
// Item baru = satu plan.md berisi "## 1. Objective", "## 2. Penjelasan", "## 3. Dampak & konfirmasi", "## 4. Eksekusi"
// (dengan "### Bukti", "### Tinjauan", "### Decision log", "### Status terkini"). readPart() memberi teks "berkas lama"
// (brief/impact/align/progress/review.md) dari bagian itu, sehingga gerbang, rekap, ringkasan, dan Plane membaca kedua bentuk
// lewat satu jalan. Berkas terpisah yang benar-benar ada selalu menang (item lama, dan item tunggal yang ditambah berkas).
export const isSingle = (item) => String((item && item.fm && item.fm.bentuk) || '') === 'tunggal';
export function sectionOf(text, re, level = 2) {
  const L = String(text || '').split(/\r?\n/);
  const i = L.findIndex((l) => { const h = /^(#{1,6})\s+(.*)$/.exec(l); return h && h[1].length === level && re.test(h[2].trim()); });
  if (i < 0) return null;
  const out = [];
  for (const l of L.slice(i + 1)) { const h = /^(#{1,6})\s/.exec(l); if (h && h[1].length <= level) break; out.push(l); }
  return out.join('\n').trim();
}
const S1 = /^1\.?\s*Objective/i; const S2 = /^2\.?\s*Penjelasan/i; const S3 = /^3\.?\s*Dampak/i; const S4 = /^4\.?\s*Eksekusi/i;
export function readPart(item, name) {
  const f = item.dir ? path.join(item.dir, name) : null;
  if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  if (!isSingle(item)) return null;
  const body = item.body !== undefined && item.body !== '' ? item.body : splitFrontmatter(item.text || '').body;
  const fm = item.fm || {};
  const s4 = sectionOf(body, S4) || '';
  const sub = (re) => sectionOf(s4, re, 3);
  if (name === 'brief.md') return `---\n---\n## Objective\n${sectionOf(body, S1) || ''}\n\n## Penjelasan\n${sectionOf(body, S2) || ''}\n`;
  if (name === 'impact.md') { const s3 = sectionOf(body, S3); return s3 === null ? null : `---\n---\n${s3}\n`; }
  if (name === 'align.md') { const s3 = sectionOf(body, S3); return s3 === null ? null : `---\nverdict: ${fm.align || 'open'}\nrounds: ${fm.align_rounds || 0}\n---\n${s3}\n`; }
  if (name === 'progress.md') return `---\n---\n## Verifikasi\n${sub(/^Bukti/i) || ''}\n\n## Decision log\n${sub(/^Decision log/i) || ''}\n\n## Status terkini\n${sub(/^Status terkini/i) || ''}\n`;
  if (name === 'review.md') {
    const t = sub(/^Tinjauan/i); if (t === null) return null;
    const v = /^\s*verdict:\s*(\S+)/im.exec(t);
    return `---\nverdict: ${v ? v[1] : 'pending'}\n---\n${t.replace(/^\s*verdict:.*$/im, '').trim()}\n`;
  }
  return null;
}
export const hasPart = (item, name) => readPart(item, name) !== null;
// Bagian yang beku setelah approved (bentuk tunggal): bagian 1–3 dan teks AC. Bukti, Tinjauan, log, status boleh berubah.
export function frozenPart(text) {
  const { body } = splitFrontmatter(text);
  return [sectionOf(body, S1), sectionOf(body, S2), sectionOf(body, S3), JSON.stringify(parseAcs(sectionOf(body, S4) || ''))].join('\n--\n');
}

const PLACEHOLDER = /^(todo|tbd|n\/a|na|-|\.{3}|belum|\?+|<.*>)$/i;

// ---------- ringkasan metadata (untuk list/show/snapshot --json) ----------
// Hanya metadata: tanpa judul, teks AC, isi bukti, isi review, atau email approver.
export function summarizeItem(item) {
  const evidence = new Map();
  const prog = readPart(item, 'progress.md');
  if (prog !== null) {
    for (const l of prog.split(/\r?\n/)) { const m = AC_LINE.exec(l); if (m) evidence.set(m[1], m[2]); }
  }
  const ac = parseAcs(item.body).map((a) => {
    const e = evidence.get(a.id);
    return { id: a.id, evidence: e && e.trim().length >= 8 && !PLACEHOLDER.test(e.trim()) ? 'ok' : 'missing' };
  });
  let review = null;
  const rvText = readPart(item, 'review.md');
  if (rvText !== null) {
    const { fm, body } = splitFrontmatter(rvText);
    const lines = body.split(/\r?\n/).filter((l) => /blocker/i.test(l));
    review = {
      verdict: String(fm.verdict || 'pending').toLowerCase(),
      blockers_open: lines.filter((l) => /^\s*[-*]\s*\[ \]/.test(l)).length,
      blockers_done: lines.filter((l) => /^\s*[-*]\s*\[[xX]\]/.test(l)).length,
    };
  }
  const has = (f) => hasPart(item, f);
  return {
    slug: item.slug, type: item.type, status: item.status, services: item.services,
    pr: asList(item.fm.pr), created: item.fm.created || null, updated: item.fm.updated || null, approved_at: item.fm.approved_at || null,
    ac, review, has: { impact: has('impact.md'), progress: has('progress.md'), review: has('review.md') },
  };
}

// ---------- gerbang pengiriman (gate.md) ----------
export const serviceDirOf = (root, cfg, svc) => (cfg.layout === 'multi-repo' ? path.join(root, cfg.services_dir, svc) : root);
// Hash isi pohon kerja (termasuk file baru, menghormati .gitignore) lewat index sementara: tidak mengubah index asli,
// dan SAMA sebelum maupun sesudah commit. Gate yang lulus tetap berlaku setelah ship meng-commit hasilnya.
function worktreeHash(d) {
  const g = (a, env) => spawnSync('git', a, { cwd: d, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env });
  const tmp = path.join(os.tmpdir(), `harness-idx-${process.pid}-${Date.now()}`);
  try {
    const idx = g(['rev-parse', '--git-path', 'index']).stdout.trim();
    const abs = idx ? path.resolve(d, idx) : '';
    if (abs && fs.existsSync(abs)) fs.copyFileSync(abs, tmp);
    const env = { GIT_INDEX_FILE: tmp };
    if (g(['add', '-A'], env).status === 0) { const w = g(['write-tree'], env); if (w.status === 0) return w.stdout.trim(); }
  } catch { /* jatuh ke cara lama */ } finally { fs.rmSync(tmp, { force: true }); }
  return `${g(['rev-parse', 'HEAD']).stdout}${g(['diff', 'HEAD']).stdout}${g(['status', '--porcelain']).stdout}`;
}
// Sidik jari masukan gerbang: bukti, review, daftar service, checks, dan keadaan kode tiap service. Berubah = gate.md usang.
export function gateFingerprint(root, cfg, item) {
  const h = crypto.createHash('sha1');
  for (const f of ['progress.md', 'review.md']) { const p = path.join(item.dir, f); h.update(hasPart(item, f) && !fs.existsSync(p) ? readPart(item, f) : fs.existsSync(p) ? fs.readFileSync(p) : ''); }
  h.update(JSON.stringify(item.services)); h.update(JSON.stringify(cfg.checks || {})); h.update(String(item.fm.lane || ''));
  for (const sv of item.services) {
    const d = serviceDirOf(root, cfg, sv === '*' ? '' : sv);
    if (!fs.existsSync(path.join(d, '.git'))) { h.update(`${sv}:nogit`); continue; }
    h.update(worktreeHash(d));
  }
  return h.digest('hex').slice(0, 16);
}
export function readGate(item) {
  const p = path.join(item.dir, 'gate.md');
  if (!fs.existsSync(p)) return null;
  const { fm, body } = splitFrontmatter(fs.readFileSync(p, 'utf8'));
  return { fm, body, failing: body.split(/\r?\n/).filter((l) => /\|\s*FAIL\s*\|/.test(l)).map((l) => l.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s*\|\s*/g, ' · ')) };
}
// 1.22.10 (H7): kegagalan checks yang SUDAH ADA di baseline (production/main) dan tidak disentuh item boleh diterima user
// ("terima baseline <slug>", ditulis hook). Terikat sidik jari kode: kode berubah → penerimaan usang, check kembali FAIL.
export function gateAccept(root, cfg, item) {
  const list = String(item.fm.gate_accept || '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'null');
  if (!list.length) return { set: new Set(), stale: false, by: '' };
  const stale = String(item.fm.gate_accept_fp || '') !== codeFingerprint(root, cfg, item);
  return { set: new Set(list), stale, by: String(item.fm.gate_accept_by || '') };
}
export const BASELINE_HINT = (slug) => `Bila kegagalan ini sudah ada di baseline (production/main) dan tidak disentuh item ini: tunjukkan buktinya (perintah yang sama di baseline, gagal sama persis) di "### Decision log", lalu USER mengetik "terima baseline ${slug}". Agent tidak boleh menulis penerimaan ini.`;
// Dipakai transisi done (dan ship): gate.md harus ada, pass, dan masih berlaku.
export function gateProblems(root, cfg, item) {
  const g = readGate(item);
  if (!g) return [`gate.md belum ada: jalankan "node .claude/hooks/harness.mjs gate ${item.slug}" ("set-status ${item.slug} done" menjalankannya otomatis).`];
  if (String(g.fm.verdict) !== 'pass') return [`gate.md verdict ${g.fm.verdict || '?'}:\n  ${g.failing.join('\n  ') || '(lihat gate.md)'}${g.failing.some((f) => /^[\w.\-]+: (?!secret|checks)/.test(f)) ? `\n${BASELINE_HINT(item.slug)}` : ''}`];
  if (String(g.fm.fingerprint) !== gateFingerprint(root, cfg, item)) return [`gate.md usang (kode atau bukti berubah sejak gate dijalankan): jalankan "node .claude/hooks/harness.mjs gate ${item.slug}" lagi.`];
  return [];
}

// ---------- tiket update: dibuat hook dari ketikan manusia, dikonsumsi `harness.mjs update` ----------
export const updateTicketPath = (root) => path.join(root, '.claude', 'state', 'update-ticket.json');
export function updateTicket(root, mode, ttlMin = 30) {
  const t = readJson(updateTicketPath(root), null);
  if (!t || !t.at || Date.now() - Date.parse(t.at) > ttlMin * 60000) return null;
  return !mode || t.mode === mode ? t : null;
}

// ---------- align: kesepahaman objective sebelum plan ----------
// align.md: frontmatter `verdict: open|aligned`, `rounds: N`; tabel klaim `| C1 | klaim | bukti path:baris | status |`.
export const CLAIM_ROW = /^\|\s*C\d+\s*\|/;
export const DECISION_ROW = /^\|\s*D\d+\s*\|/;
const cells = (l) => l.split('|').slice(1, -1).map((x) => x.trim());
// 1.22.5 (N9): jawaban berawalan "default"/"usulan"/"rekomendasi" = usulan agent, belum keputusan user → tetap terbuka
const EMPTY_ANSWER = /^(|-|\?+|<.*>|belum|tbd|(?:\(?\s*(?:default|bawaan|usulan|rekomendasi|asumsi)\b.*))$/i;
export function readAlign(item) {
  const at = readPart(item, 'align.md');
  if (at === null) return null;
  const { fm, body } = splitFrontmatter(at);
  const L = body.split(/\r?\n/);
  const claimRows = L.filter((l) => CLAIM_ROW.test(l)).map(cells);
  // 1.12.0: "## Keputusan terbuka" | D1 | pertanyaan | opsi (rekomendasi dulu) | jawaban |; jawaban kosong = masih terbuka
  const decisions = L.filter((l) => DECISION_ROW.test(l)).map(cells).map((c) => ({ id: c[0], question: c[1] || '', options: c[2] || '', answer: c[3] || '' }));
  return { fm, body, verdict: String(fm.verdict || 'open').toLowerCase(), rounds: Number(fm.rounds || 0), claims: claimRows.length,
    claimRows: claimRows.map((c) => ({ id: c[0], claim: c[1] || '', evidence: c[2] || '', status: (c[3] || '').toLowerCase() })),
    contradicted: claimRows.filter((c) => /bertentangan/i.test(c[3] || '')).length,
    doubtful: claimRows.filter((c) => /dugaan/i.test(c[3] || '')).length,
    decisions, openDecisions: decisions.filter((d) => EMPTY_ANSWER.test(d.answer)).length };
}

// Slug pendek untuk perintah yang diketik user: tanpa awalan tanggal, bila tetap unik (resolveSlug menerima potongan unik).
export function shortSlug(root, slug) {
  const s = slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  if (s === slug) return slug;
  try { return resolveSlug(root, s) === slug ? s : slug; } catch { return slug; }
}

// 1.12.0: tabel keputusan DIBUAT KODE dari align.md (bukan ditulis bebas model). Baris: klaim bertentangan, klaim dugaan,
// keputusan terbuka (D tanpa jawaban). Baris terakhir = satu-satunya langkah berikutnya yang sah.
export function decisionRows(item) {
  const a = readAlign(item);
  if (!a || a.verdict === 'aligned') return [];
  const rows = [];
  const sl = item.dir ? shortSlug(path.resolve(item.dir, '..', '..', '..'), item.slug) : item.slug;
  for (const c of a.claimRows.filter((x) => /bertentangan/.test(x.status))) rows.push({ id: c.id, kind: 'bertentangan', ask: `Kode berkata lain: "${c.claim}"${c.evidence && c.evidence !== '-' ? ` (bukti ${c.evidence})` : ''}`, options: 'a) klaim dikoreksi · b) terima risikonya', answer: `"${c.id}: <koreksi>" atau "align ok ${sl} terima ${c.id}"` });
  for (const c of a.claimRows.filter((x) => /dugaan/.test(x.status))) rows.push({ id: c.id, kind: 'dugaan', ask: `Belum ada bukti di kode: "${c.claim}"`, options: 'a) benar · b) salah', answer: `"${c.id} benar" / "${c.id} salah: <yang benar>"` });
  for (const d of a.decisions.filter((x) => EMPTY_ANSWER.test(x.answer))) rows.push({ id: d.id, kind: 'keputusan', ask: d.question, options: d.options || '-', answer: `"${d.id}: <pilihan>"` });
  return rows;
}
// 1.22.0 (D38): blok mencolok setiap kali user harus memutuskan sebelum eksekusi. TUI tidak bisa memperbesar huruf;
// heading di dalam blockquote adalah penekanan terkuat yang dirender Claude Code.
export function decisionBanner(rel, what = 'Keputusan') {
  return `> ## ⚠ BUTUH KEPUTUSANMU\n> **${what}** ada di \`${rel}\`. Tolong dibaca ulang sebelum kita eksekusi.`;
}
export function formatDecision(root, item) {
  const rows = decisionRows(item);
  const sl = shortSlug(root, item.slug);
  const a = readAlign(item);
  const hard = rows.filter((r) => r.kind === 'bertentangan').map((r) => r.id);
  const head = rows.length
    ? ['| # | jenis | yang perlu kamu putuskan | opsi (rekomendasi dulu) | jawab dengan |', '|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.id} | ${r.kind} | ${String(r.ask).replace(/\|/g, '/').slice(0, 160)} | ${String(r.options).replace(/\|/g, '/').slice(0, 100)} | ${r.answer} |`)]
    : [];
  const next = !a || !a.claims ? `Berikutnya (agent): skill align ${sl} (klaim vs bukti kode belum ditulis)`
    : hard.length ? `Berikutnya (kamu): jawab tabel di atas. "align ok ${sl}" baru diterima setelah ${hard.join(', ')} dikoreksi, atau ketik "align ok ${sl} terima ${hard.join(',')}".`
    : rows.length ? `Berikutnya (kamu): jawab tabel di atas (cukup kode + jawaban, mis. "${rows[0].id} a"), lalu ketik "align ok ${sl}".`
    : `Berikutnya (kamu): bila sepaham, ketik "align ok ${sl}".`;
  const rel = `docs/work/${item.slug}/${isSingle(item) ? 'plan.md' : 'align.md'}`;
  const banner = rows.length ? [decisionBanner(rel, `${rows.length} keputusan`), ''] : [];
  // 1.22.9 (H3): baris kosong sebelum "Berikutnya" agar tidak dirender sebagai baris tabel
  return [...banner, `Keputusan untuk ${item.slug} (${rows.length} terbuka):`, ...head, ...(head.length ? [''] : []), next].join('\n');
}
export const alignExempt = (item, cfg) => isQuick(item) || !cfg.align.required || (cfg.align.exempt_types || []).includes(item.type);
export function alignProblems(item, cfg) {
  if (alignExempt(item, cfg)) return [];
  const a = readAlign(item);
  if (!a) return [`align.md belum ada: jalankan skill align ${item.slug} (klaim vs bukti kode), lalu user mengetik align ok ${item.slug}.`];
  if (a.verdict !== 'aligned') return [`align.md belum aligned (verdict: ${a.verdict}, ronde ${a.rounds}/${cfg.align.max_rounds}): user mengetik align ok ${item.slug} bila objective sudah sepaham.`];
  return [];
}

// Sidik jari keadaan kode saja (tanpa bukti/review): dipakai bukti test (.harness/evidence) untuk mendeteksi usang.
export function codeFingerprint(root, cfg, item) {
  const h = crypto.createHash('sha1');
  for (const sv of item.services) {
    const d = serviceDirOf(root, cfg, sv === '*' ? '' : sv);
    if (!fs.existsSync(path.join(d, '.git'))) { h.update(`${sv}:nogit`); continue; }
    h.update(worktreeHash(d));
  }
  return h.digest('hex').slice(0, 16);
}
// Item yang disentuh sesi ini (diisi post.mjs): gerbang Stop hanya menahan sesi yang benar-benar mengerjakan item itu.
// mtime berkas tidak bisa jadi penanda: git clone/pull/switch/merge menulis ulang mtime semua berkas.
const touchedPath = (root, sid) => path.join(root, '.harness', 'state', `touched-${String(sid || 'x').replace(/\W/g, '')}.json`);
export const touchedSlugs = (root, sid) => new Set(readJson(touchedPath(root, sid), { slugs: [] }).slugs || []);
// 1.22.7: CLI (open --mine) tidak tahu session_id. Pakai berkas touched-* yang paling baru diubah (= sesi yang sedang aktif).
export function latestTouchedSlugs(root) {
  const dir = path.join(root, '.harness', 'state');
  try {
    const f = fs.readdirSync(dir).filter((x) => /^touched-.*\.json$/.test(x)).map((x) => ({ x, t: fs.statSync(path.join(dir, x)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
    return f ? new Set(readJson(path.join(dir, f.x), { slugs: [] }).slugs || []) : new Set();
  } catch { return new Set(); }
}
// 1.20.0: item aktif sesi ini = item terakhir yang disentuh sesi, belum merged, bukan quick
export function activeSessionItem(root, sid) {
  const order = readJson(touchedPath(root, sid), { slugs: [] }).slugs || [];
  for (const sl of [...order].reverse()) { const it = readItem(root, sl); if (it && it.status !== 'merged' && !isQuick(it)) return it; }
  return null;
}
export const newItemTicketPath = (root, sid) => path.join(root, '.harness', 'state', `newitem-${String(sid || 'x').replace(/\W/g, '')}.json`);
export function markTouched(root, sid, slugs) {
  const have = touchedSlugs(root, sid);
  const add = slugs.filter((x) => !have.has(x));
  if (!add.length) return;
  fs.mkdirSync(path.dirname(touchedPath(root, sid)), { recursive: true });
  fs.writeFileSync(touchedPath(root, sid), JSON.stringify({ slugs: [...have, ...add] }));
}
export const evidenceDir = (root, slug) => path.join(root, '.harness', 'evidence', slug);
export function readEvidence(root, slug) { return readJson(path.join(evidenceDir(root, slug), 'tests.json'), null); }

// ---------- gerbang 2 ----------
export function checkDone(root, item, cfg) {
  const problems = [];
  const acs = parseAcs(item.body);
  if (!acs.length) problems.push('plan.md tidak punya acceptance criteria (format: "- AC1: ...").');
  const progText = readPart(item, 'progress.md');
  if (progText === null) problems.push('progress.md belum ada.');
  else {
    const ev = new Map();
    for (const l of progText.split(/\r?\n/)) {
      const m = AC_LINE.exec(l); if (m) ev.set(m[1], m[2]);
    }
    for (const ac of acs) {
      const e = ev.get(ac.id);
      if (!e || e.length < 8 || PLACEHOLDER.test(e.trim())) problems.push(`${ac.id}: belum ada catatan verifikasi di progress.md (output curl, langkah manual, atau hasil tes).`);
    }
  }
  const rvPart = readPart(item, 'review.md');
  if (isQuick(item)) {
    if (!asList(item.fm.files).length) problems.push('lajur quick: belum ada file yang diubah (files: kosong). Tidak ada yang perlu di-done.');
  } else if (rvPart === null) problems.push(isSingle(item) ? 'bagian "### Tinjauan" belum ada.' : 'review.md belum ada.');
  else {
    const rv = rvPart;
    const { fm, body } = splitFrontmatter(rv);
    if (String(fm.verdict || '').toLowerCase() !== 'clean') problems.push('review.md: verdict harus "clean".');
    if (body.split(/\r?\n/).some((l) => /^\s*[-*]\s*\[ \]/.test(l) && /blocker/i.test(l))) problems.push('review.md masih punya BLOCKER yang belum dicentang.');
  }
  const testCmd = item.fm.test_command || cfg.gate.test_command;
  if (testCmd) {
    const r = spawnSync(testCmd, { shell: true, cwd: root, encoding: 'utf8', timeout: (cfg.gate.test_timeout_sec || 300) * 1000 });
    const acc = gateAccept(root, cfg, item);
    if (r.status !== 0 && !(acc.set.has('test_command') && !acc.stale)) problems.push(`test_command gagal (exit ${r.status}): ${testCmd}\n${(r.stdout + r.stderr).slice(-600)}${acc.set.has('test_command') ? '\n(penerimaan baseline usang: kode berubah sejak diterima)' : `\n${BASELINE_HINT(item.slug)}`}`);
  } else if (cfg.gate.test_required) problems.push('test_command wajib tetapi belum diset.');
  problems.push(...gateProblems(root, cfg, item));
  return problems;
}

// Menjalankan CLI lewat shell di Windows (agar claude.cmd/gh.cmd ikut ter-resolve). Argumen dijaga ketat dan
// digabung menjadi satu string perintah: `spawn(cmd, args, {shell:true})` memicu DEP0190 di Node 24.
export function runCli(cmd, args, opts = {}) {
  if (process.platform !== 'win32') return spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (args.some((a) => /[\s&|<>^"%'`;()]/.test(String(a)))) return { status: 1, stdout: '', stderr: 'argumen mengandung karakter terlarang', error: new Error('argumen tidak aman') };
  return spawnSync([cmd, ...args].join(' '), { encoding: 'utf8', ...opts, shell: true });
}
// 1.19.3: HARNESS_GH = path skrip gh tiruan (sandbox latihan); hook memakainya tanpa bergantung pada PATH.
export const ghRun = (args, cwd, timeout = 45000) => (process.env.HARNESS_GH ? runCli('node', [process.env.HARNESS_GH, ...args], { cwd, timeout }) : runCli('gh', args, { cwd, timeout }));
export function checkMerged(item) {
  const prs = asList(item.fm.pr);
  if (!prs.length) return ['frontmatter plan.md belum punya "pr:" (URL PR).'];
  const problems = [];
  for (const pr of prs) {
    const r = ghRun(['pr', 'view', pr, '--json', 'state', '-q', '.state'], undefined, 30000);
    if (r.error || r.status !== 0) problems.push(`tidak bisa memeriksa ${pr} lewat gh (${(r.stderr || r.error?.message || '').trim().slice(0, 200)}).`);
    else if (r.stdout.trim() !== 'MERGED') problems.push(`${pr} berstatus ${r.stdout.trim()}, belum MERGED.`);
  }
  return problems;
}

export const isQuick = (item) => String(item.fm?.lane || '') === 'quick';
// transisi yang boleh dilakukan agent. 'approved' hanya lewat manusia (hook prompt / CLI approve).
// Lajur quick tidak punya in-review (tanpa review subagent): gerbang pengiriman + checks yang menggantikannya.
const QUICK_TRANSITIONS = {
  'approved>in-progress': null,
  'approved>done': 'done',
  'in-progress>done': 'done',
  'done>in-progress': null,
  'done>merged': 'merged',
};
const AGENT_TRANSITIONS = {
  'approved>in-progress': null,
  'in-progress>in-review': 'progress',
  'in-review>in-progress': null,
  'in-review>done': 'done',
  'done>in-progress': null,
  'done>merged': 'merged',
};
export function checkTransition(root, cfg, item, to, { actor = 'agent' } = {}) {
  const from = item.status;
  if (from === to) return [];
  if (!STATUSES.includes(to)) return [`status "${to}" tidak dikenal. Pilihan: ${STATUSES.join(', ')}.`];
  if (to === 'approved') {
    if (actor !== 'human') return ['status "approved" hanya boleh diberikan manusia: ketik setuju <slug> di prompt (atau "! node .claude/hooks/harness.mjs approve <slug>").'];
    if (from !== 'draft') return [`approve hanya dari draft (sekarang: ${from}).`];
    const p = [];
    if (!parseAcs(item.body).length) p.push('plan.md belum punya acceptance criteria ("- AC1: ...").');
    if (!item.services.length) p.push('frontmatter plan.md belum punya "services: [..]".');
    p.push(...alignProblems(item, cfg));
    return p;
  }
  if (to === 'draft') return []; // reopen: wajib approve ulang
  const key = `${from}>${to}`;
  const table = isQuick(item) ? QUICK_TRANSITIONS : AGENT_TRANSITIONS;
  if (!(key in table)) return [isQuick(item)
    ? `transisi ${from} → ${to} tidak diizinkan untuk lajur quick. Alur: approved → in-progress → done → merged (tanpa in-review).`
    : `transisi ${from} → ${to} tidak diizinkan. Alur: draft → approved → in-progress → in-review → done → merged.`];
  const need = table[key];
  if (need === 'progress' && !hasPart(item, 'progress.md')) return ['progress.md belum ada.'];
  if (need === 'done') return checkDone(root, item, cfg);
  if (need === 'merged') return checkMerged(item);
  return [];
}

export function coversService(item, svc) {
  return item.services.includes('*') || item.services.includes(svc);
}
export function activeItems(root) {
  return listItems(root).filter((i) => i.status === 'approved' || i.status === 'in-progress');
}

// ---------- path -> service ----------
export function serviceOf(cfg, rel) {
  if (cfg.layout === 'multi-repo') {
    const pre = posix(cfg.services_dir).replace(/\/$/, '') + '/';
    if (!rel.startsWith(pre)) return null;
    const svc = rel.slice(pre.length).split('/')[0];
    return svc || null;
  }
  if (matchAny(cfg.allow_paths, rel) || rel.startsWith('.git/') || rel.startsWith('.claude/')) return null;
  return '*';
}

// ---------- secret scan ----------
export const SECRET_PATTERNS = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b|github_pat_[A-Za-z0-9_]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['API key (sk-)', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const GENERIC = /(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i;
const BENIGN = /(process\.env|os\.getenv|getenv\(|\$\{|<[^>]+>|example|changeme|placeholder|your[_-]|xxxx|\*{4,}|harness:allow-secret)/i;
export function findSecret(text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (/harness:allow-secret/.test(line)) continue;
    for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) return name;
    const g = GENERIC.exec(line);
    if (g && !BENIGN.test(line)) return `kredensial literal (${g[1]})`;
  }
  return null;
}
export function redact(text) {
  let t = String(text);
  for (const [, re] of SECRET_PATTERNS) t = t.replace(new RegExp(re.source, 'g'), '[REDACTED]');
  return t.replace(new RegExp(GENERIC.source, 'gi'), (m) => m.replace(/(["'])[^"'\s]{12,}\1/, '"[REDACTED]"'));
}
export const SECRET_FILE = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|[^/]*\.pem|[^/]*\.p12|[^/]*\.pfx|id_(rsa|ed25519|ecdsa)|credentials(\.json)?|\.npmrc|\.netrc)$/;

// ---------- audit + event log ----------
// audit(): jejak lengkap per hari (.claude/audit/*.jsonl). Event bermakna (bukan tiap tool call) juga masuk .harness/events.jsonl
// yang dibaca `harness log` dan `harness watch`. Keduanya di-redact dan tidak pernah menjatuhkan hook.
const NOISY_EVENTS = new Set(['PostToolUse', 'InstructionsLoaded']);
export const eventsPath = (root) => path.join(root, '.harness', 'events.jsonl');
export function emit(root, rec) {
  if (process.env.HARNESS_BENCH) return;
  try {
    const f = eventsPath(root);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > 1_000_000) fs.renameSync(f, f + '.1'); } catch { /* belum ada */ }
    const out = { ...rec };
    for (const k of Object.keys(out)) if (typeof out[k] === 'string') out[k] = redact(out[k]).slice(0, 300);
    fs.appendFileSync(f, JSON.stringify(out) + '\n');
  } catch { /* event log tidak boleh menjatuhkan hook */ }
}
export function readEvents(root, n = 15) {
  try { return fs.readFileSync(eventsPath(root), 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
// Kirim status tertunda ke Plane di proses latar (tidak menunda hook). Diam bila plane mati; kegagalan tercatat di event log oleh `plane sync`.
export function planeKick(root, args = ['sync', '--quiet']) {
  if (process.env.HARNESS_BENCH) return;
  try {
    if (!loadConfig(root).plane.enabled) return;
    const c = spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'harness.mjs'), 'plane', ...args],
      { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, detached: true, stdio: 'ignore', windowsHide: true });
    c.on('error', () => {}); c.unref();
  } catch { /* sinkron Plane tidak boleh menjatuhkan hook */ }
}
const PLANE_EVENTS = new Set(['status', 'approve', 'quick', 'promote']);

export function audit(root, entry) {
  if (process.env.HARNESS_BENCH) return;
  try {
    const dir = path.join(root, '.claude', 'audit');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString();
    const rec = { ts, ...entry };
    for (const k of Object.keys(rec)) if (typeof rec[k] === 'string') rec[k] = redact(rec[k]).slice(0, 400);
    fs.appendFileSync(path.join(dir, ts.slice(0, 10) + '.jsonl'), JSON.stringify(rec) + '\n');
    if (!NOISY_EVENTS.has(entry.event)) emit(root, { ts, event: entry.event, slug: entry.slug, by: entry.by, to: entry.to, from: entry.from, tool: entry.tool, reason: entry.reason });
  } catch { /* audit tidak boleh menjatuhkan hook */ }
  if (PLANE_EVENTS.has(entry.event)) planeKick(root);
}

// ---------- output helper ----------
export function deny(root, payload, reason, extra = {}) {
  audit(root, { event: 'deny', hook: payload.hook_event_name, session: payload.session_id, tool: payload.tool_name,
    target: payload.tool_input?.file_path || payload.tool_input?.command, reason, ...extra });
  process.stderr.write(`[harness] DIBLOKIR: ${reason}\n`);
  process.exit(2);
}
export function context(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

// ---------- peringatan ambang konteks (dipakai post.mjs dan prompt.mjs) ----------
export function contextWarning(root, cfg, payload) {
  const tp = payload.transcript_path;
  if (!tp || !fs.existsSync(tp)) return null;
  const stateDir = path.join(root, '.claude', 'state');
  const mark = path.join(stateDir, `ctx-${String(payload.session_id || 'x').replace(/\W/g, '')}.json`);
  const size = fs.statSync(tp).size;
  const fd = fs.openSync(tp, 'r');
  const len = Math.min(size, 262144);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').reverse();
  let tokens = 0;
  for (const l of lines) {
    if (!l.includes('"usage"')) continue;
    try {
      const u = JSON.parse(l)?.message?.usage;
      if (u) { tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); break; }
    } catch { /* baris terpotong */ }
  }
  if (tokens < cfg.context.warn_tokens) return null;
  const prev = (() => { try { return JSON.parse(fs.readFileSync(mark, 'utf8')); } catch { return {}; } })();
  if (prev.warned && tokens - prev.warned < 100000) return null;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ warned: tokens }));
  return `[harness] Konteks sesi ±${Math.round(tokens / 1000)}k token (ambang ${Math.round(cfg.context.warn_tokens / 1000)}k dari ${Math.round(cfg.context.window_tokens / 1000)}k). ` +
    'Segera: tulis status terkini ke progress.md (apa selesai, apa berikutnya, keputusan), selesaikan langkah yang sedang jalan, lalu sarankan user membuka sesi baru dan melanjutkan dengan kerjakan <slug>.';
}

// ---------- langkah berikutnya (untuk /harness:next dan pesan blokir) ----------
function alignNext(item, cfg) {
  const sl = item.dir ? shortSlug(path.resolve(item.dir, '..', '..', '..'), item.slug) : item.slug;
  // 1.12.0: langkah dibuat dari isi align.md, bukan dikarang model
  const a0 = readAlign(item);
  if (a0 && a0.verdict !== 'aligned' && !(cfg ? alignExempt(item, cfg) : false)) {
    if (a0.contradicted) return ['kamu', `jawab tabel keputusan (harness.mjs decide ${sl}): koreksi klaim bertentangan, atau "align ok ${sl} terima <Cn>"`];
    if (a0.doubtful || a0.openDecisions) return ['kamu', `jawab tabel keputusan (harness.mjs decide ${sl}), lalu "align ok ${sl}"`];
  }
  const hasPlan = parseAcs(item.body).length > 0;
  const a = readAlign(item);
  const needAlign = cfg ? alignProblems(item, cfg).length > 0 : !a || a.verdict !== 'aligned';
  if (needAlign) return a && a.claims > 0 ? ['kamu', `jawab temuan di ${isSingle(item) ? 'bagian 3 plan.md' : 'align.md'}; sepaham → ketik align ok ${sl}`] : ['agent', `skill align ${sl}`];
  if (!hasPlan) return ['agent', `skill plan ${sl}`];
  return ['kamu', `tinjau plan.md; bila setuju ketik setuju ${sl}`];
}
export function nextStep(item, cfg = null) {
  // 1.13.1: slug pendek (tanpa tanggal) bila unik, supaya sel tabel tidak terpotong
  const sl = item.dir ? shortSlug(path.resolve(item.dir, '..', '..', '..'), item.slug) : item.slug;
  const q = isQuick(item);
  const rows = {
    draft: q ? ['kamu', `skill plan ${sl}, lalu setuju ${sl} (item quick dipromosikan ke standard)`] : alignNext(item, cfg),
    approved: q ? ['agent', `kerjakan di sesi ini; bukti per AC di progress.md; lalu set-status ${sl} done`] : ['kamu', `ketik kerjakan ${sl} (di sesi ini, atau sesi baru bila konteks > 50%)`],
    'in-progress': q ? ['agent', `lengkapi bukti AC di progress.md; set-status ${sl} done`] : ['agent', `lanjut kerjakan ${sl}; semua AC berbukti → set-status ${sl} in-review`],
    'in-review': ['agent', `skill review ${sl}`],
    done: asList(item.fm.pr).length ? ['kamu', `tunggu check PR hijau, lalu ketik push PR + merge ${sl} (= keputusan merge)`] : ['kamu', `ketik push PR + merge ${sl} (buka PR)`],
    merged: ['-', 'selesai'],
  };
  const [who, cmd] = rows[item.status] || ['?', `status "${item.status}" tidak dikenal`];
  return { who, cmd };
}

// ---------- lajur quick: dibuat hook dari ketikan manusia ----------
// 1.13.0: judul/slug diringkas dari kalimat prompt ("oke, ada feedback dariku untuk formfield ..." → "feedback-formfield-...").
const FILLER = new Set('oke ok okay okey sip tolong dong ya yah yuk nih sih deh kok disini sini aku saya kamu kita gue ingin mau minta coba ada dariku darimu untuk buat buatkan bisa please pls can you i want to we the a jadi gitu begitu btw'.split(' '));
export function cleanTitle(t, max = 60) {
  const words = String(t || '').replace(/\s+/g, ' ').trim().split(' ');
  while (words.length > 1 && FILLER.has(words[0].toLowerCase().replace(/[^\w]/g, ''))) words.shift();
  let out = '';
  for (const w of words) { if ((out + ' ' + w).trim().length > max) break; out = (out + ' ' + w).trim(); }
  return (out || words.join(' ').slice(0, max)).replace(/[\s,;:\-–]+$/, '');
}
export const slugify = (t) => {
  const words = String(t).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w));
  let s = '';
  for (const w of words.slice(0, 7)) { if ((s ? `${s}-${w}` : w).length > 40) break; s = s ? `${s}-${w}` : w; }
  return s.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'item';
};
export function createQuick(root, text, who) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 8) return { ok: false, reason: 'uraikan permintaan (minimal 8 karakter): apa yang harus berubah dan bagaimana dibuktikan.' };
  const m = /^(hotfix|improvement)\s+(.+)$/i.exec(raw);
  const type = m ? m[1].toLowerCase() : 'hotfix';
  const body = (m ? m[2] : raw).slice(0, 240);
  const day = new Date().toISOString().slice(0, 10);
  let slug = `${day}-${slugify(body)}`;
  for (let n = 2; fs.existsSync(path.join(workDir(root), slug)); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`;
  const dir = path.join(workDir(root), slug);
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const title = cleanTitle(body, 80);
  fs.writeFileSync(path.join(dir, 'plan.md'), `---\ntitle: ${title.replace(/:/g, ' -')}\ntype: ${type}\nlane: quick\nstatus: approved\nservices: []\nfiles: []\ncreated: ${day}\nupdated: ${day}\napproved_at: ${now}\napproved_by: ${who}\ntest_command: null\npr: null\n---\n# Plan (quick) — ${title}\n\nLajur quick: satu service (terikat pada edit pertama), maksimal file sesuai config, bukan skema, tanpa review subagent.\n\n## Acceptance criteria\n- AC1: ${body}\n`);
  if ((process.env.HARNESS_ITEM_BENTUK || loadConfig(root).item.bentuk) === 'tunggal') { // 1.16.0: satu berkas
    const t = fs.readFileSync(path.join(dir, 'plan.md'), 'utf8').replace('\n---\n', '\nbentuk: tunggal\n---\n');
    const fm = t.slice(0, t.indexOf('\n---\n', 4) + 5);
    fs.writeFileSync(path.join(dir, 'plan.md'), `${fm}# ${title} (quick)\n\n## 1. Objective\n${body}\n\n## 2. Penjelasan\nLajur quick: satu service (terikat pada edit pertama), maksimal file sesuai config, bukan skema, tanpa review subagent.\n\n## 3. Dampak & konfirmasi\nDisetujui lewat ketikan quick (${day}).\n\n## 4. Eksekusi\n- AC1: ${body}\n\n### Bukti\n- AC1:\n\n### Status terkini\n- dibuat oleh quick: <permintaan> (${day})\n`);
  } else fs.writeFileSync(path.join(dir, 'progress.md'), `# Progress — ${title}\n\n## Verifikasi\n- AC1:\n\n## Status terkini\n- dibuat oleh quick: <permintaan> (${day})\n`);
  return { ok: true, slug, type };
}

// ---------- amend: tambahan AC kecil tanpa approve ulang ----------
export function amendItem(root, cfg, item, acText) {
  const text = String(acText || '').replace(/\s+/g, ' ').trim();
  if (!['approved', 'in-progress', 'in-review'].includes(item.status)) return { ok: false, reason: `amend hanya untuk item approved/in-progress/in-review (sekarang: ${item.status}). Item draft: edit plan langsung.` };
  if (text.length < 8 || text.length > 240) return { ok: false, reason: 'AC harus 8–240 karakter, satu kalimat yang bisa diverifikasi.' };
  const done = Number(item.fm.amendments || 0);
  if (done >= cfg.amend.max) return { ok: false, reason: `batas amend ${cfg.amend.max} tercapai. Perubahan lebih besar: "harness.mjs reopen ${item.slug}" lalu setuju <slug> ulang.` };
  const ids = parseAcs(item.text).map((a) => Number(a.id.slice(2)));
  const id = `AC${Math.max(0, ...ids) + 1}`;
  let t = item.text;
  if (isSingle(item) && /^### Bukti\s*$/m.test(t)) t = t.replace(/^### Bukti\s*$/m, `- ${id}: ${text} (amandemen)\n\n### Bukti`);
  else {
  if (!/^## Amandemen\s*$/m.test(t)) t = t.replace(/\s*$/, '\n\n## Amandemen\nTambahan kecil setelah approve (hanya menambah AC; tidak mengubah service, skema, atau AC yang ada).\n');
  t = t.replace(/\s*$/, `\n- ${id}: ${text}\n`);
  }
  t = setFmKey(t, 'amendments', done + 1);
  t = setFmKey(t, 'updated', new Date().toISOString().slice(0, 10));
  fs.writeFileSync(item.planPath, t);
  audit(root, { event: 'amend', slug: item.slug, ac: id });
  return { ok: true, id };
}

// 1.13.2: tabel keluaran CLI. Teks mentah (mode "!" di Claude Code, terminal biasa, systemMessage) tidak merender Markdown,
// jadi bawaannya garis kotak yang tampil sebagai tabel di mana pun. mode 'md' = Markdown rata kolom (untuk ditempel agent ke
// balasan, yang dirender TUI). Teks di luar tabel tidak diubah.
const cellWidth = (s) => { let w = 0; for (const ch of s) w += /\p{Extended_Pictographic}|[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFF00-\uFF60]/u.test(ch) ? 2 : 1; return w; };
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
const pad = (c, w) => c + ' '.repeat(Math.max(0, w - cellWidth(c)));
export function alignTables(text, mode = 'box') {
  const lines = String(text).split('\n');
  const out = [];
  const isRow = (l) => l !== undefined && /^\s*\|.*\|\s*$/.test(l);
  for (let i = 0; i < lines.length;) {
    if (!(isRow(lines[i]) && /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1] || ''))) { out.push(lines[i]); i++; continue; }
    const block = [];
    while (isRow(lines[i])) block.push(lines[i++]);
    const rows = block.map(splitRow).filter((_, j) => j !== 1);
    const n = Math.max(...rows.map((r) => r.length));
    const w = Array.from({ length: n }, (_, c) => Math.max(3, ...rows.map((r) => cellWidth((r[c] || '').replace(/\\\|/g, '|')))));
    if (mode === 'md') {
      const wm = w.map((cw, c) => Math.max(cw, ...rows.map((r) => cellWidth(r[c] || ''))));
      const mcell = (r) => wm.map((cw, c) => pad(r[c] || '', cw));
      out.push(`| ${mcell(rows[0]).join(' | ')} |`, `| ${wm.map((cw) => '-'.repeat(cw)).join(' | ')} |`, ...rows.slice(1).map((r) => `| ${mcell(r).join(' | ')} |`));
      continue;
    }
    // Muat di lebar terminal (bawaan 120 bila tak diketahui, mis. lewat "!"): kolom terlebar dipersempit, isi sel dibungkus per kata.
    const max = Number(process.env.HARNESS_TABLE_WIDTH) || process.stdout.columns || 120;
    while (w.reduce((a, b) => a + b + 3, 1) > max) { const k = w.indexOf(Math.max(...w)); if (w[k] <= 12) break; w[k]--; }
    const wrap = (t, cw) => { const res = []; let cur = '';
      for (let word of t.split(/\s+/).filter(Boolean)) {
        while (cellWidth(word) > cw) { if (cur) { res.push(cur); cur = ''; } res.push(word.slice(0, cw)); word = word.slice(cw); }
        if (!cur) cur = word; else if (cellWidth(cur) + 1 + cellWidth(word) <= cw) cur += ` ${word}`; else { res.push(cur); cur = word; }
      }
      return [...res, cur]; };
    const rowLines = (r) => { const parts = w.map((cw, c) => wrap((r[c] || '').replace(/\\\|/g, '|'), cw)); const h = Math.max(...parts.map((p) => p.length));
      return Array.from({ length: h }, (_, k) => `│ ${parts.map((p, c) => pad(p[k] || '', w[c])).join(' │ ')} │`); };
    const line = (a, b, c) => a + w.map((cw) => '─'.repeat(cw + 2)).join(b) + c;
    out.push(line('┌', '┬', '┐'), ...rowLines(rows[0]), line('├', '┼', '┤'), ...rows.slice(1).flatMap(rowLines), line('└', '┴', '┘'));
  }
  return out.join('\n');
}
