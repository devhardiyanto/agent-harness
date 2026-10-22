#!/usr/bin/env node
// CLI harness: dipakai skill dan user. Usage: node .claude/hooks/harness.mjs <cmd> [args]
//   new <type> <judul...>   buat work item dari template
//   list                    daftar work item
//   show <slug>             ringkas satu item
//   set-status <slug> <to>  ubah status (dengan pemeriksaan transisi/gerbang)
//   start <slug>            = set-status in-progress
//   check <slug>            dry-run gerbang 2
//   reopen <slug>           kembali ke draft (butuh approve ulang)
//   approve <slug>          HANYA manusia (jalankan dengan awalan "!")
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
//   verify-knowledge <svc>              HANYA manusia ("!" atau /harness:verify): draft → verified bila lint bersih
//   patterns-approve <slug> <P1,P3|all> HANYA manusia ("!" atau /harness:patterns): terapkan usulan pola ke patterns.md
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  inventory, baselineOf, worktreeAdd, worktreeRm, lintService, formatLint, sampleService, knowledgeStatus, proposeChecks,
  verifyService, checkProposal, approveProposal, isRepo, svcDir,
} from './knowledge.mjs';
import {
  projectRoot, loadConfig, listItems, readItem, resolveSlug, checkTransition, checkDone, setFmKey, STATUSES,
  splitFrontmatter, parseAcs, readJson, audit,
} from './lib.mjs';

const root = projectRoot();
const cfg = loadConfig(root);
const [cmd, ...args] = process.argv.slice(2);
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const TYPES = ['feature', 'improvement', 'hotfix', 'analysis', 'cross-repo', 'schema', 'onboard'];

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

function write(item, to, extra = {}) {
  let t = fs.readFileSync(item.planPath, 'utf8');
  t = setFmKey(t, 'status', to);
  t = setFmKey(t, 'updated', today());
  for (const [k, v] of Object.entries(extra)) t = setFmKey(t, k, v);
  fs.writeFileSync(item.planPath, t);
  audit(root, { event: 'status', slug: item.slug, from: item.status, to });
}

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
    const items = listItems(root);
    if (!items.length) { console.log('(belum ada work item)'); break; }
    console.log('| slug | type | status | services |\n|---|---|---|---|');
    for (const i of items) console.log(`| ${i.slug} | ${i.type} | ${i.status} | ${i.services.join(',') || '-'} |`);
    break;
  }
  case 'show': {
    const i = need(args[0]);
    console.log(`${i.slug}\nstatus: ${i.status}\ntype: ${i.type}\nservices: ${i.services.join(', ') || '-'}\nAC: ${parseAcs(i.body).map((a) => a.id).join(', ') || '-'}\npr: ${i.fm.pr || '-'}`);
    break;
  }
  case 'start':
  case 'set-status': {
    const i = need(args[0]);
    const to = cmd === 'start' ? 'in-progress' : args[1];
    if (to === 'approved') die('approve hanya oleh manusia.');
    const p = checkTransition(root, cfg, i, to, { actor: 'agent' });
    if (p.length) die(`DITOLAK ${i.status} → ${to}:\n- ${p.join('\n- ')}`, 2);
    write(i, to);
    console.log(`${i.slug}: ${i.status} → ${to}`);
    break;
  }
  case 'check': {
    const i = need(args[0]);
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
  case 'doctor': {
    const rows = [];
    const ok = (name, pass, hint = '') => rows.push(`| ${name} | ${pass ? 'OK' : 'GAGAL'} | ${pass ? '' : hint} |`);
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    ok('node >= 18', nodeMajor >= 18, `terpasang ${process.versions.node}`);
    const sh = (c, a) => spawnSync(c, a, { encoding: 'utf8' });
    const git = sh('git', ['--version']); ok('git', git.status === 0, 'pasang git');
    const gh = sh('gh', ['--version']); ok('gh (untuk cek PR merged)', gh.status === 0, 'pasang GitHub CLI + gh auth login');
    const cl = sh('claude', ['--version']);
    const ver = /(\d+)\.(\d+)\.(\d+)/.exec(cl.stdout || '');
    const verOk = ver && (Number(ver[1]) > 2 || (Number(ver[1]) === 2 && (Number(ver[2]) > 1 || (Number(ver[2]) === 1 && Number(ver[3]) >= 295))));
    ok('claude >= 2.1.295 (onFailure: block)', !!verOk, cl.stdout ? `terpasang ${cl.stdout.trim()}` : 'claude tidak ditemukan di PATH');
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
    console.log('Cocok semua? Ketik /harness:verify ' + args[0] + ' (atau "! node .claude/hooks/harness.mjs verify-knowledge ' + args[0] + '").');
    break;
  }
  case 'knowledge-status': {
    const rows = svcArgs(args).map((s) => knowledgeStatus(root, cfg, s));
    if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); break; }
    console.log('| service | status | source_commit | baseline | tertinggal | berkas berubah | keadaan |\n|---|---|---|---|---|---|---|');
    for (const r of rows) console.log(`| ${r.service} | ${r.status || '-'} | ${(r.source_commit || '-').slice(0, 8)} | ${r.baseline || '-'} | ${r.behind ?? '-'} | ${r.files ?? '-'} | ${r.state} |`);
    break;
  }
  case 'propose-checks': {
    const out = {};
    for (const s of svcArgs(args)) { const r = proposeChecks(root, cfg, s); out[s] = r.ok ? { ...r.checks } : { error: r.note }; if (r.ok && r.basis.length) console.error(`# ${s}: dasar → ${r.basis.join(', ')}`); }
    console.log(JSON.stringify({ checks: out }, null, 2));
    console.error('# Salin ke harness.config.json (blok "checks") secara manual; periksa dulu tiap perintah. agent_runs tetap false kecuali Anda memutuskan lain.');
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
  default:
    die('perintah: new | list | show | set-status | start | check | reopen | approve | doctor | inventory | baseline | worktree | lint-knowledge | knowledge-sample | knowledge-status | propose-checks | patterns-check | verify-knowledge | patterns-approve');
}
