/**
 * Stroke Rendering Module
 *
 * Converts Figma strokes to CSS borders/outlines.
 *
 * Supported: Solid, Gradient (LINEAR), Dashed, Dotted, Custom patterns
 * Alignments: INSIDE (box-shadow/pseudo), CENTER (border), OUTSIDE (outline)
 *
 * Limitations:
 * - CSS dashed/dotted use browser defaults, cannot match exact Figma dash lengths
 *   (dashPattern is reduced to coarse solid/dashed/dotted mapping)
 * - TODO: Brush/Dynamic strokes, other gradient types (RADIAL/ANGULAR/DIAMOND)
 */

import { rgbaToCss, type ParsedEffects, gradientToCssValue, type GradientFill } from './css';
import { type RadiiData } from './borderRadius';
import { CssCollector } from './cssCollector';

interface StrokeWeights {
  t: number;
  r: number;
  b: number;
  l: number;
}

type StrokeKind = 'solid' | 'gradient';

interface StrokeDataSolid {
  kind: 'solid';
  color: string;
  align: string;
  weights: StrokeWeights;
  dashPattern?: number[];
}

interface StrokeDataGradient {
  kind: 'gradient';
  gradientCss: string;
  align: string;
  weights: StrokeWeights;
}

type StrokeData = StrokeDataSolid | StrokeDataGradient;

/**
 * Heuristic threshold for distinguishing dotted vs dashed strokes.
 * dashPattern values <= 2px are rendered as 'dotted' to match CSS dotted style (~2px dots).
 * This is a visual approximation; exact Figma rendering may differ across DPI settings.
 */
const DOTTED_DASH_THRESHOLD = 2;

/**
 * Determine CSS border-style from Figma's dashPattern
 *
 * - Empty/undefined → 'solid'
 * - dashPattern[0] <= DOTTED_DASH_THRESHOLD → 'dotted' (e.g. [1] or [0, gap])
 * - dashPattern[0] > DOTTED_DASH_THRESHOLD → 'dashed' (e.g. [5, 6])
 *
 * Note: CSS cannot replicate exact Figma dash lengths. Browser uses default patterns.
 * TODO(#issue): Use SVG stroke-dasharray for pixel-perfect rendering
 */
function getBorderStyle(dashPattern?: number[]): 'solid' | 'dotted' | 'dashed' {
  if (!dashPattern || dashPattern.length === 0) {
    return 'solid';
  }

  if (dashPattern[0] <= DOTTED_DASH_THRESHOLD) {
    return 'dotted';
  }

  return 'dashed';
}

/**
 * Normalize dashPattern to undefined if empty or invalid
 */
function normalizeDashPattern(pattern: unknown): number[] | undefined {
  return Array.isArray(pattern) && pattern.length > 0 ? pattern : undefined;
}

function extractStrokeData(node: any): StrokeData | null {
  const style = node?.style;
  if (!style) return null;

  const strokes = Array.isArray(style.strokes) ? style.strokes : null;
  if (!strokes || strokes.length === 0) return null;

  const visible = strokes.find((s: any) => s && s.visible !== false);
  if (!visible) return null;

  if (visible?.type === 'SOLID') {
    const color = visible.color ? rgbaToCss(visible.color) : null;
    if (!color) return null;
    const weights = style.strokeWeights || { t: 0, r: 0, b: 0, l: 0 };
    const dashPattern = normalizeDashPattern(style.dashPattern);
    return { kind: 'solid', color, align: style.strokeAlign || 'INSIDE', weights, dashPattern };
  }

  if (visible?.type === 'GRADIENT_LINEAR') {
    const fill: GradientFill = {
      type: 'GRADIENT_LINEAR',
      gradientStops: Array.isArray(visible.gradientStops) ? visible.gradientStops : [],
      gradientHandlePositions: Array.isArray(visible.gradientHandlePositions) ? visible.gradientHandlePositions as any : null,
      gradientTransform: Array.isArray(visible.gradientTransform) ? (visible.gradientTransform as any) : null,
      opacity: typeof visible.opacity === 'number' ? visible.opacity : 1,
    };
    const gradCss = gradientToCssValue(
      fill,
      { width: Number(node?.width) || 0, height: Number(node?.height) || 0 }
    );
    if (!gradCss) {
      return null;
    }
    const weights = style.strokeWeights || { t: 0, r: 0, b: 0, l: 0 };
    return { kind: 'gradient', gradientCss: gradCss, align: style.strokeAlign || 'INSIDE', weights };
  }

  return null;
}

