// Pengukuran baseline: token per model, panggilan tool/subagent, dan durasi dari transcript Claude Code (.jsonl).
// Hanya membaca; dipakai membandingkan sesi sebelum/sesudah model routing. Tidak ada angka tertanam: semua dari transcript.
import fs from 'node:fs';

const family = (m) => (/opus/i.test(m) ? 'opus' : /sonnet/i.test(m) ? 'sonnet' : /haiku/i.test(m) ? 'haiku' : m || 'tidak-diketahui');

export function measureTranscript(file) {
  const models = {}; const tools = {}; let first = null; let last = null; let turns = 0; let sidechainTurns = 0;
  const seen = new Set(); // satu respons dapat tercatat di beberapa baris (per blok konten): hitung usage sekali per message.id
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.timestamp) { const t = Date.parse(e.timestamp); if (!Number.isNaN(t)) { first = first === null ? t : Math.min(first, t); last = last === null ? t : Math.max(last, t); } }
    const msg = e.message;
    if (e.type !== 'assistant' || !msg) continue;
    for (const c of Array.isArray(msg.content) ? msg.content : []) if (c && c.type === 'tool_use') tools[c.name] = (tools[c.name] || 0) + 1;
    const id = msg.id || e.uuid;
    if (!msg.usage || seen.has(id)) continue;
    seen.add(id);
    const m = models[family(msg.model)] ||= { turns: 0, input: 0, output: 0, cache_read: 0, cache_write: 0 };
    const u = msg.usage;
    m.turns++; m.input += u.input_tokens || 0; m.output += u.output_tokens || 0; m.cache_read += u.cache_read_input_tokens || 0; m.cache_write += u.cache_creation_input_tokens || 0;
    turns++; if (e.isSidechain) sidechainTurns++;
  }
  const subagentCalls = (tools.Task || 0) + (tools.Agent || 0);
  return { turns, sidechain_turns: sidechainTurns, duration_sec: first !== null ? Math.round((last - first) / 1000) : 0, models, tools, subagent_calls: subagentCalls, opus_turns: models.opus ? models.opus.turns : 0 };
}

export function formatMetrics(m) {
  const rows = Object.entries(m.models).map(([k, v]) => `| ${k} | ${v.turns} | ${v.input} | ${v.output} | ${v.cache_read} | ${v.cache_write} |`);
  return `| model | giliran | input | output | cache baca | cache tulis |\n|---|---|---|---|---|---|\n${rows.join('\n') || '| - | 0 | 0 | 0 | 0 | 0 |'}\n\ngiliran: ${m.turns} (subagent: ${m.sidechain_turns}) · panggilan subagent: ${m.subagent_calls} · giliran Opus: ${m.opus_turns} · durasi: ${m.duration_sec}s\ntool: ${Object.entries(m.tools).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`;
}
