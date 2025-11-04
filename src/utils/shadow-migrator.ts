import { splitShadowList } from './css-parser';

export function migrateShadowsToOuter(
  innerCss: string,
  outerCss: string
): { newInner: string; newOuter: string } {
  let inner = innerCss || '';
  let outer = outerCss || '';

  const bsMatch = inner.match(/(^|;)\s*box-shadow\s*:\s*([^;]+);?/i);
  if (!bsMatch) return { newInner: inner, newOuter: outer };

  const bsVal = bsMatch[2].trim();
  const items = splitShadowList(bsVal);
  const dropList: string[] = [];
  const keepList: string[] = [];

  for (const itRaw of items) {
    const it = itRaw.trim();
    if (/^inset\b/i.test(it)) { keepList.push(it); continue; }
    const m = it.match(/^(?:inset\s+)?(-?\d+(?:\.\d+)?(?:px)?)\s+(-?\d+(?:\.\d+)?(?:px)?)\s+(\d+(?:\.\d+)?(?:px)?)(?:\s+(-?\d+(?:\.\d+)?(?:px)?))?\s+(rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/i);
    if (m) {
      const x = m[1]; const y = m[2]; const blur = m[3]; const color = m[5];
      dropList.push(`drop-shadow(${x} ${y} ${blur} ${color})`);
    }
  }

  if (!dropList.length) return { newInner: inner, newOuter: outer };

  const existingFilter = (() => {
    const m = outer.match(/(^|;)\s*filter\s*:\s*([^;]+);?/i);
    return m ? m[2].trim() : '';
  })();
  const newFilter = existingFilter ? `${existingFilter} ${dropList.join(' ')}` : dropList.join(' ');
  outer = outer.replace(/(^|;)\s*filter\s*:[^;]+;?/ig, '$1');
  outer += `filter:${newFilter};`;

  if (keepList.length) inner = inner.replace(/(^|;)\s*box-shadow\s*:[^;]+;?/i, `$1box-shadow:${keepList.join(',')};`);
  else inner = inner.replace(/(^|;)\s*box-shadow\s*:[^;]+;?/ig, '$1');

  return { newInner: inner, newOuter: outer };
}
