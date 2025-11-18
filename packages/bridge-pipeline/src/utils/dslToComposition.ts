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

function parseTextNode(el: cheerio.Element, $: any): FigmaNode {
  const $el = $(el);
  const color = $el.attr('color') || '#000000';
  const size = Number($el.attr('size') || '16');
  const weight = Number($el.attr('weight') || '400');
  const family = $el.attr('family') || 'Inter';
  const name = $el.attr('name') || 'Text';
  const id = $el.attr('id') || `text-${Math.random().toString(36).slice(2, 9)}`;
  const text = $el.text();
  const colorObj = parseColor(color);

  const node: FigmaNode = {
    id,
    name,
    type: 'TEXT',
    visible: true,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    width: 0,
    height: 0,
    text: {
      characters: text,
      textAutoResize: 'WIDTH_AND_HEIGHT',
      segments: [{
        start: 0,
        end: text.length,
        fontSize: size,
        fontWeight: weight,
        fontName: { family, style: 'Regular' },
        fills: [{ type: 'SOLID', color: colorObj }]
      }]
    }
  };

  return node;
}

function parseFrameNode(el: cheerio.Element, $: any): FigmaNode {
  const $el = $(el);
  const layout = $el.attr('layout');
  const gap = Number($el.attr('gap') || '0');
  const padding = parsePadding($el.attr('padding'));
  const fill = $el.attr('fill');
  const radius = parseRadius($el.attr('radius'));
  const stroke = $el.attr('stroke');
  const strokeWeight = $el.attr('stroke-weight');
  const strokeAlign = $el.attr('stroke-align');
  const alignMain = $el.attr('align-main') || 'MIN';
  const alignCross = $el.attr('align-cross') || 'MIN';
  const selfAlign = $el.attr('self-align');
  const sizeMain = $el.attr('size-main') || 'AUTO';
  const sizeCross = $el.attr('size-cross') || 'AUTO';
  const name = $el.attr('name') || 'Frame';
  const id = $el.attr('id') || `frame-${Math.random().toString(36).slice(2, 9)}`;
  const x = $el.attr('x');
  const y = $el.attr('y');
  const width = $el.attr('width');
  const height = $el.attr('height');

  const node: FigmaNode = {
    id,
    name,
    type: 'FRAME',
    visible: true,
    absoluteTransform: [[1, 0, 0], [0, 1, 0]],
    children: []
  };

  if (x !== undefined || y !== undefined) {
    (node as any).isTopLevel = true;
    (node as any).x = Number(x) || 0;
    (node as any).y = Number(y) || 0;
    node.renderBounds = {
      x: Number(x) || 0,
      y: Number(y) || 0,
      width: Number(width) || 100,
      height: Number(height) || 100
    };
  } else {
    (node as any).renderBounds = { x: 0, y: 0, width: 100, height: 100 };
  }

  // Preserve CSS units (vw, vh, %, etc) as strings; numeric values become px.
  const dimW = parseDimensionAttr(width);
  const dimH = parseDimensionAttr(height);
  if (dimW !== undefined) node.width = dimW;
  if (dimH !== undefined) node.height = dimH;

  if (layout) {
    node.layoutMode = layout.toUpperCase();
    (node as any).itemSpacing = gap;
    (node as any).primaryAxisAlignItems = alignMain;
    (node as any).counterAxisAlignItems = alignCross;
    (node as any).primaryAxisSizingMode = sizeMain;
    (node as any).counterAxisSizingMode = sizeCross;
    (node as any).layoutWrap = 'NO_WRAP';
  }

  if (selfAlign) {
    (node as any).layoutAlign = selfAlign;
  }

  const grow = $el.attr('grow');
  if (grow !== undefined) {
    const growValue = grow === '' || grow === 'true' ? 1 : Number(grow);
    if (growValue > 0) {
      (node as any).layoutGrow = growValue;
    }
  }

  if (padding) {
    (node as any).paddingTop = padding.t;
    (node as any).paddingRight = padding.r;
    (node as any).paddingBottom = padding.b;
    (node as any).paddingLeft = padding.l;
  }

  if (fill || radius || stroke) {
    node.style = node.style || {};
    if (fill) {
      const color = parseColor(fill);
      (node.style as any).fills = [{ type: 'SOLID', color }];
    }
    if (radius) {
      if (typeof radius === 'number') {
        (node.style as any).radii = { uniform: radius };
      } else {
        (node.style as any).radii = { corners: [radius.tl, radius.tr, radius.br, radius.bl] };
      }
    }
    if (stroke) {
      if (!strokeWeight) {
        throw new Error(`dslToComposition: stroke-weight is required when stroke is set on frame ${id}`);
      }
      const weightNum = Number(strokeWeight);
      if (!Number.isFinite(weightNum)) {
        throw new Error(`dslToComposition: invalid stroke-weight "${strokeWeight}" on frame ${id}`);
      }
      const color = parseColor(stroke);
      (node.style as any).strokes = [{
        type: 'SOLID',
        color: color,
        visible: true
      }];

      (node.style as any).strokeWeights = { t: weightNum, r: weightNum, b: weightNum, l: weightNum };

      if (strokeAlign) {
        (node.style as any).strokeAlign = strokeAlign;
      }
    }
  }

  $el.children().each((_: number, child: any) => {
    const childTag = (child as any).tagName?.toLowerCase() || (child as any).name?.toLowerCase();
    if (childTag === 'figma-frame' || childTag === 'figma-text') {
      (node.children as FigmaNode[]).push(parseNode(child, $));
    }
  });

  return node;
}

function parseNode(el: cheerio.Element, $: any): FigmaNode {
  const tagName = (el as any).tagName?.toLowerCase() || (el as any).name?.toLowerCase();
  if (!tagName) {
    throw new Error('dslToComposition: element has no tagName/name');
  }
  if (tagName === 'figma-frame') return parseFrameNode(el, $);
  if (tagName === 'figma-text') return parseTextNode(el, $);
  throw new Error(`dslToComposition: unknown DSL tag: ${tagName}`);
}

export function dslHtmlToComposition(html: string): CompositionInput {
  const $ = cheerio.load(html);
  const rootElements = $('body > [id^="figma-"], body > figma-frame, body > figma-text').toArray();
  if (rootElements.length === 0) {
    throw new Error('dslToComposition: no Figma components found in DSL HTML');
  }

  const children = rootElements.map(el => parseNode(el, $));

  return {
    kind: 'composition',
    bounds: { x: 0, y: 0, width: 1000, height: 1000 },
    absOrigin: { x: 0, y: 0 },
    children
  };
}
