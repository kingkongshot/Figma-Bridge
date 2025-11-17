import type { RenderNodeIR, DocumentConfig, Viewport, Bounds, Rect, RenderBoxConfig, RenderBoxOptions, PreviewBuildInput } from './types';
import { CssCollector } from '../utils/cssCollector';
import { buildSharedClasses, generateClassCss } from '../utils/classExtractor';
import { optimizeBoxCss } from '../utils/css-optimizer';
import { layoutToTailwindClasses, cssToTailwindClasses } from '../utils/tailwind-mapper';
import { buildUtilityCssSelective } from '../utils/utility-css';
import { buildHtmlHead, buildHtmlBody, buildBaseStyles } from '../utils/html-builder';
import { splitClassTokens } from '../utils/css-parser';
import { migrateShadowsToOuter } from '../utils/shadow-migrator';
import { getSemanticClassName } from '../utils/class-naming';

// Why: avoid one-off utility classes — only promote widths/heights that repeat
type SizeFreq = { w: Map<number, number>; h: Map<number, number> };

function shouldUseWidthClass(v: unknown, sizeFreq?: SizeFreq): boolean {
  if (typeof v !== 'number' || !isFinite(v)) return false;
  if (!sizeFreq) return true;
  return (sizeFreq.w.get(v) || 0) > 1;
}

function shouldUseHeightClass(v: unknown, sizeFreq?: SizeFreq): boolean {
  if (typeof v !== 'number' || !isFinite(v)) return false;
  if (!sizeFreq) return true;
  return (sizeFreq.h.get(v) || 0) > 1;
}

function collectSizeFreq(nodes: RenderNodeIR[], outW: Map<number, number>, outH: Map<number, number>): void {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n || !n.layout) continue;
    const w = (n.layout as any).width;
    const h = (n.layout as any).height;
    if (typeof w === 'number' && isFinite(w)) outW.set(w, (outW.get(w) || 0) + 1);
    if (typeof h === 'number' && isFinite(h)) outH.set(h, (outH.get(h) || 0) + 1);
    if (n.content && n.content.type === 'children' && Array.isArray(n.content.nodes)) {
      collectSizeFreq(n.content.nodes, outW, outH);
    }
  }
}

export type PreviewHtmlResult = {
  html: string;
  baseWidth: number;
  baseHeight: number;
  renderUnion: Rect;
  debugHtml: string;
  debugCss: string;
};

function computeViewport(bounds: Bounds, union: Rect, padding: number = 4) {
  const outlinePadding = Math.max(0, padding | 0);
  const minXView = Math.min(0, union.x) - outlinePadding;
  const minYView = Math.min(0, union.y) - outlinePadding;
  const maxXView = Math.max(bounds.width, union.x + union.width) + outlinePadding;
  const maxYView = Math.max(bounds.height, union.y + union.height) + outlinePadding;
  const viewWidth = maxXView - minXView;
  const viewHeight = maxYView - minYView;
  return { viewWidth, viewHeight, minXView, minYView };
}

// Why: trim float noise (e.g. 596.000244px)
function fmtPx(n: number): string {
  if (!isFinite(n)) return '0px';
  const v = Math.round(n * 100) / 100;
  const s = String(v);
  return (s.replace(/\.00$/, '').replace(/\.0$/, '')) + 'px';
}

function extractCssValue(css: string, property: string): string | undefined {
  if (!css) return undefined;
  const regex = new RegExp(`${property}\\s*:\\s*([^;]+)`, 'i');
  const match = css.match(regex);
  return match ? match[1].trim() : undefined;
}

