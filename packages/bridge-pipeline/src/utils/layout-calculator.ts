import type { LayoutInfo } from '../pipeline/types';
import { matInv, matMul, hasRotation, hasReflection, matApply } from './matrix';
import { getLayoutAxes, mapAlignItems, mapJustifyContent, mapAlignSelf, computeIsStretch } from './layout';
import { normUpper } from './enum';
import { isCssUnit, dimensionToNumber } from './dimension';
import type { FigmaNode } from '../types/figma';

const CONTAINER_TYPES = ['FRAME', 'INSTANCE', 'COMPONENT', 'COMPONENT_SET', 'GROUP'];
type WrapperInfo = { contentWidth: number; contentHeight: number; centerStrategy?: 'inset' | 'translate' };

type BaseLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  t2x2: { a: number; b: number; c: number; d: number };
  wrapper?: WrapperInfo;
};

function isTextNode(node: FigmaNode): boolean {
  return node.type === 'TEXT';
}

function isTextNodeWithContent(node: FigmaNode): boolean {
  return isTextNode(node) && !!node.text;
}

function determineKind(node: FigmaNode): 'frame' | 'shape' | 'text' | 'svg' {
  if (node?.svgContent || node?.svgId) return 'svg';
  if (isTextNodeWithContent(node)) return 'text';
  if (node?.type && CONTAINER_TYPES.includes(node.type)) return 'frame';
  return 'shape';
}

// Geometry width/height come from node.width/height; renderBounds is a legacy fallback
// for normalized SVG/DSL nodes where Figma keeps width/height at 0 but renderBounds
// carries the true size. If both are invalid, fail fast so upstream data issues surface.
function getNodeSize(n: FigmaNode): { width: number; height: number } {
  const rb = n.renderBounds;
  const id = String(n?.id ?? 'unknown');

  let width: number;
  if (typeof n.width === 'number' && Number.isFinite(n.width)) {
    width = n.width;
  } else if (rb && typeof rb.width === 'number' && Number.isFinite(rb.width)) {
    width = rb.width;
  } else {
    throw new Error(`computeLayout: node ${id} has invalid width: ${String(n.width)}`);
  }

  let height: number;
  if (typeof n.height === 'number' && Number.isFinite(n.height)) {
    height = n.height;
  } else if (rb && typeof rb.height === 'number' && Number.isFinite(rb.height)) {
    height = rb.height;
  } else {
    throw new Error(`computeLayout: node ${id} has invalid height: ${String(n.height)}`);
  }

  return { width, height };
}

function computeDefaultLayout(node: FigmaNode, M_local: number[][]): BaseLayout {
  const { width: w, height: h } = getNodeSize(node);
  const a = M_local[0][0], c = M_local[0][1], e = M_local[0][2];
  const b = M_local[1][0], d = M_local[1][1], f = M_local[1][2];
  return { left: e, top: f, width: w, height: h, t2x2: { a, b, c, d } };
}