export type StrokeStyle = { css: string; boxShadow: string[] };

export function collectStrokeStyle(
  node: any,
  collector: CssCollector,
  hostSelector?: string,
  effects?: ParsedEffects
): StrokeStyle {
  const strokeData = extractStrokeData(node);
  if (!strokeData) return { css: '', boxShadow: [] };

  const w = strokeData.weights;
  if (w.t === 0 && w.r === 0 && w.b === 0 && w.l === 0) {
    return { css: '', boxShadow: [] };
  }

  if (node?.type === 'TEXT') {
    if (strokeData.kind === 'solid') {
      return { css: generateTextStroke(strokeData), boxShadow: [] };
    }
    return { css: '', boxShadow: [] };
  }

  if (node?.svgContent || node?.svgId) return { css: '', boxShadow: [] };

  const isUniform = w.t === w.r && w.r === w.b && w.b === w.l;
  const hasEffects = effects && effects.shadows.length > 0;

  if (isUniform && !hasEffects && strokeData.kind === 'solid') {
    const borderStyle = getBorderStyle(strokeData.dashPattern);
    const hasDashPattern = borderStyle !== 'solid';

    // INSIDE alignment: use box-shadow for solid strokes, pseudo element for dashed/dotted
    if (strokeData.align === 'INSIDE' && !hasDashPattern) {
      return { css: '', boxShadow: [`inset 0 0 0 ${w.t}px ${strokeData.color}`] };
    }
    // INSIDE + dashPattern: box-shadow doesn't support dashed/dotted, fallthrough to pseudo element

    // CENTER alignment: use border for solid strokes, pseudo element for dashed/dotted
    if (strokeData.align === 'CENTER' && !hasDashPattern) {
      return { css: `border: ${w.t}px solid ${strokeData.color};`, boxShadow: [] };
    }
    // CENTER + dashPattern: fallthrough to pseudo element

    // OUTSIDE alignment: use outline for solid strokes, pseudo element for dashed/dotted
    if (strokeData.align === 'OUTSIDE' && !hasDashPattern) {
      return { css: `outline: ${w.t}px solid ${strokeData.color}; outline-offset: 0;`, boxShadow: [] };
    }
    // OUTSIDE + dashPattern: fallthrough to pseudo element
  }

  if (isUniform && strokeData.kind === 'gradient') {
    const host = hostSelector || `[data-layer-id="${node.id}"]`;
    const selector = `${host}::before`;
    const props = generateGradientStrokePseudo(strokeData, node?.style?.radii);
    collector.addRule(selector, props);
    return { css: '', boxShadow: [] };
  }

  const host = hostSelector || `[data-layer-id="${node.id}"]`;
  const selector = `${host}::before`;
  if ((strokeData as any).kind === 'gradient') {
    return { css: '', boxShadow: [] };
  }
  const props = generatePseudoStroke(strokeData as StrokeDataSolid, node?.style?.radii, effects);
  collector.addRule(selector, props);
  return { css: '', boxShadow: [] };
}

export function collectStrokeCSS(node: any, collector: CssCollector, hostSelector?: string, effects?: ParsedEffects): string {
  return collectStrokeStyle(node, collector, hostSelector, effects).css;
}

function generateTextStroke(data: StrokeDataSolid): string {
  const w = Math.max(data.weights.t, data.weights.r, data.weights.b, data.weights.l);
  const parts: string[] = [`-webkit-text-stroke:${w}px ${data.color};`];
  if (data.align === 'OUTSIDE') parts.push('paint-order:stroke fill;');
  return parts.join('');
}

