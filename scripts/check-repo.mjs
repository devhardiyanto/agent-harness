#!/usr/bin/env node
// Pemeriksa konsistensi repo. Deterministik, tanpa dependency, tanpa jaringan.
// Pakai:  node scripts/check-repo.mjs        (exit 1 bila ada yang gagal)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p) => fs.existsSync(path.join(ROOT, p));
const walk = (dir, out = []) => {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p.split(path.sep).join('/'));
  }
  return out;
};
const json = (p) => JSON.parse(read(p));

const results = [];
function check(name, fn) {
  const errs = [];
  try { fn((m) => errs.push(m)); } catch (e) { errs.push(`pemeriksaan error: ${e.message}`); }
  results.push({ name, errs });
}

// 1. JSON valid
check('JSON valid', (bad) => {
  for (const f of ['package.json', 'kernel/harness.config.json', 'kernel/.claude/settings.json', 'plugin/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json']) {
    try { json(f); } catch (e) { bad(`${f}: ${e.message}`); }
  }
});

// 2. versi konsisten
check('versi konsisten (VERSION, package.json, config kernel, plugin.json)', (bad) => {
  const v = read('VERSION').trim();
  const vals = { 'package.json': json('package.json').version, 'kernel/harness.config.json': json('kernel/harness.config.json').harness_version, 'plugin/.claude-plugin/plugin.json': json('plugin/.claude-plugin/plugin.json').version };
  if (!/^\d+\.\d+\.\d+$/.test(v)) bad(`VERSION bukan semver: "${v}"`);
  for (const [f, x] of Object.entries(vals)) if (x !== v) bad(`${f} = ${x}, VERSION = ${v}`);
});

