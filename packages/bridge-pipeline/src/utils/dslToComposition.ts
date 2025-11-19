import * as cheerio from 'cheerio';
import type { CompositionInput, FigmaNode } from '../types/figma';
import { parseDimensionAttr } from './dimension';

type Padding = { t: number; r: number; b: number; l: number };
type Radius = number | { tl: number; tr: number; br: number; bl: number };
type Color = { r: number; g: number; b: number; a: number };

function parsePadding(value: string | undefined): Padding | null {
  if (!value) return null;
  const parts = value.split(',').map(v => Number(v.trim()));
  if (parts.length === 1) {
    return { t: parts[0], r: parts[0], b: parts[0], l: parts[0] };
  }
  if (parts.length === 2) {
    return { t: parts[0], r: parts[1], b: parts[0], l: parts[1] };
  }
  if (parts.length === 4) {
    return { t: parts[0], r: parts[1], b: parts[2], l: parts[3] };
  }
  return null;
}

function parseRadius(value: string | undefined): Radius | null {
  if (!value) return null;
  const parts = value.split(',').map(v => Number(v.trim()));
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 4) {
    return { tl: parts[0], tr: parts[1], br: parts[2], bl: parts[3] };
  }
  return null;
}

function parseColor(hexOrRgb: string): Color {
  if (hexOrRgb.startsWith('#')) {
    let hex = hexOrRgb.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b, a: 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

function parseLineHeight(value: string | undefined): { unit: 'PIXELS' | 'PERCENT'; value: number } | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v.endsWith('%')) {
    return { unit: 'PERCENT', value: parseFloat(v) };
  }
  if (v.endsWith('px')) {
    return { unit: 'PIXELS', value: parseFloat(v) };
  }
  const n = parseFloat(v);
  if (Number.isFinite(n)) {
    // Unitless line-height (e.g. 1.5) is treated as percentage (150%) in Figma terms
    return { unit: 'PERCENT', value: n * 100 };
  }
  return undefined;
}

function parseLetterSpacing(value: string | undefined): { unit: 'PIXELS' | 'PERCENT'; value: number } | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v.endsWith('%')) {
    return { unit: 'PERCENT', value: parseFloat(v) };
  }
  if (v.endsWith('px')) {
    return { unit: 'PIXELS', value: parseFloat(v) };
  }
  const n = parseFloat(v);
  if (Number.isFinite(n)) {
    // Unitless letter-spacing usually means pixels in design tools context, though CSS allows ems.
    // We'll assume pixels for consistency with Figma defaults if no unit specified.
    return { unit: 'PIXELS', value: n };
  }
  return undefined;
}

function parseTextNode(el: cheerio.Element, $: any): FigmaNode {
  const $el = $(el);
  const color = $el.attr('color') || '#000000';
  const size = Number($el.attr('size') || '16');
  const weight = Number($el.attr('weight') || '400');
  const family = $el.attr('family') || 'Inter';
  const alignH = $el.attr('align-h');
  const alignV = $el.attr('align-v');
  const lineHeightAttr = $el.attr('line-height');
  const letterSpacingAttr = $el.attr('letter-spacing');
  const name = $el.attr('name') || 'Text';
  const id = $el.attr('id') || `text-${Math.random().toString(36).slice(2, 9)}`;
  const text = $el.text();
  const colorObj = parseColor(color);

  const rawWidth = $el.attr('width');
  const rawHeight = $el.attr('height');
  const dimW = rawWidth != null ? parseDimensionAttr(rawWidth) : undefined;
  const dimH = rawHeight != null ? parseDimensionAttr(rawHeight) : undefined;

  const safeFontSize = Number.isFinite(size) && size > 0 ? size : 16;
  const chars = text || '';
  const approxCharWidth = safeFontSize * 0.6;
  const approxWidthFromText = Math.max(safeFontSize, approxCharWidth * Math.max(chars.length, 1));
  const approxHeightFromText = safeFontSize * 1.2;

  const widthPx = typeof dimW === 'number' && dimW > 0 ? dimW : approxWidthFromText;
  const heightPx = typeof dimH === 'number' && dimH > 0 ? dimH : approxHeightFromText;

  const lineHeight = parseLineHeight(lineHeightAttr);
  const letterSpacing = parseLetterSpacing(letterSpacingAttr);

  const node: FigmaNode = {
    id,
    name,
    type: 'TEXT',
    visible: true,
    // DSL text nodes start at the viewport origin; auto-layout/CSS will handle flow positioning.
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    width: widthPx,
    height: heightPx,
    text: {
      characters: text,
      textAutoResize: 'WIDTH_AND_HEIGHT',
      textAlignHorizontal: alignH,
      textAlignVertical: alignV,
      segments: [{
        start: 0,
        end: text.length,
        fontSize: size,
        fontWeight: weight,
        fontName: { family, style: 'Regular' },
        fills: [{ type: 'SOLID', color: colorObj }],
        lineHeight,
        letterSpacing
      }]
    },
    renderBounds: { x: 0, y: 0, width: widthPx, height: heightPx }
  };

  return node;
}

