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

type SvgShapeKind = 'rect' | 'ellipse' | null;

/**
 * Determine if node can regenerate its stroke as SVG primitive (rect/ellipse).
 */
function determineSvgShapeKind(node: any): SvgShapeKind {
  if (!node) return null;
  const hasGeometry = typeof node.width === 'number' && node.width > 0
    && typeof node.height === 'number' && node.height > 0;
  if (!hasGeometry) return null;
  const t = String(node.type || '').toUpperCase();
  if (t === 'RECTANGLE') return 'rect';
  if (t === 'ELLIPSE') return 'ellipse';
  return null;
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
    const dashPattern = Array.isArray((style && style.dashPattern)) && (style.dashPattern as any[]).every((v: any) => typeof v === 'number')
      ? (style.dashPattern as number[])
      : undefined;
    return { kind: 'solid', color, align: style.strokeAlign || 'INSIDE', weights, dashPattern };
  }

  if (visible?.type === 'GRADIENT_LINEAR') {
    const fill: GradientFill = {
      type: 'GRADIENT_LINEAR',
      gradientStops: Array.isArray(visible.gradientStops) ? visible.gradientStops : [],
      gradientHandlePositions: Array.isArray(visible.gradientHandlePositions) ? visible.gradientHandlePositions as any : null,
      gradientTransform: Array.isArray(visible.gradientTransform) ? (visible.gradientTransform as number[][]) : null,
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
    const hasDash = Array.isArray((strokeData as StrokeDataSolid).dashPattern) && (strokeData as StrokeDataSolid).dashPattern!.length > 0;
    const styleWord = hasDash ? 'dashed' : 'solid';
    if (strokeData.align === 'INSIDE') {
      if (!hasDash) {
        return { css: '', boxShadow: [`inset 0 0 0 ${w.t}px ${strokeData.color}`] };
      }
      const shapeKind = determineSvgShapeKind(node);
      if (shapeKind) {
        const host = hostSelector || `[data-layer-id="${node.id}"]`;
        const selector = `${host}::before`;
        const radii = node?.style?.radii as RadiiData | undefined;
        const nodeW = node.width;
        const nodeH = node.height;
        const props = generateSvgDashedPseudo(strokeData as StrokeDataSolid, radii, nodeW, nodeH, 'INSIDE', shapeKind, effects);
        collector.addRule(selector, props);
        return { css: '', boxShadow: [] };
      }
      // Without recognizable shape for dashed stroke, avoid generic pseudo-element rendering
      return { css: '', boxShadow: [] };
    } else if (strokeData.align === 'CENTER') {
      if (hasDash) {
        const shapeKind = determineSvgShapeKind(node);
        if (shapeKind) {
          const host = hostSelector || `[data-layer-id="${node.id}"]`;
          const selector = `${host}::before`;
          const radii = node?.style?.radii as RadiiData | undefined;
          const nodeW = node.width;
          const nodeH = node.height;
          const props = generateSvgDashedPseudo(strokeData as StrokeDataSolid, radii, nodeW, nodeH, 'CENTER', shapeKind, effects);
          collector.addRule(selector, props);
          return { css: '', boxShadow: [] };
        }
      }
      return { css: `border: ${w.t}px ${styleWord} ${strokeData.color};`, boxShadow: [] };
    } else if (strokeData.align === 'OUTSIDE') {
      if (hasDash) {
        const shapeKind = determineSvgShapeKind(node);
        if (shapeKind) {
          const host = hostSelector || `[data-layer-id="${node.id}"]`;
          const selector = `${host}::before`;
          const radii = node?.style?.radii as RadiiData | undefined;
          const nodeW = node.width;
          const nodeH = node.height;
          const props = generateSvgDashedPseudo(strokeData as StrokeDataSolid, radii, nodeW, nodeH, 'OUTSIDE', shapeKind, effects);
          collector.addRule(selector, props);
          return { css: '', boxShadow: [] };
        }
      }
      return { css: `outline: ${w.t}px ${styleWord} ${strokeData.color}; outline-offset: 0;`, boxShadow: [] };
    }
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
  if (strokeData.kind === 'gradient') {
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
  if (isUniform) {
    const styleWord = Array.isArray(data.dashPattern) && data.dashPattern.length > 0 ? 'dashed' : 'solid';
    parts.push(`border:${w.t}px ${styleWord} ${data.color}`);
  } else {
    const styleWord = Array.isArray(data.dashPattern) && data.dashPattern.length > 0 ? 'dashed' : 'solid';
    parts.push(`border-style:${styleWord}`);
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

function generateEllipseDashedPseudo(
  data: StrokeDataSolid,
  nodeW: number,
  nodeH: number,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE',
  effects?: ParsedEffects
): string {
  const s = Math.max(0, data.weights.t);
  const dash = Array.isArray(data.dashPattern) && data.dashPattern.length > 0 ? data.dashPattern : [];
  const dashStr = dash.join(' ');

  let inset = 0;
  if (align === 'CENTER') inset = -s / 2;
  else if (align === 'OUTSIDE') inset = -s;

  const pseudoW = align === 'INSIDE' ? nodeW : (align === 'CENTER' ? nodeW + s : nodeW + 2 * s);
  const pseudoH = align === 'INSIDE' ? nodeH : (align === 'CENTER' ? nodeH + s : nodeH + 2 * s);

  const cx = pseudoW / 2;
  const cy = pseudoH / 2;
  let rx = nodeW / 2;
  let ry = nodeH / 2;

  if (align === 'INSIDE') {
    rx = Math.max(0, rx - s / 2);
    ry = Math.max(0, ry - s / 2);
  } else if (align === 'OUTSIDE') {
    rx = rx + s / 2;
    ry = ry + s / 2;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='${pseudoW}' height='${pseudoH}' viewBox='0 0 ${pseudoW} ${pseudoH}'>` +
    `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='none' stroke='${data.color}' stroke-width='${s}' stroke-dasharray='${dashStr}' stroke-linecap='butt' shape-rendering='geometricPrecision'/>` +
    `</svg>`;

  const encoded = encodeURIComponent(svg);
  const parts: string[] = [];
  parts.push('content:""');
  parts.push('position:absolute');
  parts.push('z-index:0');
  parts.push('pointer-events:none');
  parts.push(`inset:${inset}px`);
  parts.push(`background-image:url("data:image/svg+xml;utf8,${encoded}")`);
  parts.push('background-repeat:no-repeat');
  parts.push('background-size:100% 100%');

  if (effects && effects.shadows.length > 0) {
    const dropShadows = effects.shadows
      .filter(sv => sv.type === 'DROP_SHADOW')
      .map(sv => `drop-shadow(${sv.x}px ${sv.y}px ${sv.blur}px ${sv.color})`);
    if (dropShadows.length > 0) parts.push(`filter:${dropShadows.join(' ')}`);
  }

  return parts.join('; ');
}

function generateRectDashedPseudo(
  data: StrokeDataSolid,
  radii: RadiiData | undefined,
  nodeW: number,
  nodeH: number,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE',
  effects?: ParsedEffects
): string {
  const s = Math.max(0, data.weights.t);
  const dash = Array.isArray(data.dashPattern) && data.dashPattern.length > 0 ? data.dashPattern : [];
  const dashStr = dash.join(' ');

  const box = calcRectPseudoBox(nodeW, nodeH, s, align);
  let svg = buildRectSvg(box, data.color, s, dashStr, radii, align);
  if (radii && (Array.isArray(radii.corners) || typeof radii.uniform === 'number')) {
    const corners = computeCornerRadiiForPath(radii, s, align, box.w, box.h);
    svg = buildRoundedPathSvg(box, corners, data.color, s, dashStr);
  }
  return assembleSvgPseudoCss(svg, box.inset, effects, radii, align);
}

function calcRectPseudoBox(
  nodeW: number,
  nodeH: number,
  s: number,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE'
): { inset: number; pseudoW: number; pseudoH: number; x: number; y: number; w: number; h: number } {
  let inset = 0;
  if (align === 'CENTER') inset = -s / 2; else if (align === 'OUTSIDE') inset = -s;
  const pseudoW = align === 'INSIDE' ? nodeW : (align === 'CENTER' ? nodeW + s : nodeW + 2 * s);
  const pseudoH = align === 'INSIDE' ? nodeH : (align === 'CENTER' ? nodeH + s : nodeH + 2 * s);
  const x = s / 2;
  const y = s / 2;
  const w = align === 'INSIDE' ? Math.max(0, nodeW - s) : (align === 'CENTER' ? nodeW : nodeW + s);
  const h = align === 'INSIDE' ? Math.max(0, nodeH - s) : (align === 'CENTER' ? nodeH : nodeH + s);
  return { inset, pseudoW, pseudoH, x, y, w, h };
}

function adjustUniformRadius(uniform: number | undefined, s: number, align: 'INSIDE' | 'CENTER' | 'OUTSIDE'): number {
  const r = typeof uniform === 'number' ? Math.max(0, uniform) : 0;
  if (r === 0) return 0;
  if (align === 'INSIDE') return Math.max(0, r - s / 2);
  if (align === 'CENTER') return r;
  return r + s / 2;
}

function buildRectSvg(
  box: { pseudoW: number; pseudoH: number; x: number; y: number; w: number; h: number },
  color: string,
  s: number,
  dashStr: string,
  radii: RadiiData | undefined,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE'
): string {
  const rx = adjustUniformRadius(radii?.uniform, s, align);
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='${box.pseudoW}' height='${box.pseudoH}' viewBox='0 0 ${box.pseudoW} ${box.pseudoH}'>` +
    `<rect x='${box.x}' y='${box.y}' width='${box.w}' height='${box.h}' rx='${rx}' ry='${rx}' fill='none' stroke='${color}' stroke-width='${s}' stroke-dasharray='${dashStr}' stroke-linecap='butt' shape-rendering='geometricPrecision'/>` +
    `</svg>`;
}

function computeCornerRadiiForPath(
  radii: RadiiData,
  s: number,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE',
  w: number,
  h: number
): { tl: number; tr: number; br: number; bl: number } {
  let tl0 = 0, tr0 = 0, br0 = 0, bl0 = 0;
  if (typeof radii.uniform === 'number') {
    const rr = Math.max(0, radii.uniform);
    tl0 = tr0 = br0 = bl0 = rr;
  } else if (Array.isArray(radii.corners)) {
    const arr = radii.corners as [number, number, number, number];
    tl0 = Math.max(0, Number(arr[0]) || 0);
    tr0 = Math.max(0, Number(arr[1]) || 0);
    br0 = Math.max(0, Number(arr[2]) || 0);
    bl0 = Math.max(0, Number(arr[3]) || 0);
  }
  const delta = align === 'INSIDE' ? -s / 2 : (align === 'CENTER' ? 0 : s / 2);
  let tl = Math.max(0, tl0 + delta);
  let tr = Math.max(0, tr0 + delta);
  let br = Math.max(0, br0 + delta);
  let bl = Math.max(0, bl0 + delta);

  // Normalize so radii fit within side lengths
  const top = tl + tr, bottom = br + bl, left = tl + bl, right = tr + br;
  const sx = Math.min(1, w / Math.max(1, top, bottom));
  const sy = Math.min(1, h / Math.max(1, left, right));
  const smin = Math.min(sx, sy);
  if (smin < 1) { tl *= smin; tr *= smin; br *= smin; bl *= smin; }
  return { tl, tr, br, bl };
}

function buildRoundedPathSvg(
  box: { pseudoW: number; pseudoH: number; x: number; y: number; w: number; h: number },
  corners: { tl: number; tr: number; br: number; bl: number },
  color: string,
  s: number,
  dashStr: string
): string {
  const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  const tl = corners.tl, tr = corners.tr, br = corners.br, bl = corners.bl;
  const cmds: string[] = [];
  cmds.push(`M ${x0 + tl} ${y0}`);
  cmds.push(`H ${x1 - tr}`);
  if (tr > 0) cmds.push(`A ${tr} ${tr} 0 0 1 ${x1} ${y0 + tr}`); else cmds.push(`L ${x1} ${y0}`);
  cmds.push(`V ${y1 - br}`);
  if (br > 0) cmds.push(`A ${br} ${br} 0 0 1 ${x1 - br} ${y1}`); else cmds.push(`L ${x1} ${y1}`);
  cmds.push(`H ${x0 + bl}`);
  if (bl > 0) cmds.push(`A ${bl} ${bl} 0 0 1 ${x0} ${y1 - bl}`); else cmds.push(`L ${x0} ${y1}`);
  cmds.push(`V ${y0 + tl}`);
  if (tl > 0) cmds.push(`A ${tl} ${tl} 0 0 1 ${x0 + tl} ${y0}`); else cmds.push(`L ${x0} ${y0}`);
  cmds.push('Z');
  const d = cmds.join(' ');
  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='${box.pseudoW}' height='${box.pseudoH}' viewBox='0 0 ${box.pseudoW} ${box.pseudoH}'>` +
    `<path d='${d}' fill='none' stroke='${color}' stroke-width='${s}' stroke-dasharray='${dashStr}' stroke-linecap='butt' shape-rendering='geometricPrecision'/>` +
    `</svg>`;
}

function assembleSvgPseudoCss(
  svg: string,
  inset: number,
  effects?: ParsedEffects,
  radii?: RadiiData,
  align?: 'INSIDE' | 'CENTER' | 'OUTSIDE'
): string {
  const encoded = encodeURIComponent(svg);
  const parts: string[] = [];
  parts.push('content:""');
  parts.push('position:absolute');
  parts.push('z-index:0');
  parts.push('pointer-events:none');
  parts.push(`inset:${inset}px`);
  parts.push(`background-image:url("data:image/svg+xml;utf8,${encoded}")`);
  parts.push('background-repeat:no-repeat');
  parts.push('background-size:100% 100%');
  if (align === 'INSIDE' && radii) {
    const rcss = formatRadius(radii);
    if (rcss) parts.push(rcss.replace(/;$/, ''));
  }
  if (effects && effects.shadows.length > 0) {
    const dropShadows = effects.shadows
      .filter(sv => sv.type === 'DROP_SHADOW')
      .map(sv => `drop-shadow(${sv.x}px ${sv.y}px ${sv.blur}px ${sv.color})`);
    if (dropShadows.length > 0) parts.push(`filter:${dropShadows.join(' ')}`);
  }
  return parts.join('; ');
}

function generateSvgDashedPseudo(
  data: StrokeDataSolid,
  radii: RadiiData | undefined,
  nodeW: number,
  nodeH: number,
  align: 'INSIDE' | 'CENTER' | 'OUTSIDE',
  shapeKind: SvgShapeKind,
  effects?: ParsedEffects
): string {
  if (shapeKind === 'ellipse') {
    return generateEllipseDashedPseudo(data, nodeW, nodeH, align, effects);
  }
  return generateRectDashedPseudo(data, radii, nodeW, nodeH, align, effects);
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
