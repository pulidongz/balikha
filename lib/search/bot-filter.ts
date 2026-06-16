// Heuristic classifier for bot/scanner search queries (ticket #114). No IP/UA
// is available (search_events stores none), so this is content/shape-based.
// Real shopper queries are short and few-token ("blue stoneware vase");
// scanner payloads are long, many-token, and carry SQL/script signatures.
// Tuned conservatively — when unsure, return false (keep the row in analytics).

const MAX_HUMAN_LENGTH = 80; // chars; real searches are far shorter
const MAX_HUMAN_TOKENS = 12; // whitespace-separated words

// Case-insensitive signatures of SQLi / script-injection probes. Each must
// carry real discriminating power — bare single keywords do NOT (see the
// false-positive guards in the check script). `\b` keeps "selection" from
// matching "select".
const SIGNATURES: RegExp[] = [
  /\bselect\b.*\bfrom\b/i,
  /\bunion\b.*\bselect\b/i,
  // DML keywords ONLY when paired with their SQL companion, so real product
  // terms survive: "drop earrings", "drop spindle", "insert clay",
  // "update to my order", "delete this" are NOT flagged.
  /\b(insert\s+into|delete\s+from|update\s+\w+\s+set|drop\s+(table|database)|alter\s+table|truncate\s+table)\b/i,
  /\b(concat|char|cast|convert|sleep|benchmark|waitfor)\s*\(/i,
  /0x[0-9a-f]{4,}/i, // hex blobs
  // Comment markers tightened: `--`/`#` immediately after a quote/paren/digit
  // (the SQLi tail shape), or a complete /* */ block. Avoids the human
  // double-hyphen in "bowl -- gift".
  /['")\d]\s*(--|#)|\/\*[\s\S]*?\*\//,
  /<script|javascript:|onerror\s*=/i, // XSS probes
  /\b(or|and)\b\s+\d+\s*=\s*\d+/i, // boolean-based: " or 1=1"
];

export function isLikelyBotQuery(raw: string): boolean {
  const q = raw.trim();
  if (q.length > MAX_HUMAN_LENGTH) return true;
  if (q.split(/\s+/).filter(Boolean).length > MAX_HUMAN_TOKENS) return true;
  return SIGNATURES.some((re) => re.test(q));
}
