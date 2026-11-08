// Intent tanpa slash (1.10.0): kalimat pendek yang DIKETIK MANUSIA dipetakan ke perintah kanonik, supaya tidak harus hafal
// perintah slash. Dipanggil hanya dari hook UserPromptSubmit (prompt = ketikan user), jadi tingkat kepercayaannya sama dengan
// slash command. Konservatif: hanya prompt pendek (intent.max_chars) yang SELURUHNYA cocok pola; perintah yang butuh slug
// hanya berlaku bila slug cocok tepat satu item. Selain itu prompt diteruskan sebagai chat biasa.
//   setuju <slug> | approve <slug> | acc <slug>                 → /harness:approve <slug>
//   align ok <slug> [terima C2,C3|semua] | sepaham <slug>       → /harness:align <slug> ok [terima ...]
//   kirim <slug> | ship <slug> | merge <slug>                   → /harness:ship <slug>
//   quick: <permintaan> | cepat: <permintaan>                    → /harness:quick <permintaan>
//   sisa | lanjut | next | yang belum selesai | apa selanjutnya? → tabel "belum selesai"
//   ingat: <fakta> | ingat P1,P2 | ingat semua | lupakan M2      → memori project
//   ref:<slug> (di mana pun dalam prompt, maks 3)               → ringkasan item dimuat sebagai konteks
const SLUG = '([\\w][\\w.\\-]*)';
const ACC = '(?:\\s+terima\\s+(semua|all|C\\d+(?:\\s*,\\s*C\\d+)*))?';

export function parseIntent(prompt, cfg, resolve) {
  const raw = String(prompt || '');
  const refs = [...raw.matchAll(/(?:^|\s)ref:([\w][\w.\-]*)/gi)].map((m) => m[1]).slice(0, 3);
  if (!cfg.intent.enabled) return { refs: [] };
  const t = raw.trim().replace(/[.!]+$/, '');
  if (t.startsWith('/') || t.length > cfg.intent.max_chars) return { refs };
  const ok = (s) => (s && resolve(s) ? resolve(s) : null);
  let m;
  if ((m = new RegExp(`^(?:setuju|approve|acc)\\s+(?:plan\\s+)?${SLUG}$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:approve ${ok(m[1])}`, refs };
  if ((m = new RegExp(`^(?:align\\s+ok|sepaham|objective\\s+(?:ok|oke))\\s+${SLUG}${ACC}$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:align ${ok(m[1])} ok${m[2] ? ` terima ${m[2]}` : ''}`, refs };
  if ((m = new RegExp(`^(?:kirim|ship|merge)\\s+${SLUG}$`, 'i').exec(t)) && ok(m[1])) return { command: `/harness:ship ${ok(m[1])}`, refs };
  if ((m = /^(?:quick|cepat)\s*:\s*(.{4,})$/is.exec(t))) return { command: `/harness:quick ${m[1].trim()}`, refs };
  if (/^(?:sisa(?:nya)?|lanjut|next|todo|apa\s+(?:lagi|selanjutnya)|(?:yang\s+)?belum\s+selesai(?:\s+apa)?|yang\s+belum)\s*\??$/i.test(t)) return { kind: 'open', refs };
  if ((m = /^(?:ingat|remember)\s*:\s*(.+)$/is.exec(t))) return { kind: 'remember', text: m[1].trim(), refs };
  if ((m = /^(?:ingat|remember)\s+(semua|all|P\d+(?:\s*,\s*P\d+)*)$/i.exec(t))) return { kind: 'remember-approve', ids: /^(semua|all)$/i.test(m[1]) ? 'all' : m[1].toUpperCase().split(/\s*,\s*/), refs };
  if ((m = /^(?:lupakan|forget)\s+(M?\d+)$/i.exec(t))) return { kind: 'forget', key: m[1], refs };
  return { refs };
}
