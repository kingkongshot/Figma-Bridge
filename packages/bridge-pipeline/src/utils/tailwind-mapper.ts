import type { LayoutInfo, LayoutCssOmit } from '../pipeline/types';

export type UtilityMapResult = {
  classNames: string[];
  remainingCss: string;
};

export type LayoutMapResult = UtilityMapResult & {
  omitFromInline: LayoutCssOmit;
};

export type ClassStrategy = 'conservative' | 'aggressive';

type Entry = [key: string, value: string];

function parseCssEntries(css: string): Entry[] {
  if (!css) return [];
  const out: Entry[] = [];
  const parts = css.split(';');
  for (const raw of parts) {
    const t = raw.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim().toLowerCase();
    const v = t.slice(i + 1).trim();
    if (!k || !v) continue;
    out.push([k, v]);
  }
  return out;
}

function stringifyCss(entries: Entry[]): string {
  return entries.map(([k, v]) => `${k}:${v};`).join('');
}

// Pure helper functions (extracted for testability)
function parsePx(v: string): number | null {
  const m = v.trim().match(/^(-)?(\d+(?:\.\d+)?)px$/i);
  if (!m) return null;
  const num = parseFloat(m[2]);
  return m[1] ? -num : num;
}

function normalizeOpacity(v: string): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return String(parseFloat(n.toFixed(3)));
}

function normalizeZIndex(v: string): string | null {
  const raw = v.trim();
  if (!/^-?\d+$/.test(raw)) return null;
  return raw;
}

function normalizeHexColor(hex: string): string | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{3,8})$/);
  if (!m) return null;
  const h = m[1].toLowerCase();
  if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  if (h.length === 4) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  if (h.length === 6 || h.length === 8) return `#${h}`;
  return null;
}

function normalizeFuncColor(v: string): string | null {
  const m = v.trim().match(/^(rgba?)\(([^)]+)\)$/i);
  if (!m) return null;
  const fn = m[1].toLowerCase();
  const args = m[2].split(',').map(s => s.trim()).filter(Boolean).join(',');
  if (!args) return null;
  return `${fn}(${args})`;
}

function normalizeColor(v: string): string | null {
  return normalizeHexColor(v) ?? normalizeFuncColor(v);
}

function pxToScale(n: number): string | null {
  const scaled = n / 4;
  const s2 = Math.round(scaled * 2);
  if (Math.abs(scaled * 2 - s2) < 1e-6) {
    const val = s2 / 2;
    return Number.isInteger(val) ? String(val) : String(val);
  }
  return null;
}

function isNonNegative(n: number | null): n is number {
  return typeof n === 'number' && isFinite(n) && n >= 0;
}

function isAnyNumber(n: number | null): n is number {
  return typeof n === 'number' && isFinite(n);
}

type SpacingTuple = { t: number; r: number; b: number; l: number } | null;

function parseSpacing(value: string): SpacingTuple {
  const parts = value.split(/\s+/).filter(Boolean).map(parsePx);
  if (parts.length === 1 && parts[0] !== null) {
    const v = parts[0];
    return { t: v, r: v, b: v, l: v };
  }
  if (parts.length === 2 && parts[0] !== null && parts[1] !== null) {
    return { t: parts[0], r: parts[1], b: parts[0], l: parts[1] };
  }
  if (parts.length === 4 && parts.every(p => p !== null)) {
    return { t: parts[0]!, r: parts[1]!, b: parts[2]!, l: parts[3]! };
  }
  return null;
}