function escAttr(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}
function h(tag: string, attrs: Record<string, string | number | undefined> | null, children?: string | string[]): string {
  const attrStr = attrs
    ? ' ' + Object.entries(attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}="${escAttr(String(v))}` + '"')
        .join(' ')
    : '';
  const inner = Array.isArray(children) ? children.join('') : (children || '');
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

function layoutToCss(layout: RenderNodeIR['layout']): {
  containerCss: string;
  positioningCss: string;
  sizingCss: string;
  transformCss: string;
} {
  const partsContainer: string[] = [];
  if (layout.display === 'flex') {
    partsContainer.push('display:flex;');
    if (layout.flexDirection) partsContainer.push(`flex-direction:${layout.flexDirection};`);
    if (typeof layout.gap === 'number') partsContainer.push(`gap:${fmtPx(layout.gap).replace('px','')}px;`);
    if (layout.flexWrap === 'wrap') partsContainer.push('flex-wrap:wrap;');
    if (typeof layout.rowGap === 'number') partsContainer.push(`row-gap:${fmtPx(layout.rowGap).replace('px','')}px;`);
    if (typeof layout.columnGap === 'number') partsContainer.push(`column-gap:${fmtPx(layout.columnGap).replace('px','')}px;`);
    if (layout.justifyContent) partsContainer.push(`justify-content:${layout.justifyContent};`);
    if (layout.alignItems) partsContainer.push(`align-items:${layout.alignItems};`);
  } else {
    partsContainer.push('display:block;');
  }
  if (layout.padding) {
    const { t, r, b, l } = layout.padding;
    if (t || r || b || l) partsContainer.push(`padding:${t || 0}px ${r || 0}px ${b || 0}px ${l || 0}px;`);
  }
  if (layout.boxSizing) partsContainer.push(`box-sizing:${layout.boxSizing};`);
  if (layout.overflow && layout.overflow !== 'visible') partsContainer.push('overflow:hidden;');

  const partsPos: string[] = [];
  const pos = layout.position || 'absolute';
  partsPos.push(`position:${pos};`);
  if (pos === 'absolute') {
    const l = typeof layout.left === 'number' ? layout.left : 0;
    const t = typeof layout.top === 'number' ? layout.top : 0;
    partsPos.push(`left:${fmtPx(l)};top:${fmtPx(t)};`);
  }

  const partsSize: string[] = [];
  const w = layout.width;
  const h = layout.height;
  if (typeof w === 'number') partsSize.push(`width:${fmtPx(w)};`);
  if (typeof h === 'number') partsSize.push(`height:${fmtPx(h)};`);
  if (typeof layout.flexGrow === 'number' && layout.flexGrow > 0) {
    partsSize.push(`flex-grow:${layout.flexGrow};`);
    if (typeof layout.flexShrink === 'number' && layout.flexShrink === 0) partsSize.push('flex-shrink:0;');
    partsSize.push(`flex-basis:${typeof layout.flexBasis === 'number' ? fmtPx(layout.flexBasis) : (layout.flexBasis || '0')};`);
    partsSize.push('min-width:0;min-height:0;');
  } else if (typeof layout.flexShrink === 'number' && layout.flexShrink === 0) {
    partsSize.push('flex-shrink:0;');
  }
  if (layout.alignSelf && layout.alignSelf !== 'auto') partsSize.push(`align-self:${layout.alignSelf};`);

  const t2 = layout.transform2x2;
  const isIdentity = t2.a === 1 && t2.b === 0 && t2.c === 0 && t2.d === 1;
  const partsXf: string[] = [];
  if (!isIdentity) {
    partsXf.push(`transform-origin:${layout.origin};`);
    partsXf.push(`transform:matrix(${t2.a},${t2.b},${t2.c},${t2.d},0,0);`);
  } else {
    partsXf.push(`transform-origin:${layout.origin};`);
  }

  return {
    containerCss: partsContainer.join(''),
    positioningCss: partsPos.join(''),
    sizingCss: partsSize.join(''),
    transformCss: partsXf.join(''),
  };
}

type RenderMode = 'content' | 'debug';
type RenderContext = {
  stylePrefix: string;
  irNode: RenderNodeIR;
  cssCollector: CssCollector;
  mode: RenderMode;
  applySharedClass?: (css: string) => { className: string | null; newCss: string };
  omitPositionOverride?: boolean;
  usedClasses?: Set<string>;
  sizeFreq?: SizeFreq;
};

function getRootPadding(irNodes: RenderNodeIR[]): { left: number; top: number } | null {
  if (!Array.isArray(irNodes) || irNodes.length !== 1) return null;
  const n = irNodes[0];
  if (!n || !n.style || !n.layout) return null;
  const isFlex = /(^|;)\s*display\s*:\s*flex\s*;?/i.test(n.style.boxCss || '');
  if (!isFlex) return null;
  if (n.layout.position !== 'absolute') return null;
  const left = n.layout.left;
  const top = n.layout.top;
  if (typeof left !== 'number' || typeof top !== 'number') return null;
  if (left === 0 && top === 0) return null;
  return { left, top };
}

function hasAbsoluteDescendant(irNode: RenderNodeIR): boolean {
  if (!irNode) return false;
  const stack: RenderNodeIR[] = [];
  if (irNode.content && irNode.content.type === 'children' && Array.isArray(irNode.content.nodes)) {
    stack.push(...irNode.content.nodes);
  }
  while (stack.length) {
    const n = stack.pop()!;
    if (n.layout && n.layout.position === 'absolute') return true;
    if (n.content && n.content.type === 'children' && Array.isArray(n.content.nodes)) {
      stack.push(...n.content.nodes);
    }
  }
  return false;
}

function sanitizeSvgForOutline(svgRaw: string): string {
  if (!svgRaw) return '';
  try {
    const viewBoxMatch = svgRaw.match(/viewBox\s*=\s*"([^"]+)"/i);
    const vb = viewBoxMatch ? ` viewBox="${viewBoxMatch[1]}"` : '';
    const inner = svgRaw.replace(/<\/?svg[^>]*>/gi, '');
    return `<svg${vb} fill="none" stroke="var(--bridge-debug-blue)" stroke-opacity="var(--bridge-debug-alpha)" vector-effect="non-scaling-stroke" stroke-width="var(--bridge-stroke, calc(1px/var(--bridge-scale)))" shape-rendering="geometricPrecision">${inner}</svg>`;
  } catch {
    return `<svg fill="none" stroke="var(--bridge-debug-blue)" stroke-opacity="var(--bridge-debug-alpha)" vector-effect="non-scaling-stroke" stroke-width="var(--bridge-stroke, calc(1px/var(--bridge-scale)))" shape-rendering="geometricPrecision">${svgRaw.replace(/<\/?svg[^>]*>/gi, '')}</svg>`;
  }
}

function splitBoxCssForWrapper(boxCss: string): { outerCss: string; innerCss: string } {
  if (!boxCss) return { outerCss: '', innerCss: '' };
  const outerProps = new Set([
    'flex-grow', 'flex-shrink', 'flex-basis', 'min-width', 'min-height', 'align-self', 'z-index',
  ]);
  const outerAlsoWhenAuto = new Set(['width', 'height']);
  const tokens = boxCss.split(';').map(s => s.trim()).filter(Boolean);
  const outer: string[] = [];
  const inner: string[] = [];
  for (const t of tokens) {
    const [rawK] = t.split(':');
    const k = (rawK || '').trim().toLowerCase();
    const v = (t.slice((rawK || '').length + 1) || '').trim().toLowerCase();
    if (outerProps.has(k)) { outer.push(t + ';'); continue; }
    if (outerAlsoWhenAuto.has(k) && v === 'auto') { outer.push(`${k}:auto;`); continue; }
    inner.push(t + ';');
  }
  return { outerCss: outer.join(''), innerCss: inner.join('') };
}

function cleanBoxCssForSingleBox(boxCss: string): { css: string; hasAutoWidth: boolean; hasAutoHeight: boolean } {
  if (!boxCss) return { css: '', hasAutoWidth: false, hasAutoHeight: false };
  const tokens = boxCss.split(';').map(s => s.trim()).filter(Boolean);
  const kept: string[] = [];
  let lastWidthValue: string | null = null;
  let lastHeightValue: string | null = null;

  for (const t of tokens) {
    const [rawK] = t.split(':');
    const k = (rawK || '').trim().toLowerCase();
    const v = (t.slice((rawK || '').length + 1) || '').trim().toLowerCase();
    if (k === 'width') {
      lastWidthValue = v;
      continue;
    }
    if (k === 'height') {
      lastHeightValue = v;
      continue;
    }
    kept.push(t + ';');
  }

  const hasAutoWidth = lastWidthValue === 'auto';
  const hasAutoHeight = lastHeightValue === 'auto';
  return { css: kept.join(''), hasAutoWidth, hasAutoHeight };
}