type FrameAttributes = {
  id: string;
  name: string;
  x?: string;
  y?: string;
  width?: string;
  height?: string;
  layout?: string;
  gap: number;
  padding?: { t: number; r: number; b: number; l: number } | null;
  fill?: string;
  radius?: number | { tl: number; tr: number; br: number; bl: number } | null;
  stroke?: string;
  strokeWeight?: string;
  strokeAlign?: string;
  clips?: string;
  opacity?: string;
  alignMain: string;
  alignCross: string;
  selfAlign?: string;
  sizeMain: string;
  sizeCross: string;
  positioning?: string;
  grow?: string;
};

function buildFrameAttributes($el: any): FrameAttributes {
  return {
    id: $el.attr('id') || `frame-${Math.random().toString(36).slice(2, 9)}`,
    name: $el.attr('name') || 'Frame',
    x: $el.attr('x'),
    y: $el.attr('y'),
    width: $el.attr('width'),
    height: $el.attr('height'),
    layout: $el.attr('layout'),
    gap: Number($el.attr('gap') || '0'),
    padding: parsePadding($el.attr('padding')),
    fill: $el.attr('fill'),
    radius: parseRadius($el.attr('radius')),
    stroke: $el.attr('stroke'),
    strokeWeight: $el.attr('stroke-weight'),
    strokeAlign: $el.attr('stroke-align'),
    clips: $el.attr('clips') ?? $el.attr('overflow'),
    opacity: $el.attr('opacity'),
    alignMain: $el.attr('align-main') || 'MIN',
    alignCross: $el.attr('align-cross') || 'MIN',
    selfAlign: $el.attr('self-align'),
    sizeMain: $el.attr('size-main') || 'AUTO',
    sizeCross: $el.attr('size-cross') || 'AUTO',
    positioning: $el.attr('positioning'),
    grow: $el.attr('grow')
  };
}

function buildFrameBase(attrs: FrameAttributes): FigmaNode {
  const dimW = parseDimensionAttr(attrs.width);
  const dimH = parseDimensionAttr(attrs.height);
  const widthPx = typeof dimW === 'number' && dimW > 0 ? dimW : 100;
  const heightPx = typeof dimH === 'number' && dimH > 0 ? dimH : 100;
  const tx = attrs.x !== undefined ? Number(attrs.x) || 0 : 0;
  const ty = attrs.y !== undefined ? Number(attrs.y) || 0 : 0;

  const node: FigmaNode = {
    id: attrs.id,
    name: attrs.name,
    type: 'FRAME',
    visible: true,
    absoluteTransform: [[1, 0, tx], [0, 1, ty]],
    width: dimW !== undefined ? dimW : widthPx,
    height: dimH !== undefined ? dimH : heightPx,
    children: []
  };

  if (attrs.x !== undefined || attrs.y !== undefined) {
    const numX = Number(attrs.x) || 0;
    const numY = Number(attrs.y) || 0;
    (node as any).isTopLevel = true;
    (node as any).x = numX;
    (node as any).y = numY;
    node.renderBounds = { x: numX, y: numY, width: widthPx, height: heightPx };
  } else {
    (node as any).renderBounds = { x: 0, y: 0, width: widthPx, height: heightPx };
  }

  return node;
}