function generatePseudoStroke(data: StrokeDataSolid, radii: RadiiData | undefined, effects?: ParsedEffects): string {
  const parts: string[] = [];

  parts.push('content:""');
  parts.push('position:absolute');
  parts.push('z-index:0');
  parts.push('pointer-events:none');

  const inset = calculateInset(data.align, data.weights);
  if (typeof inset === 'number') {
    parts.push(`inset:${inset}px`);
  } else {
    parts.push(`top:${inset.top}px`);
    parts.push(`right:${inset.right}px`);
    parts.push(`bottom:${inset.bottom}px`);
    parts.push(`left:${inset.left}px`);
  }

  const w = data.weights;
  const isUniform = w.t === w.r && w.r === w.b && w.b === w.l;
  const borderStyle = getBorderStyle(data.dashPattern);

  if (isUniform) {
    parts.push(`border:${w.t}px ${borderStyle} ${data.color}`);
  } else {
    parts.push(`border-style:${borderStyle}`);
    parts.push(`border-color:${data.color}`);
    parts.push(`border-width:${w.t}px ${w.r}px ${w.b}px ${w.l}px`);
  }

  if (radii) {
    const compensatedRadius = computeCompensatedRadius(radii, data.align, data.weights);
    if (compensatedRadius) {
      parts.push(compensatedRadius.replace(/;$/, ''));
    }
  }

  if (effects && effects.shadows.length > 0) {
    const dropShadows = effects.shadows
      .filter(s => s.type === 'DROP_SHADOW')
      .map(s => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`);
    if (dropShadows.length > 0) {
      parts.push(`filter:${dropShadows.join(' ')}`);
    }
  }

  return parts.join('; ');
}

function generateGradientStrokePseudo(data: StrokeDataGradient, radii: RadiiData | undefined): string {
  const parts: string[] = [];
  const w = data.weights.t;

  parts.push('content:""');
  parts.push('position:absolute');
  parts.push('z-index:0');
  parts.push('pointer-events:none');

  if (data.align === 'INSIDE') {
    parts.push('inset:0');
  } else if (data.align === 'CENTER') {
    parts.push(`inset:-${w / 2}px`);
  } else if (data.align === 'OUTSIDE') {
    parts.push(`inset:-${w}px`);
  } else {
    parts.push('inset:0');
  }

  parts.push(`padding:${w}px`);
  parts.push(`background:${data.gradientCss}`);

  if (radii) {
    const compensatedRadius = computeCompensatedRadius(radii, data.align, data.weights);
    if (compensatedRadius) parts.push(compensatedRadius.replace(/;$/, ''));
    else parts.push('border-radius:inherit');
  } else {
    parts.push('border-radius:inherit');
  }

  parts.push('-webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)');
  parts.push('-webkit-mask-composite:xor');
  parts.push('mask-composite:exclude');
  return parts.join('; ');
}

function calculateInset(
  align: string,
  w: StrokeWeights
): { top: number; right: number; bottom: number; left: number } | number {
  if (align === 'INSIDE') return 0;
  if (align === 'CENTER') return { top: -w.t/2, right: -w.r/2, bottom: -w.b/2, left: -w.l/2 };
  if (align === 'OUTSIDE') return { top: -w.t, right: -w.r, bottom: -w.b, left: -w.l };
  return 0;
}

function computeCompensatedRadius(
  radii: RadiiData,
  align: string,
  weights: StrokeWeights
): string | null {
  if (align === 'INSIDE') return formatRadius(radii);

  const corners = radii.uniform !== undefined
    ? [radii.uniform, radii.uniform, radii.uniform, radii.uniform]
    : radii.corners || [0, 0, 0, 0];

  const [tl, tr, br, bl] = corners;

  const comps = calculateCompensations(align, weights);

  const final = [
    tl > 0 ? tl + comps.tl : 0,
    tr > 0 ? tr + comps.tr : 0,
    br > 0 ? br + comps.br : 0,
    bl > 0 ? bl + comps.bl : 0
  ];

  if (!final[0] && !final[1] && !final[2] && !final[3]) return null;
  return `border-radius:${final[0]}px ${final[1]}px ${final[2]}px ${final[3]}px`;
}

function calculateCompensations(
  align: string,
  w: StrokeWeights
): { tl: number; tr: number; br: number; bl: number } {
  const factor = align === 'CENTER' ? 0.25 : 0.5;
  return {
    tl: (w.t + w.l) * factor,
    tr: (w.t + w.r) * factor,
    br: (w.b + w.r) * factor,
    bl: (w.b + w.l) * factor
  };
}

function formatRadius(radii: RadiiData): string | null {
  if (radii.uniform !== undefined && radii.uniform > 0) {
    return `border-radius:${radii.uniform}px`;
  }
  if (radii.corners) {
    const [tl, tr, br, bl] = radii.corners;
    if (tl || tr || br || bl) {
      return `border-radius:${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }
  return null;
}
