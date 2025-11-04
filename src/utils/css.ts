import { mapEnum, normUpper } from './enum';
import { buildFontStack } from './fonts';
import { computeBorderRadius, type RadiiData } from './borderRadius';
import type {
  FigmaGradientPaint,
  FigmaEffect,
  FigmaText,
  FigmaStyle,
  FigmaNode,
  FigmaGradientType,
  FigmaVec2,
} from '../types/figma';

// Re-export convenient type aliases for downstream imports
export type GradientFill = FigmaGradientPaint;
export interface ShadowEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}

export interface ParsedEffects {
  shadows: ShadowEffect[];
  layerBlur?: number;
  backgroundBlur?: number;
}

export function rgbaToCss(
  rgba: { r: number; g: number; b: number; a?: number } | null | undefined
): string | null {
  if (!rgba) return null;
  const r = Math.round(rgba.r * 255);
  const g = Math.round(rgba.g * 255);
  const b = Math.round(rgba.b * 255);
  const a = rgba.a ?? 1;
  // Trim alpha to 2dp and prefer rgb() when fully opaque
  const roundAlpha = (x: number): number => {
    const v = Math.round(x * 100) / 100;
    return Math.abs(v) < 0.01 ? 0 : v; // avoid -0
  };
  const aa = roundAlpha(a);
  if (aa === 1) return `rgb(${r},${g},${b})`;
  // Format minimal alpha string (e.g., 0.5 instead of 0.50)
  const s = String(aa).replace(/\.00$/, '').replace(/\.0$/, '');
  return `rgba(${r},${g},${b},${s})`;
}

