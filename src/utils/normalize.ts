import { normUpper } from './enum';
import { isAffine2x3 } from './matrix';
import { precomputeRenderItemsOnNode } from './renderItems';

function upperAssign(obj: any, key: string) {
  if (obj && typeof obj === 'object' && key in obj && typeof obj[key] === 'string') {
    const v = normUpper(obj[key]);
    if (v) obj[key] = v;
  }
}

export function normalizeNode(node: any): void {
  if (!node || typeof node !== 'object') return;

  // Back-compat: promote legacy bounds(kind='render') to renderBounds (composition-local)
  if (!node.renderBounds && node.bounds && typeof node.bounds === 'object') {
    const b = node.bounds;
    const hasNums = typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number';
    const kindOk = !('kind' in b) || String(b.kind || '').toLowerCase() === 'render';
    if (hasNums && kindOk) {
      node.renderBounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
  }

  // Common enum fields found in Figma-derived nodes
  upperAssign(node, 'type');
  upperAssign(node, 'layoutMode');
  upperAssign(node, 'layoutWrap');
  upperAssign(node, 'layoutPositioning');
  upperAssign(node, 'layoutAlign');
  upperAssign(node, 'primaryAxisSizingMode');
  upperAssign(node, 'counterAxisSizingMode');
  upperAssign(node, 'primaryAxisAlignItems');
  upperAssign(node, 'counterAxisAlignItems');

  // constraints enums (if present)
  if (node.constraints && typeof node.constraints === 'object') {
    upperAssign(node.constraints, 'horizontal');
    upperAssign(node.constraints, 'vertical');
  }

  // style.fills[] enums
  const fills = node?.style?.fills;
  if (Array.isArray(fills)) {
    for (const f of fills) {
      if (f && typeof f === 'object') {
        upperAssign(f, 'type');
        upperAssign(f, 'scaleMode');
      }
    }
  }

  // Set effectTarget based on node type (SVG nodes need 'content' for drop-shadow)
  if (node.style && typeof node.style === 'object') {
    node.style.effectTarget = (node.svgContent || node.svgId) ? 'content' : 'self';
  }

  // subtree fully removed — no subtree promotion

  // Recurse
  if (Array.isArray(node.children)) {
    node.children.forEach(normalizeNode);
  }

  // Structural validation (fail fast at boundary)
  if (!isAffine2x3((node as any).absoluteTransform)) {
    const id = String((node && (node.id || 'unknown')));
    throw new Error(`normalize: node ${id} has invalid absoluteTransform`);
  }

  // SVG nodes must have complete renderBounds
  if (node.svgContent) {
    const rb = node.renderBounds;
    if (!rb || typeof rb.x !== 'number' || typeof rb.y !== 'number' 
        || typeof rb.width !== 'number' || typeof rb.height !== 'number') {
      throw new Error(`normalize: SVG node ${node.id} missing complete renderBounds`);
    }
    // Nested SVG nodes must have absoluteRenderBounds for coordinate transformation
    if (!node.isTopLevel && !node.absoluteRenderBounds) {
      throw new Error(`normalize: nested SVG node ${node.id} missing absoluteRenderBounds`);
    }
    // Unify width/height to match renderBounds (Figma often sets height:0 for SVG)
    node.width = rb.width;
    node.height = rb.height;
  }

  // Upstream precomputation: attach _renderItems to container nodes
  precomputeRenderItemsOnNode(node);
}

export function normalizeComposition(comp: any): void {
  if (!comp || typeof comp !== 'object') return;
  // Backward-compat shim: flatten legacy element {x,y,width,height} to top-level fields
  if (Array.isArray(comp.children)) {
    for (const ch of comp.children) {
      if (ch && typeof ch === 'object' && ch.element) {
        if (typeof ch.width !== 'number' && typeof ch.element.width === 'number') {
          ch.width = ch.element.width;
        }
        if (typeof ch.height !== 'number' && typeof ch.element.height === 'number') {
          ch.height = ch.element.height;
        }
        if (typeof ch.x !== 'number' && typeof ch.element.x === 'number') {
          ch.x = ch.element.x;
        }
        if (typeof ch.y !== 'number' && typeof ch.element.y === 'number') {
          ch.y = ch.element.y;
        }
      }
    }
    comp.children.forEach(normalizeNode);
    // Ensure top-level children carry renderBounds for IR render union computation
    for (let i = 0; i < comp.children.length; i++) {
      const ch = comp.children[i];
      const rb = ch && ch.renderBounds;
      const ok = rb && typeof rb.x === 'number' && typeof rb.y === 'number' && typeof rb.width === 'number' && typeof rb.height === 'number';
      if (!ok) throw new Error(`normalize: child[${i}] missing renderBounds`);
    }
  }
}