function applyFrameLayout(node: FigmaNode, attrs: FrameAttributes): void {
  if (!attrs.layout) return;

  const upper = attrs.layout.toUpperCase();
  node.layoutMode = (upper === 'ROW' || upper === 'HORIZONTAL') ? 'HORIZONTAL' : 'VERTICAL';
  (node as any).itemSpacing = attrs.gap;
  (node as any).primaryAxisAlignItems = attrs.alignMain;
  (node as any).counterAxisAlignItems = attrs.alignCross;

  const isRow = node.layoutMode === 'HORIZONTAL';
  const explicitWidth = attrs.width !== undefined;
  const explicitHeight = attrs.height !== undefined;

  if (attrs.sizeMain === 'AUTO') {
    (node as any).primaryAxisSizingMode = (isRow ? explicitWidth : explicitHeight) ? 'FIXED' : 'AUTO';
  } else {
    (node as any).primaryAxisSizingMode = attrs.sizeMain;
  }

  if (attrs.sizeCross === 'AUTO') {
    (node as any).counterAxisSizingMode = (isRow ? explicitHeight : explicitWidth) ? 'FIXED' : 'AUTO';
  } else {
    (node as any).counterAxisSizingMode = attrs.sizeCross;
  }

  (node as any).layoutWrap = 'NO_WRAP';

  if (attrs.selfAlign) {
    (node as any).layoutAlign = attrs.selfAlign;
  }

  if (attrs.grow !== undefined) {
    const growValue = attrs.grow === '' || attrs.grow === 'true' ? 1 : Number(attrs.grow);
    if (growValue > 0) (node as any).layoutGrow = growValue;
  }

  if (attrs.padding) {
    (node as any).paddingTop = attrs.padding.t;
    (node as any).paddingRight = attrs.padding.r;
    (node as any).paddingBottom = attrs.padding.b;
    (node as any).paddingLeft = attrs.padding.l;
  }

  if (attrs.positioning) {
    const posUpper = attrs.positioning.toUpperCase();
    if (posUpper === 'ABSOLUTE' || posUpper === 'AUTO') {
      (node as any).layoutPositioning = posUpper;
    }
  }
}

function applyFrameStyle(node: FigmaNode, attrs: FrameAttributes): void {
  if (attrs.clips !== undefined) {
    (node as any).clipsContent = attrs.clips !== 'false' && attrs.clips !== '0';
  }

  if (attrs.opacity !== undefined) {
    const op = Number(attrs.opacity);
    if (Number.isFinite(op) && op >= 0 && op <= 1) {
      node.style = node.style || {};
      (node.style as any).opacity = op;
    }
  }

  if (attrs.fill || attrs.radius || attrs.stroke) {
    node.style = node.style || {};

    if (attrs.fill) {
      const color = parseColor(attrs.fill);
      (node.style as any).fills = [{ type: 'SOLID', color }];
    }

    if (attrs.radius) {
      if (typeof attrs.radius === 'number') {
        (node.style as any).radii = { uniform: attrs.radius };
      } else {
        (node.style as any).radii = { corners: [attrs.radius.tl, attrs.radius.tr, attrs.radius.br, attrs.radius.bl] };
      }
    }

    if (attrs.stroke) {
      if (!attrs.strokeWeight) {
        throw new Error(`dslToComposition: stroke-weight is required when stroke is set on frame ${attrs.id}`);
      }
      const weightNum = Number(attrs.strokeWeight);
      if (!Number.isFinite(weightNum)) {
        throw new Error(`dslToComposition: invalid stroke-weight "${attrs.strokeWeight}" on frame ${attrs.id}`);
      }
      const color = parseColor(attrs.stroke);
      (node.style as any).strokes = [{ type: 'SOLID', color, visible: true }];
      (node.style as any).strokeWeights = { t: weightNum, r: weightNum, b: weightNum, l: weightNum };

      if (attrs.strokeAlign) {
        (node.style as any).strokeAlign = attrs.strokeAlign;
      }
    }
  }
}

