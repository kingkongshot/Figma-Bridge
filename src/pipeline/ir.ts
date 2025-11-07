import type { RenderNodeIR, LayoutInfo } from './types';
import { CssCollector } from '../utils/cssCollector';
import { collectNodeBoxCss } from '../utils/nodeStyle';
import { collectTextCss, parseEffects, type ShadowEffect } from '../utils/css';
import { matInv, matMul, matApply } from '../utils/matrix';
import { computePositionCss, composeFlexGrowCss } from '../utils/layout';
import type { getLayoutAxes } from '../utils/layout';
import { extractFontsFromComposition, isChineseFontsReady } from '../utils/fonts';
import { normUpper } from '../utils/enum';
import { computeLayout } from '../utils/layout-calculator';
import { buildContent } from './content-builder';
import { computeEffectsMode, shouldInheritShadows } from '../utils/effects-mode';
import type { FigmaNode, CompositionInput } from '../types/figma';

export function compositionToIR(composition: CompositionInput | { absOrigin?: { x: number; y: number }; children?: FigmaNode[] }): { nodes: RenderNodeIR[]; cssRules: string; rawComposition: any; renderUnion: { x: number; y: number; width: number; height: number }; fontMeta: { googleFontsUrl: string | null; chineseFontsUrls: string[]; fonts: { family: string; weights: number[]; styles: string[] }[] }; assetMeta: { images: string[]; svgs?: string[] } } {
  if (!composition || typeof composition !== 'object') throw new Error('Invalid composition');
  const children = Array.isArray(composition.children) ? composition.children : [];
  if (!children.length) return { nodes: [], cssRules: '', rawComposition: composition, renderUnion: { x: 0, y: 0, width: 0, height: 0 }, fontMeta: { googleFontsUrl: null, chineseFontsUrls: [], fonts: [] }, assetMeta: { images: [] } };

  // Require upstream-provided absOrigin; no downstream guessing
  const absOrigin = composition.absOrigin;
  if (!absOrigin || typeof absOrigin.x !== 'number' || typeof absOrigin.y !== 'number') {
    throw new Error('composition.absOrigin missing or invalid');
  }
  const compAbsOriginX = absOrigin.x;
  const compAbsOriginY = absOrigin.y;
  const M_comp: number[][] = [
    [1, 0, compAbsOriginX],
    [0, 1, compAbsOriginY],
  ];

  const cssCollector = new CssCollector();

  function fnv1a(str: string): string {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  const nodes: RenderNodeIR[] = children
    .filter((n: FigmaNode) => n && n.visible !== false)
    .map((child: FigmaNode) => nodeToIR(child, M_comp, cssCollector));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  children.forEach((ch: FigmaNode, index: number) => {
    const rb = ch?.renderBounds;
    if (!rb || typeof rb.x !== 'number' || typeof rb.y !== 'number'
      || typeof rb.width !== 'number' || typeof rb.height !== 'number') {
      throw new Error(`Child ${index} missing renderBounds`);
    }
    minX = Math.min(minX, rb.x);
    minY = Math.min(minY, rb.y);
    maxX = Math.max(maxX, rb.x + rb.width);
    maxY = Math.max(maxY, rb.y + rb.height);
  });
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    throw new Error('Failed to derive render union bounds');
  }
  const renderUnion = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

  const fc = extractFontsFromComposition(composition);
  const googleFontsUrl = fc.getGoogleFontsUrl();
  const chineseFontsUrls = isChineseFontsReady() ? fc.getChineseFontsUrls() : [];
  const fonts = fc.getAllFonts().map(f => ({ family: f.family, weights: Array.from(f.weights).sort((a,b)=>a-b), styles: Array.from(f.styles) }));

  function collectImages(node: FigmaNode, out: Set<string>) {
    const fills = node?.style?.fills as any[] | undefined;
    if (Array.isArray(fills)) {
      for (const f of fills) {
        const t = String((f && f.type) || '').toUpperCase();
        if (t === 'IMAGE' && typeof f?.imageId === 'string') out.add(f.imageId);
      }
    }
    if (Array.isArray(node?.children)) node.children.forEach((c: FigmaNode) => collectImages(c, out));
  }
  const imgSet = new Set<string>();
  children.forEach((c: FigmaNode) => collectImages(c, imgSet));
  const svgSet = new Set<string>();
  function collectSvgs(n: RenderNodeIR) {
    if (n.kind === 'svg' && n.svgFile && n.svgFile.endsWith('.svg')) {
      svgSet.add(n.svgFile);
    }
    if (n.content && n.content.type === 'children') {
      n.content.nodes.forEach(collectSvgs);
    }
  }
  nodes.forEach(collectSvgs);
  const assetMeta: { images: string[]; svgs: string[] } = { images: Array.from(imgSet), svgs: Array.from(svgSet) };

  return { nodes, cssRules: cssCollector.toString(), rawComposition: composition, renderUnion, fontMeta: { googleFontsUrl, chineseFontsUrls, fonts }, assetMeta };
}

