import type { LayoutInfo } from '../pipeline/types';
import { matInv, matMul, hasRotation, hasReflection, matApply } from './matrix';
import { getLayoutAxes, mapAlignItems, mapJustifyContent, mapAlignSelf, computeIsStretch } from './layout';
import { normUpper } from './enum';
import type { FigmaNode } from '../types/figma';

const CONTAINER_TYPES = ['FRAME', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET', 'GROUP'];

function determineKind(node: FigmaNode): 'frame' | 'shape' | 'text' | 'svg' {
  if (node?.svgContent || node?.svgId) return 'svg';
  if (node?.type === 'TEXT' && node?.text) return 'text';
  if (CONTAINER_TYPES.includes(String(node?.type))) return 'frame';
  return 'shape';
}

function getNodeSize(n: FigmaNode): { width: number; height: number } {
  const width = typeof n?.width === 'number' ? n.width : 0;
  const height = typeof n?.height === 'number' ? n.height : 0;
  return { width, height };
}

function computeDefaultLayout(node: FigmaNode, M_local: number[][]): { left: number; top: number; width: number; height: number; t2x2: { a: number; b: number; c: number; d: number } } {
  const { width: w, height: h } = getNodeSize(node);
  const a = M_local[0][0], c = M_local[0][1], e = M_local[0][2];
  const b = M_local[1][0], d = M_local[1][1], f = M_local[1][2];
  return { left: e, top: f, width: w, height: h, t2x2: { a, b, c, d } };
}

function computeSvgLayoutFromBounds(node: FigmaNode, parentAbs: number[][]): { left: number; top: number; width: number; height: number; t2x2: { a: number; b: number; c: number; d: number } } {
  const rb = node.renderBounds;
  const arb = node.absoluteRenderBounds;
  if (!rb) throw new Error('computeSvgLayoutFromBounds: renderBounds missing');
  if (!arb) {
    return { left: rb.x, top: rb.y, width: rb.width, height: rb.height, t2x2: { a: 1, b: 0, c: 0, d: 1 } };
  }
  const invParent = matInv(parentAbs);
  if (!invParent) throw new Error('Parent transform not invertible');
  const localPos = matApply(invParent, arb.x, arb.y);
  // SVG content is already in absolute coordinates (exported by Figma).
  // If parent has rotation/scale, we need to apply inverse transform to cancel it out,
  // otherwise the SVG will be transformed twice (once in content, once by parent's CSS transform).
  const a = invParent[0][0], c = invParent[0][1];
  const b = invParent[1][0], d = invParent[1][1];
  const isParentIdentity = Math.abs(a - 1) < 1e-6 && Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && Math.abs(d - 1) < 1e-6;

  if (isParentIdentity) {
    return { left: localPos.x, top: localPos.y, width: rb.width, height: rb.height, t2x2: { a: 1, b: 0, c: 0, d: 1 } };
  }

  // Return inverse of parent's 2x2 rotation/scale to cancel out parent's transform
  return { left: localPos.x, top: localPos.y, width: rb.width, height: rb.height, t2x2: { a, b, c, d } };
}

function applyContainerSemantics(node: FigmaNode, layout: LayoutInfo) {
  const modeRaw = normUpper(node?.layoutMode) || 'NONE';
  if (modeRaw === 'HORIZONTAL' || modeRaw === 'VERTICAL') {
    layout.display = 'flex';
    layout.flexDirection = modeRaw === 'HORIZONTAL' ? 'row' : 'column';
    const jc = mapJustifyContent(node?.primaryAxisAlignItems);
    if (jc) (layout as any).justifyContent = jc as any;
    const spacing = typeof node?.itemSpacing === 'number' ? node.itemSpacing : 0;
    if (jc !== 'space-between' && spacing > 0) (layout as any).gap = spacing;
    const wrapRaw = normUpper(node?.layoutWrap) || 'NO_WRAP';
    if (wrapRaw === 'WRAP') {
      (layout as any).flexWrap = 'wrap';
      const cas = typeof node?.counterAxisSpacing === 'number' ? node.counterAxisSpacing : 0;
      if (cas > 0) {
        if (modeRaw === 'HORIZONTAL') (layout as any).rowGap = cas;
        else (layout as any).columnGap = cas;
      }
    } else {
      (layout as any).flexWrap = 'nowrap';
    }
    const ai = mapAlignItems(node?.counterAxisAlignItems);
    if (ai) (layout as any).alignItems = ai as any;

    const children = Array.isArray(node?.children) ? node.children : [];
    const hasFlowChildren = children.some((ch: any) => ch && ch.visible !== false && String(ch?.layoutPositioning || 'AUTO').toUpperCase() !== 'ABSOLUTE');
    if (hasFlowChildren) {
      const axes = getLayoutAxes(modeRaw);
      if (normUpper(node?.primaryAxisSizingMode) === 'AUTO') {
        (layout as any)[axes.main] = 'auto';
      }
      if (normUpper(node?.counterAxisSizingMode) === 'AUTO') {
        (layout as any)[axes.cross] = 'auto';
      }
    }
  } else {
    layout.display = 'block';
  }

  const pt = Number(node?.paddingTop) || 0;
  const pr = Number(node?.paddingRight) || 0;
  const pb = Number(node?.paddingBottom) || 0;
  const pl = Number(node?.paddingLeft) || 0;
  if (pt || pr || pb || pl) (layout as any).padding = { t: pt, r: pr, b: pb, l: pl };
  if (node?.strokesIncludedInLayout) (layout as any).boxSizing = 'border-box';
  if (node?.clipsContent) (layout as any).overflow = 'hidden';
}

export function computeLayout(
  node: FigmaNode,
  parentAbs: number[][],
  flags?: { asFlexItem?: boolean; parentAxes?: ReturnType<typeof getLayoutAxes>; parentAlignItemsCss?: string | undefined; parentWrap?: string; parentIsAutoLayout?: boolean }
): { kind: 'frame' | 'shape' | 'text' | 'svg'; layout: LayoutInfo } {
  if (!node) throw new Error('computeLayout: node is null/undefined');
  const kind = determineKind(node);
  const abs: number[][] | null = Array.isArray(node?.absoluteTransform) ? node.absoluteTransform : null;
  if (!abs) throw new Error(`Node ${node.id} missing absoluteTransform`);
  const invParent = matInv(parentAbs);
  if (!invParent) throw new Error('Parent transform not invertible');
  const M_local = matMul(invParent, abs);

  const base = kind === 'svg' ? computeSvgLayoutFromBounds(node, parentAbs) : computeDefaultLayout(node, M_local);

  // Flexbox children use relative positioning to stay in flow; otherwise absolute
  let outPosition: 'absolute' | 'relative' = flags?.asFlexItem ? 'relative' : 'absolute';
  let outLeft = base.left;
  let outTop = base.top;
  let outWidth: any = base.width;
  let outHeight: any = base.height;
  let outOrigin: 'top left' | 'center' = 'top left';
  let outT2 = { ...base.t2x2 };

  if (flags?.asFlexItem) {
    const a = M_local[0][0], c = M_local[0][1];
    const b = M_local[1][0], d = M_local[1][1];
    const { width: w, height: h } = getNodeSize(node);
    let reserveW = w, reserveH = h;
    if (hasRotation(M_local) || hasReflection(M_local)) {
      reserveW = Math.abs(a) * w + Math.abs(c) * h;
      reserveH = Math.abs(b) * w + Math.abs(d) * h;
    }
    outLeft = 0;
    outTop = 0;
    outWidth = reserveW;
    outHeight = reserveH;
    outOrigin = 'center';

    if (reserveW !== w || reserveH !== h) {
      (base as any).__wrapper = { contentWidth: w, contentHeight: h };
    }
  }

  const layout: LayoutInfo = {
    display: 'block',
    position: outPosition,
    left: outLeft,
    top: outTop,
    width: outWidth,
    height: outHeight,
    origin: outOrigin,
    transform2x2: outT2,
  } as any;

  if (flags?.asFlexItem) {
    const grow = typeof node?.layoutGrow === 'number' ? node.layoutGrow : 0;
    (layout as any).flexGrow = grow;
    (layout as any).flexShrink = grow > 0 ? 1 : 0;
    const parentWrap = normUpper((flags as any).parentWrap) || 'NO_WRAP';
    if (grow > 0) (layout as any).flexBasis = parentWrap === 'WRAP' ? 'auto' : (String(node?.type || '').toUpperCase() === 'TEXT' ? 'auto' : 0);
    const alignSelf = mapAlignSelf(node?.layoutAlign);
    if (alignSelf) (layout as any).alignSelf = alignSelf as any;
    const isStretch = computeIsStretch(String(node?.layoutAlign || 'AUTO'), (flags as any).parentAlignItemsCss);
    if (isStretch) {
      const axes = (flags as any).parentAxes || getLayoutAxes('NONE');
      if (axes.cross === 'width') (layout as any).width = 'auto';
      else (layout as any).height = 'auto';
    }
  }

  if ((base as any).__wrapper) (layout as any).wrapper = (base as any).__wrapper;
  if (kind === 'frame') applyContainerSemantics(node, layout);
  return { kind, layout };
}
