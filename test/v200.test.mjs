// 2.0.0: topik, remap, guard keamanan, akun git per service, status line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sh, hx, hook, project, gitRepo, commitAll, rd, wr, jr } from './helpers.mjs';
import * as remap from '../kernel/.claude/hooks/remap.mjs';
import { render } from '../kernel/.claude/hooks/statusline.mjs';
import { today } from '../kernel/.claude/hooks/lib.mjs';

test('topic new/list/close: folder per hari, INDEX.md, status line', () => {
  const root = project({ v1: true });
  const r = hx(root, 'topic', 'new', 'tolong', 'analisa', 'fitur', 'promo', 'invitation', 'code');
  assert.equal(r.status, 0, r.stderr);
  const rel = `docs/topics/${today()}/analisa-fitur-promo-invitation-code`;
  assert.match(r.stdout, new RegExp(`dibuat: ${rel}/`));
  assert.match(rd(root, `${rel}/topic.md`), /^status: open$/m);
  assert.ok(fs.existsSync(path.join(root, rel, 'plan.md')));
  assert.match(hx(root, 'topic', 'new', 'analisa fitur promo invitation code').stdout, /sudah ada/);
  assert.equal(hx(root, 'topic', 'active').stdout.trim(), `${rel}/`);
  // 2.0.3 (T1 a): status line memakai topik yang disentuh sesi ini (transcript), bukan topik terbuka terakhir
  const tr = path.join(root, 'transcript.jsonl');
  fs.writeFileSync(tr, JSON.stringify({ message: { content: [{ type: 'tool_result', content: `dibuat: ${rel}/` }] } }) + '\n');
  const s = spawnSync('node', [path.join(root, '.claude/hooks/statusline.mjs')], { input: JSON.stringify({ session_id: 's1', transcript_path: tr, model: { display_name: 'Opus 5.5' }, effort: { level: 'medium' }, context_window: { used_percentage: 41 } }), env: { ...process.env, CLAUDE_PROJECT_DIR: root, NO_COLOR: '1' }, encoding: 'utf8' });
  assert.match(s.stdout, /analisa-fitur-promo-invitation-code · Opus 5\.5 · medium/);
  assert.match(s.stdout, /\n.*\[konteks 41%\]/, '2.0.2 (D1): konteks tampil di baris 2');
  const c = hx(root, 'topic', 'close', 'promo');
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /summary\.md belum ada/);
  assert.match(rd(root, `${rel}/topic.md`), /^status: closed$/m);
  assert.match(rd(root, 'docs/memory/INDEX.md'), new RegExp(`\\| ${rel} \\|`));
  assert.equal(hx(root, 'topic', 'active').stdout.trim(), '');
  const lst = hx(root, 'topic', 'new', 'lanjutan promo', '--ref', 'promo');
  assert.match(rd(root, `docs/topics/${today()}/lanjutan-promo/topic.md`), /^ref: promo$/m, lst.stdout);
});

test('status line tanpa topik', () => {
  assert.equal(render({ root: 'event', topic: null, model: null, limits: [], ctx: null, lines: null }, { theme: 'mono' }), '▌event · belum ada topik');
});