function extractLayoutCssForDebug(boxCss: string): string {
  if (!boxCss) return '';
  const layoutProps = new Set([
    'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
    'flex-grow', 'flex-shrink', 'flex-basis', 'align-self',
    'min-width', 'min-height', 'max-width', 'max-height',
    'overflow', 'overflow-x', 'overflow-y',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'row-gap', 'column-gap',
    'box-sizing',
    'border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'flex-wrap',
    // Why: debug overlay needs to reveal text wrapping/alignment
    'white-space', 'text-align'
  ]);
  const tokens = boxCss.split(';').map(s => s.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const t of tokens) {
    const [rawK] = t.split(':');
    const k = (rawK || '').trim().toLowerCase();
    const v = (t.slice((rawK || '').length + 1) || '').trim().toLowerCase();
    if (layoutProps.has(k)) {
      kept.push(t + ';');
    } else if ((k === 'width' || k === 'height') && v === 'auto') {
      kept.push(`${k}:auto;`);
    }
  }
  return kept.join('');
}

function renderWrapperBox(cfg: RenderBoxConfig): string {
  const { className, id, layout, boxCss, innerContent } = cfg;
  const opts = cfg.options;
  const t = layout.transform2x2;
  const cssSeg = layoutToCss(layout);
  const { outerCss, innerCss } = splitBoxCssForWrapper(boxCss);

  const posPart = cssSeg.positioningCss;
  const baseStart = `${posPart}${opts?.outerOverflowVisible ? 'overflow:visible;' : ''}`;
  let outer = `${baseStart}${cssSeg.sizingCss}${outerCss}`;

  const containerCssForInner = layout.display === 'flex' ? cssSeg.containerCss : '';
  
  // Why: wrapper carries inner content size used for centering
  type WrapperInfo = { contentWidth: number; contentHeight: number; centerStrategy?: 'inset' | 'translate' };
  const wrapper = (layout as any).wrapper as WrapperInfo | undefined;
  const strategy = wrapper?.centerStrategy;
  if (!strategy) {
    throw new Error(`renderWrapperBox: missing wrapper.centerStrategy for node ${id}`);
  }
  const { contentWidth, contentHeight } = wrapper;
  
  let inner = '';
  if (strategy === 'inset') {
    inner = `position:absolute;left:0;top:0;right:0;bottom:0;margin:auto;` +
            `width:${fmtPx(contentWidth)};height:${fmtPx(contentHeight)};` +
            `${containerCssForInner}${cssSeg.transformCss}${innerCss}`;
  } else {
    // Why: 50%+negative margin centers in pre-transform coords; translate(-50%,-50%) runs in rotated coords and misaligns
    const marginCss = `margin-left:${fmtPx(-contentWidth / 2)};margin-top:${fmtPx(-contentHeight / 2)};`;
    inner = `position:absolute;left:50%;top:50%;${marginCss}` +
            `width:${fmtPx(contentWidth)};height:${fmtPx(contentHeight)};` +
            `${containerCssForInner}${cssSeg.transformCss}${innerCss}`;
  }

  if (!(t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1)) {
    const res = migrateShadowsToOuter(inner, outer);
    inner = res.newInner;
    outer = res.newOuter;
  }

  inner = optimizeBoxCss(inner, {
    position: 'absolute',
    hasRotateOrScale: !(t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1),
    display: (layout.display || 'block') as any,
    flexDirection: (layout.flexDirection || 'row') as any,
    isText: false,
  });

  const innerClass = opts?.innerClassName || 'content-layer';
  let outerClass = className ? `${className} has-wrapper` : 'has-wrapper';

  let innerClassExtra = '';
  if (opts?.mode === 'content' && opts?.hasStroke) {
    const classTokens = splitClassTokens(className || '');
    const outlineTokens: string[] = [];
    const nonOutlineTokens: string[] = [];
    for (const token of classTokens) {
      if (token.startsWith('outline')) outlineTokens.push(token);
      else nonOutlineTokens.push(token);
    }
    if (outlineTokens.length > 0) {
      innerClassExtra = ' ' + outlineTokens.join(' ');
      outerClass = nonOutlineTokens.length > 0 ? `${nonOutlineTokens.join(' ')} has-wrapper` : 'has-wrapper';
    }
  }

  if (opts?.mode === 'content' && (layout as any).flexShrink === 0 && !/\bshrink-0\b/.test(outerClass)) {
    outerClass += ' shrink-0';
    outer = outer.replace(/(^|;)\s*flex-shrink\s*:[^;]+;?/i, '$1');
  }
  {
    const tokenSet = new Set((outerClass || '').split(/\s+/).filter(Boolean));
    if (tokenSet.has('self-stretch') || tokenSet.has('self-start') || tokenSet.has('self-end') || tokenSet.has('self-center') || tokenSet.has('self-baseline')) {
      outer = outer.replace(/(^|;)\s*align-self\s*:[^;]+;?/gi, '$1');
    }
  }

  outer = optimizeBoxCss(outer, {
    position: (layout.position || 'absolute') as any,
    hasRotateOrScale: !(t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1),
    display: (layout.display || 'block') as any,
    flexDirection: (layout.flexDirection || 'row') as any,
    isText: false,
  });

  const attrs: Record<string, string> = { class: outerClass, style: outer };
  if (opts?.mode === 'debug') attrs['data-layer-id'] = id;
  const innerAttrs: Record<string, string> = { class: innerClass + innerClassExtra, style: inner };
  if (opts?.mode === 'content' && opts?.hasStroke) innerAttrs['data-layer-id'] = id;

  return h('div', attrs, h('div', innerAttrs, innerContent));
}