function genPaddingClasses(s: SpacingTuple, hasScale: boolean): string[] {
  if (!s || hasScale) return [];
  const { t, r, b, l } = s;
  if (t < 0 || r < 0 || b < 0 || l < 0) return [];
  if (t === r && r === b && b === l) return t !== 0 ? [`p-[${t}px]`] : [];
  if (t === b && r === l) {
    const out: string[] = [];
    if (t !== 0) out.push(`py-[${t}px]`);
    if (r !== 0) out.push(`px-[${r}px]`);
    return out;
  }
  const out: string[] = [];
  if (t !== 0) out.push(`pt-[${t}px]`);
  if (r !== 0) out.push(`pr-[${r}px]`);
  if (b !== 0) out.push(`pb-[${b}px]`);
  if (l !== 0) out.push(`pl-[${l}px]`);
  return out;
}

function genMarginClasses(s: SpacingTuple, hasScale: boolean): string[] {
  if (!s || hasScale) return [];
  const { t, r, b, l } = s;
  const cls = (prefix: string, v: number) => `${v < 0 ? '-' : ''}${prefix}-[${Math.abs(v)}px]`;
  if (t === r && r === b && b === l) return t !== 0 ? [cls('m', t)] : [];
  if (t === b && r === l) {
    const out: string[] = [];
    if (t !== 0) out.push(cls('my', t));
    if (r !== 0) out.push(cls('mx', r));
    return out;
  }
  const out: string[] = [];
  if (t !== 0) out.push(cls('mt', t));
  if (r !== 0) out.push(cls('mr', r));
  if (b !== 0) out.push(cls('mb', b));
  if (l !== 0) out.push(cls('ml', l));
  return out;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

// Simple in-memory cache for css → utility results
const _cache = new Map<string, UtilityMapResult>();

function classListHasGapScale(classes: string[]): boolean {
  return classes.some(c =>
    /^gap-(?:\d+|\d+\.5)$/.test(c) ||
    /^gap-\[(?:\d+(?:\.\d+)?)px\]$/.test(c) ||
    /^gap-[xy]-(?:\d+|\d+\.5)$/.test(c) ||
    /^gap-[xy]-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)
  );
}

