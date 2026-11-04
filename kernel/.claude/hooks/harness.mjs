#!/usr/bin/env node
// CLI harness: dipakai skill dan user. Usage: node .claude/hooks/harness.mjs <cmd> [args]
//   new <type> <judul...>   buat work item dari template
//   list [--json]           daftar work item
//   show <slug> [--json]    ringkas satu item
//   snapshot [--json]       metadata work item + baseline + kesegaran knowledge dalam satu JSON (untuk viewer; tanpa isi dokumen)
//   board [--out f] [--open] papan HTML lokal (lajur per service) dengan snapshot tertanam; default .claude/state/board.html
//   set-status <slug> <to>  ubah status (dengan pemeriksaan transisi/gerbang)
//   start <slug>            = set-status in-progress
//   gate <slug> [--json]    Delivery Gate: jalankan checks per service + cek bukti/review/secret → docs/work/<slug>/gate.md (exit 2 bila FAIL)
//   check <slug>            dry-run gerbang 2 (menjalankan gate lebih dulu)
//   reopen <slug>           kembali ke draft (butuh approve ulang)
//   approve <slug>          HANYA manusia (jalankan dengan awalan "!")
//   quick <permintaan>      HANYA manusia ("!" atau /harness:quick): item lajur quick berstatus approved
//   amend <slug> --ac ".."  tambah AC kecil setelah approve (batas config.amend.max); tanpa mengubah service/skema/AC lama
//   promote <slug>          quick → standard (draft; perlu plan + approve)
//   next [slug]             langkah berikutnya per item: siapa dan perintah persisnya
//   ship-plan <slug>        rencana pengiriman per service: branch kerja, base (config ship.base), akun gh, masalah
//   ship <slug>             merge PR berurutan; HANYA berjalan dengan tiket sekali pakai dari ketikan manusia /harness:ship <slug>
//   run-checks <slug>       jalankan checks per service (lint/test/build) dan tulis bukti .harness/evidence/<slug>/tests.json (dipakai gerbang Stop; dipanggil agent runner)
//   log [n] [--handoff]     handoff terakhir + n catatan audit terbaru (default 15)
//   measure <transcript.jsonl> [--json] [--label x]   token per model, panggilan tool/subagent, durasi → .harness/metrics/ (baseline sebelum/sesudah routing)
//   update [--all|--rollback]  perbarui harness di root ke main (HANYA dengan tiket: /harness:update atau "tolong root nya di update ke main")
//   doctor                  periksa instalasi
// Pengetahuan (tanpa token, deterministik):
//   inventory [--json]                  service di source-code/, stack, baseline, status checkout
//   baseline [svc|all] [--fetch] [--json]  branch+commit baseline (config.baseline → origin/HEAD → production → main → master)
//   worktree add|rm <svc>               checkout sementara di commit baseline (.claude/state/worktrees/<svc>); tidak menyentuh checkout user
//   lint-knowledge [svc|all] [--json]   sitasi path:baris (ada, baris, simbol), batas panjang, secret; exit 2 bila ERROR
//   knowledge-sample <svc> [n]          n klaim acak (deterministik) + potongan kodenya, untuk verifikasi manusia
//   knowledge-status [svc|all] [--json] tertinggal berapa commit dari baseline
//   propose-checks [svc|all]            usulan blok checks.<svc> (user menyalin ke harness.config.json)
//   patterns-check <slug>               validasi docs/work/<slug>/patterns-proposal.md
//   verify-knowledge <svc>              HANYA manusia ("!" atau /harness:knowledge verify): draft → verified bila lint bersih
//   patterns-approve <slug> <P1,P3|all> HANYA manusia ("!" atau /harness:knowledge patterns): terapkan usulan pola ke patterns.md
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runGate } from './delivery.mjs';
import { getStore } from './store.mjs';
import { runChecks } from './evidence.mjs';
import { handoffPath } from './handoff.mjs';
import { measureTranscript, formatMetrics } from './metrics.mjs';
import { shipPlan, runShip, ghAccess } from './ship.mjs';
import {
  inventory, baselineOf, worktreeAdd, worktreeRm, lintService, formatLint, sampleService, knowledgeStatus, proposeChecks,
  verifyService, checkProposal, approveProposal, isRepo, svcDir,
} from './knowledge.mjs';
import {
  projectRoot, loadConfig, checkTransition, checkDone, setFmKey, STATUSES,
  splitFrontmatter, parseAcs, readJson, audit, summarizeItem, createQuick, amendItem, nextStep, isQuick, runCli, globToRegex,
  updateTicket, updateTicketPath, readAlign,
} from './lib.mjs';