// Calculate linear gradient angle in degrees based on figmagic's approach
function calculateLinearAngleFromHandles(handles?: FigmaVec2[] | null): number | null {
  if (!handles || handles.length < 2) return 180;
  const point1 = handles[0];
  const point2 = handles[1];
  const deltaY = point2.x - point1.x;
  const deltaX = point2.y - point1.y;
  const angleInRadians = Math.atan2(deltaY, deltaX);
  let angle = 180 - (angleInRadians * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

function calculateLinearAngleFromTransform(m?: number[][] | null, dims?: { width: number; height: number }): number | null {
  if (!m || !isAff2x3(m)) return null;
  const a = m[0][0];
  const b = m[1][0];
  // Direction in pixel space scales by box dims to account for aspect ratio
  const W = Math.max(0, Number(dims?.width) || 0);
  const H = Math.max(0, Number(dims?.height) || 0);
  const vx = W > 0 ? a * W : a;
  const vy = H > 0 ? b * H : b;
  const angleRad = Math.atan2(vy, vx);
  // Map from math (0deg = +x, CCW) to CSS (0deg = up, CW): css = 90 - math
  let deg = 90 - ((angleRad * 180) / Math.PI);
  if (deg < 0) deg = (deg % 360) + 360;
  if (deg >= 360) deg = deg % 360;
  return Math.round(deg);
}

function getLinearAngle(fill: GradientFill, dims?: { width: number; height: number }): number {
  // Prefer new API transform if available; fallback to handles
  const tDeg = calculateLinearAngleFromTransform(fill.gradientTransform, dims);
  if (typeof tDeg === 'number') return tDeg;
  const hDeg = calculateLinearAngleFromHandles(fill.gradientHandlePositions);
  return typeof hDeg === 'number' ? hDeg : 180;
}

// Map gradient type to generator, returning only the CSS value (no property prefix)
const GRADIENT_CSS_MAP: Partial<Record<FigmaGradientType, (stops: string, fill: GradientFill) => string>> = {
  GRADIENT_RADIAL: (stops) => `radial-gradient(circle, ${stops})`,
  GRADIENT_ANGULAR: (stops) => `conic-gradient(from 0deg, ${stops})`,
  // Note: DIAMOND is approximated via ellipse; exact diamond requires masking/advanced tricks
  GRADIENT_DIAMOND: (stops) => `radial-gradient(ellipse, ${stops})`,
};

// Build gradient CSS value like `linear-gradient(...)` from a normalized fill
export function gradientToCssValue(fill: GradientFill | null | undefined, dims?: { width: number; height: number } | null): string | null {
  if (!fill || !Array.isArray(fill.gradientStops) || fill.gradientStops.length < 2) return null;

  const stops = fill.gradientStops
    .map((stop) => {
      const a = (stop.color.a ?? 1) * (fill.opacity ?? 1);
      const css = rgbaToCss({ r: stop.color.r, g: stop.color.g, b: stop.color.b, a });
      const posStr = `${(stop.position * 100).toFixed(2)}%`;
      return `${css} ${posStr}`;
    })
    .join(', ');

  if (fill.type === 'GRADIENT_LINEAR') {
    const angle = getLinearAngle(fill, dims || undefined);
    return `linear-gradient(${angle}deg, ${stops})`;
  }
  const gen = GRADIENT_CSS_MAP[fill.type as FigmaGradientType];
  return gen ? gen(stops, fill) : null;
}

/**
 * Prefer IMAGE fills. Fallback to first SOLID. Returns inline CSS string.
 * This function is pure and only depends on the provided node-like object
 * having `style.fills?: Array<{ type: string, imageId?: string, scaleMode?: string, color?: {r,g,b,a} }>`.
 */
// Default mapping for image scale modes when no precise transform is usable
const SCALE_DEFAULTS: Record<string, { size: string; repeat: string; position: string }> = {
  FIT: { size: 'contain', repeat: 'no-repeat', position: 'center' },
  FILL: { size: 'cover', repeat: 'no-repeat', position: 'center' },
  CROP: { size: 'cover', repeat: 'no-repeat', position: 'center' },
  STRETCH: { size: '100% 100%', repeat: 'no-repeat', position: 'center' },
  TILE: { size: 'auto', repeat: 'repeat', position: '0 0' },
};

function isAff2x3(m: any): m is number[][] {
  return (
    Array.isArray(m) &&
    m.length >= 2 &&
    Array.isArray(m[0]) &&
    Array.isArray(m[1]) &&
    m[0].length >= 3 &&
    m[1].length >= 3 &&
    m.flat().every((v: any) => typeof v === 'number' && isFinite(v))
  );
}

type BgLayer = { image: string; size?: string; position?: string; repeat?: string; kind: 'image' | 'solid' | 'gradient'; rawColor?: string };

function toBlendModeCss(raw?: string): string {
  if (!raw) return 'normal';
  const up = normUpper(raw);
  if (up === 'NORMAL' || up === 'PASS_THROUGH') return 'normal';
  return raw.toLowerCase().replace(/_/g, '-');
}

// Pure builder: produce background layers and blend modes from node fills (no CSS assembly here)
function buildBackgroundLayers(node: FigmaNode, skipForText = false): { layers: BgLayer[]; blends: string[] } {
  if (skipForText && node?.type === 'TEXT') return { layers: [], blends: [] };
  const fills: any[] | null = Array.isArray(node?.style?.fills) ? (node.style!.fills as any[]) : null;
  if (!fills || fills.length === 0) return { layers: [], blends: [] };

  const boxW = Number((node?.element && node.element.width) || node?.width || 0);
  const boxH = Number((node?.element && node.element.height) || node?.height || 0);

  const layers: BgLayer[] = [];
  const blends: string[] = [];

  // Build layers top-first to match CSS background layering
  const rev = fills.slice().reverse();
  for (const f of rev) {
    const t = normUpper((f && f.type) || '');
    if (t === 'IMAGE' && f?.imageId) {
      const url = `images/${f.imageId}.png`;
      const scale = normUpper(f?.scaleMode) || 'FILL';
      let size: string | undefined;
      let position: string | undefined;
      let repeat: string | undefined;

      // 精简版 CROP：仅处理无旋转/无斜切的缩放+平移
      if (scale === 'CROP' && isAff2x3((f as any).imageTransform)) {
        const m = (f as any).imageTransform as number[][];
        const [a, b, tx] = m[0];
        const [c, d, ty] = m[1];
        if (b === 0 && c === 0 && a > 0 && d > 0 && boxW > 0 && boxH > 0) {
          const fullW = boxW / a;
          const fullH = boxH / d;
          size = `${fullW.toFixed(2)}px ${fullH.toFixed(2)}px`;
          position = `${(-tx * fullW).toFixed(2)}px ${(-ty * fullH).toFixed(2)}px`;
          repeat = 'no-repeat';
        }
      }

      if (!size || !position || !repeat) {
        const def = SCALE_DEFAULTS[scale] || SCALE_DEFAULTS.FILL;
        size = size || def.size;
        position = position || def.position;
        repeat = repeat || def.repeat;
      }

      layers.push({ image: `url('${url}')`, size, position, repeat, kind: 'image' });
      blends.push(toBlendModeCss(f?.blendMode));
      continue;
    }

    if (t === 'GRADIENT_LINEAR' || t === 'GRADIENT_RADIAL' || t === 'GRADIENT_ANGULAR' || t === 'GRADIENT_DIAMOND') {
      const value = gradientToCssValue(f as GradientFill, { width: boxW, height: boxH });
      if (value) {
        layers.push({ image: value, size: 'auto', position: 'center', repeat: 'no-repeat', kind: 'gradient' });
        blends.push(toBlendModeCss(f?.blendMode));
      }
      continue;
    }

    if (t === 'SOLID' && f?.color) {
      const colorCss = rgbaToCss(f.color);
      if (colorCss) {
        const grad = `linear-gradient(0deg, ${colorCss} 0%, ${colorCss} 100%)`;
        layers.push({ image: grad, size: 'auto', position: 'center', repeat: 'no-repeat', kind: 'solid', rawColor: colorCss });
        blends.push(toBlendModeCss(f?.blendMode));
      }
      continue;
    }
  }
  return { layers, blends };
}

export function collectPaintCss(node: FigmaNode, skipForText = false): string | null {
  const { layers, blends } = buildBackgroundLayers(node, skipForText);
  if (layers.length === 0) return null;

  // Single-layer fast paths to keep CSS minimal and stable
  if (layers.length === 1) {
    const L = layers[0];
    // 纯色单层：使用最简写法，保持旧行为
    if (L.kind === 'solid' && L.rawColor) return `background:${L.rawColor};`;
    if (L.kind === 'gradient') return `background:${L.image};`;
    // Image layer
    return [
      `background-image:${L.image};`,
      `background-position:${L.position || 'center'};`,
      `background-size:${L.size || 'cover'};`,
      `background-repeat:${L.repeat || 'no-repeat'};`,
    ].join('');
  }

  // Multi-layer composition
  const images = layers.map(l => l.image).join(', ');
  const positions = layers.map(l => l.position || 'center').join(', ');
  const sizes = layers.map(l => l.size || 'auto').join(', ');
  const repeats = layers.map(l => l.repeat || 'no-repeat').join(', ');
  const hasNonNormalBlend = blends.some(b => b !== 'normal');
  const blendStr = blends.join(', ');

  return [
    `background-image:${images};`,
    `background-position:${positions};`,
    `background-size:${sizes};`,
    `background-repeat:${repeats};`,
    hasNonNormalBlend ? `background-blend-mode:${blendStr};` : '',
  ].filter(Boolean).join('');
}

/**
 * Collect border-radius CSS from node style
 * Returns null if no radius is defined
 */
export function collectBorderRadiusCss(node: { style?: { radii?: RadiiData | unknown } } | FigmaNode): string | null {
  const radii = node?.style?.radii as RadiiData | undefined;
  return computeBorderRadius(radii);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function segmentToInlineCss(seg: FigmaText['segments'] extends (infer S)[] ? S & Record<string, any> : any): string {
  const parts: string[] = [];
  if (typeof seg.fontSize === 'number') parts.push(`font-size:${seg.fontSize}px;`);
  if (seg.fontName?.family) {
    const fontStack = buildFontStack(seg.fontName.family);
    parts.push(`font-family:${fontStack};`);
    const style = seg.fontName.style || 'Regular';
    if (style.toLowerCase().includes('italic')) parts.push('font-style:italic;');
  }
  if (typeof seg.fontWeight === 'number') {
    parts.push(`font-weight:${seg.fontWeight};`);
  } else if (seg.fontName?.style) {
    const s = seg.fontName.style
      .toLowerCase()
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let w = 400;
    if (s.includes('thin')) w = 100;
    else if (s.includes('extra light') || s.includes('ultra light') || s.includes('extralight')) w = 200;
    else if (s.includes('light')) w = 300;
    else if (s.includes('medium')) w = 500;
    else if (s.includes('semi bold') || s.includes('semibold') || s.includes('demi bold') || s.includes('demibold')) w = 600;
    else if (s.includes('extra bold') || s.includes('ultra bold') || s.includes('extrabold')) w = 800;
    else if (s.includes('black') || s.includes('heavy')) w = 900;
    else if (s.includes('bold')) w = 700;
    parts.push(`font-weight:${w};`);
  }
  // Format helpers to tame floating noise (e.g. -0.01200000047 → -0.01)
  function fmtNum(n: number, dp = 2): string {
    if (!isFinite(n)) return '0';
    const v = Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);
    // Avoid "-0"
    const vv = Math.abs(v) < 1 / Math.pow(10, dp) ? 0 : v;
    const s = String(vv);
    return s.replace(/\.00$/, '').replace(/\.0$/, '');
  }

  if (seg.letterSpacing) {
    const unit = normUpper(seg.letterSpacing.unit);
    const val = seg.letterSpacing.value || 0;
    if (unit === 'PERCENT') {
      const em = val / 100;
      // Only emit when non-zero after rounding to 2dp
      const rounded = Math.round(em * 100) / 100;
      if (Math.abs(rounded) >= 0.01) parts.push(`letter-spacing:${fmtNum(em)}em;`);
    } else if (unit === 'PIXELS') {
      const rounded = Math.round(val * 100) / 100;
      if (Math.abs(rounded) >= 0.01) parts.push(`letter-spacing:${fmtNum(val)}px;`);
    }
  }
  if (seg.lineHeight) {
    const unit = normUpper(seg.lineHeight.unit);
    const val = seg.lineHeight.value;
    if (unit === 'PIXELS' && typeof val === 'number') {
      parts.push(`line-height:${val}px;`);
    } else if (unit === 'PERCENT' && typeof val === 'number' && val > 100) {
      parts.push(`line-height:${val}%;`);
    }
  }
  if (Array.isArray(seg.fills) && seg.fills.length > 0) {
    // 选择首个可见的 SOLID 作为文本颜色；若全部不可用，则透明以避免继承父色
    const visibleSolid = seg.fills.find((f: any) => {
      if (f?.visible === false) return false;
      const t = normUpper(f?.type);
      return t === 'SOLID' && !!f?.color;
    });
    if (visibleSolid && visibleSolid.color) {
      const aFill = typeof visibleSolid.opacity === 'number' ? visibleSolid.opacity : 1;
      const css = rgbaToCss({ ...visibleSolid.color, a: aFill * (visibleSolid.color.a ?? 1) });
      if (css) parts.push(`color:${css};`);
    } else {
      parts.push('color:transparent;');
    }
  } else {
    parts.push('color:transparent;');
  }
  const dec = normUpper(seg.textDecoration);
  if (dec === 'UNDERLINE') parts.push('text-decoration:underline;');
  else if (dec === 'STRIKETHROUGH') parts.push('text-decoration:line-through;');
  const tc = normUpper(seg.textCase);
  if (tc === 'UPPER') parts.push('text-transform:uppercase;');
  else if (tc === 'LOWER') parts.push('text-transform:lowercase;');
  else if (tc === 'TITLE') parts.push('text-transform:capitalize;');
  return parts.join('');
}

export type TextCssResult = { css: string; usesFlexColumn: boolean; autoWidth: boolean; autoHeight: boolean };

export function collectTextCss(node: { text?: FigmaText }): TextCssResult {
  const text = node?.text;
  if (!text) return { css: '', usesFlexColumn: false, autoWidth: false, autoHeight: false };
  const parts: string[] = [];
  const align = normUpper(text.textAlignHorizontal);
  
  // Line-break policy:
  // - TRUNCATE → single-line ellipsis
  // - WIDTH/WIDTH_AND_HEIGHT auto-resize → no auto-wrap, preserve explicit breaks (pre)
  // - fixed dimensions (HEIGHT/NONE) → allow wrapping + preserve explicit breaks (pre-wrap)
  const autoResize = normUpper((text as any).textAutoResize);
  const truncation = normUpper((text as any).textTruncation);
  const shouldTruncate = truncation === 'ENDING' || autoResize === 'TRUNCATE';
  if (shouldTruncate) {
    parts.push('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
  } else if (autoResize === 'WIDTH' || autoResize === 'WIDTH_AND_HEIGHT') {
    parts.push('white-space:pre;');
  } else {
    parts.push('white-space:pre-wrap;');
  }
  
  // 水平对齐：始终用 text-align（对 span 内的文字生效）
  if (align === 'LEFT') parts.push('text-align:left;');
  else if (align === 'CENTER') parts.push('text-align:center;');
  else if (align === 'RIGHT') parts.push('text-align:right;');
  else if (align === 'JUSTIFIED') parts.push('text-align:justify;');
  
  // 垂直对齐策略：
  // - 自动调整大小的文本（单行/自适应）：不使用 flexbox 垂直对齐，保持文字自然基线渲染
  // - 固定高度的文本框：根据 textAlignVertical 控制多行文本的垂直位置
  const vAlign = normUpper((text as any).textAlignVertical);
  let usesFlexColumn = false;
  const isAutoSize = autoResize === 'WIDTH' || autoResize === 'WIDTH_AND_HEIGHT';
  
  if (!isAutoSize) {
    // 固定高度文本：使用 flex 垂直对齐 + flex-direction:column 让 span 填满宽度
    if (vAlign === 'TOP') {
      parts.push('display:flex;flex-direction:column;justify-content:flex-start;');
    } else if (vAlign === 'CENTER') {
      parts.push('display:flex;flex-direction:column;justify-content:center;');
    } else if (vAlign === 'BOTTOM') {
      parts.push('display:flex;flex-direction:column;justify-content:flex-end;');
    }
  } else {
    // 自动调整大小的文本：需要消除 line-height 导致的垂直居中，使用 flex 控制垂直对齐
    if (vAlign === 'TOP') {
      parts.push('display:flex;align-items:flex-start;');
    } else if (vAlign === 'CENTER') {
      parts.push('display:flex;align-items:center;');
    } else if (vAlign === 'BOTTOM') {
      parts.push('display:flex;align-items:flex-end;');
    }
  }
  if (typeof text.paragraphIndent === 'number' && text.paragraphIndent !== 0) {
    parts.push(`text-indent:${text.paragraphIndent}px;`);
  }
  let autoWidth = false;
  let autoHeight = false;
  if (autoResize === 'WIDTH') {
    autoWidth = true;
  } else if (autoResize === 'WIDTH_AND_HEIGHT') {
    autoWidth = true;
    autoHeight = true;
  }
  return { css: parts.join(''), usesFlexColumn, autoWidth, autoHeight };
}

export function renderTextSegments(text: FigmaText): string {
  if (!text || typeof text.characters !== 'string') return '';
  const chars = text.characters;
  const segments = Array.isArray(text.segments) ? text.segments : [];
  if (segments.length === 0) return escapeHtml(chars).replace(/\n/g, '<br>');
  const parts: string[] = [];
  for (const seg of segments) {
    const start = seg.start || 0;
    const end = seg.end || chars.length;
    const slice = chars.slice(start, end);
    const css = segmentToInlineCss(seg);
    const html = escapeHtml(slice).replace(/\n/g, '<br>');
    parts.push(`<span style="${css}">${html}</span>`);
  }
  const result = parts.join('');
  const hasLineBreaks = chars.includes('\n');
  return hasLineBreaks ? `<div>${result}</div>` : result;
}

// Effects → CSS
// Figma blur radius conversion (official from Figma engineering):
// - BACKGROUND_BLUR: divide by 2 (Figma 30px = CSS 15px backdrop-filter)
// - LAYER_BLUR: divide by 2 (empirical, matches background-blur behavior)
export function parseEffects(node: { style?: FigmaStyle } | FigmaNode): ParsedEffects {
  const effects = Array.isArray(node?.style?.effects) ? (node.style!.effects as FigmaEffect[]) : [];
  const result: ParsedEffects = { shadows: [] };

  for (const e of effects) {
    const t = normUpper(e?.type);
    if (t === 'LAYER_BLUR') {
      const r = typeof e?.radius === 'number' ? e.radius : 0;
      if (r > 0) result.layerBlur = Math.max(result.layerBlur || 0, r);
    } else if (t === 'BACKGROUND_BLUR') {
      const r = typeof e?.radius === 'number' ? e.radius : 0;
      if (r > 0) result.backgroundBlur = Math.max(result.backgroundBlur || 0, r);
    } else if (t === 'DROP_SHADOW' || t === 'INNER_SHADOW') {
      const off = (e?.offset && typeof e.offset.x === 'number' && typeof e.offset.y === 'number') 
        ? e.offset 
        : { x: 0, y: 0 };
      result.shadows.push({
        type: t,
        x: off.x,
        y: off.y,
        blur: typeof e?.radius === 'number' ? e.radius : 0,
        spread: typeof e?.spread === 'number' ? e.spread : 0,
        color: rgbaToCss(e?.color) || 'rgb(0,0,0)'
      });
    }
  }
  return result;
}

/**
 * Convert ParsedEffects to CSS.
 * opts.target:
 *  - 'self' (default): effects apply to the box itself (box-shadow, filter on the element)
 *  - 'content': effects apply to the rendered content (use filter: drop-shadow/blur)
 */
export function effectsToCSS(
  effects: ParsedEffects,
  opts?: { target?: 'self' | 'content'; emitBoxShadow?: boolean }
): string {
  const target = opts?.target || 'self';
  const emitBoxShadow = opts?.emitBoxShadow !== false; // default true
  const parts: string[] = [];

  if (target === 'self') {
    // Map to box-shadow + filter/backdrop-filter
    if (emitBoxShadow && effects.shadows.length > 0) {
      const boxShadows = effects.shadows.map(s => {
        const inset = s.type === 'INNER_SHADOW' ? 'inset ' : '';
        return `${inset}${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;
      });
      parts.push(`box-shadow:${boxShadows.join(',')};`);
    }
    if (effects.layerBlur && effects.layerBlur > 0) {
      parts.push(`filter:blur(${effects.layerBlur / 2}px);`);
    }
    if (effects.backgroundBlur && effects.backgroundBlur > 0) {
      const blur = effects.backgroundBlur / 2;
      parts.push(`backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);`);
    }
    return parts.join('');
  }

  // target === 'content'
  // Compose all DROP_SHADOW/LAYER_BLUR into a single `filter:` chain so it affects rendered content.
  const filters: string[] = [];
  const dropShadows = effects.shadows
    .filter(s => s.type === 'DROP_SHADOW')
    .map(s => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`);
  if (dropShadows.length > 0) filters.push(dropShadows.join(' '));
  if (effects.layerBlur && effects.layerBlur > 0) {
    filters.push(`blur(${effects.layerBlur / 2}px)`);
  }
  if (filters.length > 0) parts.push(`filter:${filters.join(' ')};`);

  // INNER_SHADOW has no perfect browser equivalent on rendered content.
  // Provide a pragmatic degradation: apply inset box-shadow on the element box
  // so users still see a similar inner shading instead of silent drop.
  const insetShadows = effects.shadows
    .filter(s => s.type === 'INNER_SHADOW')
    .map(s => `inset ${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`);
  if (insetShadows.length > 0) {
    parts.push(`box-shadow:${insetShadows.join(',')};`);
  }

  if (effects.backgroundBlur && effects.backgroundBlur > 0) {
    const blur = effects.backgroundBlur / 2;
    parts.push(`backdrop-filter:blur(${blur}px);-webkit-backdrop-filter:blur(${blur}px);`);
  }
  return parts.join('');
}

export function collectEffectsCss(node: { style?: FigmaStyle } | FigmaNode): string | null {
  const effects = parseEffects(node);
  const css = effectsToCSS(effects, { target: 'self' });
  return css || null;
}