function collectBoxCssForNode(node: FigmaNode, cssCollector: CssCollector, inheritedShadows?: ShadowEffect[] | null): string {
  if (!node?.style) return '';
  return collectNodeBoxCss(
    node,
    cssCollector,
    inheritedShadows && inheritedShadows.length ? { inheritedShadows } : undefined
  );
}

function collectStyle(
  node: FigmaNode,
  kind: 'frame' | 'shape' | 'text' | 'svg',
  cssCollector: CssCollector,
  inheritedShadows?: ShadowEffect[] | null,
  effectsMode?: 'self' | 'inherit'
): { boxCss: string; shouldInheritShadows: boolean; nodeHasFills: boolean; autoWidth?: boolean; autoHeight?: boolean } {
  if (kind !== 'frame') {
    let boxCss = collectBoxCssForNode(node, cssCollector, inheritedShadows);
    let autoWidth: boolean | undefined;
    let autoHeight: boolean | undefined;
    if (kind === 'text' && node.text) {
      const textResult = collectTextCss(node);
      boxCss += textResult.css;
      autoWidth = textResult.autoWidth;
      autoHeight = textResult.autoHeight;
      if (autoWidth) boxCss += 'width:auto;';
      if (autoHeight) boxCss += 'height:auto;';
    }
    return { boxCss, shouldInheritShadows: false, nodeHasFills: false, autoWidth, autoHeight };
  }

  const subtree = node;
  const parts: string[] = [];
  const inherit = (effectsMode ? effectsMode === 'inherit' : shouldInheritShadows(node));
  const hasFills = !inherit;

  if (node?.style) {
    parts.push(
      collectNodeBoxCss(
        node,
        cssCollector,
        inherit ? { suppressEffects: true } : undefined
      )
    );
    if (inherit) {
      const eff = parseEffects(node);
      if (eff?.layerBlur && eff.layerBlur > 0) parts.push(`filter:blur(${eff.layerBlur / 2}px);`);
      if (eff?.backgroundBlur && eff.backgroundBlur > 0) {
        const b = eff.backgroundBlur / 2;
        parts.push(`backdrop-filter:blur(${b}px);-webkit-backdrop-filter:blur(${b}px);`);
      }
    }
  }

  let boxCss = parts.join('');
  return { boxCss, shouldInheritShadows: inherit, nodeHasFills: hasFills };
}

function buildRawStyle(node: FigmaNode) {
  if (!node?.style) return undefined;
  return {
    fills: node.style.fills,
    strokes: node.style.strokes,
    strokeWeights: node.style.strokeWeights || (Array.isArray(node.style.strokes) && node.style.strokes.length > 0 ? { t: 0, r: 0, b: 0, l: 0 } : undefined),
    strokeAlign: node.style.strokeAlign,
    dashPattern: (node.style as any).dashPattern,
    effects: node.style.effects,
    opacity: node.style.opacity,
    blendMode: node.style.blendMode,
    radii: (node.style as any).radii,
  } as any;
}

function svgIdToFile(node: FigmaNode): string | undefined {
  const svgId = (node as any)?.svgId;
  if (typeof svgId === 'string' && svgId) {
    const safe = svgId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return safe + '.svg';
  }
  return undefined;
}

export function nodeToIR(
  node: FigmaNode,
  parentAbs: number[][],
  cssCollector: CssCollector,
  inheritedShadows?: ShadowEffect[] | null,
  flags?: { asFlexItem?: boolean; parentAxes?: ReturnType<typeof getLayoutAxes>; parentAlignItemsCss?: string | undefined; parentWrap?: string }
): RenderNodeIR {
  if (!node) throw new Error('nodeToIR called with null/undefined node');
  if (node.visible === false) throw new Error(`Invisible node ${node.id} should have been filtered upstream`);

  const { kind, layout } = computeLayout(node, parentAbs, flags);
  const mode = computeEffectsMode(node);
  const style = collectStyle(node, kind, cssCollector, inheritedShadows, mode);
  const content = buildContent(node, kind, parentAbs, cssCollector, inheritedShadows, mode, flags);
  const rawStyle = buildRawStyle(node);
  const svgFileProp = svgIdToFile(node);

  return {
    id: String(node.id || 'unknown'),
    kind,
    layout,
    style: { boxCss: style.boxCss, raw: rawStyle },
    content,
    isMask: (node as any)?.isMask === true ? true : undefined,
    absoluteTransform: Array.isArray(node?.absoluteTransform) ? (node.absoluteTransform as number[][]) : undefined,
    effectsMode: mode,
    name: node.name || `Unnamed ${kind}`,
    type: node.type || String(kind).toUpperCase(),
    visible: true,
    svgContent: node.svgContent,
    svgFile: svgFileProp,
    text: node.text,
  };
}