const root = projectRoot();
const cfg = loadConfig(root);
const store = getStore(root, cfg);
const listItems = () => store.list();
const readItem = (_r, slug) => store.get(slug);
const resolveSlug = (_r, q) => store.resolve(q);
const [cmd, ...args] = process.argv.slice(2);
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const TYPES = ['feature', 'improvement', 'hotfix', 'analysis', 'cross-repo', 'schema', 'onboard'];
function buildSnapshot() {
  const services = (cfg.services || []).map((s) => {
    const b = baselineOf(root, cfg, s);
    const k = knowledgeStatus(root, cfg, s);
    return {
      service: s,
      baseline: b.ok ? { ref: b.ref, sha: b.sha.slice(0, 10), via: b.via, checkout: b.checkout, on_baseline: b.on_baseline, dirty: b.dirty, note: b.note } : { ref: null, note: b.note },
      knowledge: { state: k.state, status: k.status, behind: k.behind, files: k.files, source_commit: k.source_commit ? k.source_commit.slice(0, 10) : null, updated: k.updated || null },
    };
  });
  return {
    schema: 1, generated_at: new Date().toISOString(), project: cfg.project || path.basename(root),
    work_items: listItems().map(summarizeItem).sort((a, b) => a.slug.localeCompare(b.slug)),
    services,
  };
}

function need(q) {
  if (!q) die('slug wajib diisi.');
  const slug = resolveSlug(root, q);
  if (!slug) die(`work item "${q}" tidak ditemukan atau ambigu.`);
  return readItem(root, slug);
}
// daftar service dari argumen posisional (tanpa --flag); kosong/"all" = semua di config
function svcArgs(a) {
  const names = a.filter((x) => !x.startsWith('--'));
  if (!names.length || names[0] === 'all') return cfg.services || [];
  return names;
}
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'item';
const today = () => new Date().toISOString().slice(0, 10);

const write = (item, to, extra = {}) => store.setStatus(item, to, extra);

