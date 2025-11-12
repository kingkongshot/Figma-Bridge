export type FigmaNodeLite = { visible?: boolean; isMask?: boolean } & Record<string, any>;

export type RenderNodeItem = { kind: 'node'; index: number; itemCss: string };
export type RenderMaskedItem = { kind: 'masked'; maskIndex: number; nodeIndices: number[]; containerCss: string };
export type RenderItem = RenderNodeItem | RenderMaskedItem;

const isVisible = (n: FigmaNodeLite) => !!(n && n.visible !== false);

function buildIndexedRenderItems(
  children: FigmaNodeLite[],
  opts: { parentIsAutoLayout: boolean; parentLayoutMode: string; itemSpacing: number; reverseZIndex: boolean }
): RenderItem[] {
  if (!Array.isArray(children) || children.length === 0) return [];

  type ISegment = { maskIndex: number | null; nodeIndices: number[] };
  const segments: ISegment[] = [];
  let current: ISegment = { maskIndex: null, nodeIndices: [] };
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c && c.isMask) {
      if (current.nodeIndices.length > 0 || current.maskIndex !== null) segments.push(current);
      current = { maskIndex: i, nodeIndices: [] };
    } else {
      current.nodeIndices.push(i);
    }
  }
  if (current.nodeIndices.length > 0 || current.maskIndex !== null) segments.push(current);

  const items: RenderItem[] = [];
  for (const seg of segments) {
    if (seg.maskIndex !== null) {
      const visibleCount = seg.nodeIndices.reduce((acc, idx) => acc + (isVisible(children[idx]) ? 1 : 0), 0);
      if (visibleCount > 0) items.push({ kind: 'masked', maskIndex: seg.maskIndex, nodeIndices: seg.nodeIndices.slice(), containerCss: '' });
    } else {
      for (const idx of seg.nodeIndices) {
        const n = children[idx];
        if (!isVisible(n)) continue;
        items.push({ kind: 'node', index: idx, itemCss: '' });
      }
    }
  }

  const total = items.length;
  let flowIndex = 0;
  const hasNegativeGap = opts.itemSpacing < 0;
  // ✅ 优化：只在非 Flexbox 或有重叠时才添加 z-index
  const needsZIndex = !opts.parentIsAutoLayout || hasNegativeGap || opts.reverseZIndex;
  
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const zIndexCss = needsZIndex 
      ? (opts.reverseZIndex ? `z-index:${total - i};` : `z-index:${i + 1};`)
      : '';
    if (it.kind === 'masked') {
      it.containerCss = zIndexCss;
      continue;
    }
    const negativeGapMargin = hasNegativeGap && opts.parentIsAutoLayout && flowIndex > 0
      ? (opts.parentLayoutMode === 'VERTICAL' ? `margin-top:${opts.itemSpacing}px;` : `margin-left:${opts.itemSpacing}px;`)
      : '';
    it.itemCss = `${negativeGapMargin}${zIndexCss}`;
    flowIndex++;
  }
  return items;
}

export function buildRenderItems(
  children: FigmaNodeLite[],
  opts: { parentIsAutoLayout: boolean; parentLayoutMode: string; itemSpacing: number; reverseZIndex: boolean }
): RenderItem[] {
  return buildIndexedRenderItems(children, opts);
}

export function precomputeRenderItemsForContainer(container: any): RenderItem[] {
  if (!container || !Array.isArray(container.children)) return [];
  const children: any[] = container.children;
  const parentIsAutoLayout: boolean = (container?.layoutMode || 'NONE') !== 'NONE';
  const parentLayoutMode: string = container?.layoutMode || 'NONE';
  const itemSpacing: number = typeof container?.itemSpacing === 'number' ? container.itemSpacing : 0;
  const reverseZIndex: boolean = container?.itemReverseZIndex === true;

  return buildIndexedRenderItems(children, {
    parentIsAutoLayout,
    parentLayoutMode,
    itemSpacing,
    reverseZIndex,
  });
}

// Precompute and attach _renderItems to container nodes during normalization.
// This allows render-time to directly use precomputed items without recalculation.
export function precomputeRenderItemsOnNode(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.children) && node.children.length > 0) {
    (node as any)._renderItems = precomputeRenderItemsForContainer(node);
  }
}
