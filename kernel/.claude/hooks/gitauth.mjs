// Akun git per service tanpa `gh auth switch`: remote HTTPS memakai credential helper lokal yang meminta token ke gh;
// remote SSH beralias sudah memisahkan akun lewat kuncinya.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

export function accountFor(cfg, svc) {
  const g = cfg.git || {};
  return (g.services && g.services[svc]) || g.default_account || null;
}

export const helperFor = (account) => `!f() { test "$1" = get || exit 0; echo username=${account}; echo "password=$(gh auth token --user ${account})"; }; f`;

// Remote → { proto, host, repo }. SSH dengan alias host (git@github-kantor:org/repo.git) umum untuk multi-akun.
export function parseRemote(url) {
  const u = String(url || '').trim();
  let m = /^(?:ssh:\/\/)?[\w.-]+@([^:/]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(u);
  if (m && !/^https?:/.test(u)) return { proto: 'ssh', host: m[1], repo: m[2] };
  m = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(u);
  if (m) return { proto: 'https', host: m[1], repo: m[2] };
  return null;
}

// Hostname asli di balik alias SSH (~/.ssh/config), lewat `ssh -G`. Gagal → alias itu sendiri.
function sshHostname(alias) {
  const r = spawnSync('ssh', ['-G', alias], { encoding: 'utf8', timeout: 5000 });
  const m = r.status === 0 && /^hostname\s+(\S+)/m.exec(r.stdout || '');
  return m ? m[1] : alias;
}

export const OK_STATUS = (st) => st === 'terpasang' || st.startsWith('SSH');

export function plan(root, cfg) {
  const host = (cfg.git && cfg.git.host) || 'github.com';
  return (cfg.services || []).map((svc) => {
    const dir = path.join(root, cfg.services_dir, svc);
    const row = { svc, dir, account: accountFor(cfg, svc), repo: '', status: '' };
    if (!fs.existsSync(path.join(dir, '.git'))) return { ...row, status: 'bukan repo git' };
    const url = (git(dir, ['remote', 'get-url', 'origin']).stdout || '').trim();
    if (!url) return { ...row, status: 'tanpa remote origin' };
    const r = parseRemote(url);
    if (!r) return { ...row, status: 'format remote tidak dikenali' };
    row.repo = r.repo;
    if (!row.account) return { ...row, status: 'akun belum diisi (git.default_account / git.services)' };
    if (r.proto === 'ssh') {
      // Kunci SSH per alias sudah memisahkan akun untuk git; helper HTTPS tidak dipakai.
      const real = r.host === host ? host : sshHostname(r.host);
      if (real !== host && !r.host.includes('github')) return { ...row, status: `remote bukan ${host} (${r.host})` };
      return { ...row, status: `SSH ${r.host}: helper tidak perlu` };
    }
    if (r.host !== host) return { ...row, status: `remote bukan ${host} (${r.host})` };
    const cur = (git(dir, ['config', '--local', '--get', 'harness.account']).stdout || '').trim();
    return { ...row, status: cur === row.account ? 'terpasang' : 'belum terpasang' };
  });
}

export function tokenAvailable(account) {
  // HARNESS_GH = gh tiruan (sandbox/test) berupa skrip Node.
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
