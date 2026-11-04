// Harness — Delivery Gate: menjalankan checks per service dan menulis docs/work/<slug>/gate.md (PASS / FAIL / TIDAK DIPERIKSA per item).
// Dipanggil oleh `harness.mjs gate <slug>` dan otomatis oleh `set-status <slug> done`. Tanpa dependency; Node >= 18.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { summarizeItem, isQuick, serviceDirOf, gateFingerprint, findSecret, splitFrontmatter } from './lib.mjs';
import { baselineOf } from './knowledge.mjs';

const PASS = 'PASS'; const FAIL = 'FAIL'; const SKIP = 'TIDAK DIPERIKSA'; const NA = 'TIDAK BERLAKU';
const tail = (t, n = 300) => String(t || '').trim().replace(/\s+/g, ' ').slice(-n);
const ORDER = ['lint', 'test', 'build'];

function runCommand(cmd, cwd, timeoutSec) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { shell: true, cwd, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 32 * 1024 * 1024 });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.error && r.error.code === 'ETIMEDOUT') return { ok: false, note: `timeout ${timeoutSec}s: ${cmd}` };
  if (r.status !== 0) return { ok: false, note: `exit ${r.status} (${sec}s): ${cmd} → ${tail(r.stdout + ' ' + r.stderr)}` };
  return { ok: true, note: `${cmd} (${sec}s)` };
}

function secretsInDiff(root, cfg, svc) {
  const dir = serviceDirOf(root, cfg, svc === '*' ? '' : svc);
  if (!fs.existsSync(path.join(dir, '.git'))) return { state: SKIP, note: 'bukan repo git' };
  const b = svc === '*' ? { ok: false, note: 'layout single' } : baselineOf(root, cfg, svc);
  if (!b.ok) return { state: SKIP, note: `baseline tidak ditemukan (${b.note || '-'})` };
  const r = spawnSync('git', ['diff', b.sha], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return { state: SKIP, note: 'git diff gagal' };
  const added = r.stdout.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
  const hit = findSecret(added.slice(0, 2_000_000));
  return hit ? { state: FAIL, note: `diff terhadap ${b.ref} memuat ${hit}` } : { state: PASS, note: `diff terhadap ${b.ref}@${b.sha.slice(0, 8)} bersih` };
}

export function runGate(root, cfg, item, { log = () => {} } = {}) {
  const rows = []; // [item, hasil, catatan]
  const sum = summarizeItem(item);
  for (const a of sum.ac) rows.push([`${a.id} bukti`, a.evidence === 'ok' ? PASS : FAIL, a.evidence === 'ok' ? 'ada di progress.md' : 'belum ada bukti nyata di progress.md']);
  if (!sum.ac.length) rows.push(['AC', FAIL, 'plan.md tidak punya AC']);
  if (isQuick(item)) rows.push(['review', NA, 'lajur quick: tanpa review subagent; gate ini penggantinya']);
  else if (!sum.review) rows.push(['review', FAIL, 'review.md belum ada']);
  else rows.push(['review', sum.review.verdict === 'clean' && !sum.review.blockers_open ? PASS : FAIL, `verdict ${sum.review.verdict}, blocker terbuka ${sum.review.blockers_open}`]);

  const checks = cfg.checks || {};
  const ran = [];
  for (const svc of item.services) {
    const sc = (checks[svc] && typeof checks[svc] === 'object') ? checks[svc] : {};
    const names = [...ORDER, ...Object.keys(sc).filter((k) => !ORDER.includes(k))];
    const dir = serviceDirOf(root, cfg, svc === '*' ? '' : svc);
    let any = false;
    for (const n of names) {
      const cmd = sc[n];
      if (typeof cmd !== 'string' || !cmd.trim()) continue;
      any = true;
      log(`[gate] ${svc}: ${n} → ${cmd}`);
      const r = runCommand(cmd, dir, cfg.gate.test_timeout_sec || 300);
      rows.push([`${svc}: ${n}`, r.ok ? PASS : FAIL, r.note]);
      ran.push({ service: svc, name: n, command: cmd, ok: r.ok, note: r.note });
    }
    if (!any) rows.push([`${svc}: checks`, cfg.gate.require_checks ? FAIL : SKIP, cfg.gate.require_checks ? 'gate.require_checks aktif tetapi checks.' + svc + ' kosong' : `checks.${svc} belum diisi di harness.config.json (usulan: harness.mjs propose-checks ${svc})`]);
    const sec = secretsInDiff(root, cfg, svc);
    rows.push([`${svc}: secret di diff`, sec.state, sec.note]);
  }
  const verdict = rows.some((r) => r[1] === FAIL) ? 'fail' : 'pass';
  const skipped = rows.filter((r) => r[1] === SKIP).length;
  const text = `---\nverdict: ${verdict}\ngenerated: ${new Date().toISOString()}\nfingerprint: ${gateFingerprint(root, cfg, item)}\nlane: ${isQuick(item) ? 'quick' : 'standard'}\nunchecked: ${skipped}\n---\n# Gate pengiriman — ${item.slug}\n\n| item | hasil | catatan |\n|---|---|---|\n${rows.map((r) => `| ${r[0]} | ${r[1]} | ${String(r[2]).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n')}\n\n${skipped ? `**${skipped} item TIDAK DIPERIKSA**: tidak ada checks yang terkonfigurasi; keputusan ship ada di tanganmu.\n` : ''}`;
  fs.writeFileSync(path.join(item.dir, 'gate.md'), text);
  return { verdict, rows, skipped, checks: ran };
}
