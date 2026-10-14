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
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
    ok('docs/_map.md', fs.existsSync(path.join(root, 'docs', '_map.md')), 'jalankan /harness:onboard');
    ok('docs/work/_TEMPLATE', fs.existsSync(path.join(root, 'docs', 'work', '_TEMPLATE', 'plan.md')), 'hilang');
    const bad = (cfg.services || []).filter((s) => !fs.existsSync(path.join(root, cfg.services_dir, s)));
    ok('service di config ada di disk', !bad.length, bad.join(', '));
    console.log(`| cek | hasil | catatan |\n|---|---|---|\n${rows.join('\n')}`);
    if (rows.some((r) => r.includes('GAGAL'))) process.exit(2);
    break;
  }
  default:
    die('perintah: new | list | show | set-status | start | check | reopen | approve | doctor');
}
