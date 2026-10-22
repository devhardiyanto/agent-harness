// Uji modul knowledge: baseline, worktree, lint, kedaluwarsa, verifikasi manusia, usulan pola. Jalankan: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');
const sh = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8' });
const g = (dir, ...a) => sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t.t', '-c', 'commit.gpgsign=false', ...a], dir);
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const hook = (root, script, payload) => spawnSync('node', [path.join(root, '.claude/hooks', script)], { input: JSON.stringify({ session_id: 's', cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const writeTool = (root, rel, content) => hook(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, rel), content } });
const bash = (root, command) => hook(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
const prompt = (root, text) => hook(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: text });

const AUTH = ['export function withAuth(handler) {', '  return async (req) => {', '    const token = req.headers.authorization;', "    if (!token) throw new Error('unauthorized');", '    return handler(req);', '  };', '}', '', 'export const API_BASE_URL = process.env.API_BASE_URL;', '// end', ''].join('\n');

function mkProject({ remote = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kn-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cfgP = path.join(root, 'harness.config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8')); cfg.services = ['svc-a']; cfg.project = 'p';
  fs.writeFileSync(cfgP, JSON.stringify(cfg));
  const svc = path.join(root, 'source-code', 'svc-a');
  fs.mkdirSync(path.join(svc, 'src/http'), { recursive: true });
  g(svc, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(svc, 'src/http/auth.ts'), AUTH);
  fs.writeFileSync(path.join(svc, 'package.json'), JSON.stringify({ dependencies: { vue: '3' }, scripts: { lint: 'eslint .', test: 'vitest run' } }));
  g(svc, 'add', '-A'); g(svc, 'commit', '-qm', 'init');
  if (remote) {
    const bare = path.join(root, '_remote.git'); fs.mkdirSync(bare);
    sh('git', ['init', '-q', '--bare', '-b', 'main'], bare);
    g(svc, 'remote', 'add', 'origin', bare); g(svc, 'push', '-q', 'origin', 'main'); g(svc, 'branch', 'production');
    g(svc, 'push', '-q', 'origin', 'production'); g(svc, 'fetch', '-q', 'origin'); g(svc, 'remote', 'set-head', 'origin', 'main');
  }
  return { root, svc, sha: () => g(svc, 'rev-parse', 'HEAD').stdout.trim() };
}
function writeKnowledge(root, sha, { summary, patterns, status = 'draft' } = {}) {
  const dir = path.join(root, 'docs/knowledge/svc-a'); fs.mkdirSync(dir, { recursive: true });
  const fm = (st) => `---\nservice: svc-a\nsource_commit: ${sha}\nstatus: ${st}\nupdated: 2026-10-22\n---\n`;
  fs.writeFileSync(path.join(dir, 'summary.md'), fm(status) + (summary ?? [
    '# svc-a', '- Handler dibungkus `withAuth` (src/http/auth.ts:1-5)', '- Base URL dari env `API_BASE_URL` (src/http/auth.ts:9)', '- Entry point: UNKNOWN', ''].join('\n')));
  fs.writeFileSync(path.join(dir, 'patterns.md'), fm(status) + (patterns ?? ['# Pola', '- Auth lewat pembungkus `withAuth` (src/http/auth.ts:1)', ''].join('\n')));
}

test('baseline: origin/HEAD → production/main/master; override config; remote-tracking didahulukan', () => {
  const p = mkProject();
  const j = () => JSON.parse(cli(p.root, 'baseline', 'svc-a', '--json').stdout)[0];
  let b = j();
  assert.equal(b.ok, true); assert.equal(b.branch, 'main'); assert.equal(b.via, 'origin/HEAD'); assert.equal(b.ref, 'origin/main');
  // commit lokal belum di-push: baseline tetap origin/main
  const sha0 = b.sha;
  fs.writeFileSync(path.join(p.svc, 'wip.txt'), 'x'); g(p.svc, 'add', '-A'); g(p.svc, 'commit', '-qm', 'wip');
  b = j(); assert.equal(b.sha, sha0); assert.match(b.note, /berbeda dari origin\/main/);
  // override per service
  const cfgP = path.join(p.root, 'harness.config.json'); const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  cfg.baseline = { 'svc-a': 'production' }; fs.writeFileSync(cfgP, JSON.stringify(cfg));
  b = j(); assert.equal(b.branch, 'production'); assert.equal(b.via, 'config');
  cfg.baseline = { 'svc-a': 'tidak-ada' }; fs.writeFileSync(cfgP, JSON.stringify(cfg));
  const r = cli(p.root, 'baseline', 'svc-a'); assert.equal(r.status, 2); assert.match(r.stdout, /tidak ditemukan/);
});
test('baseline tanpa remote: urutan nama production → main → master', () => {
  const p = mkProject({ remote: false });
  assert.equal(JSON.parse(cli(p.root, 'baseline', 'svc-a', '--json').stdout)[0].branch, 'main');
  g(p.svc, 'branch', 'production');
  assert.equal(JSON.parse(cli(p.root, 'baseline', 'svc-a', '--json').stdout)[0].branch, 'production');
});
test('worktree: checkout baseline sementara, checkout user tidak tersentuh, bersih setelah rm', () => {
  const p = mkProject();
  g(p.svc, 'switch', '-q', '-c', 'feat/x'); fs.writeFileSync(path.join(p.svc, 'src/http/auth.ts'), 'diubah di branch fitur\n');
  const add = cli(p.root, 'worktree', 'add', 'svc-a'); assert.equal(add.status, 0, add.stderr + add.stdout);
  const wt = path.join(p.root, '.claude/state/worktrees/svc-a');
  // Windows (core.autocrlf=true) mengubah LF jadi CRLF saat checkout; yang diuji adalah isinya, bukan akhir barisnya.
  assert.equal(fs.readFileSync(path.join(wt, 'src/http/auth.ts'), 'utf8').replace(/\r\n/g, '\n'), AUTH, 'isi = baseline, bukan branch fitur');
  assert.equal(g(p.svc, 'branch', '--show-current').stdout.trim(), 'feat/x');
  assert.equal(fs.readFileSync(path.join(p.svc, 'src/http/auth.ts'), 'utf8'), 'diubah di branch fitur\n');
  assert.equal(cli(p.root, 'worktree', 'rm', 'svc-a').status, 0);
  assert.equal(fs.existsSync(wt), false);
  assert.doesNotMatch(g(p.svc, 'worktree', 'list').stdout, /worktrees/);
});
test('lint: knowledge benar lolos; sitasi mengarang ditangkap', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha());
  let r = cli(p.root, 'lint-knowledge', 'svc-a'); assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /\| svc-a \| draft \| 3\/3 \|/);
  const bad = (summary, re) => { writeKnowledge(p.root, p.sha(), { summary }); const x = cli(p.root, 'lint-knowledge', 'svc-a'); assert.equal(x.status, 2, summary); assert.match(x.stdout, re, summary); };
  bad('# s\n- file hantu `foo` (src/nope.ts:3)\n', /tidak ada di/);
  bad('# s\n- baris kejauhan `withAuth` (src/http/auth.ts:99)\n', /di luar file/);
  bad('# s\n- simbol karangan `rateLimiter` (src/http/auth.ts:1-5)\n', /simbol `rateLimiter` tidak ditemukan/);
  bad('# s\n' + Array.from({ length: 90 }, (_, i) => `- baris ${i}`).join('\n') + '\n', /melebihi batas 80/);
  bad('# s\n- DB_PASSWORD = "supersecretvalue123"\n', /kredensial/);
  // UNKNOWN dan dugaan "?" tidak diperlakukan sebagai klaim
  writeKnowledge(p.root, p.sha(), { summary: '# s\n- Entry point: UNKNOWN\n- Mungkin pakai Redis?\n' });
  assert.equal(cli(p.root, 'lint-knowledge', 'svc-a').status, 0);
  // frontmatter rusak
  fs.writeFileSync(path.join(p.root, 'docs/knowledge/svc-a/summary.md'), '# tanpa frontmatter\n');
  assert.equal(cli(p.root, 'lint-knowledge', 'svc-a').status, 2);
});
test('lint membaca baseline (source_commit), bukan working tree', () => {
  const p = mkProject(); const sha = p.sha(); writeKnowledge(p.root, sha);
  fs.writeFileSync(path.join(p.svc, 'src/http/auth.ts'), 'berubah total\n'); g(p.svc, 'commit', '-qam', 'ubah');
  assert.equal(cli(p.root, 'lint-knowledge', 'svc-a').status, 0, 'sitasi valid pada source_commit walau kode sudah berubah');
});
test('sampel deterministik dengan potongan kode', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha());
  const a = cli(p.root, 'knowledge-sample', 'svc-a', '2').stdout; const b = cli(p.root, 'knowledge-sample', 'svc-a', '2').stdout;
  assert.equal(a, b); assert.match(a, /Klaim :/); assert.match(a, /src\/http\/auth\.ts:/);
});
test('knowledge-status: tertinggal dari baseline dihitung; SessionStart memperingatkan', () => {
  const p = mkProject(); const sha = p.sha(); writeKnowledge(p.root, sha);
  const st = () => JSON.parse(cli(p.root, 'knowledge-status', '--json').stdout)[0];
  assert.equal(st().state, 'ok'); assert.equal(st().behind, 0);
  for (let i = 0; i < 3; i++) { fs.writeFileSync(path.join(p.svc, `f${i}.txt`), String(i)); g(p.svc, 'add', '-A'); g(p.svc, 'commit', '-qm', `c${i}`); }
  g(p.svc, 'push', '-q', 'origin', 'main');
  assert.equal(st().behind, 3); assert.equal(st().files, 3); assert.equal(st().state, 'behind');
  const cfgP = path.join(p.root, 'harness.config.json'); const cfg = JSON.parse(fs.readFileSync(cfgP, 'utf8'));
  cfg.knowledge = { stale_warn_commits: 2 }; fs.writeFileSync(cfgP, JSON.stringify(cfg));
  assert.equal(st().state, 'stale');
  const out = hook(p.root, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' }).stdout;
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /tertinggal dari baseline: svc-a \(\+3 commit\)/);
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /draft \(belum diverifikasi manusia\): svc-a/);
});
test('SessionStart: service tanpa knowledge diberi tahu', () => {
  const p = mkProject();
  const ctx = JSON.parse(hook(p.root, 'session.mjs', { hook_event_name: 'SessionStart', source: 'startup' }).stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Knowledge belum ada: svc-a/);
});
test('inventory dan propose-checks (dari baseline)', () => {
  const p = mkProject();
  const nu = path.join(p.root, 'source-code', 'svc-baru'); fs.mkdirSync(nu); g(nu, 'init', '-q', '-b', 'main');
  fs.mkdirSync(path.join(p.root, 'source-code', 'dokumen-lepas'));
  const inv = JSON.parse(cli(p.root, 'inventory', '--json').stdout);
  assert.deepEqual(inv.new_services, ['svc-baru']); assert.deepEqual(inv.skipped, ['dokumen-lepas']);
  assert.match(inv.found.find((f) => f.service === 'svc-a').stack, /node\(vue\)/);
  const pc = cli(p.root, 'propose-checks', 'svc-a'); assert.equal(pc.status, 0);
  assert.deepEqual(JSON.parse(pc.stdout).checks['svc-a'], { lint: 'npm run lint', test: 'npm run test', agent_runs: false });
});
test('gerbang: agent tidak bisa membuat knowledge "verified" atau mengubah isi verified tanpa turun ke draft', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha());
  const rel = 'docs/knowledge/svc-a/summary.md';
  const cur = fs.readFileSync(path.join(p.root, rel), 'utf8');
  assert.equal(writeTool(p.root, rel, cur.replace('status: draft', 'status: verified')).status, 2);
  assert.equal(writeTool(p.root, rel, cur + '\n- tambahan\n').status, 0, 'draft bebas diedit agent');
  writeKnowledge(p.root, p.sha(), { status: 'verified' });
  const v = fs.readFileSync(path.join(p.root, rel), 'utf8');
  assert.equal(writeTool(p.root, rel, v + '\n- tambahan\n').status, 2, 'isi verified berubah, status tetap verified');
  assert.equal(writeTool(p.root, rel, (v + '\n- tambahan\n').replace('status: verified', 'status: draft')).status, 0, 'turun ke draft diizinkan');
  assert.equal(bash(p.root, `sed -i 's/draft/verified/' ${rel}`).status, 2);
  assert.equal(bash(p.root, 'node .claude/hooks/harness.mjs verify-knowledge svc-a').status, 2);
});
test('verifikasi manusia: lint gagal ditolak; lolos → verified (CLI dan hook prompt)', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha(), { summary: '# s\n- karangan `zzz` (src/http/auth.ts:1)\n' });
  assert.equal(cli(p.root, 'verify-knowledge', 'svc-a').status, 2);
  assert.match(prompt(p.root, '/harness:verify svc-a').stdout, /"decision":"block"/);
  assert.match(fs.readFileSync(path.join(p.root, 'docs/knowledge/svc-a/summary.md'), 'utf8'), /status: draft/);
  writeKnowledge(p.root, p.sha());
  const r = prompt(p.root, '/harness:verify svc-a'); assert.match(r.stdout, /VERIFIED/);
  for (const f of ['summary.md', 'patterns.md']) assert.match(fs.readFileSync(path.join(p.root, 'docs/knowledge/svc-a', f), 'utf8'), /status: verified[\s\S]*verified_by:/);
  assert.equal(prompt(p.root, '/harness:verify tidak-ada').stdout.includes('"decision":"block"'), true);
  assert.equal(prompt(p.root, 'halo biasa').stdout, '');
});
test('usulan pola: agent hanya "proposed"; manusia menyetujui; hook menerapkan; sitasi @sha diperiksa', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha(), { status: 'verified' });
  g(p.svc, 'switch', '-q', '-c', 'feat/rl'); fs.writeFileSync(path.join(p.svc, 'src/http/rate.ts'), 'export function rateLimit() {}\n'); g(p.svc, 'add', '-A'); g(p.svc, 'commit', '-qm', 'rl');
  const sha2 = p.sha(); g(p.svc, 'switch', '-q', 'main');
  const slug = path.basename(cli(p.root, 'new', 'feature', 'Rate limit').stdout.trim());
  const rel = `docs/work/${slug}/patterns-proposal.md`;
  const item = (st, cite = `src/http/rate.ts:1@${sha2}`) => ['---', `slug: ${slug}`, '---', '# Usulan pola', '', '## P1 · svc-a · tambah', `Bukti: ${cite}`, `Status: ${st}`, '', '```pola', `- Endpoint publik dibatasi \`rateLimit\` (${cite})`, '```', ''].join('\n');
  assert.equal(writeTool(p.root, rel, item('approved')).status, 2, 'agent tak boleh menulis approved');
  assert.equal(writeTool(p.root, rel, item('applied')).status, 2);
  assert.equal(writeTool(p.root, rel, item('proposed')).status, 0);
  fs.writeFileSync(path.join(p.root, rel), item('proposed'));
  assert.equal(cli(p.root, 'patterns-check', slug).status, 0);
  assert.equal(bash(p.root, `node .claude/hooks/harness.mjs patterns-approve ${slug} P1`).status, 2);
  // sitasi karangan ditolak saat disetujui
  fs.writeFileSync(path.join(p.root, rel), item('proposed', `src/http/rate.ts:7@${sha2}`));
  assert.match(prompt(p.root, `/harness:patterns ${slug} P1`).stdout, /"decision":"block"/);
  fs.writeFileSync(path.join(p.root, rel), item('proposed'));
  const ok = prompt(p.root, `/harness:patterns ${slug} P1`); assert.match(ok.stdout, /DITERAPKAN/);
  const pat = fs.readFileSync(path.join(p.root, 'docs/knowledge/svc-a/patterns.md'), 'utf8');
  assert.match(pat, /## Pola disetujui \(.*\)\n- Endpoint publik dibatasi `rateLimit`/);
  assert.match(pat, /status: verified/, 'persetujuan manusia = atestasi; status tetap verified');
  assert.match(fs.readFileSync(path.join(p.root, rel), 'utf8'), /Status: applied \(/);
  // item yang sudah applied tidak bisa dipalsukan/diubah agent
  assert.equal(writeTool(p.root, rel, item('proposed')).status, 2);
  // lint lolos: sitasi @sha2 valid (info agar di-ground ulang)
  const l = cli(p.root, 'lint-knowledge', 'svc-a'); assert.equal(l.status, 0, l.stdout); assert.match(l.stdout, /memakai @sha/);
});
test('usulan "ganti": harus cocok persis satu baris', () => {
  const p = mkProject(); writeKnowledge(p.root, p.sha(), { status: 'verified' });
  const slug = path.basename(cli(p.root, 'new', 'feature', 'Ganti pola').stdout.trim());
  const rel = path.join(p.root, `docs/work/${slug}/patterns-proposal.md`);
  const mk = (rep) => ['---', `slug: ${slug}`, '---', '## P1 · svc-a · ganti', `Ganti: ${rep}`, 'Status: proposed', '```pola', '- Auth lewat `withAuth` (src/http/auth.ts:1)', '```', ''].join('\n');
  fs.writeFileSync(rel, mk('- baris yang tidak ada')); assert.equal(cli(p.root, 'patterns-check', slug).status, 2);
  fs.writeFileSync(rel, mk('- Auth lewat pembungkus `withAuth` (src/http/auth.ts:1)'));
  assert.equal(cli(p.root, 'patterns-check', slug).status, 0);
  assert.match(prompt(p.root, `/harness:patterns ${slug} all`).stdout, /DITERAPKAN/);
  const pat = fs.readFileSync(path.join(p.root, 'docs/knowledge/svc-a/patterns.md'), 'utf8');
  assert.doesNotMatch(pat, /pembungkus/); assert.match(pat, /- Auth lewat `withAuth`/);
});
