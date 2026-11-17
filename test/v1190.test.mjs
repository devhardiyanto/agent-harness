// 1.19.0: salinan antislop terpasang tanpa kode pihak ketiga; config; baris gate untuk item frontend.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { project, hx, wr, rd, jr } from './helpers.mjs';

delete process.env.HARNESS_ITEM_BENTUK;

test('pasang: enam skill antislop + lisensi terpasang; tanpa skrip Python, tanpa izin Bash, tanpa petunjuk installer hulu', () => {
  const root = project({ v1: true });
  const sk = path.join(root, '.claude/skills');
  const ds = fs.readdirSync(sk).filter((d) => d.startsWith('antislop')).sort();
  assert.deepEqual(ds, ['antislop', 'antislop-code', 'antislop-copywriting', 'antislop-human', 'antislop-layoutmobile', 'antislop-ui']);
  assert.ok(fs.existsSync(path.join(sk, 'antislop/LICENSE')));
  assert.ok(fs.existsSync(path.join(sk, 'antislop-human/LICENSE-web-quality-skills')));
  const all = ds.flatMap((d) => fs.readdirSync(path.join(sk, d), { recursive: true }).map((f) => path.join(d, String(f))));
  assert.equal(all.filter((f) => /\.(py|js|mjs|sh)$/.test(f)).length, 0);
  const core = rd(root, '.claude/skills/antislop/SKILL.md');
  assert.doesNotMatch(core, /Already installed, and the user asks how to update|APPDATA|npx /);
  assert.match(core, /antislop\.mode` in `harness\.config\.json/);
  assert.doesNotMatch(rd(root, '.claude/skills/antislop-human/SKILL.md'), /^allowed-tools:.*Bash/m);
  assert.deepEqual(jr(root, 'harness.config.json').antislop, { enabled: true, mode: 'during' });
});

test('gate: item frontend mendapat baris antislop (TIDAK DIPERIKSA bila tinjauan tidak menyebutnya, PASS bila mengutip R-xx); item backend tidak', () => {
  const root = project({ v1: true });
  const mk = (title, svc) => {
    const slug = hx(root, 'new', 'feature', title).stdout.trim().split('/').pop();
    const p = `docs/work/${slug}/plan.md`;
    wr(root, p, rd(root, p).replace('status: draft', 'status: in-review').replace('services: []', `services: [${svc}]`).replace('<!-- AC bernomor, ditulis setelah aligned: - AC1: ... (yang bisa dibuktikan) -->', '- AC1: tombol tampil').replace('<!-- satu baris per AC: - AC1: output nyata / langkah + hasil -->', '- AC1: diperiksa manual di 390px, tombol tampil').replace('verdict: pending', 'verdict: clean'));
    return slug;
  };
  const fe = mk('Tombol simpan', 'web'); const be = mk('Endpoint simpan', 'api');
  hx(root, 'gate', fe);
  assert.match(rd(root, `docs/work/${fe}/gate.md`), /\| antislop \(UI\) \| TIDAK DIPERIKSA \|/);
  const p = `docs/work/${fe}/plan.md`;
  wr(root, p, rd(root, p).replace('verdict: clean', 'verdict: clean\nantislop: R-17 dan R-32 dicek, bersih'));
  hx(root, 'gate', fe);
  assert.match(rd(root, `docs/work/${fe}/gate.md`), /\| antislop \(UI\) \| PASS \|/);
  hx(root, 'gate', be);
  assert.doesNotMatch(rd(root, `docs/work/${be}/gate.md`), /antislop/);
});
