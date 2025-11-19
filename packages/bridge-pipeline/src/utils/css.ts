import { mapEnum, normUpper } from './enum';
import { buildFontStack } from './fonts';
import { computeBorderRadius, type RadiiData } from './borderRadius';
import { dimensionToNumber } from './dimension';
import type {
  FigmaGradientPaint,
  FigmaImagePaint,
  FigmaEffect,
  FigmaText,
  FigmaStyle,
  FigmaNode,
  FigmaGradientType,
  FigmaVec2,
} from '../types/figma';

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
  const roundAlpha = (x: number): number => {
    const v = Math.round(x * 100) / 100;
    return Math.abs(v) < 0.01 ? 0 : v;
  };
  const aa = roundAlpha(a);
  if (aa === 1) return `rgb(${r},${g},${b})`;
  const s = String(aa).replace(/\.00$/, '').replace(/\.0$/, '');
  return `rgba(${r},${g},${b},${s})`;
}

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
  // Why: scale by box dims to account for aspect ratio
  const W = Math.max(0, Number(dims?.width) || 0);
  const H = Math.max(0, Number(dims?.height) || 0);
  const vx = W > 0 ? a * W : a;
  const vy = H > 0 ? b * H : b;
  const angleRad = Math.atan2(vy, vx);
  let deg = 90 - ((angleRad * 180) / Math.PI);
  if (deg < 0) deg = (deg % 360) + 360;
  if (deg >= 360) deg = deg % 360;
  return Math.round(deg);
}

function getLinearAngle(fill: GradientFill, dims?: { width: number; height: number }): number {
  const tDeg = calculateLinearAngleFromTransform(fill.gradientTransform, dims);
  if (typeof tDeg === 'number') return tDeg;
  const hDeg = calculateLinearAngleFromHandles(fill.gradientHandlePositions);
  return typeof hDeg === 'number' ? hDeg : 180;
}

const GRADIENT_CSS_MAP: Partial<Record<FigmaGradientType, (stops: string, fill: GradientFill) => string>> = {
  GRADIENT_RADIAL: (stops) => `radial-gradient(circle, ${stops})`,
  GRADIENT_ANGULAR: (stops) => `conic-gradient(from 0deg, ${stops})`,
  // Why: DIAMOND approximated via ellipse — exact diamond needs masking
  GRADIENT_DIAMOND: (stops) => `radial-gradient(ellipse, ${stops})`,
};

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
// Why: default image scale mapping when no precise transform is usable
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

