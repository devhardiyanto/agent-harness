#!/usr/bin/env node
// CLI harness 2.0. Perintah:
//   doctor                         cek pemasangan
//   update [--all|--rollback]      perbarui harness root ini (lewat installer di ~/.harness/installer.json)
//   topic new "<judul>" [--ref <topik>] | list [--open] | find <kata> | use <topik> | close <topik> | active
//   remap [--apply] [--json]       rencana merapikan docs/ lama (tanpa --apply = rencana saja)
//   git-auth [--apply] | git-auth which <service> | git-auth repo <service>
//   knowledge [service]            status pengetahuan service (ada, umur, menunggu merge)
//   growth [--arsip <skill>]       laporan pertumbuhan: memori, skill hasil belajar, knowledge, koreksi per topik
//   memori [--rapikan [--apply]]   status memori; rapikan format 1.x (§) ke baris "- "
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, readJson, globToRegex } from './lib.mjs';
import { newTopic, listTopics, closeTopic, activeTopic, findTopics, useTopic, readFm, skillUsagePath, staleTopics, junkTopics } from './topics.mjs';
import * as memory from './memory.mjs';
import * as knowledge from './knowledge.mjs';
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
      const stale = opt('stale');
      const ts = stale !== null ? staleTopics(root, Number(stale) || 7) : listTopics(root).filter((t) => !flag('open') || t.status === 'open');
      console.log(ts.length ? table(['tanggal', 'topik', 'status', 'judul'], ts.map((t) => [t.date, t.slug, t.status, t.title])) : 'belum ada topik');
    } else if (sub === 'close') {
      if (!args[1]) die('pakai: harness.mjs topic close <tanggal/slug>');
      const r = closeTopic(root, args[1]);
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
    } else die('pakai: harness.mjs topic new|list [--open|--stale <hari>]|find|use|close|active');
    break;
  }
  case 'remap': {
    const p = remap.plan(root, cfg);
    if (flag('json')) { console.log(JSON.stringify(p, null, 2)); break; }
    const nX = p.moves.filter((m) => m.remove).length; const nL = p.moves.filter((m) => m.legacy).length; const nT = p.moves.length - nL - nX;
    console.log(`## Remap (batas legacy: sebelum ${p.cutoff}, ${p.months} bulan)\n`);
    console.log(table(['ringkas', 'jumlah'], [['ke docs/topics atau docs/sessions (baru)', nT], ['ke docs/_legacy', nL], ['folder kosong buatan remap lama (dihapus)', nX], ['tidak disentuh', p.untouched.length], ['disarankan dihapus (skrip)', p.deletes.length]]));
    if (p.moves.length) console.log(`\n${table(['ke', 'dari', 'tujuan'], p.moves.map((m) => [m.remove ? 'hapus' : m.legacy ? 'legacy' : 'baru', m.src, m.to || '-']))}`);
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
  case 'knowledge': {
    const svcs = args[0] ? [args[0]] : cfg.services;
    if (args[0] && !cfg.services.includes(args[0])) die(`service ${args[0]} tidak ada di harness.config.json → services`);
    const rows = svcs.map((s) => knowledge.serviceStatus(root, cfg, s));
    if (!args[0]) knowledge.writeCache(root, rows);
    else { const all = { ...knowledge.readCache(root) }; const r = rows[0]; all[r.svc] = r.state.startsWith('usang') ? 'usang' : r.state === 'belum ada' ? 'belum' : 'ok'; knowledge.writeCache(root, Object.entries(all).map(([svc, v]) => ({ svc, state: v === 'usang' ? 'usang' : v === 'belum' ? 'belum ada' : 'segar' }))); }
    console.log(table(['service', 'status', 'diperbarui', 'baseline', 'menunggu merge'], rows.map((r) => [r.svc, r.state, r.updated || '-', r.base || '-', r.pending.length ? r.pending.map((p) => `${p.branch}@${p.sha} ${p.merged ? 'merged: ya' : 'belum merged'}`).join('; ') : '-'])));
    const todo = rows.filter((r) => r.state === 'belum ada').map((r) => r.svc);
    if (todo.length) console.log(`\nBelum ada knowledge: ${todo.join(', ')} → skill bootstrap (ringkas) sebelum topik menyentuhnya.`);
    break;
  }
  case 'growth': {
    const L = cfg.learn;
    const userMd = memory.userMdPath();
    const mem = (f, limit) => { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { return '-'; } return `${memory.entries(t).length} fakta · ${t.length}/${limit} karakter${memory.isLegacy(t) ? ' · format 1.x → harness.mjs memori --rapikan' : ''}`; };
    const usage = readJson(skillUsagePath(root), {}) || {};
    const skillsDir = path.join(root, '.claude', 'skills');
    const learned = [];
    try {
      for (const d of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        let t = ''; try { t = fs.readFileSync(path.join(skillsDir, d.name, 'SKILL.md'), 'utf8'); } catch { continue; }
        const fm = readFm(t);
        if (fm.asal === 'belajar') learned.push({ name: d.name, made: fm.dibuat || '-', used: usage[d.name] || null });
      }
    } catch { /* belum ada skill */ }
    const ageDays = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Math.floor((Date.now() - Date.parse(iso)) / 864e5) : null);
    const stale = learned.filter((s) => { const a = ageDays(s.used || s.made); return a !== null && a > L.skill_unused_days; });
    const arsip = opt('arsip');
    if (arsip) {
      if (!learned.some((s) => s.name === arsip)) die(`skill ${arsip} bukan skill hasil belajar (asal: belajar)`);
      const to = path.join(root, 'docs', '_legacy', '_lama', 'skills', arsip);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(path.join(skillsDir, arsip), to);
      console.log(`diarsip: .claude/skills/${arsip} → docs/_legacy/_lama/skills/${arsip}`);
      break;
    }
    const topics = listTopics(root);
    const closed = topics.filter((t) => t.status === 'closed').sort((a, b) => (a.id < b.id ? 1 : -1));
    const kor = closed.slice(0, 10).map((t) => { try { return Number(readFm(fs.readFileSync(path.join(t.dir, 'summary.md'), 'utf8')).koreksi); } catch { return NaN; } }).filter((n) => Number.isFinite(n));
    const kn = cfg.services.map((s) => knowledge.serviceStatus(root, cfg, s));
    knowledge.writeCache(root, kn);
    console.log(table(['bagian', 'nilai'], [
      ['memori project', mem(path.join(root, 'docs', 'memory', 'MEMORY.md'), L.memory_chars)],
      ['profil user', mem(userMd, L.user_chars)],
      ['skill hasil belajar', learned.length ? learned.map((s) => `${s.name} (dipakai ${s.used || 'belum'})`).join(', ') : '0'],
      ['knowledge service', `${kn.filter((r) => r.state === 'segar').length} segar · ${kn.filter((r) => r.state.startsWith('usang')).length} usang · ${kn.filter((r) => r.state === 'belum ada').length} belum ada · ${kn.reduce((n, r) => n + r.pending.length, 0)} menunggu merge`],
      ['topik', `${topics.length} total · ${topics.filter((t) => t.status === 'open').length} terbuka · ${topics.filter((t) => t.status === 'impor').length} impor (tanpa frontmatter) · ${closed.length} ditutup`],
      ['koreksi user per topik (10 terakhir, baru → lama)', kor.length ? `${kor.join(', ')} · rata-rata ${(kor.reduce((a, b) => a + b, 0) / kor.length).toFixed(1)}` : 'belum ada data (frontmatter koreksi: di summary.md)'],
    ]));
    if (stale.length) console.log(`\nSkill tidak dipakai > ${L.skill_unused_days} hari: ${stale.map((s) => s.name).join(', ')} → arsip (tidak dihapus): harness.mjs growth --arsip <skill>`);
    break;
  }
  case 'memori': {
    const rows = memory.plan(root, cfg);
    console.log(table(['berkas', 'status', 'fakta', 'karakter sekarang → setelah rapikan'], rows.map((r) => [r.file, r.state, r.entries ?? '-', r.before === undefined ? '-' : `${r.before} → ${r.after} / ${r.limit}`])));
    const legacy = rows.filter((r) => r.legacy);
    if (!flag('rapikan')) { if (legacy.length) console.log('\nFormat 1.x: node .claude/hooks/harness.mjs memori --rapikan'); break; }
    if (!legacy.length) { console.log('\nTidak ada yang perlu dirapikan.'); break; }
    if (!flag('apply')) {
      for (const r of legacy) console.log(`\n### ${r.file} (setelah rapikan)\n${r.next.split('\n').slice(0, 12).join('\n')}${r.next.split('\n').length > 12 ? '\n…' : ''}`);
      console.log('\nTerapkan: node .claude/hooks/harness.mjs memori --rapikan --apply (USER.md dicadangkan ke USER.md.bak)');
      break;
    }
    for (const f of memory.apply(rows)) console.log(`dirapikan: ${f}`);
    for (const r of legacy) if (r.after > r.limit) console.log(`peringatan: ${r.file} ${r.after}/${r.limit} karakter → gabungkan atau hapus fakta usang (skill belajar)`);
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
    if (cfg.services.length) {
      const kn = cfg.services.map((s) => knowledge.serviceStatus(root, cfg, s));
      knowledge.writeCache(root, kn);
      const miss = kn.filter((r) => r.state === 'belum ada').map((r) => r.svc); const old = kn.filter((r) => r.state.startsWith('usang')).map((r) => r.svc);
      add('knowledge service', miss.length || old.length ? 'INFO' : 'OK', [miss.length ? `belum ada: ${miss.join(', ')}` : '', old.length ? `usang: ${old.join(', ')}` : ''].filter(Boolean).join(' · ').slice(0, 300));
    }
    const legacyMem = memory.plan(root, cfg).filter((r) => r.legacy).map((r) => (r.kind === 'user' ? '~/.harness/USER.md' : 'docs/memory/MEMORY.md'));
    if (legacyMem.length) add('format memori', 'PERINGATAN', `${legacyMem.join(', ')} masih format 1.x (§) → node .claude/hooks/harness.mjs memori --rapikan`);
    const junk = junkTopics(root);
    if (junk.length) add('topik sampah', 'INFO', `${junk.map((t) => t.rel).join(', ')} → periksa lalu hapus sendiri`.slice(0, 400));
    const leftovers = ['docs/work', 'docs/topik', 'docs/reports', '.harness'].filter((p) => fs.existsSync(path.join(root, p)));
    if (leftovers.length) add('sisa 1.x', 'INFO', `${leftovers.join(', ')} → skill remap`);
    console.log(table(['cek', 'hasil', 'catatan'], rows));
    if (rows.some((r) => r[1] === 'GAGAL')) process.exit(2);
    break;
  }
  default:
    console.log('harness.mjs doctor | update [--all|--rollback] | topic new|list|find|use|close|active | remap [--apply] | git-auth [--apply] | git-auth which|repo <svc> | knowledge [svc] | growth [--arsip <skill>] | memori [--rapikan [--apply]]');
    if (cmd && cmd !== 'help') process.exit(1);
}
