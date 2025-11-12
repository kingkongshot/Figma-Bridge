export type SharedClass = {
  name: string;
  props: Record<string, string>;
  usage: number;
};

const WHITELIST = new Set([
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-decoration',
  'color', 'opacity',
  'background', 'background-color',
  'border', 'border-radius', 'box-shadow',
  // Effects-like tokens
  'filter', 'backdrop-filter', '-webkit-backdrop-filter',
]);

function parseCss(css: string): [key: string, value: string][] {
  if (!css) return [];
  const tokens = css.split(';').map(s => s.trim()).filter(Boolean);
  const out: [string, string][] = [];
  for (const t of tokens) {
    const idx = t.indexOf(':');
    if (idx <= 0) continue;
    const k = t.slice(0, idx).trim().toLowerCase();
    const v = t.slice(idx + 1).trim();
    if (!k || !v) continue;
    out.push([k, v]);
  }
  return out;
}

function normalizeWhitelistProps(css: string): Record<string, string> {
  const entries = parseCss(css);
  const map: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!WHITELIST.has(k)) continue;
    map[k] = v; // last-wins
  }
  return map;
}

function stableKey(obj: Record<string, string>): string {
  const keys = Object.keys(obj).sort();
  return keys.map(k => `${k}:${obj[k]}`).join(';');
}

function fnv1a(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export function buildSharedClasses(
  boxCssList: string[],
  minRepeat = 3
): { classes: SharedClass[]; applier: (css: string) => { className: string | null; newCss: string } } {
  const freq = new Map<string, { props: Record<string, string>; count: number }>();
  for (const css of boxCssList) {
    const props = normalizeWhitelistProps(css);
    const key = stableKey(props);
    if (!key) continue;
    const cur = freq.get(key);
    if (cur) cur.count++; else freq.set(key, { props, count: 1 });
  }
  const classes: SharedClass[] = [];
  freq.forEach((entry, key) => {
    if (entry.count >= minRepeat) {
      classes.push({ name: `fr-${fnv1a(key).slice(0, 6)}`, props: entry.props, usage: entry.count });
    }
  });

  // Fast map for applier
  const keyToName = new Map<string, string>();
  classes.forEach(c => keyToName.set(stableKey(c.props), c.name));

  function applier(css: string): { className: string | null; newCss: string } {
    if (!css) return { className: null, newCss: '' };
    const props = normalizeWhitelistProps(css);
    const key = stableKey(props);
    const cls = key ? keyToName.get(key) || null : null;
    if (!cls) return { className: null, newCss: css };

    // Remove whitelisted keys from inline css
    const tokens = parseCss(css);
    const kept: string[] = [];
    for (const [k, v] of tokens) {
      if (WHITELIST.has(k)) continue;
      kept.push(`${k}:${v};`);
    }
    return { className: cls, newCss: kept.join('') };
  }

  return { classes, applier };
}

export function generateClassCss(classes: SharedClass[], scope: string = '[data-figma-render]'): string {
  if (!classes.length) return '';
  return classes
    .map(c => {
      const body = Object.keys(c.props)
        .sort()
        .map(k => `${k}:${c.props[k]}`)
        .join(';');
      return `${scope} .${c.name}{${body}}`;
    })
    .join('\n');
}