function attachFrameChildren(node: FigmaNode, el: cheerio.Element, $: any, basePath?: string): void {
  const $el = $(el);
  $el.children().each((_: number, child: any) => {
    const childTag = (child as any).tagName?.toLowerCase() || (child as any).name?.toLowerCase();
    if (childTag === 'bridge-frame' || childTag === 'bridge-text' || childTag === 'bridge-image' || childTag === 'bridge-svg') {
      (node.children as FigmaNode[]).push(parseNode(child, $, basePath));
    }
  });
}

function applyFixedSizeShrink(node: FigmaNode, attrs: FrameAttributes): void {
  // Fixed-size elements should not shrink in flex containers to prevent layout collapse
  // Trust parseDimensionAttr to handle invalid inputs
  const isFixedSize = !!(parseDimensionAttr(attrs.width) || parseDimensionAttr(attrs.height));

  // Sanitize grow value: treat non-numeric strings (like "false") as 0
  const grow = Number(attrs.grow) || 0;

  if (isFixedSize && grow === 0) {
    node.layoutShrink = 0;
  }
}

function parseFrameNode(el: cheerio.Element, $: any, basePath?: string): FigmaNode {
  const attrs = buildFrameAttributes($(el));
  const node = buildFrameBase(attrs);
  applyFrameLayout(node, attrs);
  applyFrameStyle(node, attrs);
  applyFixedSizeShrink(node, attrs);
  attachFrameChildren(node, el, $, basePath);
  return node;
}

