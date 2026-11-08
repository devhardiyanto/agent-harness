// S6: pengiriman berantai: rencana ship, akun gh, tiket merge sekali pakai, merge berurutan. Memakai gh tiruan.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './helpers.mjs'; // memasang shim `claude` palsu di PATH

const here = path.dirname(fileURLToPath(import.meta.url));
const kernel = path.join(here, '..', 'kernel');
const g = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

// gh tiruan: keadaan di berkas JSON (GH_FAKE); tiap pemanggilan dicatat di state.log
const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-fake-'));
fs.writeFileSync(path.join(fakeDir, 'gh.mjs'), `
import fs from 'node:fs';
const a = process.argv.slice(2); const f = process.env.GH_FAKE; const st = JSON.parse(fs.readFileSync(f, 'utf8'));
const save = () => fs.writeFileSync(f, JSON.stringify(st)); st.log.push(a.join(' ')); save();
const out = (x) => { console.log(typeof x === 'string' ? x : JSON.stringify(x)); process.exit(0); };
if (a[0] === '--version') out('gh version 2.0.0');
if (a[0] === 'api' && a[1] === 'user') { if (!st.login) process.exit(1); out(st.login); }
if (a[0] === 'repo' && a[1] === 'view') { if (st.needSlug && (!a[2] || a[2].startsWith('--'))) { console.error('none of the git remotes configured for this repository point to a known GitHub host.'); process.exit(1); } if (st.perm === 'NONE') { console.error('Could not resolve to a Repository'); process.exit(1); } out({ nameWithOwner: 'o/r', viewerPermission: st.perm }); }
const pr = st.prs[a[2]];
if (a[0] === 'pr') {
  if (!pr) { console.error('no pull requests found'); process.exit(1); }
  if (a[1] === 'view' && a.includes('-q')) out(pr.state);
  if (a[1] === 'view') out({ state: pr.state, isDraft: pr.draft || false, baseRefName: pr.base, headRefName: pr.head, headRefOid: pr.sha, statusCheckRollup: pr.checks });
  if (a[1] === 'edit') { pr.base = a[a.indexOf('--base') + 1]; save(); out(''); }
  if (a[1] === 'merge') { if (st.refuseMerge) { console.error('Pull request is not mergeable'); process.exit(1); } pr.state = 'MERGED'; save(); out(''); }
}
process.exit(1);
`);
fs.writeFileSync(path.join(fakeDir, 'gh'), `#!/bin/sh\nexec node "${path.join(fakeDir, 'gh.mjs')}" "$@"\n`, { mode: 0o755 });
fs.writeFileSync(path.join(fakeDir, 'gh.cmd'), `@node "${path.join(fakeDir, 'gh.mjs')}" %*\r\n`);
process.env.PATH = fakeDir + path.delimiter + process.env.PATH;

const OK = [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }];
const RED = [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }];
const RUN = [{ __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }];
const mkPr = (o = {}) => ({ state: 'OPEN', base: 'main', head: 'feat/x', sha: 'aaaaaaa1', checks: OK, ...o });
function fake(root, prs = {}, extra = {}) {
  const f = path.join(root, 'gh-state.json');
  fs.writeFileSync(f, JSON.stringify({ login: 'devhardiyanto', perm: 'ADMIN', prs, log: [], ...extra }));
  process.env.GH_FAKE = f;
  return f;
}
const state = (root) => JSON.parse(fs.readFileSync(path.join(root, 'gh-state.json'), 'utf8'));
const merges = (root) => state(root).log.filter((l) => l.startsWith('pr merge'));