export async function cssToTailwindClasses(css: string, strategy: ClassStrategy = 'conservative'): Promise<UtilityMapResult> {
  const key = `${strategy}:${css || ''}`;
  if (_cache.has(key)) return _cache.get(key)!;
  if (!css || !css.trim()) {
    const empty = { classNames: [], remainingCss: '' };
    _cache.set(key, empty);
    return empty;
  }

  const kept: Entry[] = [];
  const classes = new Set<string>();
  const entries = parseCssEntries(css);

  // 1) Basic one-to-one mappings (layout semantics and non-spacing)
  for (const [kRaw, vRaw] of entries) {
    const k = kRaw.toLowerCase();
    const v = vRaw.toLowerCase().trim();
    // display
    if (k === 'display' && (v === 'flex' || v === 'inline-flex')) {
      classes.add(v);
      continue;
    }
    // flex-direction
    if (k === 'flex-direction' && v === 'column') { classes.add('flex-col'); continue; }
    // flex-wrap
    if (k === 'flex-wrap') {
      if (v === 'wrap') classes.add('flex-wrap');
      else if (v === 'nowrap') classes.add('flex-nowrap');
      else if (v === 'wrap-reverse') classes.add('flex-wrap-reverse');
      continue;
    }
    // justify-content
    if (k === 'justify-content') {
      const map: Record<string, string> = {
        'center': 'justify-center',
        'flex-end': 'justify-end',
        'space-between': 'justify-between',
        'space-around': 'justify-around',
        'space-evenly': 'justify-evenly',
      };
      const tw = map[v]; if (tw) classes.add(tw);
      continue;
    }
    // align-items
    if (k === 'align-items') {
      const map: Record<string, string> = {
        'center': 'items-center',
        'flex-start': 'items-start',
        'flex-end': 'items-end',
        'baseline': 'items-baseline',
      };
      const tw = map[v]; if (tw) classes.add(tw);
      continue;
    }
    // align-self
    if (k === 'align-self') {
      const map: Record<string, string> = {
        'stretch': 'self-stretch',
        'center': 'self-center',
        'flex-start': 'self-start',
        'flex-end': 'self-end',
        'baseline': 'self-baseline',
      };
      const tw = map[v]; if (tw) classes.add(tw);
      continue;
    }
    // flex-basis
    if (k === 'flex-basis') {
      if (v === '0' || v === '0px') classes.add('basis-0');
      else if (v === 'auto') classes.add('basis-auto');
      continue;
    }
    // flex-grow/shrink
    if (k === 'flex-grow' && v === '1') { classes.add('grow'); continue; }
    if (k === 'flex-shrink' && v === '0') { classes.add('shrink-0'); continue; }
    // box-sizing
    if (k === 'box-sizing') {
      if (v === 'border-box') classes.add('box-border');
      else if (v === 'content-box') classes.add('box-content');
      continue;
    }
    // overflow family
    if (k === 'overflow' && /^(visible|hidden|auto|scroll)$/.test(v)) { classes.add(`overflow-${v}`); continue; }
    if (k === 'overflow-x' && /^(visible|hidden|auto|scroll)$/.test(v)) { classes.add(`overflow-x-${v}`); continue; }
    if (k === 'overflow-y' && /^(visible|hidden|auto|scroll)$/.test(v)) { classes.add(`overflow-y-${v}`); continue; }
    // opacity: opacity-[0..1]
    if (k === 'opacity') {
      const norm = normalizeOpacity(v);
      if (norm !== null) classes.add(`opacity-[${norm}]`);
      continue;
    }
    // z-index: z-[n]
    if (k === 'z-index') {
      const raw = normalizeZIndex(vRaw);
      if (raw !== null) classes.add(`z-[${raw}]`);
      continue;
    }
    // text-align
    if (k === 'text-align') {
      const map: Record<string, string> = { 'left': 'text-left', 'center': 'text-center', 'right': 'text-right', 'justify': 'text-justify' };
      const tw = map[v]; if (tw) classes.add(tw);
      continue;
    }
    // white-space
    if (k === 'white-space') {
      const map: Record<string, string> = { 'normal': 'whitespace-normal', 'nowrap': 'whitespace-nowrap', 'pre': 'whitespace-pre', 'pre-wrap': 'whitespace-pre-wrap' };
      const tw = map[v]; if (tw) classes.add(tw);
      continue;
    }
    // gap (scale only here; arbitrary handled later when no scale exists)
    if (k === 'gap') {
      const n = parsePx(vRaw);
      if (isNonNegative(n)) {
        const s = pxToScale(n);
        if (s !== null) classes.add(`gap-${s}`);
      }
      continue;
    }
    // padding family → generate scale classes only when fully representable
    if (k === 'padding') {
      const parts = vRaw.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        const n = parsePx(parts[0]); const s = isNonNegative(n) ? pxToScale(n) : null;
        if (s !== null) classes.add(`p-${s}`);
      } else if (parts.length === 2) {
        const ny = parsePx(parts[0]); const sy = isNonNegative(ny) ? pxToScale(ny!) : null;
        const nx = parsePx(parts[1]); const sx = isNonNegative(nx) ? pxToScale(nx!) : null;
        if (sy !== null && sx !== null) { classes.add(`py-${sy}`); classes.add(`px-${sx}`); }
      } else if (parts.length === 4) {
        const [nt, nr, nb, nl] = parts.map(parsePx);
        const st = isNonNegative(nt) ? pxToScale(nt!) : null;
        const sr = isNonNegative(nr) ? pxToScale(nr!) : null;
        const sb = isNonNegative(nb) ? pxToScale(nb!) : null;
        const sl = isNonNegative(nl) ? pxToScale(nl!) : null;
        if (st !== null && sr !== null && sb !== null && sl !== null) {
          classes.add(`pt-${st}`); classes.add(`pr-${sr}`); classes.add(`pb-${sb}`); classes.add(`pl-${sl}`);
        }
      }
      continue;
    }
    if (k === 'padding-top' || k === 'padding-right' || k === 'padding-bottom' || k === 'padding-left') {
      const n = parsePx(vRaw); const s = isNonNegative(n) ? pxToScale(n!) : null;
      if (s !== null) {
        const map: Record<string,string> = { 'padding-top':'pt','padding-right':'pr','padding-bottom':'pb','padding-left':'pl' };
        classes.add(`${map[k]}-${s}`);
      }
      continue;
    }
    // margin family (allow negative values)
    if (k === 'margin') {
      const parts = vRaw.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        const n = parsePx(parts[0]); const s = isAnyNumber(n) ? pxToScale(Math.abs(n!)) : null; const sign = (n ?? 0) < 0 ? '-' : '';
        if (s !== null) classes.add(`${sign}m-${s}`);
      } else if (parts.length === 2) {
        const ny = parsePx(parts[0]); const sy = isAnyNumber(ny) ? pxToScale(Math.abs(ny!)) : null; const sySign = (ny ?? 0) < 0 ? '-' : '';
        const nx = parsePx(parts[1]); const sx = isAnyNumber(nx) ? pxToScale(Math.abs(nx!)) : null; const sxSign = (nx ?? 0) < 0 ? '-' : '';
        if (sy !== null && sx !== null) { classes.add(`${sySign}my-${sy}`); classes.add(`${sxSign}mx-${sx}`); }
      } else if (parts.length === 4) {
        const [nt, nr, nb, nl] = parts.map(parsePx);
        const st = isAnyNumber(nt) ? pxToScale(Math.abs(nt!)) : null; const stSign = (nt ?? 0) < 0 ? '-' : '';
        const sr = isAnyNumber(nr) ? pxToScale(Math.abs(nr!)) : null; const srSign = (nr ?? 0) < 0 ? '-' : '';
        const sb = isAnyNumber(nb) ? pxToScale(Math.abs(nb!)) : null; const sbSign = (nb ?? 0) < 0 ? '-' : '';
        const sl = isAnyNumber(nl) ? pxToScale(Math.abs(nl!)) : null; const slSign = (nl ?? 0) < 0 ? '-' : '';
        if (st !== null && sr !== null && sb !== null && sl !== null) {
          classes.add(`${stSign}mt-${st}`); classes.add(`${srSign}mr-${sr}`); classes.add(`${sbSign}mb-${sb}`); classes.add(`${slSign}ml-${sl}`);
        }
      }
      continue;
    }
    if (k === 'margin-top' || k === 'margin-right' || k === 'margin-bottom' || k === 'margin-left') {
      const n = parsePx(vRaw); const s = isAnyNumber(n) ? pxToScale(Math.abs(n!)) : null; const sign = (n ?? 0) < 0 ? '-' : '';
      if (s !== null) {
        const map: Record<string,string> = { 'margin-top':'mt','margin-right':'mr','margin-bottom':'mb','margin-left':'ml' };
        classes.add(`${sign}${map[k]}-${s}`);
      }
      continue;
    }
  }

  // Helpers to avoid generating duplicate arbitrary classes when a scale class already exists
  const hasGapScale = Array.from(classes).some(c => /^gap-(?:\d+|\d+\.5)$/.test(c));
  const hasPaddingScale = Array.from(classes).some(c => /^(p|px|py|pt|pr|pb|pl)-(?:\d+|\d+\.5)$/.test(c));
  const hasMarginScale = Array.from(classes).some(c => /^(?:-)?(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(c));

  for (const [k, vRaw] of entries) {
    const v = vRaw.trim();
    if (k === 'width') { const n = parsePx(v); if (n !== null) { classes.add(`w-[${n}px]`); continue; } }
    if (k === 'height') { const n = parsePx(v); if (n !== null) { classes.add(`h-[${n}px]`); continue; } }
    if (k === 'font-size') { const n = parsePx(v); if (n !== null) { classes.add(`text-[${n}px]`); continue; } }
    if (k === 'line-height') { const n = parsePx(v); if (n !== null) { classes.add(`leading-[${n}px]`); continue; } }
    if (k === 'letter-spacing') {
      const mpx = v.match(/^(-?\d+(?:\.\d+)?)px$/i);
      const mem = v.match(/^(-?\d+(?:\.\d+)?)em$/i);
      if (mpx) { classes.add(`tracking-[${mpx[1]}px]`); continue; }
      if (mem) { classes.add(`tracking-[${mem[1]}em]`); continue; }
    }
    if (k === 'font-weight') {
      const n = parseInt(v, 10);
      const map: Record<number, string> = {100:'thin',200:'extralight',300:'light',400:'normal',500:'medium',600:'semibold',700:'bold',800:'extrabold',900:'black'};
      if (!Number.isNaN(n)) { if (map[n]) classes.add(`font-${map[n]}`); else classes.add(`font-[${n}]`); continue; }
    }
    if (k === 'border-radius') {
      const m = v.match(/^(\d+(?:\.\d+)?)px(?:\s+\1px){0,3}$/);
      if (m) {
        const n = parseFloat(m[1]);
        if (isFinite(n)) classes.add(`rounded-[${fmtNum(n)}px]`);
        continue;
      }
    }
    if (k === 'outline') {
      const m = v.match(/^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/i);
      if (m) { classes.add(`outline-${parseFloat(m[1])}`); classes.add(`outline-[${m[2]}]`); continue; }
    }
    if (k === 'outline-offset') { const n = parsePx(v); if (n !== null) { classes.add(`outline-offset-${n}`); continue; } }
    if (k === 'gap') {
      const n = parsePx(v);
      if (n !== null && n >= 0 && !hasGapScale) { classes.add(`gap-[${n}px]`); continue; }
    }
    if (k === 'padding') {
      genPaddingClasses(parseSpacing(v), hasPaddingScale).forEach(c => classes.add(c));
      continue;
    }
    if (k === 'padding-top' || k === 'padding-right' || k === 'padding-bottom' || k === 'padding-left') {
      const n = parsePx(v);
      if (n !== null && n >= 0 && !hasPaddingScale) {
        const map: Record<string,string> = { 'padding-top':'pt','padding-right':'pr','padding-bottom':'pb','padding-left':'pl' };
        classes.add(`${map[k]}-[${n}px]`);
      }
      continue;
    }
    if (k === 'margin') {
      genMarginClasses(parseSpacing(v), hasMarginScale).forEach(c => classes.add(c));
      continue;
    }
    if (k === 'margin-top' || k === 'margin-right' || k === 'margin-bottom' || k === 'margin-left') {
      const n = parsePx(v);
      if (n !== null && !hasMarginScale) {
        const map: Record<string,string> = { 'margin-top':'mt','margin-right':'mr','margin-bottom':'mb','margin-left':'ml' };
        classes.add(`${n<0?'-':''}${map[k]}-[${Math.abs(n)}px]`);
      }
      continue;
    }
  }

  // Aggressive strategy: parse color properties
  if (strategy === 'aggressive') {
    for (const [k, vRaw] of entries) {
      const v = vRaw.trim();
      if (k === 'color') {
        const color = normalizeColor(v);
        if (color) {
          classes.add(`text-[${color}]`);
          continue;
        }
      }
      if (k === 'background-color' || k === 'background') {
        const color = normalizeColor(v);
        if (color) {
          classes.add(`bg-[${color}]`);
          continue;
        }
      }
    }
  }

  type Checker = (v: string, cls: Set<string>) => boolean;
  const cssToClassCheckers: Record<string, Checker> = {
    'width': (_v, cls) => Array.from(cls).some(c => /^w-\[.+\]$/.test(c)),
    'height': (_v, cls) => Array.from(cls).some(c => /^h-\[.+\]$/.test(c)),
    'opacity': (v, cls) => {
      const norm = normalizeOpacity(v);
      return norm !== null && cls.has(`opacity-[${norm}]`);
    },
    'z-index': (v, cls) => {
      const norm = normalizeZIndex(v);
      return norm !== null && cls.has(`z-[${norm}]`);
    },
    'display': (v, cls) => (v === 'flex' && cls.has('flex')) || (v === 'inline-flex' && cls.has('inline-flex')),
    'flex-direction': (v, cls) => (v === 'row') || (v === 'column' && cls.has('flex-col')),
    'flex-wrap': (v, cls) =>
      (v === 'wrap' && cls.has('flex-wrap')) ||
      (v === 'nowrap' && cls.has('flex-nowrap')) ||
      (v === 'wrap-reverse' && cls.has('flex-wrap-reverse')),
    'font-size': (_v, cls) => Array.from(cls).some(c => /^text-\[.+\]$/.test(c)),
    'line-height': (_v, cls) => Array.from(cls).some(c => /^leading-\[.+\]$/.test(c)),
    'letter-spacing': (_v, cls) => Array.from(cls).some(c => /^tracking-\[.+\]$/.test(c)),
    'font-weight': (_v, cls) => Array.from(cls).some(c => /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(c) || /^font-\[\d+\]$/.test(c)),
    'border-radius': (_v, cls) => Array.from(cls).some(c => /^rounded-\[.+\]$/.test(c)),
    'outline': (_v, cls) => Array.from(cls).some(c => /^outline-(?:\d+)$/.test(c) || /^outline-\[.+\]$/.test(c)),
    'outline-offset': (_v, cls) => Array.from(cls).some(c => /^outline-offset-(?:\d+)$/.test(c)),
    'justify-content': (v, cls) => {
      if (v === 'flex-start') return true; // default
      const map: Record<string, string> = {
        'center': 'justify-center',
        'flex-end': 'justify-end',
        'space-between': 'justify-between',
        'space-around': 'justify-around',
        'space-evenly': 'justify-evenly',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'align-items': (v, cls) => {
      if (v === 'stretch') return true; // default
      const map: Record<string, string> = {
        'center': 'items-center',
        'flex-start': 'items-start',
        'flex-end': 'items-end',
        'baseline': 'items-baseline',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'flex-basis': (v, cls) => ((v === '0' || v === '0px') && cls.has('basis-0')) || (v === 'auto' && cls.has('basis-auto')),
    'flex-shrink': (v, cls) => v === '0' && cls.has('shrink-0'),
    'flex-grow': (v, cls) => v === '1' && cls.has('grow'),
    'align-self': (v, cls) => {
      const map: Record<string, string> = {
        'stretch': 'self-stretch',
        'center': 'self-center',
        'flex-start': 'self-start',
        'flex-end': 'self-end',
        'baseline': 'self-baseline',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'text-align': (v, cls) => {
      const map: Record<string, string> = {
        'left': 'text-left',
        'center': 'text-center',
        'right': 'text-right',
        'justify': 'text-justify',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'white-space': (v, cls) => {
      const map: Record<string, string> = {
        'normal': 'whitespace-normal',
        'nowrap': 'whitespace-nowrap',
        'pre': 'whitespace-pre',
        'pre-wrap': 'whitespace-pre-wrap',
      };
      const tw = map[v];
      return !!(tw && cls.has(tw));
    },
    'box-sizing': (v, cls) => (v === 'border-box' && cls.has('box-border')) || (v === 'content-box' && cls.has('box-content')),
    'overflow': (v, cls) => cls.has(`overflow-${v}`),
    'overflow-x': (v, cls) => cls.has(`overflow-x-${v}`),
    'overflow-y': (v, cls) => cls.has(`overflow-y-${v}`),
    // padding family: drop when any matching padding class exists
    'padding': (v, cls) => {
      const parts = v.split(/\s+/).filter(Boolean);
      const hasAnyPad = Array.from(cls).some(c => /^(p|px|py|pt|pr|pb|pl)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|py|pt|pr|pb|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c));
      return hasAnyPad && (parts.length === 1 || parts.length === 2 || parts.length === 4);
    },
    'padding-top': (_v, cls) => Array.from(cls).some(c => /^(p|py|pt)-(?:\d+|\d+\.5)$/.test(c) || /^(p|py|pt)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-right': (_v, cls) => Array.from(cls).some(c => /^(p|px|pr)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|pr)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-bottom': (_v, cls) => Array.from(cls).some(c => /^(p|py|pb)-(?:\d+|\d+\.5)$/.test(c) || /^(p|py|pb)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'padding-left': (_v, cls) => Array.from(cls).some(c => /^(p|px|pl)-(?:\d+|\d+\.5)$/.test(c) || /^(p|px|pl)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    // row/column-gap: drop when any gap class exists
    'row-gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'column-gap': (_v, cls) => classListHasGapScale(Array.from(cls)),
    'margin': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(m|mx|my|mt|mr|mb|ml)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(m|mx|my|mt|mr|mb|ml)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-left': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(ml|mx|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(ml|mx|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-right': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mr|mx|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mr|mx|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-top': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mt|my|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mt|my|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    'margin-bottom': (_v, cls) => Array.from(cls).some(c => /^(?:-)?(mb|my|m)-(?:\d+|\d+\.5)$/.test(c) || /^(?:-)?(mb|my|m)-\[(?:\d+(?:\.\d+)?)px\]$/.test(c)),
    // color properties: drop only when exact matching class exists (aggressive strategy)
    'color': (v, cls) => {
      const c = normalizeColor(v);
      return c !== null && cls.has(`text-[${c}]`);
    },
    'background-color': (v, cls) => {
      const c = normalizeColor(v);
      return c !== null && cls.has(`bg-[${c}]`);
    },
    'background': (v, cls) => {
      const c = normalizeColor(v);
      return c !== null && cls.has(`bg-[${c}]`);
    },
  };

  for (const [k, vRaw] of entries) {
    const v = vRaw.toLowerCase();
    const checker = cssToClassCheckers[k];
    if (checker && checker(v, classes)) continue;
    kept.push([k, vRaw]);
  }

  const result: UtilityMapResult = { classNames: Array.from(classes).sort(), remainingCss: stringifyCss(kept) };
  _cache.set(key, result);
  return result;
}

// Direct semantic → Tailwind class mapping, then merge with visual CSS conversion.
// Returns classNames, remainingCss, and omitFromInline to tell downstream what to skip.
export async function layoutToTailwindClasses(layout: LayoutInfo, extraCss: string): Promise<LayoutMapResult> {
  const classes = new Set<string>();
  const omit: LayoutCssOmit = {};

  // 1. Position
  if (layout.position === 'absolute') {
    classes.add('absolute');
    omit.position = true;
    if (typeof layout.left === 'number') {
      classes.add(`left-[${fmtNum(layout.left)}px]`);
      omit.left = true;
    }
    if (typeof layout.top === 'number') {
      classes.add(`top-[${fmtNum(layout.top)}px]`);
      omit.top = true;
    }
  } else if (layout.position === 'relative') {
    classes.add('relative');
    omit.position = true;
  }

  // 2. Size (Width/Height) - skip when cssWidth/cssHeight override exists (e.g., width:auto)
  if (typeof layout.width === 'number' && layout.width >= 0 && !layout.cssWidth) {
    classes.add(`w-[${fmtNum(layout.width)}px]`);
    omit.width = true;
  }
  if (typeof layout.height === 'number' && layout.height >= 0 && !layout.cssHeight) {
    classes.add(`h-[${fmtNum(layout.height)}px]`);
    omit.height = true;
  }

  // Container semantics
  if (layout.display === 'flex') {
    classes.add('flex');
    if (layout.flexDirection === 'column') classes.add('flex-col');
    if (layout.flexWrap === 'wrap') classes.add('flex-wrap');
    if (typeof layout.gap === 'number' && layout.gap > 0) {
      classes.add(`gap-[${fmtNum(layout.gap)}px]`);
    }
    if (layout.flexWrap === 'wrap') {
      if (typeof (layout as any).rowGap === 'number' && (layout as any).rowGap > 0) {
        classes.add(`gap-y-[${fmtNum((layout as any).rowGap)}px]`);
      }
      if (typeof (layout as any).columnGap === 'number' && (layout as any).columnGap > 0) {
        classes.add(`gap-x-[${fmtNum((layout as any).columnGap)}px]`);
      }
    }
    const jcMap: Record<string, string> = {
      'center': 'justify-center',
      'flex-end': 'justify-end',
      'space-between': 'justify-between',
      'space-around': 'justify-around',
      'space-evenly': 'justify-evenly',
    };
    if (layout.justifyContent && jcMap[layout.justifyContent]) classes.add(jcMap[layout.justifyContent]);
    const aiMap: Record<string, string> = {
      'center': 'items-center',
      'flex-start': 'items-start',
      'flex-end': 'items-end',
      'baseline': 'items-baseline',
    };
    if (layout.alignItems && aiMap[layout.alignItems]) classes.add(aiMap[layout.alignItems]);
  }

  // padding
  if (layout.padding) {
    const { t = 0, r = 0, b = 0, l = 0 } = layout.padding as any;
    if (t === r && r === b && b === l && t !== 0) {
      classes.add(`p-[${fmtNum(t)}px]`);
    } else if (t === b && r === l && (t !== 0 || r !== 0)) {
      if (t !== 0) classes.add(`py-[${fmtNum(t)}px]`);
      if (r !== 0) classes.add(`px-[${fmtNum(r)}px]`);
    } else {
      if (t !== 0) classes.add(`pt-[${fmtNum(t)}px]`);
      if (r !== 0) classes.add(`pr-[${fmtNum(r)}px]`);
      if (b !== 0) classes.add(`pb-[${fmtNum(b)}px]`);
      if (l !== 0) classes.add(`pl-[${fmtNum(l)}px]`);
    }
  }

  // box-sizing
  if (layout.boxSizing === 'border-box') classes.add('box-border');
  if (layout.boxSizing === 'content-box') classes.add('box-content');

  // overflow
  if (layout.overflow === 'hidden') classes.add('overflow-hidden');

  // Flex item semantics
  if (typeof layout.flexGrow === 'number' && layout.flexGrow > 0) {
    classes.add('grow');
    classes.add('min-w-0');
    classes.add('min-h-0');
    omit.flexGrow = true;
    omit.minWidth = true;
    omit.minHeight = true;
  }
  if (typeof layout.flexShrink === 'number' && layout.flexShrink === 0) {
    classes.add('shrink-0');
    omit.flexShrink = true;
  }
  if (layout.flexBasis === 0) {
    classes.add('basis-0');
    omit.flexBasis = true;
  }
  if (layout.flexBasis === 'auto') {
    classes.add('basis-auto');
    omit.flexBasis = true;
  }
  const asMap: Record<string, string> = {
    'flex-start': 'self-start',
    'flex-end': 'self-end',
    'center': 'self-center',
    'stretch': 'self-stretch',
    'baseline': 'self-baseline',
  };
  if (layout.alignSelf && asMap[layout.alignSelf]) {
    classes.add(asMap[layout.alignSelf]);
    omit.alignSelf = true;
  }

  // Visual CSS → utility classes（并返回剩余 CSS）
  const util = await cssToTailwindClasses(extraCss || '');
  for (const c of util.classNames) classes.add(c);
  return { classNames: Array.from(classes).sort(), remainingCss: util.remainingCss, omitFromInline: omit };
}