function renderSingleBox(cfg: RenderBoxConfig): string {
  const { className, id, layout, boxCss, innerContent } = cfg;
  const opts = cfg.options;
  const t = layout.transform2x2;
  const cleaned = cleanBoxCssForSingleBox(boxCss);

  // Why: respect textAutoResize: auto width/height should not be constrained to renderBounds
  const adjustedLayout = { ...layout };
  if (cleaned.hasAutoWidth) adjustedLayout.width = 'auto' as any;
  if (cleaned.hasAutoHeight) adjustedLayout.height = 'auto' as any;

  const cssSeg = layoutToCss(adjustedLayout);
  const isIdentity = t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1;
  const transformPart = isIdentity ? '' : cssSeg.transformCss;
  const posPart = opts?.omitPosition ? '' : cssSeg.positioningCss;
  const baseStart = `${posPart}${transformPart}`;

  let sizeCss = cssSeg.sizingCss;
  if (opts?.mode === 'content' && className) {
    const tokens = new Set((className || '').split(/\s+/).filter(Boolean));
    function drop(prop: string) {
      sizeCss = sizeCss.replace(new RegExp(`(^|;)\\s*${prop}\\s*:[^;]+;?`, 'gi'), '$1');
    }
    if ([...tokens].some(c => /^w-\[.+\]$/.test(c))) drop('width');
    if ([...tokens].some(c => /^h-\[.+\]$/.test(c))) drop('height');
    if (tokens.has('shrink-0')) drop('flex-shrink');
    if (tokens.has('self-stretch') || tokens.has('self-start') || tokens.has('self-end') || tokens.has('self-center') || tokens.has('self-baseline')) drop('align-self');
    if (tokens.has('grow')) drop('flex-grow');
    if ([...tokens].some(c => c === 'basis-0' || c === 'basis-auto')) drop('flex-basis');
  }

  const containerPart = opts?.mode === 'debug' ? cssSeg.containerCss : '';
  const style = `${baseStart}${sizeCss}${cleaned.css}${containerPart}`;
  const attrs: Record<string, string> = { class: className, style };
  if (opts?.mode === 'debug') attrs['data-layer-id'] = id;
  else if (opts?.mode === 'content' && opts?.hasStroke) attrs['data-layer-id'] = id;
  return h('div', attrs, innerContent);
}

function maybeWrapWithContentBox(cfg: RenderBoxConfig): string {
  const { layout } = cfg;
  const wrapper = (layout as any).wrapper as { contentWidth: number; contentHeight: number } | undefined;
  const hasWrapper = wrapper && typeof wrapper.contentWidth === 'number' && typeof wrapper.contentHeight === 'number';
  if (hasWrapper) {
    return renderWrapperBox(cfg);
  }
  return renderSingleBox(cfg);
}

async function renderFrameNode(ctx: RenderContext): Promise<string> {
  if (!ctx.irNode) throw new Error('renderFrameNode: irNode missing');
  const layout = ctx.irNode.layout;
  let boxCss = ctx.mode === 'debug' ? extractLayoutCssForDebug(ctx.irNode.style.boxCss) : ctx.irNode.style.boxCss;
  const cssCtx = {
    position: layout.position,
    hasRotateOrScale: !(layout.transform2x2.a === 1 && layout.transform2x2.b === 0 && layout.transform2x2.c === 0 && layout.transform2x2.d === 1),
    display: extractCssValue(boxCss, 'display'),
    flexDirection: extractCssValue(boxCss, 'flex-direction'),
    isText: false,
  };
  boxCss = optimizeBoxCss(boxCss, cssCtx);
  const hasWrapper = !!(layout as any).wrapper;
  const utilClasses: string[] = [];
  if (ctx.mode === 'content' && !hasWrapper) {
    const util = await layoutToTailwindClasses(layout, boxCss || '');
    if (util.classNames.length) utilClasses.push(...util.classNames);
    if (typeof layout.width === 'number' && shouldUseWidthClass(layout.width, ctx.sizeFreq)) {
      const cw = `w-[${Math.round(layout.width*100)/100}px]`;
      utilClasses.push(cw);
      if (ctx.usedClasses) ctx.usedClasses.add(cw);
    }
    if (typeof layout.height === 'number' && shouldUseHeightClass(layout.height, ctx.sizeFreq)) {
      const ch = `h-[${Math.round(layout.height*100)/100}px]`;
      utilClasses.push(ch);
      if (ctx.usedClasses) ctx.usedClasses.add(ch);
    }
    boxCss = util.remainingCss;
    if (ctx.usedClasses && util.classNames.length) {
      util.classNames.forEach((c: string) => ctx.usedClasses!.add(c));
    }
  }
  let innerHtml = '';
  if (ctx.irNode.content.type === 'children' && Array.isArray(ctx.irNode.content.nodes)) {
    const parts = await Promise.all(
      ctx.irNode.content.nodes.map((childIr) => {
        return renderNodeUnified(childIr, { stylePrefix: '', irNode: childIr, cssCollector: ctx.cssCollector, mode: ctx.mode, applySharedClass: ctx.applySharedClass, usedClasses: ctx.usedClasses });
      })
    );
    innerHtml = parts.join('');
  }
  if (ctx.mode === 'debug') {
    var classNames: string[] = ['debug-box'];
  } else {
    const semantic = ctx.irNode.isMask
      ? 'mask-container'
      : getSemanticClassName(ctx.irNode.name || '', 'frame');
    const classSet = new Set<string>();
    classSet.add('frame');
    if (ctx.irNode.isMask) classSet.add('mask-container');
    if (semantic && semantic !== 'frame') classSet.add(semantic);
    var classNames: string[] = Array.from(classSet);
  }
  if (ctx.mode === 'content' && utilClasses.length) classNames.push(...utilClasses);
  if (ctx.mode === 'content' && ctx.applySharedClass) {
    const res = ctx.applySharedClass(boxCss);
    if (res.className) classNames.push(res.className);
    boxCss = res.newCss;
  }
  const className = classNames.join(' ');
  // Why: for boxes with visible geometry (padding/bg/radius) force layout size to keep debug overlay aligned; others let children size naturally
  let debugOverrideSize = false;
  if (ctx.mode === 'debug' && !hasWrapper) {
    const cssForCheck = boxCss || '';
    const hasPadding = /(^|;)\s*padding(\-|:)/i.test(cssForCheck);
    const hasBackground = /(^|;)\s*background\s*:/i.test(cssForCheck);
    const hasRadius = /(^|;)\s*border-(top-left-|top-right-|bottom-right-|bottom-left-)?radius\s*:/i.test(cssForCheck);
    debugOverrideSize = hasPadding || hasBackground || hasRadius;
  }
  const omitPosition = ctx.omitPositionOverride || (!hasWrapper && layout.position === 'relative' && ctx.mode === 'content' && !hasAbsoluteDescendant(ctx.irNode));
  const hasStroke = !!(ctx.irNode.style.raw?.strokes && ctx.irNode.style.raw.strokes.length > 0);
  return maybeWrapWithContentBox({
    className,
    id: ctx.irNode.id,
    layout,
    boxCss,
    innerContent: innerHtml,
    options: { outerOverflowVisible: true, innerClassName: ctx.mode === 'debug' ? 'debug-box' : undefined, debugOverrideSize, omitPosition, mode: ctx.mode, hasStroke }
  });
}

