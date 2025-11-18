export type LayoutDimension = number | string;

// Parse width/height attributes from DSL/inputs into a layout-friendly dimension.
// number => px; string => raw CSS length/keyword such as 'auto', '100%', '100vw'.
export function parseDimensionAttr(raw: string | null | undefined): LayoutDimension | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  // Preserve previous behavior: empty string treated as 0px.
  if (trimmed === '') return 0;
  // Any value containing letters or % is treated as a CSS unit/keyword.
  if (/[a-z%]/i.test(trimmed)) return trimmed;
  const n = Number(trimmed);
  if (Number.isFinite(n)) return n;
  // Fall back to raw string so problems surface in CSS instead of being silently hidden.
  return trimmed;
}

// Detect whether a layout dimension is an explicit CSS unit/keyword that should not be
// overwritten by automatic sizing (e.g. '100%', '100vw', 'auto').
export function isCssUnit(value: LayoutDimension | undefined): value is string {
  return typeof value === 'string' && value !== '0' && /[a-z%]/i.test(value);
}

// Convert a layout dimension to a numeric px value for internal geometry calculations.
// 历史上的做法是把字符串直接当 0 处理，这会悄悄吞掉上游错误。
// 现在约定：只有真正的 number 才合法；CSS 单位必须走 cssWidth/cssHeight，而不是混进几何层。
export function dimensionToNumber(value: LayoutDimension | undefined, ctx?: string): number {
  if (typeof value === 'number') return value;
  throw new Error(
    `dimensionToNumber: expected numeric dimension${ctx ? ` for ${ctx}` : ''}, got ${String(
      value
    )}`
  );
}

// Convert a layout dimension to a CSS length string.
// - number => formatted px via provided formatter
// - string => returned as-is (e.g. 'auto', '100%', '100vw')
export function dimensionToCss(
  value: LayoutDimension | undefined,
  fmtPx: (n: number) => string
): string | undefined {
  if (typeof value === 'number') return fmtPx(value);
  if (typeof value === 'string') return value;
  return undefined;
}
