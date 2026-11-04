// Bukti test yang ditulis KODE (bukan agent): .harness/evidence/<slug>/tests.json. Dipakai gerbang Stop.
// Agent `runner` hanya memanggil `harness.mjs run-checks <slug>`; berkas ini dilindungi dari Edit/Write dan tulis lewat shell.
import fs from 'node:fs';
import path from 'node:path';
import { evidenceDir, codeFingerprint, redact } from './lib.mjs';
import { runGate } from './delivery.mjs';

export function recordEvidence(root, cfg, item, g) {
  const checks = (g.checks || []).map((c) => ({ ...c, note: redact(c.note) }));
  const verdict = !checks.length ? 'unchecked' : checks.some((c) => !c.ok) ? 'fail' : 'pass';
  const doc = { schema: 1, slug: item.slug, generated: new Date().toISOString(), code_fingerprint: codeFingerprint(root, cfg, item), verdict, checks, gate: g.verdict };
  const dir = evidenceDir(root, item.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tests.json'), JSON.stringify(doc, null, 2) + '\n');
  return doc;
}

export function runChecks(root, cfg, item, opts = {}) {
  const g = runGate(root, cfg, item, opts);
  return { gate: g, evidence: recordEvidence(root, cfg, item, g) };
}
