import type { LayoutInfo } from '../pipeline/types';
import { matInv, matMul, hasRotation, hasReflection, matApply } from './matrix';
import { getLayoutAxes, mapAlignItems, mapJustifyContent, mapAlignSelf, computeIsStretch } from './layout';
import { normUpper } from './enum';
import { isCssUnit, dimensionToNumber } from './dimension';
import type { FigmaNode } from '../types/figma';

const CONTAINER_TYPES = ['FRAME', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET', 'GROUP'];

function determineKind(node: FigmaNode): 'frame' | 'shape' | 'text' | 'svg' {
  if (node?.svgContent || node?.svgId) return 'svg';
  if (node?.type === 'TEXT' && node?.text) return 'text';
  if (CONTAINER_TYPES.includes(String(node?.type))) return 'frame';
  return 'shape';
}

function getNodeSize(n: FigmaNode): { width: number | string; height: number | string } {
  const width = typeof n?.width === 'number' ? n.width : (typeof n?.width === 'string' ? n.width : 0);
  const height = typeof n?.height === 'number' ? n.height : (typeof n?.height === 'string' ? n.height : 0);
  return { width, height };
}

function computeDefaultLayout(node: FigmaNode, M_local: number[][]): { left: number; top: number; width: number | string; height: number | string; t2x2: { a: number; b: number; c: number; d: number } } {
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
  // Prevent double-transform: cancel parent's rotate/scale on baked SVG.
  const a = invParent[0][0], c = invParent[0][1];
  const b = invParent[1][0], d = invParent[1][1];
  const isParentIdentity = Math.abs(a - 1) < 1e-6 && Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && Math.abs(d - 1) < 1e-6;

  if (isParentIdentity) {
    return { left: localPos.x, top: localPos.y, width: rb.width, height: rb.height, t2x2: { a: 1, b: 0, c: 0, d: 1 } };
  }

  return { left: localPos.x, top: localPos.y, width: rb.width, height: rb.height, t2x2: { a, b, c, d } };
}

function applyContainerSemantics(node: FigmaNode, layout: LayoutInfo, hasWrapper?: boolean) {
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
    // Why exclude hasWrapper: wrapper already reserves correct space; setting auto would conflict with wrapper centering
    if (hasFlowChildren && !hasWrapper) {
      const axes = getLayoutAxes(modeRaw);
      // Don't override if explicitly set to CSS units (vw, vh, %, etc) from node.width/height
      if (normUpper(node?.primaryAxisSizingMode) === 'AUTO') {
        const currentMain = (layout as any)[axes.main];
        if (!isCssUnit(currentMain)) {
          (layout as any)[axes.main] = 'auto';
        }
      }
      if (normUpper(node?.counterAxisSizingMode) === 'AUTO') {
        const currentCross = (layout as any)[axes.cross];
        if (!isCssUnit(currentCross)) {
          (layout as any)[axes.cross] = 'auto';
        }
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

  // Why: decide centering in IR to keep HTML rendering simple
  if (hasWrapper && (layout as any).wrapper) {
    type WrapperInfo = { contentWidth: number; contentHeight: number; centerStrategy?: 'inset' | 'translate' };
    const w = (layout as any).wrapper as WrapperInfo;
    const t = layout.transform2x2;
    const hasTransform = t && !(t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1);
    
    // Why: inset+margin:auto only safe without transform; otherwise center in pre-transform coords
    w.centerStrategy = (layout.display === 'flex' && !hasTransform) ? 'inset' : 'translate';
  }
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

  // Why: keep flex items in flow (relative); others are absolute
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
    // Flex items must have numeric dimensions for layout calculation
    const wNum = dimensionToNumber(w as any, `computeLayout:flexItem:width for node ${node.id}`);
    const hNum = dimensionToNumber(h as any, `computeLayout:flexItem:height for node ${node.id}`);
    let reserveW = wNum, reserveH = hNum;
    if (hasRotation(M_local) || hasReflection(M_local)) {
      reserveW = Math.abs(a) * wNum + Math.abs(c) * hNum;
      reserveH = Math.abs(b) * wNum + Math.abs(d) * hNum;
    }
    outLeft = 0;
    outTop = 0;
    outOrigin = 'center';

    if (kind === 'svg') {
      // Why: keep flex spacing accurate and avoid extra DOM; only wrap when baked renderBounds != design size.
      outWidth = wNum;
      outHeight = hNum;
      const eps = 1e-2;
      const baseWidth = dimensionToNumber(base.width as any, `computeLayout:baseWidth for node ${node.id}`);
      const baseHeight = dimensionToNumber(base.height as any, `computeLayout:baseHeight for node ${node.id}`);
      const needWrapper = Math.abs(baseWidth - wNum) > eps || Math.abs(baseHeight - hNum) > eps;
      if (needWrapper) {
        (base as any).__wrapper = { contentWidth: baseWidth, contentHeight: baseHeight };
      }
    } else {
      // Why: rotated shapes need reserved AABB for layout; inner keeps original size for correct transform/stroke.
      outWidth = reserveW;
      outHeight = reserveH;
      if (reserveW !== wNum || reserveH !== hNum) {
        (base as any).__wrapper = { contentWidth: wNum, contentHeight: hNum };
      }
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
    // 好品味：不要到处强行写死 flex-shrink:0
    // 之前这里把所有非 grow 的 item 都改成 flex-shrink:0，导致文本和气泡永远不能被压窄，窗口变窄时只会整体溢出而不会在内部换行。
    // 现在遵循浏览器默认：除非有明确需求，否则不要锁死 shrink。
    // 为兼容性，仅在 grow>0 时显式标记为可收缩，其余交给默认值处理。
    if (grow > 0) (layout as any).flexShrink = 1;
    const parentWrap = normUpper((flags as any).parentWrap) || 'NO_WRAP';
    if (grow > 0) (layout as any).flexBasis = parentWrap === 'WRAP' ? 'auto' : (String(node?.type || '').toUpperCase() === 'TEXT' ? 'auto' : 0);
    const alignSelf = mapAlignSelf(node?.layoutAlign);
    if (alignSelf) (layout as any).alignSelf = alignSelf as any;
    const isStretch = computeIsStretch(String(node?.layoutAlign || 'AUTO'), (flags as any).parentAlignItemsCss);
    const hasWrapper = !!(base as any).__wrapper;
    if (isStretch) {
      // 文本节点的尺寸应由 textAutoResize 控制，不应被 stretch 破坏
      const axes = (flags as any).parentAxes || getLayoutAxes('NONE');
      const isText = String(node?.type || '').toUpperCase() === 'TEXT' && !!(node as any).text;
      if (isText) {
        const autoResize = normUpper((node as any).text?.textAutoResize);
        if (axes.cross === 'width') {
          if (autoResize === 'WIDTH' || autoResize === 'WIDTH_AND_HEIGHT') {
            // 好品味：stretch 语义只影响渲染层，不再把几何 width/height 改成字符串。
            layout.cssWidth = 'auto';
          }
        } else {
          if (autoResize === 'HEIGHT' || autoResize === 'WIDTH_AND_HEIGHT') {
            layout.cssHeight = 'auto';
          }
        }
      } else {
        if (axes.cross === 'width') layout.cssWidth = 'auto';
        else layout.cssHeight = 'auto';
      }
    }
  }

  if ((base as any).__wrapper) layout.wrapper = (base as any).__wrapper;
  // Why: ensure non-frame wrappers have a default centerStrategy
  if (kind !== 'frame' && layout.wrapper && !layout.wrapper.centerStrategy) {
    layout.wrapper.centerStrategy = 'translate';
  }
  // Snapshot any string-based node sizing into cssWidth/cssHeight for rendering，
  // 保持 width/height 仅承担几何层职责。
  if (typeof node.width === 'string' && !layout.cssWidth) {
    layout.cssWidth = node.width;
  }
  if (typeof node.height === 'string' && !layout.cssHeight) {
    layout.cssHeight = node.height;
  }
  if (kind === 'frame') {
    const hasWrapper = !!layout.wrapper;
    applyContainerSemantics(node, layout, hasWrapper);
  }
  return { kind, layout };
}