function buildBackgroundLayers(node: FigmaNode, skipForText = false): { layers: BgLayer[]; blends: string[] } {
  if (skipForText && node?.type === 'TEXT') return { layers: [], blends: [] };
  const fills: any[] | null = Array.isArray(node?.style?.fills) ? (node.style!.fills as any[]) : null;
  if (!fills || fills.length === 0) return { layers: [], blends: [] };

  const boxW = Number((node?.element && node.element.width) || node?.width || 0);
  const boxH = Number((node?.element && node.element.height) || node?.height || 0);

  const layers: BgLayer[] = [];
  const blends: string[] = [];

  // Why: top-first to match CSS background layering
  const rev = fills.slice().reverse();
  for (const f of rev) {
    const t = normUpper((f && f.type) || '');
    if (t === 'IMAGE' && f?.imageId) {
      const url = f.imageId.startsWith('/') ? f.imageId : `images/${f.imageId}.png`;
      const scale = normUpper(f?.scaleMode) || 'FILL';
      let size: string | undefined;
      let position: string | undefined;
      let repeat: string | undefined;

      // Why: simplified CROP — handle pure scale+translate only (no rotate/skew)
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

  // Why: single-layer fast paths keep CSS minimal and stable
  if (layers.length === 1) {
    const L = layers[0];
    if (L.kind === 'solid' && L.rawColor) return `background:${L.rawColor};`;
    if (L.kind === 'gradient') return `background:${L.image};`;
    return [
      `background-image:${L.image};`,
      `background-position:${L.position || 'center'};`,
      `background-size:${L.size || 'cover'};`,
      `background-repeat:${L.repeat || 'no-repeat'};`,
    ].join('');
  }

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
  // Why: tame floating noise (e.g. -0.01200000047 → -0.01)
  function fmtNum(n: number, dp = 2): string {
    if (!isFinite(n)) return '0';
    const v = Math.round(n * Math.pow(10, dp)) / Math.pow(10, dp);
    const vv = Math.abs(v) < 1 / Math.pow(10, dp) ? 0 : v;
    const s = String(vv);
    return s.replace(/\.00$/, '').replace(/\.0$/, '');
  }

  if (seg.letterSpacing) {
    const unit = normUpper(seg.letterSpacing.unit);
    const val = seg.letterSpacing.value || 0;
    if (unit === 'PERCENT') {
      const em = val / 100;
      // Why: drop near-zero values after rounding
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
    // Why: choose first visible SOLID as text color; else transparent to avoid inheriting parent color
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
  
  // Why: preserve explicit breaks; WIDTH 视为单行，其它允许换行
  const autoResize = normUpper((text as any).textAutoResize);
  const truncation = normUpper((text as any).textTruncation);
  const shouldTruncate = truncation === 'ENDING' || autoResize === 'TRUNCATE';
  if (shouldTruncate) {
    parts.push('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;');
  } else if (autoResize === 'WIDTH') {
    // Single-line, width-driven text: keep pre-style spacing but avoid soft wraps
    parts.push('white-space:pre;');
  } else {
    // Multi-line / auto-height text (including WIDTH_AND_HEIGHT) should wrap
    // naturally while preserving explicit spaces and line breaks.
    parts.push('white-space:pre-wrap;');
  }
  
  if (align === 'LEFT') parts.push('text-align:left;');
  else if (align === 'CENTER') parts.push('text-align:center;');
  else if (align === 'RIGHT') parts.push('text-align:right;');
  else if (align === 'JUSTIFIED') parts.push('text-align:justify;');
  
  // Why: use flex vertical align only for single-line to avoid breaking wrapping
  const vAlign = normUpper((text as any).textAlignVertical);
  let usesFlexColumn = false;
  // 好品味：只有 WIDTH 真正是一行文本，WIDTH_AND_HEIGHT 属于多行文本，不能再用单行的 flex 对齐方式去破坏换行
  const isSingleLine = autoResize === 'WIDTH';
  if (isSingleLine) {
    if (vAlign === 'TOP') parts.push('display:flex;align-items:flex-start;');
    else if (vAlign === 'CENTER') parts.push('display:flex;align-items:center;');
    else if (vAlign === 'BOTTOM') parts.push('display:flex;align-items:flex-end;');
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
  } else if (autoResize === 'HEIGHT') {
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
  // 不再额外包一层 div；让 span 自然 inline 换行，<br> 在 span 内即可生效
  const result = parts.join('');
  return result;
}

// Why: Figma blur radii roughly halve in CSS (e.g., 30px → 15px)
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
  const emitBoxShadow = opts?.emitBoxShadow !== false;
  const parts: string[] = [];

  if (target === 'self') {
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

  const filters: string[] = [];
  const dropShadows = effects.shadows
    .filter(s => s.type === 'DROP_SHADOW')
    .map(s => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`);
  if (dropShadows.length > 0) filters.push(dropShadows.join(' '));
  if (effects.layerBlur && effects.layerBlur > 0) {
    filters.push(`blur(${effects.layerBlur / 2}px)`);
  }
  if (filters.length > 0) parts.push(`filter:${filters.join(' ')};`);

  // Why: no perfect equivalent for INNER_SHADOW on content — degrade to inset box-shadow on element
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

// Why: check if node has valid IMAGE fill with imageId for masking
export function hasMaskImageFill(node: FigmaNode): boolean {
  if (!node.style || !Array.isArray(node.style.fills) || node.style.fills.length === 0) {
    return false;
  }
  const imageFill = node.style.fills.find(f => {
    if (normUpper(f.type) !== 'IMAGE') return false;
    const imgFill = f as FigmaImagePaint;
    return !!imgFill.imageId;
  });
  return !!imageFill;
}

// Why: convert mask node IMAGE fill to CSS mask-image
export function buildMaskCss(mask: FigmaNode): string {
  const fills = mask.style!.fills!;
  const imageFill = fills.find(f => normUpper(f.type) === 'IMAGE') as FigmaImagePaint;

  const boxW = dimensionToNumber(mask.width as any, `buildMaskCss:width for node ${mask.id}`);
  const boxH = dimensionToNumber(mask.height as any, `buildMaskCss:height for node ${mask.id}`);
  const url = `images/${imageFill.imageId}.png`;
  const scale = normUpper(imageFill.scaleMode) || 'FILL';

  let size: string | undefined;
  let position: string | undefined;
  let repeat: string | undefined;

  // Why: handle CROP transform like background-image
  if (scale === 'CROP' && isAff2x3(imageFill.imageTransform)) {
    const m = imageFill.imageTransform!;
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

  const parts: string[] = [
    `mask-image:url('${url}');`,
    `mask-size:${size};`,
    `mask-position:${position};`,
    `mask-repeat:${repeat};`,
    `-webkit-mask-image:url('${url}');`,
    `-webkit-mask-size:${size};`,
    `-webkit-mask-position:${position};`,
    `-webkit-mask-repeat:${repeat};`,
  ];

  // Why: LUMINANCE uses brightness, ALPHA uses alpha channel
  const mode = normUpper(mask.maskType) === 'LUMINANCE' ? 'luminance' : 'alpha';
  parts.push(`mask-mode:${mode};`);
  parts.push(`-webkit-mask-mode:${mode};`);

  return parts.join('');
}
