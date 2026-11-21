#!/usr/bin/env node
// gh tiruan untuk sandbox harness (scripts/sandbox.mjs). Tidak ada jaringan. Status PR di <sandbox>/.sandbox/prs.json.
// Didukung: --version, auth status, api user, repo view, pr create|view|checks|merge|edit|list. Check selalu hijau.
// Merge = push fast-forward head → base ke remote lokal; bila tidak fast-forward, PR tetap MERGED dengan catatan.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = path.join(sb, 'prs.json');
const a = process.argv.slice(2);
const opt = (n) => { const i = a.findIndex((x) => x === n || x.startsWith(`${n}=`)); if (i < 0) return null; return a[i].includes('=') ? a[i].split('=').slice(1).join('=') : a[i + 1]; };
const has = (n) => a.includes(n);
const out = (s) => { process.stdout.write(`${s}\n`); process.exit(0); };
const fail = (s) => { process.stderr.write(`fake gh: ${s}\n`); process.exit(1); };
// 1.22.2: URL berbentuk https://host/owner/repo/pull/N (owner = "sandbox"), sesuai validasi harness.mjs ship.
// Entri lama tanpa owner (https://sandbox.invalid/<repo>/pull/N) diubah saat dibaca.
const prUrl = (repo, n) => `https://sandbox.invalid/sandbox/${repo}/pull/${n}`;
const load = () => { try { return JSON.parse(fs.readFileSync(store, 'utf8')).map((p) => { const m = /^https:\/\/sandbox\.invalid\/([\w.-]+)\/pull\/(\d+)$/.exec(p.url || ''); return m ? { ...p, url: prUrl(m[1], m[2]) } : p; }); } catch { return []; } };
const save = (l) => fs.writeFileSync(store, JSON.stringify(l, null, 2));
const git = (cwd, ...x) => spawnSync('git', x, { cwd, encoding: 'utf8' });
const top = (cwd) => (git(cwd, 'rev-parse', '--show-toplevel').stdout || '').trim() || cwd;
const nameOf = (cwd) => path.basename(top(cwd));
const find = (ref) => { const l = load(); const r = String(ref || '').replace(/^https:\/\/sandbox\.invalid\/(?!sandbox\/)([\w.-]+)\/pull\//, 'https://sandbox.invalid/sandbox/$1/pull/'); const p = l.find((x) => x.url === r || String(x.number) === r); return { l, p }; };
const jsonPick = (p, fields) => {
  const all = { state: p.state, isDraft: false, baseRefName: p.base, headRefName: p.head, headRefOid: (git(p.dir, 'rev-parse', p.head).stdout || '').trim() || p.sha, url: p.url, number: p.number, title: p.title,
    statusCheckRollup: [{ name: 'sandbox-check', status: 'COMPLETED', conclusion: 'SUCCESS' }] };
  return fields ? Object.fromEntries(fields.split(',').map((f) => [f, all[f]])) : all;
};
const emit = (obj) => { const q = opt('-q') || opt('--jq'); if (q && /^\.\w+$/.test(q)) out(String(obj[q.slice(1)] ?? '')); out(JSON.stringify(obj)); };

const [c1, c2] = a;
if (c1 === '--version') out('gh version 0.0.0-sandbox (tiruan harness; tanpa jaringan)');
if (c1 === 'auth') out('sandbox: login sebagai "sandbox" (tiruan)');
if (c1 === 'api' && c2 === 'user') emit({ login: 'sandbox' });
if (c1 === 'repo' && c2 === 'view') emit({ nameWithOwner: `sandbox/${nameOf(process.cwd())}`, viewerPermission: 'ADMIN' });
if (c1 !== 'pr') fail(`perintah "${a.slice(0, 2).join(' ')}" tidak didukung di sandbox`);

if (c2 === 'create') {
  const dir = top(process.cwd());
  const head = opt('--head') || (git(dir, 'branch', '--show-current').stdout || '').trim();
  const base = opt('--base') || 'main';
  if (!head || head === base) fail('butuh --head berbeda dari --base');
  if (git(dir, 'ls-remote', '--exit-code', 'origin', `refs/heads/${head}`).status !== 0) fail(`branch ${head} belum di-push ke origin (remote lokal)`);
  const l = load(); const number = l.length + 1;
  const p = { number, url: prUrl(nameOf(dir), number), dir, head, base, title: opt('--title') || head, state: 'OPEN', created_at: new Date().toISOString() };
  l.push(p); save(l); out(p.url);
}
if (c2 === 'list') { const l = load(); out(l.map((p) => `${p.number}\t${p.title}\t${p.head}\t${p.state}`).join('\n') || '(tidak ada PR)'); }
const { l, p } = find(a[2]);
if (!p) fail(`PR ${a[2] || '(kosong)'} tidak ditemukan di sandbox`);
if (c2 === 'view') emit(jsonPick(p, opt('--json')));
if (c2 === 'checks') out('sandbox-check\tpass\t0s\t(tiruan)');
if (c2 === 'edit') { if (opt('--base')) p.base = opt('--base'); save(l); out(p.url); }
if (c2 === 'merge') {
  if (p.state !== 'OPEN') fail(`PR ${p.url} berstatus ${p.state}`);
  const sha = (git(p.dir, 'rev-parse', p.head).stdout || '').trim();
  const want = opt('--match-head-commit'); if (want && want !== sha) fail(`head berubah (${sha.slice(0, 7)} ≠ ${want.slice(0, 7)})`);
  git(p.dir, 'fetch', '-q', 'origin');
  const ff = git(p.dir, 'push', 'origin', `${sha}:refs/heads/${p.base}`);
  p.state = 'MERGED'; p.merged_at = new Date().toISOString(); p.note = ff.status === 0 ? 'fast-forward ke remote lokal' : 'tidak fast-forward; ditandai MERGED saja';
  save(l); out(`✓ Merged ${p.url} (${p.note})`);
}
fail(`pr ${c2} tidak didukung di sandbox`);