function mkProject(cfgPatch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-'));
  fs.cpSync(kernel, root, { recursive: true });
  const cfgPath = path.join(root, 'harness.config.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')), services: ['svc-a', 'svc-b'], align: { required: false }, ...cfgPatch }));
  for (const s of ['svc-a', 'svc-b']) {
    const d = path.join(root, 'source-code', s);
    fs.mkdirSync(d, { recursive: true });
    g(d, 'init', '-q', '-b', 'main'); g(d, 'config', 'user.name', 't'); g(d, 'config', 'user.email', 't@t.t'); g(d, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(d, 'README.md'), 'x\n'); g(d, 'add', '-A'); g(d, 'commit', '-qm', 'init');
  }
  fake(root);
  return root;
}
const run = (root, script, payload) => spawnSync('node', [path.join(root, '.claude', 'hooks', script)], { input: JSON.stringify({ session_id: 's1', cwd: root, ...payload }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const cli = (root, ...a) => spawnSync('node', [path.join(root, '.claude', 'hooks', 'harness.mjs'), ...a], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
const prompt = (root, text) => run(root, 'prompt.mjs', { hook_event_name: 'UserPromptSubmit', prompt: text });
const ticket = (root, slug) => path.join(root, '.claude/state/merge-tickets', `${slug}.json`);

// item quick berstatus done, kode di-commit di branch kerja svc-a, pr: terisi
function doneItem(root, urls = ['https://github.com/o/r/pull/1'], branch = 'feat/x') {
  const r = prompt(root, '/harness:quick ubah teks pesan di halaman login');
  const slug = /Item quick (\S+) dibuat/.exec(r.stdout)[1];
  const e = run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'source-code/svc-a/login.txt'), old_string: 'a', new_string: 'b' } });
  assert.equal(e.status, 0);
  const svc = path.join(root, 'source-code/svc-a');
  g(svc, 'switch', '-q', '-c', branch);
  fs.writeFileSync(path.join(svc, 'login.txt'), 'pesan baru\n');
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'progress.md'), '## Verifikasi\n- AC1: halaman login menampilkan pesan baru (dicek manual)\n');
  const d = cli(root, 'set-status', slug, 'done');
  assert.equal(d.status, 0, d.stderr + d.stdout);
  g(svc, 'add', '-A'); g(svc, 'commit', '-qm', `pesan login (${slug})`); // commit SESUDAH gate: gate harus tetap berlaku
  const pp = path.join(root, 'docs/work', slug, 'plan.md');
  fs.writeFileSync(pp, fs.readFileSync(pp, 'utf8').replace(/^pr: .*$/m, `pr: [${urls.join(', ')}]`));
  return slug;
}

test('ship-plan: branch utama ditolak; branch kerja lolos; ship.base menandai PR bertumpuk', () => {
  const root = mkProject({ ship: { base: { 'svc-a': 'feat/dasar' } } });
  const r = prompt(root, '/harness:quick ubah teks pesan di halaman login');
  const slug = /Item quick (\S+) dibuat/.exec(r.stdout)[1];
  run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'source-code/svc-a/x.txt'), old_string: 'a', new_string: 'b' } });
  let p = cli(root, 'ship-plan', slug);
  assert.equal(p.status, 2); assert.match(p.stdout, /sedang di branch main \(dilindungi\)/);
  g(path.join(root, 'source-code/svc-a'), 'switch', '-q', '-c', 'feat/x');
  p = cli(root, 'ship-plan', slug);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stdout, /\| svc-a \| - \| feat\/x \| feat\/dasar \(config ship\.base\) \| ya \| devhardiyanto \(ADMIN\)/);
});

test('ship-plan: akun gh tanpa akses → pesan jelas dengan saran gh auth switch', () => {
  const root = mkProject();
  const slug = doneItem(root);
  fake(root, {}, { perm: 'NONE', login: 'nawa9nest-dev' });
  const p = cli(root, 'ship-plan', slug);
  assert.equal(p.status, 2);
  assert.match(p.stdout, /akun gh aktif "nawa9nest-dev" tidak dapat mengakses repo/); assert.match(p.stdout, /gh auth switch --user/);
});

test('ketikan ship dengan PR hijau menerbitkan tiket; ship merge lalu menutup item; gate tetap berlaku setelah commit', () => {
  const root = mkProject();
  const slug = doneItem(root);
  fake(root, { 'https://github.com/o/r/pull/1': mkPr() });
  const r = prompt(root, `/harness:ship ${slug}`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /memutuskan MERGE/); assert.match(r.stdout, /skill summarize/); assert.ok(fs.existsSync(ticket(root, slug)));
  const s = cli(root, 'ship', slug);
  assert.equal(s.status, 0, s.stderr + s.stdout);
  assert.match(s.stdout, /pull\/1: MERGED \(merge\)/); assert.match(s.stdout, /done → merged/); assert.match(s.stdout, /Berikutnya: ringkasan sesi .*docs\/sessions/);
  assert.deepEqual(merges(root), ['pr merge https://github.com/o/r/pull/1 --merge --match-head-commit aaaaaaa1']);
  assert.match(fs.readFileSync(path.join(root, 'docs/work', slug, 'plan.md'), 'utf8'), /status: merged/);
  assert.equal(fs.existsSync(ticket(root, slug)), false);
});

