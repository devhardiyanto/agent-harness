// 1.13.0: persiapan 2.0. checkV2 = apa yang masih menghalangi 2.0 di root ini; fixAlign = migrasi otomatis align.md format
// lama (hanya klaim) dengan menambahkan bagian "## Keputusan terbuka" (D10: otomatis, hanya menambah, tidak mengubah isi).
import fs from 'node:fs';
import path from 'node:path';
import { listItems, DEFAULT_CONFIG, readJson } from './lib.mjs';

const DEC_SECTION = '## Keputusan terbuka\n| # | pertanyaan | opsi | jawaban |\n|---|---|---|---|\n';
const oldAlign = (it) => {
  const p = path.join(it.dir, 'align.md'); // bentuk tunggal (1.16) tidak punya align.md: tidak pernah "format lama"
  return fs.existsSync(p) && !/^##\s+Keputusan terbuka/m.test(fs.readFileSync(p, 'utf8')) ? p : null;
};

export function fixAlign(root) {
  const fixed = [];
  for (const it of listItems(root)) {
    const p = oldAlign(it); if (!p) continue;
    let t = fs.readFileSync(p, 'utf8');
    t = /^##\s+Debat/m.test(t) ? t.replace(/^##\s+Debat/m, `${DEC_SECTION}\n## Debat`) : `${t.replace(/\s*$/, '')}\n\n${DEC_SECTION}`;
    fs.writeFileSync(p, t); fixed.push(it.slug);
  }
  return fixed;
}

// Flag yang di 2.0 dikunci (D7: tetap ada sebagai escape hatch, tetapi nilai non-bawaan dilaporkan).
const LOCKED = [['align', 'decision_table'], ['align', 'block_plan_before_aligned'], ['recap', 'enabled'], ['intent', 'enabled']];

export function checkV2(root, cfg) {
  const rows = [];
  const old = listItems(root).filter(oldAlign).map((i) => i.slug);
  rows.push(['align.md format lama', old.length ? `${old.length} item` : 'tidak ada', old.length ? 'migrate --apply (otomatis di awal sesi)' : '-', !old.length]);
  const off = LOCKED.filter(([a, b]) => cfg[a][b] !== DEFAULT_CONFIG[a][b]).map(([a, b]) => `${a}.${b}`);
  rows.push(['flag yang dikunci di 2.0', off.length ? off.join(', ') : 'semua bawaan', off.length ? 'kembalikan ke bawaan di harness.config.json' : '-', !off.length]);
  // 1.23.0 (R1, D37): Plane dicabut. Sisa konfigurasi lama dilaporkan sebagai info (tidak menghalangi).
  const u = readJson(path.join(root, 'harness.config.json'), {}) || {};
  if (u.plane) rows.push(['kunci "plane" di harness.config.json', 'ada (diabaikan sejak 1.23.0)', 'boleh dihapus manual; data .harness/plane/ juga boleh dihapus', true]);
  return { rows, ready: rows.every((r) => r[3]) };
}

export function formatV2(r) {
  return ['| periksa | keadaan | tindakan | status |', '|---|---|---|---|', ...r.rows.map((x) => `| ${x[0]} | ${x[1]} | ${x[2]} | ${x[3] ? 'OK' : 'BELUM'} |`),
    r.ready ? 'Root ini siap untuk 2.0.' : 'Root ini belum siap untuk 2.0.'].join('\n');
}
