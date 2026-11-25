#!/usr/bin/env node
// CLI harness 2.0. Perintah:
//   doctor                         cek pemasangan
//   update [--all|--rollback]      perbarui harness root ini (lewat installer di ~/.harness/installer.json)
//   topic new "<judul>" [--ref <topik>] | list [--open] | find <kata> | use <topik> | close <topik> | active
//   remap [--apply] [--json]       rencana merapikan docs/ lama (tanpa --apply = rencana saja)
//   git-auth [--apply] | git-auth which <service> | git-auth repo <service>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, readJson, globToRegex } from './lib.mjs';
import { newTopic, listTopics, closeTopic, activeTopic, findTopics, useTopic } from './topics.mjs';
import * as remap from './remap.mjs';
import * as gitauth from './gitauth.mjs';

const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
const cfg = loadConfig(root);
const [cmd, ...args] = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map((c) => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`).join('\n')}`;

switch (cmd) {
  case 'topic': {
    const sub = args[0];
    if (sub === 'new') {
      const words = args.slice(1).filter((a, i, all) => a !== '--ref' && all[i - 1] !== '--ref');
      if (!words.length) die('pakai: harness.mjs topic new "<judul>" [--ref <topik lama>]');
      const r = newTopic(root, words.join(' '), { ref: opt('ref') || '' });
      console.log(`${r.created ? 'dibuat' : 'sudah ada'}: ${r.rel}/`);
    } else if (sub === 'list') {
      const ts = listTopics(root).filter((t) => !flag('open') || t.status !== 'closed');
      console.log(ts.length ? table(['tanggal', 'topik', 'status', 'judul'], ts.map((t) => [t.date, t.slug, t.status, t.title])) : 'belum ada topik');
    } else if (sub === 'close') {
      const r = closeTopic(root, args[1] || (activeTopic(root) || {}).id);
      if (!r.ok) die(r.reason);
      console.log(`ditutup: ${r.topic.rel}/${r.summary ? '' : '  (summary.md belum ada: tulis dulu)'}`);
    } else if (sub === 'find') {
      const r = findTopics(root, args.slice(1).join(' '));
      console.log(r.length ? table(['skor', 'lokasi', 'status', 'judul'], r.map((t) => [t.score, `${t.rel}/`, t.status, t.title])) : 'tidak ada topik yang cocok');
    } else if (sub === 'use') {
      const r = useTopic(root, args[1]);
      if (!r.ok) die(r.reason);
      console.log(`dipakai: ${r.topic.rel}/${r.reopened ? '  (dibuka lagi)' : ''}`);
    } else if (sub === 'active') {
      const t = activeTopic(root);
      console.log(t ? `${t.rel}/` : '');
    } else die('pakai: harness.mjs topic new|list|find|use|close|active');
    break;
  }
  case 'remap': {
    const p = remap.plan(root, cfg);
    if (flag('json')) { console.log(JSON.stringify(p, null, 2)); break; }
    const nT = p.moves.filter((m) => !m.legacy).length; const nL = p.moves.length - nT;
    console.log(`## Remap (batas legacy: sebelum ${p.cutoff}, ${p.months} bulan)\n`);
    console.log(table(['ringkas', 'jumlah'], [['ke docs/topics atau docs/sessions (baru)', nT], ['ke docs/_legacy', nL], ['tidak disentuh', p.untouched.length], ['disarankan dihapus (skrip)', p.deletes.length]]));
    if (p.moves.length) console.log(`\n${table(['ke', 'dari', 'tujuan'], p.moves.map((m) => [m.legacy ? 'legacy' : 'baru', m.src, m.to]))}`);
    if (p.untouched.length) console.log(`\nTidak disentuh: ${p.untouched.join(', ')}`);
    const s = remap.deleteScript(p);
    if (s) console.log(`\n### Skrip hapus (tidak dijalankan)\n\`\`\`bash\n${s}\n\`\`\``);
    if (flag('apply')) { const done = remap.apply(root, p); console.log(`\nDITERAPKAN: ${done.length} dipindah. Tinjau dengan git status, lalu commit sendiri.`); }
    else console.log('\nRencana saja. Terapkan: node .claude/hooks/harness.mjs remap --apply');
    break;
  }
  case 'git-auth': {
    if (args[0] === 'which') { const a = gitauth.accountFor(cfg, args[1]); if (!a) die(`akun untuk ${args[1]} belum diisi di harness.config.json → git`); console.log(a); break; }
    if (args[0] === 'repo') { const r = gitauth.plan(root, cfg).find((x) => x.svc === args[1]); if (!r || !r.repo) die(`repo untuk ${args[1]} tidak terbaca dari remote origin`); console.log(r.repo); break; }
    const rows = flag('apply') ? gitauth.apply(root, cfg) : gitauth.plan(root, cfg);
    console.log(rows.length ? table(['service', 'akun', 'repo', 'status'], rows.map((r) => [r.svc, r.account || '-', r.repo || '-', r.status])) : 'tidak ada service di harness.config.json');
    if (!flag('apply') && rows.some((r) => r.status === 'belum terpasang')) console.log('\nPasang: node .claude/hooks/harness.mjs git-auth --apply');
    break;
  }
  case 'update': {
    const home = process.env.HARNESS_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.harness');
    const inst = readJson(path.join(home, 'installer.json'), null);
    const script = inst && inst.path ? path.join(inst.path, 'scripts', 'harness-update.mjs') : null;
    if (!script || !fs.existsSync(script)) die('lokasi installer belum tercatat (~/.harness/installer.json). Jalankan sekali: node <agent-harness>/install.mjs <root> --update', 2);
    const r = spawnSync(process.execPath, [script, ...(flag('all') ? ['--all'] : [root]), ...(flag('rollback') ? ['--rollback'] : []), ...args.filter((a) => ['--dry-run', '--push', '--no-pull', '--no-plugin'].includes(a))], { stdio: 'inherit', cwd: root });
    process.exit(r.status ?? 1);
  }
  case 'doctor': {
    const rows = [];
    const add = (name, res, note = '') => rows.push([name, res, note]);
    const ok = (name, pass, hint = '') => add(name, pass ? 'OK' : 'GAGAL', pass ? '' : hint);
    const sh = (c, a) => spawnSync(c, a, { encoding: 'utf8', shell: process.platform === 'win32' && c === 'claude' });
    ok('node >= 18', Number(process.versions.node.split('.')[0]) >= 18, process.versions.node);
    ok('git', sh('git', ['--version']).status === 0, 'pasang git');
    const gh = sh('gh', ['--version']);
    ok('gh', gh.status === 0, 'pasang GitHub CLI + gh auth login');
    const ver = readJson(path.join(root, '.claude', 'harness.version'));
    ok('.claude/harness.version', !!(ver && ver.version), 'node <agent-harness>/install.mjs . --update');
    ok('versi config = versi terpasang', !ver || cfg.harness_version === ver.version, `config ${cfg.harness_version} ≠ ${ver && ver.version}`);
    const settings = readJson(path.join(root, '.claude', 'settings.json'));
    ok('.claude/settings.json', !!settings, 'hilang');
    const refs = [...new Set(JSON.stringify(settings || {}).match(/\.claude\/hooks\/[\w.-]+\.mjs/g) || [])];
    const missing = refs.filter((r) => !fs.existsSync(path.join(root, r)));
    ok('hook yang dirujuk ada', !missing.length, missing.join(', '));
    ok('AGENTS.md', fs.existsSync(path.join(root, 'AGENTS.md')), 'hilang');
    const bad = cfg.services.filter((s) => !fs.existsSync(path.join(root, cfg.services_dir, s)));
    ok('service di config ada di disk', !bad.length, bad.join(', '));
    if (cfg.layout === 'multi-repo') {
      const iso = [settings, readJson(path.join(root, '.claude', 'settings.local.json'))].map((s) => s && s.worktree && s.worktree.bgIsolation);
      ok('sesi background tidak pindah worktree', iso.includes('none'), 'install --update menambahkan worktree.bgIsolation = "none"');
    }
    if (gh.status === 0 && cfg.services.length) {
      const g = gitauth.plan(root, cfg);
      const accts = [...new Set(g.map((r) => r.account).filter(Boolean))];
      if (!accts.length) add('akun git per service', 'INFO', 'isi "git": {"default_account": "<akun>"} di harness.config.json, lalu git-auth --apply');
      else {
        const noTok = accts.filter((a) => !gitauth.tokenAvailable(a));
        ok('gh login untuk akun service', !noTok.length, `belum login: ${noTok.join(', ')} → gh auth login`);
        const notSet = g.filter((r) => r.status === 'belum terpasang').map((r) => r.svc);
        ok('akses git per service (helper HTTPS atau SSH)', !notSet.length, `${notSet.join(', ')} → node .claude/hooks/harness.mjs git-auth --apply`.slice(0, 300));
        const other = g.filter((r) => !gitauth.OK_STATUS(r.status) && r.status !== 'belum terpasang');
        if (other.length) add('service di luar git-auth', 'INFO', other.map((r) => `${r.svc}: ${r.status}`).join(' | ').slice(0, 300));
      }
    }
    const prot = [cfg.root_branch, ...cfg.protected_branches].map(globToRegex);
    ok('root_branch dilindungi', prot.some((re) => re.test(cfg.root_branch)), '');
    const leftovers = ['docs/work', 'docs/topik', 'docs/reports', '.harness'].filter((p) => fs.existsSync(path.join(root, p)));
    if (leftovers.length) add('sisa 1.x', 'INFO', `${leftovers.join(', ')} → skill remap`);
    console.log(table(['cek', 'hasil', 'catatan'], rows));
    if (rows.some((r) => r[1] === 'GAGAL')) process.exit(2);
    break;
  }
  default:
    console.log('harness.mjs doctor | update [--all|--rollback] | topic new|list|close|active | remap [--apply] | git-auth [--apply] | git-auth which|repo <svc>');
    if (cmd && cmd !== 'help') process.exit(1);
}