function parseImageNode(el: cheerio.Element, $: any, basePath?: string): FigmaNode {
  const $el = $(el);
  const srcAttr = $el.attr('src');
  if (!srcAttr) {
    throw new Error('dslToComposition: <bridge-image> requires a non-empty src attribute');
  }
  let src = srcAttr;
  if (basePath && src.startsWith('./')) {
    const path = require('path');
    const relativePath = src.replace(/^\.\//, '');
    const dirName = basePath.split('/').pop() || '';
    src = `/fixtures/dsl/${dirName}/${relativePath}`;
  }
  const scaleMode = $el.attr('mode') || 'FILL'; // FILL, FIT, CROP, TILE
  const widthAttr = $el.attr('width');
  const heightAttr = $el.attr('height');
  const name = $el.attr('name') || 'Image';
  const id = $el.attr('id') || `image-${Math.random().toString(36).slice(2, 9)}`;
  const x = $el.attr('x');
  const y = $el.attr('y');
  const opacityAttr = $el.attr('opacity');
  const radius = parseRadius($el.attr('radius'));

  const dimW = parseDimensionAttr(widthAttr);
  const dimH = parseDimensionAttr(heightAttr);
  const widthPx = typeof dimW === 'number' && dimW > 0 ? dimW : 100;
  const heightPx = typeof dimH === 'number' && dimH > 0 ? dimH : 100;

  const tx = x !== undefined ? Number(x) || 0 : 0;
  const ty = y !== undefined ? Number(y) || 0 : 0;

  const node: FigmaNode = {
    id,
    name,
    type: 'RECTANGLE',
    visible: true,
    absoluteTransform: [[1, 0, tx], [0, 1, ty]],
    width: widthPx,
    height: heightPx,
    style: {
      fills: [{
        type: 'IMAGE',
        scaleMode: scaleMode as any,
        // We pass the URL in a custom field (or imageId if the pipeline supports it).
        // Standard Figma uses imageHash, but we don't have that from a URL.
        // We'll use imageId to store the URL for now, or rely on downstream to handle it.
        imageId: src
      }]
    },
    renderBounds: { x: 0, y: 0, width: widthPx, height: heightPx },
    absoluteRenderBounds: { x: 0, y: 0, width: widthPx, height: heightPx }
  };

  if (x !== undefined || y !== undefined) {
    const numX = Number(x) || 0;
    const numY = Number(y) || 0;
    (node as any).isTopLevel = true;
    (node as any).x = numX;
    (node as any).y = numY;
    node.renderBounds = {
      x: numX,
      y: numY,
      width: widthPx,
      height: heightPx
    };
    (node as any).absoluteRenderBounds = {
      x: numX,
      y: numY,
      width: widthPx,
      height: heightPx
    };
  }

  if (radius) {
    if (typeof radius === 'number') {
      (node.style as any).radii = { uniform: radius };
    } else {
      (node.style as any).radii = { corners: [radius.tl, radius.tr, radius.br, radius.bl] };
    }
  }

  if (opacityAttr !== undefined) {
    const op = Number(opacityAttr);
    if (Number.isFinite(op) && op >= 0 && op <= 1) {
      (node.style as any).opacity = op;
    }
  }

  // Preserve CSS units (vw, vh, %, etc) as strings; numeric values become px.
  if (dimW !== undefined) {
    (node as any).width = dimW as any;
  }
  if (dimH !== undefined) {
    (node as any).height = dimH as any;
  }

  return node;
}

function parseSvgNode(el: cheerio.Element, $: any, basePath?: string): FigmaNode {
  const $el = $(el);
  const widthAttr = $el.attr('width');
  const heightAttr = $el.attr('height');
  const name = $el.attr('name') || 'Vector';
  const id = $el.attr('id') || `svg-${Math.random().toString(36).slice(2, 9)}`;
  const x = $el.attr('x');
  const y = $el.attr('y');
  const opacityAttr = $el.attr('opacity');
  const srcAttr = $el.attr('src');

  const dimW = parseDimensionAttr(widthAttr);
  const dimH = parseDimensionAttr(heightAttr);
  const widthPx = typeof dimW === 'number' && dimW > 0 ? dimW : 24; // Default icon size
  const heightPx = typeof dimH === 'number' && dimH > 0 ? dimH : 24;

  const tx = x !== undefined ? Number(x) || 0 : 0;
  const ty = y !== undefined ? Number(y) || 0 : 0;

  // Extract inner SVG content from innerHTML or external file
  let svgContent = $el.html()?.trim() || '';

  if (!svgContent && srcAttr && basePath) {
    // Load SVG from external file
    const fs = require('fs');
    const path = require('path');
    const svgPath = path.join(basePath, srcAttr);
    try {
      svgContent = fs.readFileSync(svgPath, 'utf8').trim();
    } catch (e) {
      throw new Error(`dslToComposition: failed to load SVG from ${srcAttr}: ${e}`);
    }
  }

  if (!svgContent) {
    throw new Error(`dslToComposition: <bridge-svg> requires either innerHTML or src attribute with valid file`);
  }

  // Simple hash for svgId (not cryptographically secure, just for diffing)
  const simpleHash = svgContent.split('').reduce((a: number, b: string) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(16);

  const node: FigmaNode = {
    id,
    name,
    type: 'VECTOR',
    visible: true,
    absoluteTransform: [[1, 0, tx], [0, 1, ty]],
    width: widthPx,
    height: heightPx,
    svgContent,
    svgId: simpleHash,
    style: {}, // SVGs usually carry their own style, but we can support override opacity
    renderBounds: { x: 0, y: 0, width: widthPx, height: heightPx },
    absoluteRenderBounds: { x: 0, y: 0, width: widthPx, height: heightPx }
  };

  if (x !== undefined || y !== undefined) {
    const numX = Number(x) || 0;
    const numY = Number(y) || 0;
    (node as any).isTopLevel = true;
    (node as any).x = numX;
    (node as any).y = numY;
    node.renderBounds = {
      x: numX,
      y: numY,
      width: widthPx,
      height: heightPx
    };
    (node as any).absoluteRenderBounds = {
      x: numX,
      y: numY,
      width: widthPx,
      height: heightPx
    };
  }

  if (opacityAttr !== undefined) {
    const op = Number(opacityAttr);
    if (Number.isFinite(op) && op >= 0 && op <= 1) {
      (node.style as any).opacity = op;
    }
  }

  // Preserve CSS units (vw, vh, %, etc) as strings; numeric values become px.
  if (dimW !== undefined) {
    (node as any).width = dimW as any;
  }
  if (dimH !== undefined) {
    (node as any).height = dimH as any;
  }

  return node;
}

function parseNode(el: cheerio.Element, $: any, basePath?: string): FigmaNode {
  const tagName = (el as any).tagName?.toLowerCase() || (el as any).name?.toLowerCase();
  if (!tagName) {
    throw new Error('dslToComposition: element has no tagName/name');
  }
  if (tagName === 'bridge-frame') return parseFrameNode(el, $, basePath);
  if (tagName === 'bridge-text') return parseTextNode(el, $);
  if (tagName === 'bridge-image') return parseImageNode(el, $, basePath);
  if (tagName === 'bridge-svg') return parseSvgNode(el, $, basePath);
  throw new Error(`dslToComposition: unknown DSL tag: ${tagName}`);
}

export function dslHtmlToComposition(html: string, basePath?: string): CompositionInput {
  const $ = cheerio.load(html);
  const rootElements = $(
    [
      'body > [id^="bridge-"]',
      'body > bridge-frame',
      'body > bridge-text'
    ].join(', ')
  ).toArray();
  if (rootElements.length === 0) {
    throw new Error('dslToComposition: no Figma components found in DSL HTML');
  }

  const children = rootElements.map(el => parseNode(el, $, basePath));

  // Viewport hints on the first root DSL element:
  // <bridge-frame viewport-width="1440" viewport-height="900" ...>
  let viewportWidth: number | undefined;
  let viewportHeight: number | undefined;
  if (rootElements.length > 0) {
    const $root = $(rootElements[0] as any);
    const vwAttr = $root.attr('viewport-width') || $root.attr('data-viewport-width');
    const vhAttr = $root.attr('viewport-height') || $root.attr('data-viewport-height');
    const vwNum = vwAttr != null ? Number(vwAttr) : NaN;
    const vhNum = vhAttr != null ? Number(vhAttr) : NaN;
    if (Number.isFinite(vwNum) && vwNum > 0) viewportWidth = vwNum;
    if (Number.isFinite(vhNum) && vhNum > 0) viewportHeight = vhNum;
  }

  if (!viewportWidth || !viewportHeight) {
    throw new Error(
      'dslToComposition: viewport-width and viewport-height are required on root DSL element (e.g. <bridge-frame viewport-width="1440" viewport-height="900" ...>)'
    );
  }

  // DSL path has no Figma-global canvas: treat the viewport origin as the only world origin.
  // absOrigin is fixed at (0,0); children renderBounds/absoluteTransform live in viewport coordinates.
  const absOrigin = { x: 0, y: 0 };
  const bounds = {
    x: 0,
    y: 0,
    width: viewportWidth,
    height: viewportHeight
  };

  return {
    kind: 'composition',
    bounds,
    absOrigin,
    children
  };
}