function legacyRoot() {
  const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'remap-')), 'astra');
  gitRepo(root);
  wr(root, 'harness.config.json', '{}');
  wr(root, 'docs/work/2026-11-20-fix-kpb/plan.md', 'plan baru');
  wr(root, 'docs/work/2026-11-20-fix-kpb/review.md', 'review');
  wr(root, 'docs/work/2026-08-02-migrasi-voucher/plan.md', 'plan lama');
  wr(root, 'docs/work/_TEMPLATE/plan.md', 'templat');
  wr(root, 'docs/work/README.md', 'readme');
  wr(root, 'docs/topics/2026-11-24-checkin-500.md', '# topik datar');
  wr(root, 'docs/topics/2026-11-24-checkin-500.diff', 'diff');
  wr(root, 'docs/topics/2026-07-01-lama.md', '# lama');
  wr(root, 'docs/topik/infra-karcix.md', '# topik tanpa tanggal');
  wr(root, 'docs/sessions/2026-10-06_090035_SESSION_rating-info.md', 's1');
  wr(root, 'docs/sessions/2026-11-04-booking-detail.md', 's2');
  wr(root, 'docs/sessions/11-2026/2026-11-10-feedback.md', 's3');
  wr(root, 'docs/sessions/astra-cleaner.md', 's4');
  wr(root, 'docs/sessions/2026-08-01-sangat-lama.md', 's5');
  wr(root, 'docs/reports/analisis/2026-11-01-stok.md', 'r1');
  wr(root, 'docs/reports/audit/umum.md', 'r2');
  wr(root, 'docs/_arsip/old/x.md', 'arsip');
  wr(root, 'docs/memory/pending.md', 'p');
  wr(root, 'docs/memory/MEMORY.md', 'm');
  wr(root, 'docs/md/md01/a.md', 'dok user');
  wr(root, '.harness/state/x.json', '{}');
  wr(root, '.codex/config.toml', '');
  commitAll(root, 'data lama');
  return root;
}

test('remap: rencana, lalu terapkan ke topics/sessions/_legacy', () => {
  const root = legacyRoot();
  const now = new Date(2026, 10, 24);
  const p = remap.plan(root, { remap: { legacy_months: 2 } }, { now });
  assert.equal(p.cutoff, '2026-09-24');
  const to = Object.fromEntries(p.moves.map((m) => [m.src, m.to]));
  const t = today();
  assert.equal(to['docs/work/2026-11-20-fix-kpb'], 'docs/topics/2026-11-20/fix-kpb');
  assert.equal(to['docs/work/2026-08-02-migrasi-voucher'], 'docs/_legacy/2026-08-02/migrasi-voucher');
  assert.equal(to['docs/work/_TEMPLATE'], 'docs/_legacy/_lama/harness-1.x/_TEMPLATE');
  assert.equal(to['docs/topics/2026-11-24-checkin-500.md'], 'docs/topics/2026-11-24/checkin-500/topic.md');
  assert.equal(to['docs/topics/2026-11-24-checkin-500.diff'], 'docs/topics/2026-11-24/checkin-500/lampiran/2026-11-24-checkin-500.diff');
  assert.equal(to['docs/topics/2026-07-01-lama.md'], 'docs/_legacy/2026-07-01/lama/topic.md');
  assert.equal(to['docs/topik/infra-karcix.md'], `docs/topics/${t}/infra-karcix/topic.md`);
  assert.equal(to['docs/sessions/2026-10-06_090035_SESSION_rating-info.md'], 'docs/sessions/2026-10-06/rating-info.md');
  assert.equal(to['docs/sessions/2026-11-04-booking-detail.md'], 'docs/sessions/2026-11-04/booking-detail.md');
  assert.equal(to['docs/sessions/11-2026/2026-11-10-feedback.md'], 'docs/sessions/2026-11-10/feedback.md');
  assert.equal(to['docs/sessions/astra-cleaner.md'], `docs/sessions/${t}/astra-cleaner.md`);
  assert.equal(to['docs/sessions/2026-08-01-sangat-lama.md'], 'docs/_legacy/2026-08-01/sangat-lama/session.md');
  assert.equal(to['docs/reports/analisis/2026-11-01-stok.md'], 'docs/topics/2026-11-01/stok/lampiran/2026-11-01-stok.md');
  assert.equal(to['docs/reports/audit/umum.md'], `docs/topics/${t}/audit-umum/lampiran/umum.md`);
  assert.equal(to['docs/_arsip'], 'docs/_legacy/_lama/_arsip');
  assert.equal(to['docs/memory/pending.md'], 'docs/_legacy/_lama/memory/pending.md');
  assert.equal(to['docs/memory/MEMORY.md'], undefined, 'MEMORY.md tetap');
  assert.deepEqual(p.untouched, ['docs/md']);
  assert.deepEqual(p.deletes.map((d) => d.path), ['.harness', '.codex']);
  assert.match(remap.deleteScript(p), /rm -rf "\.harness"/);

  remap.apply(root, p);
  assert.equal(rd(root, 'docs/topics/2026-11-20/fix-kpb/plan.md'), 'plan baru');
  assert.equal(rd(root, 'docs/_legacy/2026-08-02/migrasi-voucher/plan.md'), 'plan lama');
  assert.equal(rd(root, 'docs/topics/2026-11-24/checkin-500/topic.md'), '# topik datar');
  assert.equal(rd(root, 'docs/sessions/2026-11-10/feedback.md'), 's3');
  assert.equal(rd(root, 'docs/md/md01/a.md'), 'dok user');
  assert.ok(fs.existsSync(path.join(root, '.harness/state/x.json')), 'state tidak dihapus');
  for (const gone of ['docs/work', 'docs/topik', 'docs/reports', 'docs/sessions/11-2026', 'docs/_arsip']) assert.equal(fs.existsSync(path.join(root, gone)), false, gone);
  const idx = rd(root, 'docs/_legacy/INDEX.md');
  assert.match(idx, /\| 2026-08-02 \| docs\/_legacy\/2026-08-02\/migrasi-voucher \| docs\/work\/2026-08-02-migrasi-voucher \|/);
  // idempoten: rencana kedua tidak memindah apa pun
  assert.equal(remap.plan(root, { remap: { legacy_months: 2 } }, { now }).moves.length, 0);
});