test('check merah, check berjalan, atau draft (merge_on_request=false): tiket tidak terbit dan ketikan ditolak dengan alasan', () => {
  const root = mkProject({ ship: { merge_on_request: false } });
  const slug = doneItem(root);
  const url = 'https://github.com/o/r/pull/1';
  for (const [pr, re] of [[mkPr({ checks: RED }), /1 check MERAH/], [mkPr({ checks: RUN }), /masih berjalan/], [mkPr({ draft: true }), /masih draft/]]) {
    fake(root, { [url]: pr });
    const r = prompt(root, `/harness:ship ${slug}`);
    assert.match(r.stdout, /"decision":"block"/); assert.match(JSON.parse(r.stdout).reason, re);
    assert.equal(fs.existsSync(ticket(root, slug)), false);
  }
});

test('tanpa tiket, ship tidak memanggil merge; tiket hanya sekali pakai', () => {
  const root = mkProject();
  const slug = doneItem(root);
  const url = 'https://github.com/o/r/pull/1';
  fake(root, { [url]: mkPr() });
  const none = cli(root, 'ship', slug);
  assert.equal(none.status, 2); assert.match(none.stderr, /tidak ada tiket merge/); assert.equal(merges(root).length, 0);
  prompt(root, `/harness:ship ${slug}`);
  fake(root, { [url]: mkPr() }, { refuseMerge: true }); // merge gagal pada percobaan pertama
  const first = cli(root, 'ship', slug);
  assert.equal(first.status, 2); assert.match(first.stderr, /merge ditolak gh/);
  assert.equal(fs.existsSync(ticket(root, slug)), false, 'tiket habis walau gagal');
  fake(root, { [url]: mkPr() });
  const again = cli(root, 'ship', slug);
  assert.equal(again.status, 2); assert.match(again.stderr, /tidak ada tiket merge/);
});

test('tiket kedaluwarsa dan commit PR yang berubah sejak tiket ditolak', () => {
  const root = mkProject();
  const slug = doneItem(root);
  const url = 'https://github.com/o/r/pull/1';
  fake(root, { [url]: mkPr() });
  prompt(root, `/harness:ship ${slug}`);
  const t = JSON.parse(fs.readFileSync(ticket(root, slug), 'utf8')); t.expires_at = new Date(Date.now() - 1000).toISOString();
  fs.writeFileSync(ticket(root, slug), JSON.stringify(t));
  assert.match(cli(root, 'ship', slug).stderr, /kedaluwarsa/);
  fake(root, { [url]: mkPr() });
  prompt(root, `/harness:ship ${slug}`);
  fake(root, { [url]: mkPr({ sha: 'bbbbbbb2' }) }); // push baru setelah tiket
  const r = cli(root, 'ship', slug);
  assert.equal(r.status, 2); assert.match(r.stderr, /commit PR berubah sejak tiket/); assert.equal(merges(root).length, 0);
});

test('rantai dua PR: induk lebih dulu, anak diarahkan ke base induk, lalu merge', () => {
  const root = mkProject();
  const a = 'https://github.com/o/r/pull/1'; const b = 'https://github.com/o/r/pull/2';
  const slug = doneItem(root, [b, a]); // sengaja urutan terbalik di frontmatter
  fake(root, { [a]: mkPr({ head: 'feat/a', base: 'main', sha: 'aaaaaaa1' }), [b]: mkPr({ head: 'feat/b', base: 'feat/a', sha: 'bbbbbbb2' }) });
  assert.match(prompt(root, `/harness:ship ${slug}`).stdout, /memutuskan MERGE/);
  const s = cli(root, 'ship', slug);
  assert.equal(s.status, 0, s.stderr + s.stdout);
  const log = state(root).log.filter((l) => /^pr (edit|merge)/.test(l));
  assert.deepEqual(log, [
    `pr merge ${a} --merge --match-head-commit aaaaaaa1`,
    `pr edit ${b} --base main`,
    `pr merge ${b} --merge --match-head-commit bbbbbbb2`,
  ]);
});

test('agent tidak bisa menulis tiket (Edit/Write maupun shell) dan tidak bisa merge langsung', () => {
  const root = mkProject();
  const w = run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(root, '.claude/state/merge-tickets/x.json'), content: '{}' } });
  assert.equal(w.status, 2); assert.match(w.stderr, /dilindungi/);
  const b = (command) => run(root, 'guard-bash.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
  assert.equal(b('echo {} > .claude/state/merge-tickets/x.json').status, 2);
  assert.equal(b('gh pr merge 12 --merge').status, 2);
  assert.equal(b('node .claude/hooks/harness.mjs ship x').status, 0, 'ship tanpa tiket tidak berbuat apa pun, jadi boleh dijalankan');
});

