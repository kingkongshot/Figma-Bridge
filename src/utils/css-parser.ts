// Simple CSS parsing helpers extracted from renderer paths.
// Keep them pure and reusable across modules.

/**
 * Split a CSS box-shadow list by commas, respecting parentheses nesting.
 */
export function splitShadowList(s: string): string[] {
  const out: string[] = [];
  if (!s) return out;
  let cur = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') { depth++; cur += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Split class tokens by whitespace, preserving bracketed contents like outline-[rgb(0,0,0)].
 */
export function splitClassTokens(s: string): string[] {
  const tokens: string[] = [];
  if (!s) return tokens;
  let current = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    if (ch === ']') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