async function renderTextNode(ctx: RenderContext): Promise<string> {
  if (!ctx.irNode) throw new Error('renderTextNode: irNode missing');
  // Why: keep text content in debug mode for accurate flexbox sizing, but make it invisible
  const rawTextHtml = (ctx.irNode.content.type === 'text' ? ctx.irNode.content.html : '');
  const textHtml = ctx.mode === 'debug'
    ? (rawTextHtml ? `<span style="visibility:hidden;">${rawTextHtml}</span>` : '')
    : rawTextHtml;
  let boxCss = ctx.mode === 'debug' ? extractLayoutCssForDebug(ctx.irNode.style.boxCss) : ctx.irNode.style.boxCss;
  const cssCtx = {
    position: ctx.irNode.layout.position,
    hasRotateOrScale: !(ctx.irNode.layout.transform2x2.a === 1 && ctx.irNode.layout.transform2x2.b === 0 && ctx.irNode.layout.transform2x2.c === 0 && ctx.irNode.layout.transform2x2.d === 1),
    display: extractCssValue(boxCss, 'display'),
    flexDirection: extractCssValue(boxCss, 'flex-direction'),
    isText: true,
  };
  boxCss = optimizeBoxCss(boxCss, cssCtx);
  const utilClassesT: string[] = [];
  if (ctx.mode === 'content') {
    const util = await layoutToTailwindClasses(ctx.irNode.layout, boxCss || '');
    if (util.classNames.length) utilClassesT.push(...util.classNames);

    // Why: respect textAutoResize: skip width/height classes when text uses auto sizing
    const hasAutoWidth = /width\s*:\s*auto\s*(;|$)/i.test(boxCss || '');
    const hasAutoHeight = /height\s*:\s*auto\s*(;|$)/i.test(boxCss || '');

    const w = ctx.irNode.layout.width; const h = ctx.irNode.layout.height;
    if (typeof w === 'number' && !hasAutoWidth && shouldUseWidthClass(w, ctx.sizeFreq)) {
      const cw = `w-[${Math.round(w*100)/100}px]`;
      utilClassesT.push(cw);
      if (ctx.usedClasses) ctx.usedClasses.add(cw);
    }
    if (typeof h === 'number' && !hasAutoHeight && shouldUseHeightClass(h, ctx.sizeFreq)) {
      const ch = `h-[${Math.round(h*100)/100}px]`;
      utilClassesT.push(ch);
      if (ctx.usedClasses) ctx.usedClasses.add(ch);
    }
    boxCss = util.remainingCss;
    if (ctx.usedClasses && util.classNames.length) {
      util.classNames.forEach((c: string) => ctx.usedClasses!.add(c));
    }
  }
  
  if (ctx.mode === 'debug') {
    var classNames: string[] = ['debug-box'];
  } else {
    const semantic = getSemanticClassName(ctx.irNode.name || '', 'text');
    const classSet = new Set<string>(['text']);
    if (semantic && semantic !== 'text') classSet.add(semantic);
    var classNames: string[] = Array.from(classSet);
  }
  if (ctx.mode === 'content' && utilClassesT.length) classNames.push(...utilClassesT);
  if (ctx.mode === 'content' && ctx.applySharedClass) {
    const res = ctx.applySharedClass(boxCss);
    if (res.className) classNames.push(res.className);
    boxCss = res.newCss;
  }
  const className = classNames.join(' ');
  const hasWrapper = !!(ctx.irNode.layout as any).wrapper;
  const debugOverrideSize = false;
  const omitPosition = ctx.omitPositionOverride || (!hasWrapper && ctx.irNode.layout.position === 'relative' && ctx.mode === 'content' && !hasAbsoluteDescendant(ctx.irNode));
  const hasStroke = !!(ctx.irNode.style.raw?.strokes && ctx.irNode.style.raw.strokes.length > 0);
  return maybeWrapWithContentBox({
    className,
    id: ctx.irNode.id,
    layout: ctx.irNode.layout,
    boxCss,
    innerContent: textHtml,
    options: { innerClassName: ctx.mode === 'debug' ? 'debug-box' : undefined, debugOverrideSize, omitPosition, mode: ctx.mode, hasStroke }
  });
}

async function renderSvgNode(ctx: RenderContext): Promise<string> {
  if (!ctx.irNode) throw new Error('renderSvgNode: irNode missing');
  const svgFile = (ctx.irNode as any).svgFile || null;
  const svgContent = (ctx.irNode as any).svgContent || '';
  const wantsShape = ctx.mode === 'debug' && typeof svgContent === 'string' && svgContent.trim().length > 0;
  
  let className = '';
  if (ctx.mode === 'debug') {
    className = wantsShape ? 'debug-svg shape-only' : 'debug-svg';
  } else {
    const semantic = getSemanticClassName(ctx.irNode.name || '', 'svg-container');
    const classSet = new Set<string>(['svg-container']);
    if (semantic && semantic !== 'svg-container') classSet.add(semantic);
    className = Array.from(classSet).join(' ');
  }
  const hasWrapper = !!(ctx.irNode.layout as any).wrapper;
  const debugOverrideSize = ctx.mode === 'debug' ? !hasWrapper : false;
  const placeholder = (ctx.mode === 'debug' && svgFile && !wantsShape)
    ? `<div class="debug-svg-shape" data-svg-file="${svgFile}" style="position:absolute;left:0;top:0;right:0;bottom:0;width:100%;height:100%;pointer-events:auto;"></div>`
    : '';
  
  let finalContentHtml = (ctx.mode === 'content')
    ? (svgFile ? `<img src="svgs/${svgFile}" alt="" style="display:block;width:100%;height:100%;" />` : '')
    : (wantsShape ? sanitizeSvgForOutline(svgContent) : placeholder);

  let itemCss = '';
  if (ctx.irNode.style && typeof ctx.irNode.style.boxCss === 'string' && ctx.irNode.style.boxCss) {
    itemCss = ctx.irNode.style.boxCss;
  }

  if (ctx.mode === 'content') {
    const nodeType = (ctx.irNode as any).type;
    const hasRadius = /(^|;)\s*border-(top-left-|top-right-|bottom-right-|bottom-left-)?radius\s*:/i.test(itemCss);

    if (nodeType === 'ELLIPSE' && !hasRadius) {
      itemCss += 'border-radius:50%;';
    }

    const needsClip = hasRadius || (nodeType === 'ELLIPSE');
    const hasOverflow = /(^|;)\s*overflow\s*:\s*hidden\s*;?/i.test(itemCss);
    if (needsClip && !hasOverflow) {
      itemCss += 'overflow:hidden;';
    }
  }
  if (ctx.mode === 'content' && itemCss) {
    const util = await cssToTailwindClasses(itemCss);
    if (util.classNames.length) {
      className += ' ' + util.classNames.join(' ');
    }
    itemCss = util.remainingCss;
    if (ctx.usedClasses && util.classNames.length) {
      util.classNames.forEach((c: string) => ctx.usedClasses!.add(c));
    }
    // Why: ensure shrink-0 when converter misses mapping
    if (/(^|;)\s*flex-shrink\s*:\s*0\s*;?/i.test(itemCss) && !/\bshrink-0\b/.test(className)) {
      className += ' shrink-0';
      itemCss = itemCss.replace(/(^|;)\s*flex-shrink\s*:\s*0\s*;?/ig, '$1');
    }
  }
  return maybeWrapWithContentBox({
    className,
    id: ctx.irNode.id,
    layout: ctx.irNode.layout,
    boxCss: itemCss,
    innerContent: finalContentHtml,
    options: { innerClassName: ctx.mode === 'debug' ? 'debug-box' : undefined, debugOverrideSize, mode: ctx.mode }
  });
}

