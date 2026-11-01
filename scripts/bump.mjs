#!/usr/bin/env node
// Naikkan versi harness di semua tempat sekaligus, lalu jalankan check-repo.
//   node scripts/bump.mjs patch|minor|major|X.Y.Z [--dry-run] [--no-check]
// Aturan rilis: naikkan versi pada tiap perubahan kernel/plugin/installer yang harus sampai ke project (plugin hanya berganti bila `version` berubah).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.BUMP_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
const DRY = process.argv.includes('--dry-run');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fail = (m) => { console.error(`GAGAL: ${m}`); process.exit(1); };

const current = read('VERSION').trim();
if (!/^\d+\.\d+\.\d+$/.test(current)) fail(`VERSION bukan semver: "${current}"`);
const [ma, mi, pa] = current.split('.').map(Number);
const next = { patch: `${ma}.${mi}.${pa + 1}`, minor: `${ma}.${mi + 1}.0`, major: `${ma + 1}.0.0` }[arg] || (/^\d+\.\d+\.\d+$/.test(arg || '') ? arg : null);
if (!next) fail('pakai: node scripts/bump.mjs patch|minor|major|X.Y.Z [--dry-run] [--no-check]');
if (next === current) fail(`versi sudah ${current}`);

// [berkas, pola dengan satu kelompok awalan dan satu kelompok akhiran di sekitar nomor versi]
const targets = [
  ['VERSION', /^()\d+\.\d+\.\d+(\s*)$/],
  ['package.json', /("version"\s*:\s*")\d+\.\d+\.\d+(")/],
  ['plugin/.claude-plugin/plugin.json', /("version"\s*:\s*")\d+\.\d+\.\d+(")/],
  ['kernel/harness.config.json', /("harness_version"\s*:\s*")\d+\.\d+\.\d+(")/],
  ['kernel/.claude/hooks/lib.mjs', /(harness_version:\s*')\d+\.\d+\.\d+(')/],
];
const edits = targets.map(([f, re]) => {
  const s = read(f);
  if (!re.test(s)) fail(`${f}: penanda versi tidak ditemukan`);
  return [f, s.replace(re, `$1${next}$2`)];
});
console.log(`${current} → ${next}${DRY ? ' (dry run)' : ''}`);
for (const [f, s] of edits) { console.log(`  ${f}`); if (!DRY) fs.writeFileSync(path.join(ROOT, f), s); }
if (!DRY && !process.argv.includes('--no-check')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-repo.mjs')], { cwd: ROOT, encoding: 'utf8' });
  console.log((r.stdout || '').trim().split(/\r?\n/).slice(-1)[0]);
  if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
}
if (!DRY) console.log(`\nBerikutnya: git commit -am "rilis ${next}" → PR → setelah merge: git tag v${next} <sha merge>`);
