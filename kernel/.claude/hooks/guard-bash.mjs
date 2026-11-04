// PreToolUse (Bash): git gate, perintah destruktif, secret, proteksi harness. Exit 2 = blokir.
// Ini guardrail best-effort (regex), bukan sandbox.
import { spawnSync } from 'node:child_process';
import {
  readStdinJson, projectRoot, loadConfig, globToRegex, activeItems, coversService, posix, deny, SECRET_FILE,
  isMain, updateTicket,
} from './lib.mjs';

const WRITE_OP = /(\bsed\s+(-[a-zA-Z]*i|--in-place)|\btee\b|(^|[^<>&=\d])>>?(?![>&=])|\bmv\b|\bcp\b|\brm\b|\bpatch\b|\bgit\s+apply\b|\bperl\s+-[a-z]*i|\btruncate\b|\binstall\s+-|\bdd\b)/;

function currentBranch(cwd) {
  const r = spawnSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
const isProtectedBranch = (cfg, b) => !!b && [cfg.root_branch, ...cfg.protected_branches].some((g) => globToRegex(g).test(b));

export function evaluate(root, cfg, payload) {
  const cmd = String(payload.tool_input?.command || '');
  const cwd = payload.cwd || root;
  const fail = (reason) => ({ ok: false, reason });
  const flat = cmd.replace(/\s+/g, ' ');

  // approve hanya manusia
  if (/harness\.mjs\s+approve\b/.test(flat)) return fail('approve hanya boleh dilakukan manusia (ketik /harness:approve <slug>, atau jalankan sendiri dengan awalan "!").');
  if (/harness\.mjs\s+quick\b/.test(flat)) return fail('item quick hanya dibuat dari ketikan manusia: /harness:quick <permintaan> (atau jalankan sendiri dengan awalan "!").');

  // verifikasi knowledge dan persetujuan pola hanya manusia
  if (/harness\.mjs\s+(verify-knowledge|patterns-approve)\b/.test(flat)) return fail('verify-knowledge / patterns-approve hanya manusia: ketik /harness:knowledge verify <svc> atau /harness:knowledge patterns <slug> <P1,P3|all>, atau jalankan sendiri dengan awalan "!".');

  // update harness di root butuh tiket dari ketikan manusia (/harness:update atau "tolong root nya di update ke main")
  if (/harness\.mjs\s+update\b/.test(flat)) {
    const mode = /--all\b/.test(flat) ? 'all' : /--rollback\b/.test(flat) ? 'rollback' : 'update';
    if (!updateTicket(root, mode)) return fail(`update harness hanya atas permintaan manusia: ketik /harness:update${mode === 'update' ? '' : ' ' + mode} (atau jalankan sendiri dengan awalan "!").`);
  }

  // perintah terlarang dari config
  for (const re of cfg.deny_commands) if (new RegExp(re, 'i').test(flat)) return fail(`perintah cocok dengan daftar larangan (${re}). Lakukan manual di luar agent.`);

  // destruktif umum
  if (/\bgit\s+(-C\s+\S+\s+)?reset\s+--hard\b/.test(flat) || /\bgit\s+(-C\s+\S+\s+)?clean\s+-[a-z]*f/.test(flat) || /\bgit\s+branch\s+-D\b/.test(flat)) return fail('git reset --hard / clean -f / branch -D dilarang. Minta user bila memang perlu.');
  if (/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\.\.|\*|\.)(\s|$)/.test(flat)) return fail('rm rekursif pada root/home/parent/wildcard dilarang.');
  if (/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z)?sh\b/.test(flat)) return fail('pipe unduhan langsung ke shell dilarang. Unduh, periksa, baru jalankan.');
  if (/--no-verify\b/.test(flat) && /\bgit\b/.test(flat)) return fail('--no-verify dilarang (melewati hook git).');

  // git push
  if (/\bgit\b[^;&|]*\bpush\b/.test(flat)) {
    if (/(--force\b|--force-with-lease|\s-f(\s|$)|\s\+\S)/.test(flat.replace(/git\s+push/, 'git push '))) return fail('force push dilarang.');
    const target = /push\s+(?:-\S+\s+)*\S+\s+(?:\S+:)?(\S+)/.exec(flat);
    const named = target ? target[1].replace(/^refs\/heads\//, '') : null;
    if (named && isProtectedBranch(cfg, named)) return fail(`push langsung ke branch ${named} dilarang. Push branch kerja lalu buka PR.`);
    if (!named || named === 'HEAD') {
      const b = currentBranch(cwd);
      if (isProtectedBranch(cfg, b)) return fail(`kamu sedang di branch ${b}; push dari branch ini dilarang. Buat branch kerja dan buka PR.`);
    }
  }
  // git commit di branch dilindungi
  if (/\bgit\b[^;&|]*\bcommit\b/.test(flat)) {
    const b = currentBranch(cwd);
    if (isProtectedBranch(cfg, b)) return fail(`commit langsung di branch ${b} dilarang. Buat branch kerja dulu (mis. feat/<slug>).`);
  }

  // baca file rahasia lewat shell
  const readRe = /\b(cat|less|more|head|tail|bat|grep|rg|awk|sed|cp|source|xxd|strings|base64)\b[^|;&]*?(\S*\.env(\.[\w.-]+)?|\S+\.pem|\S*id_(rsa|ed25519)\S*)/g;
  for (const m of flat.matchAll(readRe)) {
    const f = m[2];
    if (SECRET_FILE.test(posix(f).replace(/^.*\//, '')) && !/\.(example|sample|template)$/.test(f)) return fail(`akses ke ${f} (file rahasia) dilarang lewat shell.`);
  }
  if (/\b(printenv|env)\s*(\||$|;)/.test(flat) || /\bcat\s+\/proc\/\S*environ/.test(flat)) return fail('dump environment dilarang (bisa membocorkan secret).');

  // tulis ke file harness / plan.md lewat shell
  if (WRITE_OP.test(cmd)) {
    if (/docs\/work\/[^\s'"]*plan\.md/.test(flat)) return fail('jangan ubah plan.md lewat shell; pakai Edit/Write (transisi status diperiksa hook) atau harness.mjs set-status.');
    if (/docs\/knowledge\/[^\s'"]*(summary|patterns)\.md|docs\/work\/[^\s'"]*patterns-proposal\.md/.test(flat)) return fail('jangan ubah summary.md/patterns.md/patterns-proposal.md lewat shell; pakai Edit/Write (status verified/approved dijaga hook).');
    if (!process.env.HARNESS_ADMIN && /(\.claude\/(hooks|agents)\/|\.claude\/settings\.json|harness\.config\.json|merge-tickets|update-ticket|\.harness\/evidence)/.test(flat)) return fail('file harness dilindungi; ubah manual di luar sesi agent.');
    // gerbang 1 untuk tulis lewat shell ke services_dir
    if (cfg.layout === 'multi-repo') {
      const dir = posix(cfg.services_dir).replace(/\/$/, '');
      const svcs = new Set([...flat.matchAll(new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([\\w.-]+)`, 'g'))].map((m) => m[1]));
      if (svcs.size) {
        const items = activeItems(root);
        const missing = [...svcs].filter((s) => !items.some((i) => coversService(i, s)));
        if (missing.length) return fail(`menulis ke service ${missing.join(', ')} lewat shell tanpa work item approved yang mencakupnya.`);
      }
    }
  }
  return { ok: true };
}

if (isMain(import.meta.url)) {
  const payload = await readStdinJson();
  const root = projectRoot(payload);
  const cfg = loadConfig(root);
  const r = evaluate(root, cfg, payload);
  if (!r.ok) deny(root, payload, r.reason);
  process.exit(0);
}
