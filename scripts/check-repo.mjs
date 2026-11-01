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
  if (skillDirs.length > 12) bad(`terlalu banyak skill (${skillDirs.length}); target 1.5.0 = 12, batas 12`);
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
  for (const f of [...walk('kernel/.claude/hooks'), 'install.mjs', 'scripts/check-repo.mjs'].filter((x) => x.endsWith('.mjs'))) {
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

let failed = 0;
for (const r of results) {
  console.log(`${r.errs.length ? 'GAGAL' : 'OK   '}  ${r.name}`);
  for (const e of r.errs) console.log(`        - ${e}`);
  if (r.errs.length) failed++;
}
console.log(`\n${results.length - failed}/${results.length} pemeriksaan lulus.`);
process.exit(failed ? 1 : 0);