async function renderShapeNode(ctx: RenderContext): Promise<string> {
  if (!ctx.irNode) throw new Error('renderShapeNode: irNode missing');
  let boxCss = ctx.mode === 'debug' ? extractLayoutCssForDebug(ctx.irNode.style.boxCss) : ctx.irNode.style.boxCss;
  const cssCtx = {
    position: ctx.irNode.layout.position,
    hasRotateOrScale: !(ctx.irNode.layout.transform2x2.a === 1 && ctx.irNode.layout.transform2x2.b === 0 && ctx.irNode.layout.transform2x2.c === 0 && ctx.irNode.layout.transform2x2.d === 1),
    display: extractCssValue(boxCss, 'display'),
    flexDirection: extractCssValue(boxCss, 'flex-direction'),
    isText: false,
  };
  boxCss = optimizeBoxCss(boxCss, cssCtx);
  const utilClassesS: string[] = [];
  if (ctx.mode === 'content') {
    const util = await cssToTailwindClasses(boxCss);
    if (util.classNames.length) utilClassesS.push(...util.classNames);
    boxCss = util.remainingCss;
    if (ctx.usedClasses && util.classNames.length) {
      util.classNames.forEach((c) => ctx.usedClasses!.add(c));
    }
  }
  
  if (ctx.mode === 'debug') {
    var classNames: string[] = ['debug-box'];
  } else {
    const semantic = getSemanticClassName(ctx.irNode.name || '', 'shape');
    // Why: keep backward compatibility with legacy "shape rect" classes
    const classSet = new Set<string>(['shape', 'rect']);
    if (semantic && semantic !== 'shape') classSet.add(semantic);
    var classNames: string[] = Array.from(classSet);
  }
  if (ctx.mode === 'content' && utilClassesS.length) classNames.push(...utilClassesS);
  if (ctx.mode === 'content' && ctx.applySharedClass) {
    const res = ctx.applySharedClass(boxCss);
    if (res.className) classNames.push(res.className);
    boxCss = res.newCss;
  }
  const className = classNames.join(' ');
  const hasWrapper = !!(ctx.irNode.layout as any).wrapper;
  const debugOverrideSize = ctx.mode === 'debug' ? !hasWrapper : false;
  const omitPosition = ctx.omitPositionOverride || (!hasWrapper && ctx.irNode.layout.position === 'relative' && ctx.mode === 'content' && !hasAbsoluteDescendant(ctx.irNode));
  const hasStroke = !!(ctx.irNode.style.raw?.strokes && ctx.irNode.style.raw.strokes.length > 0);
  return maybeWrapWithContentBox({
    className,
    id: ctx.irNode.id,
    layout: ctx.irNode.layout,
    boxCss,
    innerContent: '',
    options: { innerClassName: ctx.mode === 'debug' ? 'debug-box' : undefined, debugOverrideSize, omitPosition, mode: ctx.mode, hasStroke }
  });
}

async function renderNodeUnified(irNode: RenderNodeIR, ctx: RenderContext): Promise<string> {
  if (irNode.kind === 'svg') return renderSvgNode(ctx);
  if (irNode.kind === 'frame') return renderFrameNode(ctx);
  if (irNode.kind === 'text') return renderTextNode(ctx);
  return renderShapeNode(ctx);
}

 
function wrapInDocument(config: DocumentConfig): string {
  const head = buildHtmlHead(config);
  const body = buildHtmlBody(config);
  const rawHtml = `<!doctype html>\n<html lang=\"en\">\n${head}\n${body}\n</html>`;
  // Do not prettify here; let host decide formatting/minification
  return rawHtml;
}