const intent = (root, slug) => path.join(root, '.claude/state/merge-tickets', `intent-${slug}.json`);
test('fase A: ketikan ship tanpa PR → agent diminta menjalankan skill ship; izin merge tercatat, tanpa tiket', () => {
  const root = mkProject();
  const slug = doneItem(root, ['null']);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'plan.md'), fs.readFileSync(path.join(root, 'docs/work', slug, 'plan.md'), 'utf8').replace(/^pr: .*$/m, 'pr: null'));
  const r = prompt(root, 'push PR + merge');
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /meminta SHIP .*skill harness:ship[\s\S]*summary\.md/);
  assert.equal(fs.existsSync(ticket(root, slug)), false); assert.equal(fs.existsSync(intent(root, slug)), true);
});

test('fase A dengan merge_on_request=false: skill ship tanpa izin merge', () => {
  const root = mkProject({ ship: { merge_on_request: false } });
  const slug = doneItem(root, ['null']);
  fs.writeFileSync(path.join(root, 'docs/work', slug, 'plan.md'), fs.readFileSync(path.join(root, 'docs/work', slug, 'plan.md'), 'utf8').replace(/^pr: .*$/m, 'pr: null'));
  const r = prompt(root, `/harness:ship ${slug}`);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /mengetik \/harness:ship .* lagi/);
  assert.equal(fs.existsSync(intent(root, slug)), false);
});

test('izin merge tertunda: check berjalan → tidak merge, izin tetap; hijau → ship menerbitkan tiket sendiri dan merge; izin habis dipakai', () => {
  const root = mkProject();
  const slug = doneItem(root);
  const url = 'https://github.com/o/r/pull/1';
  fake(root, { [url]: mkPr({ checks: RUN }) });
  const r = prompt(root, `kirim ${slug}`);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /izin tertunda[\s\S]*masih berjalan/);
  assert.equal(fs.existsSync(intent(root, slug)), true); assert.equal(fs.existsSync(ticket(root, slug)), false);
  let s2 = cli(root, 'ship', slug);
  assert.equal(s2.status, 2); assert.match(s2.stderr, /masih berjalan[\s\S]*izin merge dari/); assert.deepEqual(merges(root), []);
  assert.equal(fs.existsSync(intent(root, slug)), true);
  fake(root, { [url]: mkPr() });
  s2 = cli(root, 'ship', slug);
  assert.equal(s2.status, 0, s2.stderr); assert.match(s2.stdout, /MERGED/); assert.match(s2.stdout, /summary\.md/);
  assert.equal(merges(root).length, 1); assert.equal(fs.existsSync(intent(root, slug)), false);
  assert.match(fs.readFileSync(path.join(root, 'docs/work', slug, 'summary.md'), 'utf8'), /Ringkasan/);
});

test('izin merge tidak bisa ditulis agent (Write diblokir)', () => {
  const root = mkProject();
  const r = run(root, 'gate.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: intent(root, 'x'), content: '{}' } });
  assert.equal(r.status, 2);
});

test('remote beralias SSH: repo diberikan eksplisit ke gh (owner/repo), tanpa itu gh menolak', () => {
  const root = mkProject();
  const slug = doneItem(root);
  const svc = path.join(root, 'source-code/svc-a');
  g(svc, 'remote', 'add', 'origin', 'git@github-pribadi:trio-inovasi-digital/event-backend.git');
  fake(root, {}, { needSlug: true });
  const p = cli(root, 'ship-plan', slug);
  assert.equal(p.status, 0, p.stdout + p.stderr);
  assert.match(p.stdout, /\| svc-a \| trio-inovasi-digital\/event-backend \|/);
  assert.ok(state(root).log.some((l) => l === 'repo view trio-inovasi-digital/event-backend --json nameWithOwner,viewerPermission'));
  // remote yang tidak bisa diurai: tanpa slug, gh (tiruan) menolak dan pesan menjelaskan akses
  g(svc, 'remote', 'set-url', 'origin', 'file:///tmp/tidak-ada');
  const q = cli(root, 'ship-plan', slug);
  assert.equal(q.status, 2); assert.match(q.stdout, /tidak dapat mengakses/);
});

test('repoSlug mengurai ssh alias, ssh://, dan https', async () => {
  const { repoSlug } = await import(pathToFileURL(path.join(kernel, '.claude/hooks/ship.mjs')).href);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-')); g(d, 'init', '-q');
  for (const [url, want] of [['git@github-pribadi:o/r.git', 'o/r'], ['git@github.com:o/r.git', 'o/r'], ['ssh://git@github.com/o/r.git', 'o/r'], ['https://github.com/o/r', 'o/r'], ['https://github.com/o/r.git/', 'o/r'], ['file:///x/y', null]]) {
    g(d, 'remote', 'remove', 'origin'); g(d, 'remote', 'add', 'origin', url);
    assert.equal(repoSlug(d), want, url);
  }
});
