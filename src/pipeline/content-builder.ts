import type { RenderNodeIR } from './types';
import { CssCollector } from '../utils/cssCollector';
import { buildRenderItems, type RenderItem, type RenderNodeItem, type RenderMaskedItem } from '../utils/renderItems';
import { getLayoutAxes, mapAlignItems } from '../utils/layout';
import { matInv, matMul } from '../utils/matrix';
import { collectBorderRadiusCss } from '../utils/css';
import { computeEffectsMode, getInheritedShadows } from '../utils/effects-mode';
import type { ShadowEffect } from '../utils/css';
import { renderTextSegments } from '../utils/css';
import { nodeToIR } from './ir';
import type { FigmaNode } from '../types/figma';

export function buildContent(
  node: FigmaNode,
  kind: 'frame' | 'shape' | 'text' | 'svg',
  parentAbs: number[][],
  cssCollector: CssCollector,
  inheritedShadows?: ShadowEffect[] | null,
  effectsMode?: 'self' | 'inherit',
  flags?: { asFlexItem?: boolean }
): any {
  if (kind === 'text' && node.text) {
    const html = renderTextSegments(node.text);
    return { type: 'text' as const, html };
  }
  if (kind === 'svg' && node.svgContent) {
    return { type: 'svg' as const, svg: String(node.svgContent) };
  }
  if (kind !== 'frame') return { type: 'empty' as const };

  const subtree = node;
  const parentForChildrenAbs: number[][] | null = Array.isArray(node?.absoluteTransform)
    ? node.absoluteTransform
    : null;
  if (!(parentForChildrenAbs && Array.isArray(subtree?.children) && subtree.children.length > 0)) {
    return { type: 'children' as const, nodes: [] };
  }

  const children: FigmaNode[] = subtree.children as FigmaNode[];
  const preItems: RenderItem[] | undefined = (subtree as any)._renderItems as any[] | undefined;
  const items: RenderItem[] = Array.isArray(preItems) && preItems.length > 0
    ? preItems
    : buildRenderItems(children, {
        parentIsAutoLayout: (subtree?.layoutMode || 'NONE') !== 'NONE',
        parentLayoutMode: subtree?.layoutMode || 'NONE',
        itemSpacing: typeof subtree?.itemSpacing === 'number' ? subtree.itemSpacing : 0,
        reverseZIndex: subtree?.itemReverseZIndex === true,
      });

  const mode: 'self' | 'inherit' = effectsMode || computeEffectsMode(subtree);
  const baseInherited = (mode !== 'inherit') ? [] : (Array.isArray(inheritedShadows) ? inheritedShadows! : []);
  const localEffects = mode === 'inherit' ? getInheritedShadows(subtree) : [];
  const nextInherited: ShadowEffect[] = [...baseInherited, ...localEffects];
  const parentIsAutoLayout = (subtree?.layoutMode || 'NONE') !== 'NONE';
  const parentAxes = getLayoutAxes(subtree?.layoutMode || 'NONE');
  const parentAlignItemsCss = mapAlignItems(subtree?.counterAxisAlignItems);
  const invParent2 = matInv(parentForChildrenAbs);
  if (!invParent2) throw new Error('Parent transform not invertible');

  const ctx = {
    children,
    parentForChildrenAbs,
    invParent: invParent2,
    parentIsAutoLayout,
    parentAxes,
    parentAlignItemsCss,
    subtree,
    cssCollector,
    nextInherited,
  };

  const irKids: RenderNodeIR[] = [];
  for (const it of items) {
    if (it.kind === 'node') {
      const ch = children[(it as RenderNodeItem).index];
      const childIR = processChildNode(ch, it as RenderNodeItem, ctx);
      if (childIR) irKids.push(childIR);
    } else if (it.kind === 'masked') {
      const maskedIRs = processMaskedGroup(it as RenderMaskedItem, ctx);
      irKids.push(...maskedIRs);
    }
  }
  return { type: 'children' as const, nodes: irKids };
}