function buildDebugStyles(): string {
  return `
:root {
  color-scheme: light;
  --bridge-debug-blue: #0499ff;
  --bridge-debug-orange: #ff9904;
  --bridge-scale: 1;
  --bridge-debug-alpha: 0.25;
  --bridge-debug-z: 999999;
}
.debug-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--bridge-debug-z);
  overflow: visible;
}
.debug-box, .debug-svg {
  box-sizing: border-box;
  position: relative;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  opacity: 1 !important;
  overflow: visible !important;
  --bridge-stroke: calc(1px / var(--bridge-scale));
  outline: var(--bridge-stroke) solid rgba(4, 153, 255, var(--bridge-debug-alpha, 0));
  outline-offset: 0;
  pointer-events: auto;
}
.debug-svg.shape-only { outline: none !important; }
.debug-box.has-wrapper { pointer-events: none; }
.debug-box.has-wrapper > .debug-box { pointer-events: auto; }
.debug-overlay .debug-box.is-hover, .debug-overlay .debug-svg.is-hover { z-index: 2147483600 !important; }
.debug-overlay .debug-box.is-selected, .debug-overlay .debug-svg.is-selected { z-index: 2147483647 !important; }
  .debug-box.is-hover, .debug-svg.is-hover { --bridge-stroke: calc(2px / var(--bridge-scale)); outline: var(--bridge-stroke) solid var(--bridge-debug-blue) !important; }
  .debug-box.is-selected, .debug-svg.is-selected { --bridge-stroke: calc(3px / var(--bridge-scale)); outline: var(--bridge-stroke) solid var(--bridge-debug-blue) !important; }
  .debug-svg.shape-only.is-hover { outline: var(--bridge-stroke) solid var(--bridge-debug-blue) !important; }
  .debug-svg.shape-only.is-selected { outline: var(--bridge-stroke) solid var(--bridge-debug-blue) !important; }
  .debug-svg.is-hover svg *, .debug-svg.is-selected svg * { stroke-opacity: 1 !important; }
.debug-box.has-wrapper { outline: none !important; }
.debug-box.has-wrapper > .debug-box { outline: calc(1px / var(--bridge-scale)) solid rgba(4, 153, 255, var(--bridge-debug-alpha, 0)); }
.debug-box.has-wrapper.is-hover { outline: none !important; }
.debug-box.has-wrapper.is-selected { outline: none !important; }
.debug-box.has-wrapper.is-hover > .debug-box { outline: calc(2px / var(--bridge-scale)) solid var(--bridge-debug-blue) !important; }
.debug-box.has-wrapper.is-selected > .debug-box { outline: calc(3px / var(--bridge-scale)) solid var(--bridge-debug-blue) !important; }
.frame.is-hover, .shape.is-hover, .text.is-hover, .svg-container.is-hover {
  outline: calc(2px / var(--bridge-scale)) solid var(--bridge-debug-blue) !important;
}
.frame.is-selected, .shape.is-selected, .text.is-selected, .svg-container.is-selected {
  outline: calc(3px / var(--bridge-scale)) solid var(--bridge-debug-blue) !important;
}
`;
}

async function buildPreviewPieces(
  composition: any,
  irNodes: RenderNodeIR[],
  renderUnion: Rect,
  debugEnabled: boolean
): Promise<{ shapeHtml: string[]; debugHtml: string[]; usedClasses: Set<string>; viewport: Viewport; contentLayerStyle: string; sharedCss: string }> {
  const bounds = composition.bounds as Bounds;
  const { viewWidth, viewHeight, minXView, minYView } = computeViewport(bounds, renderUnion, 4);
  const safeViewWidth = Math.ceil(viewWidth);
  const safeViewHeight = Math.ceil(viewHeight);

  const shapeHtml: string[] = [];
  const debugHtml: string[] = [];
  const dummyCssCollector = new CssCollector();
  const usedClasses = new Set<string>();
  const absOrigin = (composition as any)?.absOrigin;
  if (!absOrigin || typeof absOrigin.x !== 'number' || typeof absOrigin.y !== 'number') {
    throw new Error('composition.absOrigin missing or invalid');
  }

  // Why: precompute w/h usage frequency to decide utility vs inline
  const __localSizeFreq = (() => {
    const wMap = new Map<number, number>();
    const hMap = new Map<number, number>();
    collectSizeFreq(irNodes, wMap, hMap);
    return { w: wMap, h: hMap } as SizeFreq;
  })();

  const boxCssList: string[] = irNodes.map((n) => (n?.style?.boxCss || ''));
  const shared = buildSharedClasses(boxCssList, 2);
  const sharedCss = generateClassCss(shared.classes);

  const pad = getRootPadding(irNodes);
  let contentLayerStyle = '';
  if (pad) {
    contentLayerStyle = `padding:${pad.top}px 0 0 ${pad.left}px;`;
  }

  const contentPromises = irNodes.map((irNode, idx) => {
    const omitPositionOverride = !!(pad && idx === 0);
    return renderNodeUnified(irNode, { stylePrefix: '', irNode, cssCollector: dummyCssCollector, mode: 'content', applySharedClass: shared.applier, omitPositionOverride, usedClasses, sizeFreq: __localSizeFreq });
  });
  const debugPromises = debugEnabled
    ? irNodes.map((irNode) => renderNodeUnified(irNode, { stylePrefix: '', irNode, cssCollector: dummyCssCollector, mode: 'debug', sizeFreq: __localSizeFreq }))
    : [];
  const [contentParts, debugParts] = await Promise.all([Promise.all(contentPromises), Promise.all(debugPromises)]);
  shapeHtml.push(...contentParts);
  if (debugEnabled) debugHtml.push(...debugParts);

  const viewport: Viewport = { width: safeViewWidth, height: safeViewHeight, offsetX: minXView, offsetY: minYView };
  return { shapeHtml, debugHtml, usedClasses, viewport, contentLayerStyle, sharedCss };
}

export async function createPreviewHtml(
  config: PreviewBuildInput
): Promise<PreviewHtmlResult> {
  const { composition, irNodes, cssRules, renderUnion, debugEnabled = false } = config || ({} as PreviewBuildInput);
  if (!composition || typeof composition !== 'object') {
    throw new Error('Invalid composition payload');
  }
  const bounds = composition.bounds as Bounds;
  if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
    throw new Error('Composition bounds missing width/height');
  }
  const children = Array.isArray(composition.children) ? composition.children : [];
  if (!children.length) {
    throw new Error('Composition contains no children');
  }

  const { shapeHtml, debugHtml, usedClasses, viewport, contentLayerStyle, sharedCss } = await buildPreviewPieces(
    composition,
    irNodes,
    renderUnion,
    debugEnabled
  );

  
  const contentBounds = { width: Math.ceil(renderUnion.width), height: Math.ceil(renderUnion.height) };
  const overlayStr = debugEnabled ? debugHtml.join('\n') : '';
  
  const utilityCss = buildUtilityCssSelective(usedClasses);
  const html = wrapInDocument({
    bodyHtml: shapeHtml.join('\n'),
    viewport,
    bounds: contentBounds,
    styles: { cssRules: `${cssRules || ''}\n${sharedCss}`, utilityCss },
    contentLayerStyle,
  });
  const debugCss = buildDebugStyles();
  return { html, baseWidth: viewport.width, baseHeight: viewport.height, renderUnion, debugHtml: overlayStr, debugCss };
}