test('remap: tujuan yang sudah ada digabung tanpa menimpa', () => {
  const root = legacyRoot();
  wr(root, 'docs/topics/2026-11-20/fix-kpb/plan.md', 'plan topik baru');
  const p = remap.plan(root, { remap: { legacy_months: 2 } }, { now: new Date(2026, 10, 24) });
  remap.apply(root, p);
  assert.equal(rd(root, 'docs/topics/2026-11-20/fix-kpb/plan.md'), 'plan topik baru');
  assert.equal(rd(root, 'docs/topics/2026-11-20/fix-kpb/plan-2.md'), 'plan baru');
  assert.equal(rd(root, 'docs/topics/2026-11-20/fix-kpb/review.md'), 'review');
});

test('remap CLI: tanpa --apply hanya rencana', () => {
  const root = project({ v1: true });
  wr(root, 'docs/work/2026-01-01-lama/plan.md', 'x');
  const r = hx(root, 'remap');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rencana saja/);
  assert.ok(fs.existsSync(path.join(root, 'docs/work/2026-01-01-lama/plan.md')));
  assert.match(hx(root, 'doctor').stdout, /sisa 1\.x \| INFO \| docs\/work/);
});

test('guard: keamanan tetap, alur kerja bebas', () => {
  const root = project({ v1: true });
  const bash = (command, cwd = root) => hook(root, 'guard.mjs', { tool_name: 'Bash', cwd, tool_input: { command } }).status;
  assert.equal(bash('git status'), 0);
  assert.equal(bash('cat .env'), 2);
  assert.equal(bash('cat .env.example'), 0);
  assert.equal(bash('git push --force origin fix/x'), 2);
  assert.equal(bash('git push origin main'), 2);
  assert.equal(bash('git reset --hard HEAD~1'), 2);
  assert.equal(bash('gh auth token --user nawa9nest-dev'), 2, 'token tidak boleh dicetak');
  assert.equal(bash('GH_TOKEN="$(gh auth token --user nawa9nest-dev)" gh pr create -R a/b --title x'), 0);
  assert.equal(bash('git commit -m "catatan"'), 0, 'root boleh commit docs di main');
  const svc = path.join(root, 'source-code/api');
  assert.equal(bash('git commit -m x', svc), 2, 'repo service di main: dilarang');
  assert.equal(hook(root, 'guard.mjs', { tool_name: 'Edit', tool_input: { file_path: path.join(svc, 'src/a.ts') } }).status, 0);
  assert.equal(hook(root, 'guard.mjs', { tool_name: 'Write', tool_input: { file_path: path.join(root, 'id_rsa') } }).status, 2);
});