function processChildNode(
  ch: FigmaNode,
  it: RenderNodeItem,
  ctx: {
    children: FigmaNode[];
    parentForChildrenAbs: number[][];
    invParent: number[][];
    parentIsAutoLayout: boolean;
    parentAxes: ReturnType<typeof getLayoutAxes>;
    parentAlignItemsCss: string | undefined;
    subtree: FigmaNode;
    cssCollector: CssCollector;
    nextInherited: ShadowEffect[];
  }
): RenderNodeIR | null {
  if (!ch || ch.visible === false) return null;
  const isFlexItem = ctx.parentIsAutoLayout && String(ch?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE';
  const ir = nodeToIR(
    ch,
    ctx.parentForChildrenAbs,
    ctx.cssCollector,
    ctx.nextInherited,
    isFlexItem ? { asFlexItem: true, parentAxes: ctx.parentAxes, parentAlignItemsCss: ctx.parentAlignItemsCss, parentWrap: ctx.subtree?.layoutWrap } : undefined
  );
  if (ir && it && typeof (it as any).itemCss === 'string' && (it as any).itemCss) {
    const extra = String((it as any).itemCss);
    const prev = (ir.style && typeof ir.style.boxCss === 'string') ? ir.style.boxCss : '';
    ir.style.boxCss = extra + prev;
  }
  return ir;
}

function processMaskedGroup(
  it: RenderMaskedItem,
  ctx: {
    children: FigmaNode[];
    parentForChildrenAbs: number[][];
    invParent: number[][];
    parentIsAutoLayout: boolean;
    parentAxes: ReturnType<typeof getLayoutAxes>;
    parentAlignItemsCss: string | undefined;
    subtree: FigmaNode;
    cssCollector: CssCollector;
    nextInherited: ShadowEffect[];
  }
): RenderNodeIR[] {
  const mask = ctx.children[it.maskIndex];
  if (!mask) throw new Error('processMaskedGroup: mask node missing');
  if (!Array.isArray(mask?.absoluteTransform)) throw new Error('processMaskedGroup: mask.absoluteTransform missing');
  const maskedNodes = it.nodeIndices.map(i => ctx.children[i]).filter(n => n && n.visible !== false);
  if (maskedNodes.length === 0) return [];
  const M_local2 = matMul(ctx.invParent, mask.absoluteTransform);
  const a2 = M_local2[0][0], c2 = M_local2[0][1], e2 = M_local2[0][2];
  const b2 = M_local2[1][0], d2 = M_local2[1][1], f2 = M_local2[1][2];
  const mw = typeof mask?.width === 'number' ? mask.width : 0;
  const mh = typeof mask?.height === 'number' ? mask.height : 0;
  const parts: string[] = [];
  const radiusCss = collectBorderRadiusCss(mask);
  if (radiusCss) parts.push(radiusCss);
  const isEllipse = (mask?.type === 'ELLIPSE');
  if (isEllipse) parts.push('border-radius:50%;overflow:hidden;');
  else parts.push('overflow:hidden;');
  if (typeof it.containerCss === 'string' && it.containerCss) parts.push(it.containerCss);

  const containerIR: RenderNodeIR = {
    id: String(mask.id || 'mask'),
    kind: 'frame',
    layout: {
      display: 'block',
      position: (ctx.parentIsAutoLayout && String(mask?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE') ? 'relative' : 'absolute',
      left: (ctx.parentIsAutoLayout && String(mask?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE') ? 0 : e2,
      top: (ctx.parentIsAutoLayout && String(mask?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE') ? 0 : f2,
      width: mw,
      height: mh,
      origin: (ctx.parentIsAutoLayout && String(mask?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE') ? 'center' : 'top left',
      transform2x2: { a: a2, b: b2, c: c2, d: d2 },
    },
    style: { boxCss: parts.join('') },
    content: { type: 'children', nodes: maskedNodes.map(ch => nodeToIR(ch, mask.absoluteTransform as number[][], ctx.cssCollector, ctx.nextInherited)) },
    isMask: true,
    absoluteTransform: Array.isArray(mask?.absoluteTransform) ? mask.absoluteTransform : undefined,
    name: mask.name || 'Mask Container',
    type: mask.type || 'FRAME',
    visible: mask.visible !== false,
    svgContent: mask.svgContent,
    text: mask.text,
  };
  return [containerIR];
}
