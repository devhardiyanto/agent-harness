// PostToolUse (hanya Edit/Write/MultiEdit/NotebookEdit/Bash) / InstructionsLoaded: audit log JSONL, laporan diff manifest dependency, peringatan ambang konteks.
// Tidak pernah memblokir.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  readStdinJson, projectRoot, loadConfig, relPath, audit, activeItems, serviceOf, context, contextWarning, markTouched,
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
// 1.19.2: agent yang menjalankan tool (subagent membawa agent_type/agent_id), bukti uji M0 nomor 2 dan dasar bidang.enforce
const agent = payload.agent_type || payload.agent_name || payload.subagent_type || undefined;
audit(root, { event: ev, session: payload.session_id, tool: payload.tool_name, target, agent, agent_id: payload.agent_id || undefined });

// Catat item yang disentuh sesi ini: tulis ke docs/work/<slug>/..., atau perintah shell yang menyebut slug (mis. run-checks <slug>).
try {
  const slugs = new Set();
  const m = /^docs\/work\/([^/]+)\//.exec(relPath(root, input.file_path || input.notebook_path || ''));
  if (m && m[1] !== '_TEMPLATE') slugs.add(m[1]);
  if (/^(Bash|PowerShell)$/.test(payload.tool_name)) for (const t of String(input.command || '').match(/\d{4}-\d{2}-\d{2}-[\w.-]+/g) || []) slugs.add(t.replace(/[.-]+$/, ''));
  if (slugs.size) markTouched(root, payload.session_id, [...slugs]);
} catch { /* abaikan */ }
// 1.21.0: topik yang ditulis sesi ini (docs/topics/<slug>.md) atau dibuat lewat "harness.mjs topic new/promote"
try {
  const rel = relPath(root, input.file_path || input.notebook_path || '');
  const tm = /^docs\/topics\/([^/]+)\.md$/.exec(rel);
  const { markTopic } = await import('./topic.mjs');
  if (tm && !tm[1].startsWith('_')) markTopic(root, payload.session_id, tm[1]);
  const out = String((payload.tool_response && (payload.tool_response.stdout || payload.tool_response.output)) || '');
  const bm = /^(Bash|PowerShell)$/.test(payload.tool_name) && /harness\.mjs\s+topic\s+new\b/.test(String(input.command || '')) ? /docs\/topics\/([\w.-]+)\.md/.exec(out) : null;
  if (bm) markTopic(root, payload.session_id, bm[1]);
  // 1.22.3: tiket "item baru"/"jadikan item" habis setelah item benar-benar dibuat
  if (/^(Bash|PowerShell)$/.test(payload.tool_name) && /harness\.mjs\s+(new|topic\s+promote)\b/.test(String(input.command || '')) && /docs\/work\/\d{4}-/.test(out)) {
    const { newItemTicketPath } = await import('./lib.mjs');
    fs.rmSync(newItemTicketPath(root, payload.session_id), { force: true });
  }
} catch { /* abaikan */ }

try {
  const rel = relPath(root, input.file_path || '');
  if (rel && MANIFEST.test(rel) && /^(Edit|Write|MultiEdit)$/.test(payload.tool_name)) depsReport(root, cfg, rel);
} catch { /* abaikan */ }

try {
  const w = contextWarning(root, cfg, payload);
  if (w) context('PostToolUse', w);
} catch { /* abaikan */ }
process.exit(0);