test('git-auth: helper per service memakai token akunnya sendiri tanpa switch', () => {
  const root = project({ v1: true });
  const svc = path.join(root, 'source-code/api');
  sh('git', ['remote', 'add', 'origin', 'https://github.com/org/api.git'], svc);
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ghbin-'));
  // gh tiruan: skrip Node (HARNESS_GH, juga jalan di Windows) + pembungkus sh untuk helper git
  const fakeJs = path.join(bin, 'gh.mjs');
  fs.writeFileSync(fakeJs, 'const a = process.argv.slice(2); if (a.slice(0, 3).join(" ") === "auth token --user") { console.log("tok-" + a[3]); process.exit(0); } console.log("gh version 0.0.0");\n');
  const fake = path.join(bin, 'gh');
  fs.writeFileSync(fake, `#!/bin/sh\nexec node "${fakeJs}" "$@"\n`);
  fs.chmodSync(fake, 0o755);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CLAUDE_PROJECT_DIR: root, HARNESS_GH: fakeJs };
  const run = (...a) => spawnSync('node', [path.join(root, '.claude/hooks/harness.mjs'), ...a], { cwd: root, env, encoding: 'utf8' });
  assert.match(run('git-auth').stdout, /\| api \| - \| org\/api \| akun belum diisi/);
  const cfg = jr(root, 'harness.config.json'); cfg.git = { default_account: 'akun-a', services: { api: 'akun-b' } };
  wr(root, 'harness.config.json', JSON.stringify(cfg));
  assert.equal(run('git-auth', 'which', 'api').stdout.trim(), 'akun-b');
  assert.match(run('git-auth').stdout, /\| api \| akun-b \| org\/api \| belum terpasang/);
  const a = run('git-auth', '--apply');
  assert.match(a.stdout, /\| api \| akun-b \| org\/api \| terpasang/, a.stdout + a.stderr);
  assert.equal(sh('git', ['config', '--local', 'harness.account'], svc).stdout.trim(), 'akun-b');
  const cred = spawnSync('git', ['credential', 'fill'], { cwd: svc, env, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
  if (process.platform !== 'win32') {
    assert.match(cred.stdout, /^username=akun-b$/m);
    assert.match(cred.stdout, /^password=tok-akun-b$/m);
  }
  assert.equal(sh('git', ['config', '--file', path.join(svc, '.git/config'), '--get-all', 'credential.https://github.com.helper'], svc).stdout.split('\n')[0], '', 'helper global dinonaktifkan untuk repo ini');
});

test('git-auth: remote SSH beralias dikenali, helper tidak dipasang; doctor tidak OK palsu', async () => {
  const { parseRemote } = await import('../kernel/.claude/hooks/gitauth.mjs');
  assert.deepEqual(parseRemote('git@github-kantor:DinovInovasi/ce-console-api.git'), { proto: 'ssh', host: 'github-kantor', repo: 'DinovInovasi/ce-console-api' });
  assert.deepEqual(parseRemote('ssh://git@github.com:22/org/r.git'), { proto: 'ssh', host: 'github.com', repo: 'org/r' });
  assert.deepEqual(parseRemote('https://github.com/org/r.git'), { proto: 'https', host: 'github.com', repo: 'org/r' });
  assert.deepEqual(parseRemote('https://x-access-token@gitlab.com/g/sub/r'), { proto: 'https', host: 'gitlab.com', repo: 'g/sub/r' });
  const root = project({ v1: true });
  sh('git', ['remote', 'add', 'origin', 'git@github-pribadi:trio/api.git'], path.join(root, 'source-code/api'));
  sh('git', ['remote', 'add', 'origin', 'https://gitlab.com/g/web.git'], path.join(root, 'source-code/web'));
  const cfg = jr(root, 'harness.config.json'); cfg.git = { default_account: 'akun-a' };
  wr(root, 'harness.config.json', JSON.stringify(cfg));
  const a = hx(root, 'git-auth', '--apply');
  assert.match(a.stdout, /\| api \| akun-a \| trio\/api \| SSH github-pribadi: helper tidak perlu \|/);
  assert.match(a.stdout, /\| web \| akun-a \| g\/web \| remote bukan github\.com \(gitlab\.com\) \|/);
  assert.equal(sh('git', ['config', '--local', '--get-all', 'credential.https://github.com.helper'], path.join(root, 'source-code/api')).stdout, '');
  assert.equal(hx(root, 'git-auth', 'repo', 'api').stdout.trim(), 'trio/api');
  const d = hx(root, 'doctor').stdout;
  assert.match(d, /akses git per service \(helper HTTPS atau SSH\) \| OK/);
  assert.match(d, /service di luar git-auth \| INFO \| web: remote bukan github\.com/);
});

test('status line 2.0.2: kapsul, konteks + token, batas, +/- baris, badge ponytail', async () => {
  const { statusData, render: r, level } = await import('../kernel/.claude/hooks/statusline.mjs');
  const root = project({ v1: true });
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
  const payload = { model: { display_name: 'Opus 5.5' }, effort: { level: 'medium' },
    context_window: { used_percentage: 72.4, context_window_size: 200000, current_usage: { input_tokens: 4000, cache_creation_input_tokens: 0, cache_read_input_tokens: 140000 } },
    rate_limits: { five_hour: { used_percentage: 88, resets_at: 1764079200 }, seven_day: { used_percentage: 30 } },
    cost: { total_lines_added: 310, total_lines_removed: 88 } };
  let d = statusData(root, payload, { CLAUDE_CONFIG_DIR: cfgDir });
  assert.deepEqual(d.ctx, { pct: 72, tokens: 144000, size: 200000 });
  assert.equal(d.ponytail, null);
  const mono = r(d, { theme: 'mono' });
  assert.match(mono, /^▌proj · belum ada topik · Opus 5\.5 · medium\n▌\[konteks 72%\] · 144k\/200k · 5j 88% \(reset \d\d:\d\d\) · 7h 30% · \+310 −88$/);
  fs.writeFileSync(path.join(cfgDir, '.ponytail-active'), 'ultra\n');
  d = statusData(root, payload, { CLAUDE_CONFIG_DIR: cfgDir });
  assert.equal(d.ponytail, 'ultra');
  const k = r(d, { theme: 'kapsul' });
  assert.match(k, /\x1b\[48;5;30;38;5;255;1mproj/, 'root = kapsul');
  assert.match(k, /\x1b\[48;5;178;38;5;16;1mkonteks 72%/, '72% = kuning');
  assert.match(k, /ponytail:ultra/);
  fs.writeFileSync(path.join(cfgDir, '.ponytail-active'), 'off');
  assert.equal(statusData(root, payload, { CLAUDE_CONFIG_DIR: cfgDir }).ponytail, null);
  assert.deepEqual([level(59), level(60), level(84), level(85)], ['ok', 'warn', 'warn', 'bad']);
  // tanpa used_percentage: dihitung dari token / ukuran; lebar sempit memotong segmen, bukan galat
  const d2 = statusData(root, { context_window: { total_input_tokens: 50000, context_window_size: 200000 } }, { CLAUDE_CONFIG_DIR: cfgDir });
  assert.equal(d2.ctx.pct, 25);
  assert.equal(r(d, { theme: 'mono', max: 20 }).split('\n')[0], '▌proj');
  assert.equal(jr(root, '.claude/settings.json').statusLine.refreshInterval, undefined, 'D4: tanpa refreshInterval');
  assert.equal(jr(root, 'harness.config.json').tui.theme, 'kapsul');
});

test('git-auth: petunjuk --apply hanya bila ada yang belum terpasang', () => {
  const root = project({ v1: true });
  sh('git', ['remote', 'add', 'origin', 'git@github-pribadi:trio/api.git'], path.join(root, 'source-code/api'));
  const cfg = jr(root, 'harness.config.json'); cfg.git = { default_account: 'akun-a' }; cfg.services = ['api'];
  wr(root, 'harness.config.json', JSON.stringify(cfg));
  assert.doesNotMatch(hx(root, 'git-auth').stdout, /Pasang:/);
});

test('status line 2.0.3: topik per sesi dari transcript, bertahap, abaikan teks chat dan tabel remap', async () => {
  const { sessionTopic } = await import('../kernel/.claude/hooks/topics.mjs');
  const root = project({ v1: true });
  for (const t of ['2026-11-20/lama', '2026-11-25/baru', '2026-11-25/kedua']) fs.mkdirSync(path.join(root, 'docs/topics', t), { recursive: true });
  const tr = path.join(root, 't.jsonl');
  const line = (content, role = 'assistant') => JSON.stringify({ type: role, message: { role, content } }) + '\n';
  const P = { session_id: 'abc', transcript_path: tr };
  fs.writeFileSync(tr, line([{ type: 'text', text: 'lihat docs/topics/2026-11-20/lama/topic.md' }]));
  assert.equal(sessionTopic(root, P), null, 'sesi baru: teks chat bukan bukti');
  fs.appendFileSync(tr, line([{ type: 'tool_result', content: '| baru | docs/topics/2026-11-20/lama |' }], 'user'));
  assert.equal(sessionTopic(root, P), null, 'keluaran tool selain topic new diabaikan');
  fs.appendFileSync(tr, line([{ type: 'tool_use', name: 'Write', input: { file_path: 'D:\\dev\\event\\docs\\topics\\2026-11-25\\baru\\topic.md' } }]));
  assert.equal(sessionTopic(root, P).slug, 'baru', 'path Windows di input tool');
  fs.appendFileSync(tr, '{"partial":');
  assert.equal(sessionTopic(root, P).slug, 'baru', 'baris belum lengkap ditunda');
  fs.appendFileSync(tr, '1}\n' + line([{ type: 'tool_use', name: 'Bash', input: { command: 'cat docs/topics/2026-11-25/kedua/plan.md' } }]));
  assert.equal(sessionTopic(root, P).slug, 'kedua', 'yang terakhir disentuh menang');
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, '.claude/state/topic-abc.json'), 'utf8')).offset > 0, 'posisi baca disimpan');
  assert.equal(sessionTopic(root, { session_id: 'lain', transcript_path: path.join(root, 'tidak-ada.jsonl') }), null);
  assert.equal(sessionTopic(root, { transcript_path: tr }), null, 'tanpa session_id');
  const { statusData, render } = await import('../kernel/.claude/hooks/statusline.mjs');
  const d = statusData(root, { cost: { total_lines_added: 0, total_lines_removed: 0 }, model: { display_name: 'M' }, effort: { level: 'low' } }, { CLAUDE_CONFIG_DIR: root });
  assert.equal(d.lines, null, '+0 −0 disembunyikan');
  d.ponytail = 'full';
  assert.match(render(d, { theme: 'kapsul' }), /M · low\x1b\[0m · \x1b\[38;5;244mponytail:full/, 'pemisah · sebelum badge');
});

test('2.0.4: agent bernama orang; berkas agent lama dibuang saat update', () => {
  const root = project({ v1: true });
  const names = fs.readdirSync(path.join(root, '.claude/agents')).sort();
  assert.deepEqual(names, ['freya-dba.md', 'hana-fe.md', 'kofi-ops.md', 'lucia-rv.md', 'nikola-be.md', 'runner.md', 'scout.md']);
  for (const f of names) assert.match(rd(root, `.claude/agents/${f}`), new RegExp(`^---\\nname: ${f.replace('.md', '')}\\n`));
  // simulasi root lama yang masih punya backend.md di manifest
  wr(root, '.claude/agents/backend.md', '---\nname: backend\n---\n');
  const m = jr(root, '.claude/harness.manifest.json'); m.files.push('.claude/agents/backend.md'); wr(root, '.claude/harness.manifest.json', JSON.stringify(m));
  const v = jr(root, '.claude/harness.version'); v.version = '2.0.3'; wr(root, '.claude/harness.version', JSON.stringify(v));
  commitAll(root, 'lama');
  const r = sh('node', [path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'install.mjs'), root, '--update', '--yes', '--repo', 'devhardiyanto/agent-harness'], root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.existsSync(path.join(root, '.claude/agents/backend.md')), false);
  assert.match(rd(root, 'AGENTS.md'), /`nikola-be` \(backend\)/);
});