switch (cmd) {
  case 'new': {
    const type = args[0];
    const title = args.slice(1).join(' ');
    if (!TYPES.includes(type) || !title) die(`usage: new <${TYPES.join('|')}> <judul>`);
    const slug = `${today()}-${slugify(title)}`;
    const dir = path.join(root, 'docs', 'work', slug);
    if (fs.existsSync(dir)) die(`sudah ada: docs/work/${slug}`);
    const tpl = path.join(root, 'docs', 'work', '_TEMPLATE');
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(tpl)) {
      let t = fs.readFileSync(path.join(tpl, f), 'utf8');
      t = t.replaceAll('{{slug}}', slug).replaceAll('{{title}}', title).replaceAll('{{type}}', type).replaceAll('{{date}}', today());
      fs.writeFileSync(path.join(dir, f), t);
    }
    console.log(`docs/work/${slug}`);
    break;
  }
  case 'list': {
    const items = listItems();
    if (args.includes('--json')) { console.log(JSON.stringify(items.map(summarizeItem), null, 2)); break; }
    if (!items.length) { console.log('(belum ada work item)'); break; }
    console.log('| slug | type | lajur | status | services |\n|---|---|---|---|---|');
    for (const i of items) console.log(`| ${i.slug} | ${i.type} | ${isQuick(i) ? 'quick' : 'standard'} | ${i.status} | ${i.services.join(',') || '-'} |`);
    break;
  }
  case 'show': {
    const i = need(args.find((a) => !a.startsWith('--')));
    if (args.includes('--json')) { console.log(JSON.stringify(summarizeItem(i), null, 2)); break; }
    console.log(`${i.slug}\nstatus: ${i.status}\ntype: ${i.type}\nlane: ${isQuick(i) ? 'quick' : 'standard'}\nservices: ${i.services.join(', ') || '-'}\nAC: ${parseAcs(i.body).map((a) => a.id).join(', ') || '-'}\npr: ${i.fm.pr || '-'}`);
    break;
  }
  case 'start':
  case 'set-status': {
    const i = need(args[0]);
    const to = cmd === 'start' ? 'in-progress' : args[1];
    if (to === 'approved') die('approve hanya oleh manusia.');
    if (to === 'done' && ['approved', 'in-progress', 'in-review'].includes(i.status)) runGate(root, cfg, i, { log: (m) => console.error(m) }); // Delivery Gate: checks + gate.md
    const p = checkTransition(root, cfg, i, to, { actor: 'agent' });
    if (p.length) die(`DITOLAK ${i.status} → ${to}:\n- ${p.join('\n- ')}`, 2);
    write(i, to);
    console.log(`${i.slug}: ${i.status} → ${to}`);
    break;
  }
  case 'gate': {
    const i = need(args.find((a) => !a.startsWith('--')));
    const r = runGate(root, cfg, i, { log: (m) => console.error(m) });
    if (args.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else console.log(`| item | hasil | catatan |\n|---|---|---|\n${r.rows.map((x) => `| ${x[0]} | ${x[1]} | ${String(x[2]).slice(0, 160)} |`).join('\n')}\n\ngate: ${r.verdict.toUpperCase()}${r.skipped ? ` (${r.skipped} item TIDAK DIPERIKSA)` : ''} → docs/work/${i.slug}/gate.md`);
    if (r.verdict !== 'pass') process.exit(2);
    break;
  }
  case 'check': {
    const i = need(args[0]);
    runGate(root, cfg, i, { log: (m) => console.error(m) });
    const p = checkDone(root, i, cfg);
    if (p.length) { console.log(`BELUM LULUS gerbang 2:\n- ${p.join('\n- ')}`); process.exit(2); }
    console.log('LULUS gerbang 2: siap diset done.');
    break;
  }
  case 'reopen': {
    const i = need(args[0]);
    write(i, 'draft', { approved_at: 'null', approved_by: 'null' });
    console.log(`${i.slug}: ${i.status} → draft (perlu /harness:approve lagi)`);
    break;
  }
  case 'approve': {
    const i = need(args[0]);
    const p = checkTransition(root, cfg, i, 'approved', { actor: 'human' });
    if (p.length) die(`DITOLAK:\n- ${p.join('\n- ')}`, 2);
    const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
    write(i, 'approved', { approved_at: new Date().toISOString(), approved_by: who });
    console.log(`${i.slug}: draft → approved`);
    break;
  }
  case 'quick': {
    const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
    const r = createQuick(root, args.join(' '), who);
    if (!r.ok) die(`DITOLAK: ${r.reason}`, 2);
    audit(root, { event: 'quick', slug: r.slug, by: who });
    console.log(`docs/work/${r.slug} (quick, approved oleh ${who})`);
    break;
  }
  case 'amend': {
    const i = need(args.find((a) => !a.startsWith('--')));
    const ai = args.indexOf('--ac');
    const r = amendItem(root, cfg, i, ai >= 0 ? args.slice(ai + 1).join(' ') : '');
    if (!r.ok) die(`DITOLAK: ${r.reason}`, 2);
    console.log(`${i.slug}: ${r.id} ditambahkan (amandemen ${Number(i.fm.amendments || 0) + 1}/${cfg.amend.max}). Perubahan besar (service baru, skema, ubah/hapus AC): reopen + approve ulang.`);
    break;
  }
  case 'promote': {
    const i = need(args[0]);
    if (!isQuick(i)) die('hanya item quick yang bisa dipromosikan.');
    let t = fs.readFileSync(i.planPath, 'utf8');
    t = setFmKey(t, 'lane', 'standard'); t = setFmKey(t, 'status', 'draft'); t = setFmKey(t, 'approved_at', 'null'); t = setFmKey(t, 'approved_by', 'null'); t = setFmKey(t, 'updated', today());
    fs.writeFileSync(i.planPath, t);
    audit(root, { event: 'promote', slug: i.slug, from: i.status });
    console.log(`${i.slug}: quick → standard (draft). Berikutnya: /harness:plan ${i.slug}, lalu user mengetik /harness:approve ${i.slug}.`);
    break;
  }
  case 'next': {
    const q = args.find((a) => !a.startsWith('--'));
    const items = q ? [need(q)] : listItems().filter((i) => i.status !== 'merged');
    if (!items.length) { console.log('(tidak ada work item terbuka) Mulai: /harness:quick <permintaan> untuk perubahan kecil, atau /harness:impact <tipe> <permintaan>.'); break; }
    console.log('| slug | lajur | status | siapa | langkah berikutnya |\n|---|---|---|---|---|');
    for (const i of items) { const n = nextStep(i, cfg); console.log(`| ${i.slug} | ${isQuick(i) ? 'quick' : 'standard'} | ${i.status} | ${n.who} | ${n.cmd} |`); }
    break;
  }
  case 'ship-plan': {
    const i = need(args[0]);
    const rows = shipPlan(root, cfg, i);
    console.log('| service | repo | branch kerja | base | PR bertumpuk | gh akun | belum commit | masalah |\n|---|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.service} | ${r.repo || '-'} | ${r.branch || '-'} | ${r.base} (${r.base_via}) | ${r.stacked ? 'ya' : 'tidak'} | ${r.gh} | ${r.dirty} | ${r.problems.join(' ') || '-'} |`);
    if (rows.some((r) => r.problems.length)) process.exit(2);
    break;
  }
  case 'ship': {
    const i = need(args[0]);
    if (i.status !== 'done') die(`status ${i.status}; ship hanya untuk item "done".`, 2);
    const r = runShip(root, cfg, i, (m) => console.log(m));
    if (!r.ok) die(`DITOLAK:\n- ${r.problems.join('\n- ')}${r.merged?.length ? `\n(sudah merged: ${r.merged.map((x) => x.url).join(', ')}; ketik /harness:ship lagi untuk sisanya)` : ''}`, 2);
    audit(root, { event: 'ship-merge', slug: i.slug, prs: r.merged.map((x) => x.url).join(' ') });
    const p = checkTransition(root, cfg, readItem(root, i.slug), 'merged', { actor: 'agent' });
    if (p.length) die(`PR sudah merged tetapi item belum ditutup:\n- ${p.join('\n- ')}`, 2);
    write(readItem(root, i.slug), 'merged');
    console.log(`${i.slug}: done → merged\nBerikutnya: ringkasan sesi (skill summarize ${i.slug}) → docs/sessions/`);
    break;
  }
  case 'run-checks': {
    const i = need(args[0]);
    const r = runChecks(root, cfg, i, { log: (m) => console.error(m) });
    const ev = r.evidence;
    console.log(`| service | check | hasil |\n|---|---|---|\n${(ev.checks.length ? ev.checks.map((c) => `| ${c.service} | ${c.name} | ${c.ok ? 'PASS' : 'FAIL'} |`) : ['| - | - | tidak ada checks terkonfigurasi |']).join('\n')}\n\nbukti test: ${ev.verdict.toUpperCase()} → .harness/evidence/${i.slug}/tests.json`);
    if (ev.verdict === 'fail') process.exit(2);
    break;
  }
  case 'log': {
    const n = Math.max(1, Number(args.find((a) => /^\d+$/.test(a))) || 15);
    const hp = handoffPath(root);
    if (fs.existsSync(hp)) console.log(fs.readFileSync(hp, 'utf8').trim() + '\n');
    else console.log('(belum ada handoff: ditulis otomatis saat PreCompact/SessionEnd)\n');
    if (args.includes('--handoff')) break;
    const ad = path.join(root, '.claude', 'audit');
    const files = fs.existsSync(ad) ? fs.readdirSync(ad).filter((f) => f.endsWith('.jsonl')).sort().slice(-3) : [];
    const lines = files.flatMap((f) => fs.readFileSync(path.join(ad, f), 'utf8').split('\n').filter(Boolean)).slice(-n);
    console.log(`## Audit terakhir (${lines.length})`);
    for (const l of lines) { try { const e = JSON.parse(l); console.log(`${e.ts.slice(11, 19)} ${e.event}${e.slug ? ' ' + e.slug : ''}${e.tool ? ' ' + e.tool : ''}${e.target ? ' ' + String(e.target).slice(0, 80) : ''}${e.reason ? ' — ' + String(e.reason).slice(0, 100) : ''}`); } catch { /* baris rusak */ } }
    break;
  }
  case 'measure': {
    const f = args.find((a) => !a.startsWith('--') && a !== args[args.indexOf('--label') + 1]);
    if (!f || !fs.existsSync(f)) die('usage: measure <transcript.jsonl> [--json] [--label nama]');
    const m = measureTranscript(f);
    const li = args.indexOf('--label');
    const label = (li >= 0 && args[li + 1] ? args[li + 1] : new Date().toISOString().slice(0, 10)).replace(/[^\w.-]/g, '_');
    const out = path.join(root, '.harness', 'metrics', `${label}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ label, source: path.basename(f), ...m }, null, 2) + '\n');
    console.log(args.includes('--json') ? JSON.stringify(m, null, 2) : formatMetrics(m) + `\n\ntersimpan: .harness/metrics/${label}.json`);
    break;
  }
  case 'update': {
    const mode = args.includes('--all') ? 'all' : args.includes('--rollback') ? 'rollback' : 'update';
    const ticket = updateTicket(root, mode);
    if (ticket) fs.rmSync(updateTicketPath(root), { force: true }); // sekali pakai; berjalan tanpa tiket hanya bila manusia memanggil langsung
    const home = process.env.HARNESS_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.harness');
    const inst = readJson(path.join(home, 'installer.json'), null);
    const script = inst && inst.path ? path.join(inst.path, 'scripts', 'harness-update.mjs') : null;
    if (!script || !fs.existsSync(script)) die('lokasi installer belum tercatat (~/.harness/installer.json). Jalankan sekali: node <folder agent-harness>/install.mjs <root> --update', 2);
    const r = spawnSync(process.execPath, [script, ...(mode === 'all' ? ['--all'] : [root]), ...(mode === 'rollback' ? ['--rollback'] : []), ...args.filter((a) => ['--dry-run', '--push', '--no-pull'].includes(a))], { stdio: 'inherit', cwd: root });
    audit(root, { event: 'harness-update', mode, status: r.status });
    process.exit(r.status ?? 1);
  }
  case 'doctor': {
    const rows = [];
    const ok = (name, pass, hint = '') => rows.push(`| ${name} | ${pass ? 'OK' : 'GAGAL'} | ${pass ? '' : hint} |`);
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    ok('node >= 18', nodeMajor >= 18, `terpasang ${process.versions.node}`);
    const sh = (c, a) => spawnSync(c, a, { encoding: 'utf8' });
    const git = sh('git', ['--version']); ok('git', git.status === 0, 'pasang git');
    const gh = sh('gh', ['--version']); ok('gh (untuk PR dan merge)', gh.status === 0, 'pasang GitHub CLI + gh auth login');
    if (gh.status === 0) {
      const dirs = (cfg.services || []).map((s) => path.join(root, cfg.services_dir, s)).filter((d) => fs.existsSync(d) && spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: d }).status === 0); // service tanpa remote origin dilewati
      const bad = dirs.map((d) => ({ d, a: ghAccess(d) })).filter((x) => !x.a.ok);
      ok('akun gh aktif punya akses tulis ke repo service', !bad.length, bad.map((x) => path.basename(x.d) + ': ' + x.a.note).join(' | ').slice(0, 300));
    }
    const cl = runCli('claude', ['--version']);
    const clv = /(\d+)\.(\d+)\.(\d+)/.exec(cl.stdout || '');
    const verOk = clv && (Number(clv[1]) > 2 || (Number(clv[1]) === 2 && (Number(clv[2]) > 1 || (Number(clv[2]) === 1 && Number(clv[3]) >= 295))));
    ok('claude >= 2.1.295 (onFailure: block)', !!verOk, cl.stdout ? `terpasang ${cl.stdout.trim()}` : 'claude tidak ditemukan di PATH');
    const ver = readJson(path.join(root, '.claude', 'harness.version'));
    ok('.claude/harness.version terbaca', !!(ver && ver.version), 'jalankan: node <installer>/install.mjs . --update');
    ok('versi config sama dengan versi terpasang', !ver || cfg.harness_version === ver.version, `config ${cfg.harness_version} ≠ terpasang ${ver && ver.version}; jalankan install --update`);
    const settings = readJson(path.join(root, '.claude', 'settings.json'));
    ok('.claude/settings.json', !!settings, 'hilang');
    const refs = JSON.stringify(settings || {}).match(/\.claude\/hooks\/[\w.-]+\.mjs/g) || [];
    const missing = [...new Set(refs)].filter((r) => !fs.existsSync(path.join(root, r)));
    ok('semua hook yang dirujuk ada', !missing.length, missing.join(', '));
    ok('AGENTS.md', fs.existsSync(path.join(root, 'AGENTS.md')), 'hilang');
    ok('docs/_map.md', fs.existsSync(path.join(root, 'docs', '_map.md')), 'jalankan /harness:init');
    ok('docs/work/_TEMPLATE', fs.existsSync(path.join(root, 'docs', 'work', '_TEMPLATE', 'plan.md')), 'hilang');
    const bad = (cfg.services || []).filter((s) => !fs.existsSync(path.join(root, cfg.services_dir, s)));
    ok('service di config ada di disk', !bad.length, bad.join(', '));
    // Branch baseline (tempat deploy) tiap service harus dilindungi; kalau tidak, commit/push langsung ke sana tidak diblokir.
    const prot = [cfg.root_branch, ...(cfg.protected_branches || [])].map((g) => globToRegex(g));
    const open = (cfg.services || []).map((s) => ({ s, b: baselineOf(root, cfg, s, { light: true }) })).filter((x) => x.b.ok && !prot.some((re) => re.test(x.b.branch)));
    ok('branch baseline tiap service dilindungi (protected_branches)', !open.length, `${open.map((x) => `${x.s}: ${x.b.branch}`).join(', ')} → tambahkan ke "protected_branches" di harness.config.json`.slice(0, 300));
    console.log(`| cek | hasil | catatan |\n|---|---|---|\n${rows.join('\n')}`);
    if (rows.some((r) => r.includes('GAGAL'))) process.exit(2);
    break;
  }
  case 'inventory': {
    const inv = inventory(root, cfg);
    if (args.includes('--json')) { console.log(JSON.stringify(inv, null, 2)); break; }
    console.log('| service | stack (dari baseline) | di config | baseline | checkout |\n|---|---|---|---|---|');
    for (const f of inv.found) console.log(`| ${f.service} | ${f.stack} | ${f.in_config ? 'ya' : 'BELUM'} | ${f.baseline} | ${f.checkout} |`);
    if (inv.skipped.length) console.log(`\nDilewati (bukan repo git): ${inv.skipped.join(', ')}`);
    if (inv.new_services.length) console.log(`\nService baru (belum di harness.config.json → services): ${inv.new_services.join(', ')}\nTambahkan manual (file itu dilindungi dari agent).`);
    if (inv.missing_on_disk.length) console.log(`\nAda di config tetapi tidak ada di disk: ${inv.missing_on_disk.join(', ')}`);
    break;
  }
  case 'baseline': {
    const fetch = args.includes('--fetch');
    const rows = svcArgs(args).map((s) => baselineOf(root, cfg, s, { fetch }));
    if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); break; }
    console.log('| service | baseline | commit | via | checkout | catatan |\n|---|---|---|---|---|---|');
    for (const r of rows) console.log(r.ok ? `| ${r.service} | ${r.ref} | ${r.sha.slice(0, 10)} | ${r.via} | ${r.checkout}${r.on_baseline ? '' : ' (≠ baseline)'}${r.dirty ? ' · dirty' : ''} | ${r.note} |` : `| ${r.service} | — | — | — | — | ${r.note} |`);
    if (rows.some((r) => !r.ok)) process.exit(2);
    break;
  }
  case 'worktree': {
    const [act, svc] = args;
    if (!['add', 'rm'].includes(act) || !svc) die('usage: worktree add|rm <service>');
    const r = act === 'add' ? worktreeAdd(root, cfg, svc) : worktreeRm(root, cfg, svc);
    if (!r.ok) die(r.note, 2);
    console.log(act === 'add' ? `${r.path}  (commit baseline ${r.sha.slice(0, 10)} dari ${r.ref})` : `dihapus: .claude/state/worktrees/${svc}`);
    break;
  }
  case 'lint-knowledge': {
    const res = svcArgs(args).map((s) => lintService(root, cfg, s));
    if (args.includes('--json')) console.log(JSON.stringify(res, null, 2)); else console.log(formatLint(res));
    if (res.some((r) => r.errors)) process.exit(2);
    break;
  }
  case 'knowledge-sample': {
    if (!args[0]) die('usage: knowledge-sample <service> [n]');
    const it = sampleService(root, cfg, args[0], Number(args[1]) || 6);
    if (!it.length) die('tidak ada sitasi yang bisa disampel.', 2);
    it.forEach((x, i) => console.log(`### ${i + 1}. ${x.f}\nKlaim : ${x.claim}\nKode  : ${x.cite}\n\`\`\`\n${x.code.join('\n')}\n\`\`\`\n`));
    console.log('Cocok semua? Ketik /harness:knowledge verify ' + args[0] + ' (atau "! node .claude/hooks/harness.mjs verify-knowledge ' + args[0] + '").');
    break;
  }
  case 'knowledge-status': {
    const rows = svcArgs(args).map((s) => knowledgeStatus(root, cfg, s));
    if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); break; }
    console.log('| service | status | source_commit | baseline | tertinggal | berkas berubah | keadaan |\n|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.service} | ${r.status || '-'} | ${(r.source_commit || '-').slice(0, 8)} | ${r.baseline || '-'} | ${r.behind ?? '-'} | ${r.files ?? '-'} | ${r.state} |`);
    break;
  }
  case 'snapshot': {
    // Satu objek JSON metadata untuk viewer (tempel/unggah). Tanpa isi dokumen, teks AC, atau path kode.
    console.log(JSON.stringify(buildSnapshot(), null, 2));
    break;
  }
  case 'board': {
    // Papan lokal: template board.html + snapshot tertanam. Hanya metadata yang sama dengan `snapshot`.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const tplPath = path.join(here, 'board.html');
    if (!fs.existsSync(tplPath)) die('board.html tidak ditemukan di .claude/hooks/. Pasang ulang harness atau salin dari repo agent-harness.');
    const oi = args.indexOf('--out');
    if (oi >= 0 && !args[oi + 1]) die('--out butuh path berkas.');
    const out = path.resolve(oi >= 0 ? args[oi + 1] : path.join(root, '.claude/state/board.html'));
    const snap = buildSnapshot();
    const json = JSON.stringify(snap).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const tpl = fs.readFileSync(tplPath, 'utf8');
    if (tpl.split('/*SNAPSHOT*/null').length !== 2) die('board.html tidak valid: penanda /*SNAPSHOT*/null harus tepat satu.');
    const body = tpl.replace('/*SNAPSHOT*/null', () => json);
    const doc = `<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>:root{color-scheme:light}body{margin:0}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, doc);
    const url = pathToFileURL(out).href;
    console.log(`board: ${out}\nurl:   ${url}\nisi:   ${snap.work_items.length} work item, ${snap.services.length} service (snapshot ${snap.generated_at})`);
    if (args.includes('--open')) {
      const [bin, ...a] = process.platform === 'win32' ? ['cmd.exe', '/c', 'start', '', out] : process.platform === 'darwin' ? ['open', out] : ['xdg-open', out];
      const r = spawnSync(bin, a, { stdio: 'ignore' });
      if (r.error || (r.status ?? 0) !== 0) console.log('catatan: gagal membuka browser otomatis; buka url di atas secara manual.');
    }
    break;
  }
  case 'propose-checks': {
    const out = {};
    for (const s of svcArgs(args)) { const r = proposeChecks(root, cfg, s); out[s] = r.ok ? { ...r.checks } : { error: r.note }; if (r.ok && r.basis.length) console.error(`# ${s}: dasar → ${r.basis.join(', ')}`); }
    console.log(JSON.stringify({ checks: out }, null, 2));
    console.error('# Salin ke harness.config.json (blok "checks") secara manual; periksa dulu tiap perintah.');
    break;
  }
  case 'patterns-check': {
    if (!args[0]) die('usage: patterns-check <slug>');
    const slug = resolveSlug(root, args[0]); if (!slug) die(`work item "${args[0]}" tidak ditemukan.`);
    const r = checkProposal(root, cfg, slug);
    if (r.problems.length) { console.log(`USULAN BERMASALAH:\n- ${r.problems.join('\n- ')}`); process.exit(2); }
    console.log(`OK: ${r.selected.length} item proposed siap disetujui manusia (${r.selected.map((i) => i.id).join(', ') || '-'}).`);
    break;
  }
  case 'verify-knowledge': {
    if (!args[0]) die('usage: verify-knowledge <service>');
    const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
    const r = verifyService(root, cfg, args[0], who);
    if (!r.ok) { console.log(formatLint([r.lint])); die(`\nDITOLAK: lint punya ${r.lint.errors} ERROR; perbaiki dulu (knowledge tidak boleh verified).`, 2); }
    audit(root, { event: 'verify-knowledge', service: args[0], by: who });
    console.log(`${args[0]}: draft → verified oleh ${who}\n- ${r.changed.join('\n- ')}`);
    break;
  }
  case 'patterns-approve': {
    if (!args[0] || !args[1]) die('usage: patterns-approve <slug> <P1,P2|all>');
    const slug = resolveSlug(root, args[0]); if (!slug) die(`work item "${args[0]}" tidak ditemukan.`);
    const who = spawnSync('git', ['config', 'user.email'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
    const r = approveProposal(root, cfg, slug, args[1] === 'all' ? 'all' : args[1].split(',').map((x) => x.trim().toUpperCase()), who);
    if (!r.ok) die(`DITOLAK:\n- ${r.problems.join('\n- ')}`, 2);
    audit(root, { event: 'patterns-approve', slug, by: who, applied: r.applied.join(',') });
    console.log(`diterapkan ke patterns.md oleh ${who}: ${r.applied.join(', ')}`);
    break;
  }
  case 'bench': {
    // Ukur latensi tiap hook (spawn node sungguhan, payload sintetis). Jalankan di mesin target: node .claude/hooks/harness.mjs bench [--n 20] [--json]
    const ni = args.indexOf('--n');
    const n = Math.max(3, Number(ni >= 0 ? args[ni + 1] : 15) || 15);
    const hooksDir = path.dirname(fileURLToPath(import.meta.url));
    const pj = (o) => JSON.stringify({ session_id: 'bench', cwd: root, ...o });
    const specs = [
      ['node kosong (dasar)', ['-e', '0'], ''],
      ['session.mjs (SessionStart)', [path.join(hooksDir, 'session.mjs')], pj({ hook_event_name: 'SessionStart', source: 'startup' })],
      ['prompt.mjs (UserPromptSubmit)', [path.join(hooksDir, 'prompt.mjs')], pj({ hook_event_name: 'UserPromptSubmit', prompt: 'halo' })],
      ['gate.mjs (Edit)', [path.join(hooksDir, 'gate.mjs')], pj({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'docs', 'bench.md'), old_string: 'a', new_string: 'b' } })],
      ['guard-bash.mjs (Bash)', [path.join(hooksDir, 'guard-bash.mjs')], pj({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })],
      ['post.mjs (PostToolUse)', [path.join(hooksDir, 'post.mjs')], pj({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })],
    ];
    const rows = [];
    for (const [name, a, input] of specs) {
      const t = []; let bad = 0;
      for (let i = 0; i < n + 2; i++) {
        const t0 = process.hrtime.bigint();
        const r = spawnSync(process.execPath, a, { input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, HARNESS_BENCH: '1' } });
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (r.status !== 0) bad++;
        if (i >= 2) t.push(ms);
      }
      t.sort((x, y) => x - y);
      const q = (p) => t[Math.min(t.length - 1, Math.floor(p * t.length))];
      rows.push({ hook: name, p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), max: Math.round(t[t.length - 1]), error: bad });
    }
    const med = (k) => rows.find((r) => r.hook.startsWith(k))?.p50 ?? 0;
    const perAction = { 'Read/Grep/Glob (tanpa hook)': 0, 'Edit/Write': med('gate') + med('post'), 'Bash': med('guard') + med('post') };
    if (args.includes('--json')) { console.log(JSON.stringify({ os: process.platform, node: process.versions.node, n, rows, per_action_ms: perAction }, null, 2)); break; }
    console.log(`os: ${process.platform} | node: ${process.versions.node} | ulangan: ${n} (+2 pemanasan)\n\n| hook | p50 ms | p95 ms | max ms | gagal |\n|---|---|---|---|---|\n${rows.map((r) => `| ${r.hook} | ${r.p50} | ${r.p95} | ${r.max} | ${r.error} |`).join('\n')}`);
    console.log(`\nBeban hook per tindakan (p50, hook sebelum + sesudah): ${Object.entries(perAction).map(([k, v]) => `${k} ≈ ${v} ms`).join('; ')}`);
    break;
  }
  default:
    die('perintah: new | gate | run-checks | log | measure | update | quick | amend | promote | next | list | show | snapshot | board | set-status | start | check | reopen | approve | doctor | inventory | baseline | worktree | lint-knowledge | knowledge-sample | knowledge-status | propose-checks | bench | patterns-check | verify-knowledge | patterns-approve');
}
