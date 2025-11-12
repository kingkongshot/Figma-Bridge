import type { ShadowEffect } from './css';

function extractProp(css: string, prop: string): { rest: string; value: string | null } {
  if (!css) return { rest: '', value: null };
  const re = new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+);?`, 'i');
  const m = css.match(re);
  if (!m) return { rest: css, value: null };
  const value = (m[2] || '').trim();
  const rest = css.replace(re, (s, p1) => (p1 ? p1 : ''));
  return { rest, value };
}

export function mergeInheritedEffectsIntoCss(baseCss: string, inherited?: ShadowEffect[] | null): string {
  if (!baseCss) baseCss = '';
  const eff = Array.isArray(inherited) ? inherited : [];
  if (eff.length === 0) return baseCss;

  const drop = eff.filter(s => s && s.type === 'DROP_SHADOW');
  const inner = eff.filter(s => s && s.type === 'INNER_SHADOW');

  let rest = baseCss;
  const { rest: withoutFilter, value: filterVal } = extractProp(rest, 'filter');
  rest = withoutFilter;
  const inheritedFilter = drop.length > 0
    ? drop.map(s => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`).join(' ')
    : '';
  const mergedFilter = inheritedFilter
    ? `filter:${inheritedFilter}${filterVal ? ' ' + filterVal : ''};`
    : (filterVal ? `filter:${filterVal};` : '');

  const { rest: withoutBox, value: boxVal } = extractProp(rest, 'box-shadow');
  rest = withoutBox;
  const insetTokens = inner.length > 0
    ? inner.map(s => `inset ${s.x}px ${s.y}px ${s.blur}px ${s.spread || 0}px ${s.color}`).join(',')
    : '';
  const mergedBox = insetTokens
    ? `box-shadow:${boxVal ? boxVal + ',' : ''}${insetTokens};`
    : (boxVal ? `box-shadow:${boxVal};` : '');

  return rest + mergedFilter + mergedBox;
}

