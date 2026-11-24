// Akun git per service (2.0, K13) tanpa `gh auth switch`.
// Tiap repo service mendapat credential helper lokal yang meminta token akunnya sendiri ke gh
// (`gh auth token --user <akun>`) saat git butuh kredensial. Token tidak pernah ditulis ke berkas atau dicetak.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

export function accountFor(cfg, svc) {
  const g = cfg.git || {};
  return (g.services && g.services[svc]) || g.default_account || null;
}

export const helperFor = (account) => `!f() { test "$1" = get || exit 0; echo username=${account}; echo "password=$(gh auth token --user ${account})"; }; f`;

export function plan(root, cfg) {
  const host = (cfg.git && cfg.git.host) || 'github.com';
  return (cfg.services || []).map((svc) => {
    const dir = path.join(root, cfg.services_dir, svc);
    const row = { svc, dir, account: accountFor(cfg, svc), status: '' };
    if (!fs.existsSync(path.join(dir, '.git'))) return { ...row, status: 'bukan repo git' };
    const url = (git(dir, ['remote', 'get-url', 'origin']).stdout || '').trim();
    if (!url.includes(host)) return { ...row, status: url ? `remote bukan ${host}` : 'tanpa remote origin' };
    if (!row.account) return { ...row, status: 'akun belum diisi (git.default_account / git.services)' };
    const cur = (git(dir, ['config', '--local', '--get', 'harness.account']).stdout || '').trim();
    return { ...row, status: cur === row.account ? 'terpasang' : 'belum terpasang' };
  });
}

export function tokenAvailable(account) {
  // HARNESS_GH: gh tiruan (sandbox/test), skrip Node yang dijalankan langsung.
  const fake = process.env.HARNESS_GH;
  const r = fake ? spawnSync(process.execPath, [fake, 'auth', 'token', '--user', account], { encoding: 'utf8' }) : spawnSync('gh', ['auth', 'token', '--user', account], { encoding: 'utf8' });
  return r.status === 0 && !!String(r.stdout).trim();
}

export function apply(root, cfg) {
  const host = (cfg.git && cfg.git.host) || 'github.com';
  const key = `credential.https://${host}.helper`;
  return plan(root, cfg).map((r) => {
    if (r.status !== 'belum terpasang' && r.status !== 'terpasang') return r;
    if (!tokenAvailable(r.account)) return { ...r, status: `gh belum login sebagai ${r.account} (gh auth login)` };
    git(r.dir, ['config', '--local', '--unset-all', key]);
    // nilai kosong pertama menonaktifkan helper global (mis. manager/gh akun aktif) untuk host ini di repo ini saja
    git(r.dir, ['config', '--local', '--add', key, '']);
    const a = git(r.dir, ['config', '--local', '--add', key, helperFor(r.account)]);
    git(r.dir, ['config', '--local', 'harness.account', r.account]);
    return { ...r, status: a.status === 0 ? 'terpasang' : `gagal: ${(a.stderr || '').trim().slice(0, 120)}` };
  });
}