// 3. skill: SKILL.md ada, name = nama folder, description terisi
const skillDirs = fs.existsSync(path.join(ROOT, 'plugin/skills')) ? fs.readdirSync(path.join(ROOT, 'plugin/skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
check('skill: SKILL.md valid dan namanya sama dengan folder', (bad) => {
  if (!skillDirs.length) bad('plugin/skills kosong');
  if (skillDirs.length > 14) bad(`terlalu banyak skill (${skillDirs.length}); batas 14 (1.7.0: +align, +update)`);
  for (const d of skillDirs) {
    const f = `plugin/skills/${d}/SKILL.md`;
    if (!has(f)) { bad(`${f} tidak ada`); continue; }
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(f));
    if (!m) { bad(`${f}: frontmatter tidak ada`); continue; }
    const name = /^name:\s*(.+)$/m.exec(m[1])?.[1].trim();
    const desc = /^description:\s*(.+)$/m.exec(m[1])?.[1].trim();
    if (name !== d) bad(`${f}: name "${name}" != folder "${d}"`);
    if (!desc) bad(`${f}: description kosong`);
  }
});

// 4. setiap /harness:<x> yang dirujuk adalah skill atau perintah hook yang dikenal
check('rujukan /harness:<perintah> menunjuk skill yang ada', (bad) => {
  const known = new Set(skillDirs); // perintah /harness:<x> = skill; tidak ada perintah lain (hook hanya memproses ketikan skill yang sama)
  const files = [...walk('kernel'), ...walk('plugin'), 'README.md', 'install.mjs'].filter((f) => /\.(md|mjs|json)$/.test(f));
  for (const f of files) {
    for (const m of read(f).matchAll(/(?<=^|[\s`"'])\/harness:([a-z][a-z-]*)/gm)) {
      if (!known.has(m[1])) bad(`${f}: /harness:${m[1]} tidak ada sebagai skill`);
    }
  }
});

// 5. modul yang sudah dibuang tidak boleh dirujuk lagi di kernel dan plugin
check('tidak ada rujukan ke modul yang dibuang (executor, dispatch, plane, lean, agy, graphify)', (bad) => {
  const banned = /\/harness:(dispatch|plane|lean)\b|executor\.enabled|scripts\/executor|\.agents\/|--with-executor|Antigravity|\bagy\b|graphify|knowledge\/graph/i;
  for (const f of [...walk('kernel'), ...walk('plugin')].filter((x) => /\.(md|mjs|json)$/.test(x))) {
    const m = banned.exec(read(f));
    if (m) bad(`${f}: memuat "${m[0]}"`);
  }
});

// 6. hook yang dirujuk settings.json ada, dan sintaksnya valid
check('hook di settings.json ada dan sintaks Node valid', (bad) => {
  const st = read('kernel/.claude/settings.json');
  const names = new Set([...st.matchAll(/\.claude\/hooks\/([A-Za-z0-9_.-]+\.mjs)/g)].map((m) => m[1]));
  if (!names.size) bad('settings.json tidak merujuk hook apa pun');
  for (const n of names) if (!has(`kernel/.claude/hooks/${n}`)) bad(`hook ${n} dirujuk tetapi tidak ada`);
  for (const f of [...walk('kernel/.claude/hooks'), 'install.mjs', 'scripts/check-repo.mjs', 'scripts/harness-update.mjs', 'scripts/projects.mjs'].filter((x) => x.endsWith('.mjs'))) {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
    if (r.status !== 0) bad(`${f}: ${(r.stderr || '').split('\n')[0]}`);
  }
});

// 7. kernel lengkap untuk installer, dan template work item lengkap
check('kernel dan template work item lengkap', (bad) => {
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'harness.config.json', '.claude/settings.json', '.claude/hooks/gate.mjs', '.claude/hooks/lib.mjs', 'docs/_map.md', 'docs/work/_TEMPLATE/plan.md', 'docs/work/_TEMPLATE/brief.md']) {
    if (!has(`kernel/${f}`)) bad(`kernel/${f} tidak ada`);
  }
  for (const f of walk('kernel/.claude/rules')) if (!read(f).trim()) bad(`${f} kosong`);
  // 1.11.0: ID rule (antislop R-xx): tiap butir rule ber-ID "X-NN.", unik lintas berkas; satu prefiks per berkas
  const seen = new Map();
  for (const f of walk('kernel/.claude/rules')) {
    let code = false; const prefixes = new Set();
    for (const l of read(f).split(/\r?\n/)) {
      if (l.startsWith('```')) code = !code;
      if (code || !/^- /.test(l)) continue;
      const m = /^- ([A-Z])-(\d{2})\. /.exec(l);
      if (!m) { bad(`${f}: butir tanpa ID "X-NN." → ${l.slice(0, 50)}`); continue; }
      prefixes.add(m[1]);
      const id = `${m[1]}-${m[2]}`;
      if (seen.has(id)) bad(`ID rule ${id} ganda: ${seen.get(id)} dan ${f}`); else seen.set(id, f);
    }
    if (prefixes.size > 1) bad(`${f}: lebih dari satu prefiks ID (${[...prefixes].join(',')})`);
  }
});

// 8. berkas yang selalu dimuat harus tetap kecil
check('AGENTS.md dan CLAUDE.md kernel tetap ramping (<= 80 baris)', (bad) => {
  for (const f of ['kernel/AGENTS.md', 'kernel/CLAUDE.md']) {
    const n = read(f).split(/\r?\n/).length;
    if (n > 80) bad(`${f}: ${n} baris (batas 80)`);
  }
});

// 9. marketplace menunjuk plugin yang ada
check('marketplace menunjuk plugin yang ada', (bad) => {
  const mk = json('.claude-plugin/marketplace.json');
  for (const p of mk.plugins || []) {
    const src = String(p.source || '').replace(/^\.\//, '');
    if (!has(`${src}/.claude-plugin/plugin.json`)) bad(`plugin "${p.name}": ${src}/.claude-plugin/plugin.json tidak ada`);
  }
});

// 10. hook memakai exec form (command "node" + args): tanpa shell, jalan sama di PowerShell dan Git Bash
check('hook settings.json memakai exec form (command: node + args)', (bad) => {
  const st = json('kernel/.claude/settings.json');
  for (const [ev, groups] of Object.entries(st.hooks || {})) for (const g of groups) for (const h of g.hooks || []) {
    if (h.command !== 'node' || !Array.isArray(h.args) || !h.args.length) bad(`${ev}: hook harus {command:"node", args:[...]} (ditemukan ${JSON.stringify(h.command)})`);
    else if (!/^\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/[\w.-]+\.mjs$/.test(h.args[0])) bad(`${ev}: args[0] bukan path hook di \${CLAUDE_PROJECT_DIR}: ${h.args[0]}`);
  }
  for (const ev of ['Stop', 'PreCompact', 'SessionEnd', 'SessionStart']) if (!(st.hooks || {})[ev]) bad(`hook ${ev} tidak terpasang`);
});

// 11. agent: frontmatter lengkap, model dikenal; scout/runner Haiku, reviewer Opus
check('agent: frontmatter valid dan routing model sesuai', (bad) => {
  const want = { scout: 'haiku', runner: 'haiku', reviewer: 'opus' };
  for (const f of walk('kernel/.claude/agents').filter((x) => x.endsWith('.md'))) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(f));
    if (!m) { bad(`${f}: frontmatter tidak ada`); continue; }
    const name = /^name:\s*(.+)$/m.exec(m[1])?.[1].trim();
    const model = /^model:\s*(.+)$/m.exec(m[1])?.[1].trim();
    if (!name || !/^description:\s*\S/m.test(m[1]) || !/^tools:\s*\S/m.test(m[1])) bad(`${f}: name/description/tools wajib`);
    if (model && !['sonnet', 'opus', 'haiku', 'inherit'].includes(model)) bad(`${f}: model "${model}" tidak dikenal`);
    if (want[name] && model !== want[name]) bad(`${f}: ${name} harus model ${want[name]} (ditemukan ${model || 'tidak ada'})`);
    if (want[name] && !/^omitClaudeMd:\s*true/m.test(m[1])) bad(`${f}: ${name} harus omitClaudeMd: true`);
  }
});

// 12. tidak ada penanda "v1" pada nama produk/skill yang tampil ke user
check('tanpa penanda "v1" pada nama plugin, judul, dan skill', (bad) => {
  for (const f of ['plugin/.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'kernel/AGENTS.md', 'README.md']) {
    const first = f.endsWith('.md') ? read(f).split('\n')[0] : read(f);
    if (/harness[ -]?v1\b/i.test(first)) bad(`${f}: memuat penanda "v1"`);
  }
  for (const d of skillDirs) if (/v\d/.test(d)) bad(`skill ${d}: nama berpenanda versi`);
});

let failed = 0;
for (const r of results) {
  console.log(`${r.errs.length ? 'GAGAL' : 'OK   '}  ${r.name}`);
  for (const e of r.errs) console.log(`        - ${e}`);
  if (r.errs.length) failed++;
}
console.log(`\n${results.length - failed}/${results.length} pemeriksaan lulus.`);
process.exit(failed ? 1 : 0);
