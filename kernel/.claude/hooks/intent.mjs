// Intent tanpa slash (1.10.0): kalimat pendek yang DIKETIK MANUSIA dipetakan ke perintah kanonik, supaya tidak harus hafal
// perintah slash. Dipanggil hanya dari hook UserPromptSubmit (prompt = ketikan user), jadi tingkat kepercayaannya sama dengan
// slash command. Konservatif: hanya prompt pendek (intent.max_chars) yang SELURUHNYA cocok pola; perintah yang butuh slug
// hanya berlaku bila slug cocok tepat satu item. Selain itu prompt diteruskan sebagai chat biasa.
//   setuju <slug> | approve <slug> | acc <slug>                 → /harness:approve <slug>
//   align ok <slug> [terima C2,C3|semua] | sepaham <slug>       → /harness:align <slug> ok [terima ...]
//   push PR + merge [slug] | kirim [slug] | ship [slug]         → /harness:ship <slug> (PR, merge saat hijau, ringkasan);
//                                                                  tanpa slug = satu-satunya item berstatus done
//   quick: <permintaan> | cepat: <permintaan>                    → /harness:quick <permintaan>
//   keputusan [slug] | apa yang harus aku jawab?              → tabel keputusan align (dibuat kode)
//   sisa | lanjut | next | yang belum selesai | apa selanjutnya? → tabel "belum selesai"
//   ingat: <fakta> | ingat P1,P2 | ingat semua | lupakan M2      → memori project
//   ingat user: <preferensi> | lupakan U2                       → profil user (per orang, ~/.harness/USER.md)
//   ref:<slug> (di mana pun dalam prompt, maks 3)               → ringkasan item dimuat sebagai konteks
//   bukan itu | salah tangkap (1.13)                            → intent terakhir ditandai salah tangkap (+ dibatalkan bila bisa)
//   kerjakan <slug> | verifikasi knowledge <svc> | terapkan pola <slug> <P1|semua> (1.15)
//   tarik | tarik plane | cek plane (1.13)                       → tarik komentar/checklist Plane ke cermin lokal
const SLUG = '([\\w][\\w.\\-]*)';
const ACC = '(?:\\s+terima\\s+(semua|all|C\\d+(?:\\s*,\\s*C\\d+)*))?';

export function parseIntent(prompt, cfg, resolve, soleDone = () => null) {
  const raw = String(prompt || '');
  const refs = [...raw.matchAll(/(?:^|\s)ref:([\w][\w.\-]*)/gi)].map((m) => m[1]).slice(0, 3);
  if (!cfg.intent.enabled) return { refs: [] };
  const t = raw.trim().replace(/[.!]+$/, '');
  if (t.startsWith('/') || t.length > cfg.intent.max_chars) return { refs };
  const ok = (s) => (s && resolve(s) ? resolve(s) : null);
  let m;
  if ((m = new RegExp(`^(?:setuju|approve|acc)\\s+(?:plan\\s+)?${SLUG}$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:approve ${ok(m[1])}`, refs };
  if ((m = new RegExp(`^(?:align\\s+ok|sepaham|objective\\s+(?:ok|oke))\\s+${SLUG}${ACC}$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:align ${ok(m[1])} ok${m[2] ? ` terima ${m[2]}` : ''}`, refs };
  if ((m = new RegExp(`^(?:push\\s+pr\\s*(?:\\+|&|dan|and|lalu)\\s*merge|pr\\s*(?:\\+|&|dan)\\s*merge|kirim|ship|merge)(?:\\s+${SLUG})?$`, 'i').exec(t))) {
    const sl = m[1] ? ok(m[1]) : soleDone();
    if (sl) return { command: `/harness:ship ${sl}`, refs };
  }
  // 1.15.0: pengganti slash yang dulu belum punya kalimat pendek
  if ((m = new RegExp(`^(?:kerjakan|bangun|build|lanjut(?:kan)?)\\s+${SLUG}$`, 'i').exec(t)) && ok(m[1])) return { kind: 'build', slug: ok(m[1]), refs };
  if ((m = /^(?:verifikasi|verify)\s+(?:knowledge\s+)?([\w.\-]+)$/i.exec(t)) && (cfg.services || []).includes(m[1])) return { command: `/harness:knowledge verify ${m[1]}`, refs };
  if ((m = new RegExp(`^(?:terapkan|setujui)\\s+pola\\s+${SLUG}\\s+(all|semua|P\\d+(?:\\s*,\\s*P\\d+)*)$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:knowledge patterns ${ok(m[1])} ${/^semua$/i.test(m[2]) ? 'all' : m[2]}`, refs };
  if ((m = /^(?:quick|cepat)\s*:\s*(.{4,})$/is.exec(t))) return { command: `/harness:quick ${m[1].trim()}`, refs };
  if ((m = new RegExp(`^(?:keputusan|tabel\\s+keputusan|apa\\s+yang\\s+(?:harus|perlu)\\s+(?:aku|saya)\\s+jawab)(?:\\s+${SLUG})?\\s*\\??$`, 'i').exec(t))) return { kind: 'decide', slug: m[1] ? ok(m[1]) : null, refs };
  if (/^(?:menu|\?|lalu\s+apa|terus\s+apa)\s*\??$/i.test(t)) return { kind: 'menu', refs };
  if (/^(?:sisa(?:nya)?|lanjut|next|todo|apa\s+(?:lagi|selanjutnya)|(?:yang\s+)?belum\s+selesai(?:\s+apa)?|yang\s+belum)\s*\??$/i.test(t)) return { kind: 'open', refs };
  if ((m = /^(?:ingat|remember)\s+(?:user|aku|saya|me)\s*:\s*(.+)$/is.exec(t))) return { kind: 'remember', target: 'user', text: m[1].trim(), refs };
  if ((m = /^(?:ingat|remember)\s*:\s*(.+)$/is.exec(t))) return { kind: 'remember', target: 'memory', text: m[1].trim(), refs };
  if ((m = /^(?:ingat|remember)\s+(semua|all|P\d+(?:\s*,\s*P\d+)*)$/i.exec(t))) return { kind: 'remember-approve', ids: /^(semua|all)$/i.test(m[1]) ? 'all' : m[1].toUpperCase().split(/\s*,\s*/), refs };
  if ((m = /^(?:lupakan|forget)\s+([MU]?\d+)$/i.exec(t))) return { kind: 'forget', key: m[1].toUpperCase(), refs };
  if (/^(?:bukan\s+itu(?:\s+maksud(?:ku|nya))?|salah\s+tangkap|bukan\s+begitu)\s*$/i.test(t)) return { kind: 'misfire', refs };
  if ((m = new RegExp(`^(?:tarik(?:\\s+plane)?|cek\\s+plane|sync\\s+plane)(?:\\s+${SLUG})?$`, 'i').exec(t))) return { kind: 'pull', slug: m[1] ? ok(m[1]) : null, refs };
  return { refs };
}
