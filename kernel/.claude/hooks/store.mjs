// WorkStore: satu-satunya pintu baca/tulis work item untuk CLI dan hook baru. Backend aktif dipilih lewat config.store.backend.
// Sekarang hanya 'local' (docs/work/<slug>/plan.md). Backend lain mendaftar lewat registerBackend() tanpa mengubah pemanggil.
// Antarmuka: { backend, list(), get(slug), resolve(query), setStatus(item, to, extra) }
import fs from 'node:fs';
import { listItems, readItem, resolveSlug, setFmKey, audit } from './lib.mjs';

const today = () => new Date().toISOString().slice(0, 10);

function localStore(root) {
  return {
    backend: 'local',
    list: () => listItems(root),
    get: (slug) => readItem(root, slug),
    resolve: (q) => resolveSlug(root, q),
    // Menulis status + updated (+ kunci tambahan) ke frontmatter plan.md. Pemeriksaan transisi dilakukan pemanggil (checkTransition).
    setStatus(item, to, extra = {}) {
      let t = fs.readFileSync(item.planPath, 'utf8');
      t = setFmKey(t, 'status', to);
      t = setFmKey(t, 'updated', today());
      for (const [k, v] of Object.entries(extra)) t = setFmKey(t, k, v);
      fs.writeFileSync(item.planPath, t);
      audit(root, { event: 'status', slug: item.slug, from: item.status, to });
    },
  };
}

const backends = { local: localStore };
export const registerBackend = (name, factory) => { backends[name] = factory; };

export function getStore(root, cfg) {
  const name = (cfg && cfg.store && cfg.store.backend) || 'local';
  const make = backends[name];
  if (!make) throw new Error(`store.backend "${name}" tidak dikenal (tersedia: ${Object.keys(backends).join(', ')}).`);
  return make(root, cfg);
}
