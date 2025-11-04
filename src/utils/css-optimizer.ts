export type CssContext = {
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky' | string;
  hasRotateOrScale?: boolean;
  display?: string;
  flexDirection?: string;
  isText?: boolean;
};

const DO_NOT_TOUCH = new Set([
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
  'transform', 'z-index', 'line-height', 'letter-spacing'
]);

function parseCss(css: string): [string, string][] {
  if (!css) return [];
  const out: [string, string][] = [];
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

function stringifyCss(entries: [string, string][]): string {
  return entries.map(([k, v]) => `${k}:${v};`).join('');
}

export function optimizeBoxCss(css: string, ctx: CssContext): string {
  if (!css) return css;
  const entries = parseCss(css);
  const out: [string, string][] = [];
  const isRel = (ctx.position || '').toLowerCase() === 'relative';
  const hasRotateOrScale = !!ctx.hasRotateOrScale;
  const isFlex = (ctx.display || '').toLowerCase() === 'flex';
  const flexDir = (ctx.flexDirection || 'row').toLowerCase();

  for (const [k, v] of entries) {
    if (DO_NOT_TOUCH.has(k)) { out.push([k, v]); continue; }
    
    if (isRel && (k === 'left' || k === 'top')) {
      const vv = v.toLowerCase();
      if (vv === '0' || vv === '0px' || vv === '0%') continue;
    }
    
    if (k === 'transform-origin' && !hasRotateOrScale) continue;
    
    if (isFlex) {
      const vv = v.toLowerCase();
      if (!ctx.isText && k === 'justify-content' && vv === 'flex-start') continue;
      if (k === 'align-items' && vv === 'stretch') continue;
      if (k === 'flex-direction' && vv === 'row') continue;
    }
    
    out.push([k, v]);
  }
  return stringifyCss(out);
}
