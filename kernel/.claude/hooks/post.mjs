// PostToolUse / InstructionsLoaded: audit log JSONL, laporan diff manifest dependency, peringatan ambang konteks.
// Tidak pernah memblokir.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readStdinJson, projectRoot, loadConfig, relPath, audit, activeItems, serviceOf, context,
} from './lib.mjs';

const MANIFEST = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.json|composer\.lock|go\.mod|go\.sum|requirements[\w.-]*\.txt|pyproject\.toml|poetry\.lock|Pipfile|Gemfile|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?)$/;

function depsReport(root, cfg, rel) {
  const svc = serviceOf(cfg, rel);
  if (!svc) return;
  const items = activeItems(root).filter((i) => i.status === 'in-progress' && (i.services.includes(svc) || i.services.includes('*')));
  if (!items.length) return;
  const repoDir = cfg.layout === 'multi-repo' ? path.join(root, cfg.services_dir, svc) : root;
  const inner = cfg.layout === 'multi-repo' ? rel.split('/').slice(2).join('/') : rel;
  const r = spawnSync('git', ['diff', '-U0', '--', inner], { cwd: repoDir, encoding: 'utf8' });
  const lines = (r.stdout || '').split('\n').filter((l) => /^[+-][^+-]/.test(l)).slice(0, 40);
  if (!lines.length) return;
  const out = path.join(items[0].dir, 'deps-report.md');
  const head = fs.existsSync(out) ? '' : '# Laporan perubahan dependency (otomatis, dari hook)\n\nTinjau di review.md: apakah dependency baru memang perlu?\n';
  fs.appendFileSync(out, `${head}\n## ${new Date().toISOString()} — ${rel}\n\`\`\`diff\n${lines.join('\n')}\n\`\`\`\n`);
}

function contextWarn(root, cfg, payload) {
  const tp = payload.transcript_path;
  if (!tp || !fs.existsSync(tp)) return null;
  const stateDir = path.join(root, '.claude', 'state');
  const mark = path.join(stateDir, `ctx-${String(payload.session_id || 'x').replace(/\W/g, '')}.json`);
  const size = fs.statSync(tp).size;
  const fd = fs.openSync(tp, 'r');
  const len = Math.min(size, 262144);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n').reverse();
  let tokens = 0;
  for (const l of lines) {
    if (!l.includes('"usage"')) continue;
    try {
      const u = JSON.parse(l)?.message?.usage;
      if (u) { tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); break; }
    } catch { /* baris terpotong */ }
  }
  if (tokens < cfg.context.warn_tokens) return null;
  const prev = (() => { try { return JSON.parse(fs.readFileSync(mark, 'utf8')); } catch { return {}; } })();
  if (prev.warned && tokens - prev.warned < 100000) return null;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(mark, JSON.stringify({ warned: tokens }));
  return `[harness] Konteks sesi ±${Math.round(tokens / 1000)}k token (ambang ${Math.round(cfg.context.warn_tokens / 1000)}k dari ${Math.round(cfg.context.window_tokens / 1000)}k). ` +
    'Segera: tulis status terkini ke progress.md (apa selesai, apa berikutnya, keputusan), selesaikan langkah yang sedang jalan, lalu sarankan user membuka sesi baru dan melanjutkan dengan /harness:build <slug>.';
}

const payload = await readStdinJson();
const root = projectRoot(payload);
const cfg = loadConfig(root);
const ev = payload.hook_event_name;
const input = payload.tool_input || {};

if (ev === 'InstructionsLoaded') {
  audit(root, { event: ev, session: payload.session_id, file: payload.file_path, reason: payload.load_reason, memory_type: payload.memory_type });
  process.exit(0);
}
const target = input.file_path || input.notebook_path || input.command || input.pattern || '';
audit(root, { event: ev, session: payload.session_id, tool: payload.tool_name, target });

try {
  const rel = relPath(root, input.file_path || '');
  if (rel && MANIFEST.test(rel) && /^(Edit|Write|MultiEdit)$/.test(payload.tool_name)) depsReport(root, cfg, rel);
} catch { /* abaikan */ }

try {
  const w = contextWarn(root, cfg, payload);
  if (w) context('PostToolUse', w);
} catch { /* abaikan */ }
process.exit(0);