export async function createPreviewAssets(
  config: PreviewBuildInput
): Promise<{ html: string; cssText: string; baseWidth: number; baseHeight: number; renderUnion: Rect; debugHtml: string; debugCss: string }> {
  const { composition, irNodes, cssRules, renderUnion, debugEnabled = false } = config || ({} as PreviewBuildInput);
  if (!composition || typeof composition !== 'object') {
    throw new Error('Invalid composition payload');
  }
  const bounds = composition.bounds as Bounds;
  if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
    throw new Error('Composition bounds missing width/height');
  }
  const children = Array.isArray(composition.children) ? composition.children : [];
  if (!children.length) {
    throw new Error('Composition contains no children');
  }

  // Why: reserve 4px padding for debug overlay outline (max 3px when selected)
  const { viewWidth, viewHeight, minXView, minYView } = computeViewport(bounds, renderUnion, 4);
  const safeViewWidth = Math.ceil(viewWidth);
  const safeViewHeight = Math.ceil(viewHeight);

  const { shapeHtml, debugHtml, usedClasses, viewport, contentLayerStyle, sharedCss } = await buildPreviewPieces(
    composition,
    irNodes,
    renderUnion,
    debugEnabled
  );
  const overlayStr = debugEnabled ? debugHtml.join('\n') : '';

  const baseStyles = buildBaseStyles(viewport, bounds);
  const utilityCss = buildUtilityCssSelective(usedClasses);
  const cssText = `${baseStyles}\n${utilityCss}\n${cssRules || ''}\n${sharedCss}`;
  const baseTag = `    <base href=\"/\">\n`;

  const rawHtmlDoc = `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Bridge Preview</title>\n${baseTag}    <link rel=\"stylesheet\" href=\"/preview/styles.css\"/>\n  </head>\n  <body>\n    <div class=\"viewport\">\n      <div class=\"view-offset\">\n        <div class=\"composition\" data-figma-render=\"1\">\n          <div class=\"content-layer\"${contentLayerStyle ? ` style=\\\"${contentLayerStyle}\\\"` : ''}>\n${shapeHtml.join('\n')}\n          </div>\n        </div>\n      </div>\n    </div>\n  </body>\n</html>`;

  const debugCss = buildDebugStyles();
  // Keep raw HTML; host app may format or minify as needed
  return { html: rawHtmlDoc, cssText, baseWidth: viewport.width, baseHeight: viewport.height, renderUnion, debugHtml: overlayStr, debugCss };
}

export async function createContentAssets(
  irNodes: RenderNodeIR[],
  cssRules: string
): Promise<{ bodyHtml: string; cssText: string; headLinks: string }> {
  const dummyCssCollector = new CssCollector();
  // Why: compute size frequencies for this content export
  const __localSizeFreq: SizeFreq = (() => {
    const wMap = new Map<number, number>();
    const hMap = new Map<number, number>();
    collectSizeFreq(irNodes, wMap, hMap);
    return { w: wMap, h: hMap } as SizeFreq;
  })();
  const boxCssList: string[] = irNodes.map((n) => (n?.style?.boxCss || ''));
  const shared = buildSharedClasses(boxCssList, 2);
  const sharedCss = generateClassCss(shared.classes, '.figma-export');

  const nodeHtml: string[] = [];
  const usedClasses = new Set<string>();
  {
    const parts = await Promise.all(
      irNodes.map((irNode) =>
        renderNodeUnified(irNode, {
          stylePrefix: '',
          irNode,
          cssCollector: dummyCssCollector,
          mode: 'content',
          applySharedClass: shared.applier,
          usedClasses,
          sizeFreq: __localSizeFreq,
        })
      )
    );
    nodeHtml.push(...parts);
  }

  const baseStyles = `.figma-export .svg-container > svg{display:block;width:100%;height:100%;shape-rendering:geometricPrecision;}
.figma-export .svg-container > img{display:block;width:100%;height:100%;}`;
  const utilityCss = buildUtilityCssSelective(usedClasses, '.figma-export');
  const cssText = `${baseStyles}\n${utilityCss}\n${cssRules || ''}\n${sharedCss}`;
  const headLinks = '';
  return { bodyHtml: nodeHtml.join('\n'), cssText, headLinks };
}

export async function createContentHtml(
  irNodes: RenderNodeIR[],
  cssRules: string
): Promise<string> {
  const dummyCssCollector = new CssCollector();
  // Why: compute size frequencies for this content export
  const __localSizeFreq: SizeFreq = (() => {
    const wMap = new Map<number, number>();
    const hMap = new Map<number, number>();
    collectSizeFreq(irNodes, wMap, hMap);
    return { w: wMap, h: hMap } as SizeFreq;
  })();
  const boxCssList: string[] = irNodes.map((n) => (n?.style?.boxCss || ''));
  const shared = buildSharedClasses(boxCssList, 2);
  const sharedCss = generateClassCss(shared.classes, '.figma-export');

  const nodeHtml: string[] = [];
  const usedClasses = new Set<string>();
  {
    const parts = await Promise.all(
      irNodes.map((irNode) =>
        renderNodeUnified(irNode, {
          stylePrefix: '',
          irNode,
          cssCollector: dummyCssCollector,
          mode: 'content',
          applySharedClass: shared.applier,
          usedClasses,
          sizeFreq: __localSizeFreq,
        })
      )
    );
    nodeHtml.push(...parts);
  }

  const baseStyles = `.figma-export .svg-container > svg{display:block;width:100%;height:100%;shape-rendering:geometricPrecision;}
.figma-export .svg-container > img{display:block;width:100%;height:100%;}`;
  const utilityCss = buildUtilityCssSelective(usedClasses, '.figma-export');
  const styles = `${baseStyles}\n${utilityCss}\n${cssRules || ''}\n${sharedCss}`;

  const raw = `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Exported Content</title>\n    <style>${styles}</style>\n  </head>\n  <body>\n    <div class=\"figma-export\">\n${nodeHtml.join('\n')}\n    </div>\n  </body>\n</html>`;
  // Return raw HTML; host can choose to format/minify
  return raw;
}