function computeSvgLayoutFromBounds(node: FigmaNode, parentAbs: number[][]): BaseLayout {
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

type FlexCoreProps = Pick<LayoutInfo, 'flexGrow' | 'flexShrink' | 'flexBasis' | 'alignSelf'>;

function computeFlexItemCoreProps(
  node: FigmaNode,
  flags: { parentWrap?: string } | undefined,
  outWidth: number
): Partial<FlexCoreProps> {
  const grow = typeof node?.layoutGrow === 'number' ? node.layoutGrow : 0;
  const props: Partial<FlexCoreProps> = { flexGrow: grow };

  // 好品味：除非有明确需求，否则不要到处强行写死 flex-shrink:0。
  if (grow > 0) {
    props.flexShrink = 1;
    const parentWrap = normUpper(flags?.parentWrap) || 'NO_WRAP';
    const isText = isTextNode(node);
    props.flexBasis = parentWrap === 'WRAP' || isText ? 'auto' : outWidth;
  }

  const alignSelf = mapAlignSelf(node?.layoutAlign);
  if (alignSelf) {
    props.alignSelf = alignSelf as LayoutInfo['alignSelf'];
  }

  return props;
}

function applyContainerSemantics(node: FigmaNode, layout: LayoutInfo, hasWrapper?: boolean) {
  const modeRaw = normUpper(node?.layoutMode) || 'NONE';
  if (modeRaw === 'HORIZONTAL' || modeRaw === 'VERTICAL') {
    layout.display = 'flex';
    layout.flexDirection = modeRaw === 'HORIZONTAL' ? 'row' : 'column';
    const jc = mapJustifyContent(node?.primaryAxisAlignItems);
    if (jc) layout.justifyContent = jc as LayoutInfo['justifyContent'];
    const spacing = typeof node?.itemSpacing === 'number' ? node.itemSpacing : 0;
    if (jc !== 'space-between' && spacing > 0) layout.gap = spacing;
    const wrapRaw = normUpper(node?.layoutWrap) || 'NO_WRAP';
    if (wrapRaw === 'WRAP') {
      layout.flexWrap = 'wrap';
      const cas = typeof node?.counterAxisSpacing === 'number' ? node.counterAxisSpacing : 0;
      if (cas > 0) {
        if (modeRaw === 'HORIZONTAL') layout.rowGap = cas;
        else layout.columnGap = cas;
      }
    } else {
      layout.flexWrap = 'nowrap';
    }
    const ai = mapAlignItems(node?.counterAxisAlignItems);
    if (ai) layout.alignItems = ai as LayoutInfo['alignItems'];

    const children = Array.isArray(node?.children) ? node.children : [];
    const hasFlowChildren = children.some(
      (ch: any) => ch && ch.visible !== false && normUpper(ch?.layoutPositioning) !== 'ABSOLUTE'
    );
    // Why exclude hasWrapper: wrapper already reserves correct space; setting auto would conflict with wrapper centering
    if (hasFlowChildren && !hasWrapper) {
      const axes = getLayoutAxes(modeRaw);
      // Don't override if explicitly set to CSS units (vw, vh, %, etc) via cssWidth/cssHeight
      if (normUpper(node?.primaryAxisSizingMode) === 'AUTO') {
        const hasCssMain = axes.main === 'width'
          ? isCssUnit(layout.cssWidth)
          : isCssUnit(layout.cssHeight);
        if (!hasCssMain) {
          if (axes.main === 'width') layout.cssWidth = 'auto';
          else layout.cssHeight = 'auto';
        }
      }
      if (normUpper(node?.counterAxisSizingMode) === 'AUTO') {
        const hasCssCross = axes.cross === 'width'
          ? isCssUnit(layout.cssWidth)
          : isCssUnit(layout.cssHeight);
        if (!hasCssCross) {
          if (axes.cross === 'width') layout.cssWidth = 'auto';
          else layout.cssHeight = 'auto';
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
  if (pt || pr || pb || pl) layout.padding = { t: pt, r: pr, b: pb, l: pl };
  if (node?.strokesIncludedInLayout) layout.boxSizing = 'border-box';
  if (node?.clipsContent) layout.overflow = 'hidden';

  // Why: decide centering in IR to keep HTML rendering simple
  if (hasWrapper && layout.wrapper) {
    const w = layout.wrapper;
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
  let outWidth = base.width;
  let outHeight = base.height;
  let outOrigin: 'top left' | 'center' = 'top left';
  let outT2 = { ...base.t2x2 };
  let wrapper: WrapperInfo | undefined = base.wrapper;

  if (flags?.asFlexItem) {
    const a = M_local[0][0], c = M_local[0][1];
    const b = M_local[1][0], d = M_local[1][1];
    const { width: w, height: h } = getNodeSize(node);
    // Flex items must have numeric dimensions for layout calculation
    const wNum = dimensionToNumber(w, `computeLayout:flexItem:width for node ${node.id}`);
    const hNum = dimensionToNumber(h, `computeLayout:flexItem:height for node ${node.id}`);
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
      const baseWidth = dimensionToNumber(base.width, `computeLayout:baseWidth for node ${node.id}`);
      const baseHeight = dimensionToNumber(base.height, `computeLayout:baseHeight for node ${node.id}`);
      const needWrapper = Math.abs(baseWidth - wNum) > eps || Math.abs(baseHeight - hNum) > eps;
      if (needWrapper) {
        wrapper = { contentWidth: baseWidth, contentHeight: baseHeight };
      }
    } else {
      // Why: rotated shapes need reserved AABB for layout; inner keeps original size for correct transform/stroke.
      outWidth = reserveW;
      outHeight = reserveH;
      if (reserveW !== wNum || reserveH !== hNum) {
        wrapper = { contentWidth: wNum, contentHeight: hNum };
      }
    }
  }

  let flexProps: Partial<FlexCoreProps> = {};
  if (flags?.asFlexItem) {
    flexProps = computeFlexItemCoreProps(node, flags, outWidth as number);
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
    ...flexProps,
  };

  if (flags?.asFlexItem) {
    const isStretch = computeIsStretch(node?.layoutAlign || 'AUTO', flags?.parentAlignItemsCss);
    if (isStretch) {
      // 文本节点的尺寸应由 textAutoResize 控制，不应被 stretch 破坏
      const axes = flags?.parentAxes || getLayoutAxes('NONE');
      const isText = isTextNodeWithContent(node);
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

  if (wrapper) layout.wrapper = wrapper;
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
