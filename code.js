figma.showUI(__html__, { width: 280, height: 160, themeColors: true });

function sanitizeImageId(hash) {
  if (!hash || typeof hash !== 'string') return null;
  const cleaned = hash.replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || null;
}

const IGNORED_TYPES = [
  'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE',
  'REGULAR_POLYGON', 'ELLIPSE', 'ARROW', 'TRIANGLE'
];
const VECTOR_TYPES = [
  'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE',
  'REGULAR_POLYGON', 'ELLIPSE', 'ARROW', 'TRIANGLE'
];

function isVectorType(node) {
  return VECTOR_TYPES.includes(node.type);
}

function isPureVectorContainer(node) {
  if (!node || !('children' in node) || !Array.isArray(node.children) || node.children.length === 0) return false;
  for (const child of node.children) {
    if (!child || child.visible === false) continue;
    if ('children' in child && Array.isArray(child.children) && child.children.length > 0) {
      if (!isPureVectorContainer(child)) return false;
      continue;
    }
    if (!isVectorType(child)) return false;
  }
  return true;
}

function sortByDocumentOrder(nodes) {
  if (!nodes.length) return nodes;
  
  const parent = nodes[0].parent;
  if (!parent || !nodes.every(n => n.parent === parent)) {
    return nodes;
  }
  
  const indexMap = new Map();
  parent.children.forEach((child, i) => {
    indexMap.set(child.id, i);
  });
  
  return nodes.slice().sort((a, b) => {
    const idxA = indexMap.has(a.id) ? indexMap.get(a.id) : Infinity;
    const idxB = indexMap.has(b.id) ? indexMap.get(b.id) : Infinity;
    return idxA - idxB;
  });
}

function expandGroupsWithAncestors(nodes) {
  // Preserve selection as-is; no flattening.
  return nodes
    .filter(n => !!n && n.visible !== false)
    .map(n => ({ node: n, ancestors: [] }));
}

function computeBoundsFromRenderables(renderables) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function transformPoint(M, x, y) {
    const a = M[0][0], b = M[0][1], tx = M[0][2];
    const c = M[1][0], d = M[1][1], ty = M[1][2];
    return { x: a * x + b * y + tx, y: c * x + d * y + ty };
  }

  for (const entry of renderables) {
    const node = entry && entry.node;
    const M = node && node.absoluteTransform;
    const w = node && node.width;
    const h = node && node.height;

    const validMatrix = Array.isArray(M) && M.length >= 2 && Array.isArray(M[0]) && Array.isArray(M[1]) && M[0].length >= 3 && M[1].length >= 3;
    if (!validMatrix || typeof w !== 'number' || typeof h !== 'number') continue;

    const p00 = transformPoint(M, 0, 0);
    const p10 = transformPoint(M, w, 0);
    const p01 = transformPoint(M, 0, h);
    const p11 = transformPoint(M, w, h);

    const xs = [p00.x, p10.x, p01.x, p11.x];
    const ys = [p00.y, p10.y, p01.y, p11.y];

    const lminX = Math.min(xs[0], xs[1], xs[2], xs[3]);
    const lminY = Math.min(ys[0], ys[1], ys[2], ys[3]);
    const lmaxX = Math.max(xs[0], xs[1], xs[2], xs[3]);
    const lmaxY = Math.max(ys[0], ys[1], ys[2], ys[3]);

    minX = Math.min(minX, lminX);
    minY = Math.min(minY, lminY);
    maxX = Math.max(maxX, lmaxX);
    maxY = Math.max(maxY, lmaxY);
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { x: 0, y: 0, width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return { x: 0, y: 0, width, height, offsetX: minX, offsetY: minY };
}

function pickAutoLayoutContainerProps(n) {
  if (!n || typeof n.layoutMode !== 'string' || n.layoutMode === 'NONE') return null;
  const out = {
    layoutMode: n.layoutMode,
    itemSpacing: n.itemSpacing,
    paddingTop: n.paddingTop,
    paddingRight: n.paddingRight,
    paddingBottom: n.paddingBottom,
    paddingLeft: n.paddingLeft,
    primaryAxisAlignItems: n.primaryAxisAlignItems,
    counterAxisAlignItems: n.counterAxisAlignItems,
    primaryAxisSizingMode: n.primaryAxisSizingMode,
    counterAxisSizingMode: n.counterAxisSizingMode,
    layoutWrap: n.layoutWrap,
    counterAxisAlignContent: n.counterAxisAlignContent,
    counterAxisSpacing: (typeof n.counterAxisSpacing === 'number' ? n.counterAxisSpacing : null),
    strokesIncludedInLayout: n.strokesIncludedInLayout,
    itemReverseZIndex: n.itemReverseZIndex
  };
  return out;
}

function pickAutoLayoutChildProps(n, parentIsAutoLayout) {
  if (!parentIsAutoLayout || !n) return null;
  return {
    layoutAlign: n.layoutAlign,
    layoutGrow: typeof n.layoutGrow === 'number' ? n.layoutGrow : undefined,
    layoutPositioning: n.layoutPositioning
  };
}

function extractFills(n) {
  const fills = Array.isArray(n && n.fills) ? n.fills : null;
  if (!fills || fills.length === 0) return undefined;
  const out = [];
  
  for (const p of fills) {
    if (!p || p.visible === false) continue;
    const paintOpacity = typeof p.opacity === 'number' ? p.opacity : 1;
    
    if (p.type === 'SOLID' && p.color) {
      out.push({ 
        type: 'SOLID', 
        color: { r: p.color.r, g: p.color.g, b: p.color.b, a: paintOpacity },
        blendMode: typeof p.blendMode === 'string' ? p.blendMode : undefined
      });
    } 
    else if (p.type === 'IMAGE' && typeof p.imageHash === 'string') {
      const safeId = sanitizeImageId(p.imageHash);
      if (safeId) {
        const img = {
          type: 'IMAGE',
          imageId: safeId,
          imageHash: p.imageHash,
          scaleMode: p.scaleMode,
          opacity: paintOpacity,
          blendMode: typeof p.blendMode === 'string' ? p.blendMode : undefined
        };
        // Preserve crop/tiling/stretched transforms when available (best-effort)
        try {
          if (p && p.imageTransform && Array.isArray(p.imageTransform) && p.imageTransform.length >= 2) {
            const m0 = p.imageTransform[0];
            const m1 = p.imageTransform[1];
            if (Array.isArray(m0) && Array.isArray(m1) && m0.length >= 3 && m1.length >= 3) {
              img.imageTransform = [
                [Number(m0[0]) || 0, Number(m0[1]) || 0, Number(m0[2]) || 0],
                [Number(m1[0]) || 0, Number(m1[1]) || 0, Number(m1[2]) || 0]
              ];
            }
          }
          if (p && typeof p.scalingFactor === 'number') {
            img.scalingFactor = p.scalingFactor;
          }
        } catch (_) {}
        out.push(img);
      }
    }
    else if (p.type === 'GRADIENT_LINEAR' || p.type === 'GRADIENT_RADIAL' || p.type === 'GRADIENT_ANGULAR' || p.type === 'GRADIENT_DIAMOND') {
      const stops = Array.isArray(p.gradientStops) ? p.gradientStops : [];
      if (stops.length < 2) continue;
      
      const gradientStops = stops.map(stop => ({
        position: stop.position,
        color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
      }));
      
      const handles = Array.isArray(p.gradientHandlePositions) && p.gradientHandlePositions.length === 3
        ? [
            { x: p.gradientHandlePositions[0].x, y: p.gradientHandlePositions[0].y },
            { x: p.gradientHandlePositions[1].x, y: p.gradientHandlePositions[1].y },
            { x: p.gradientHandlePositions[2].x, y: p.gradientHandlePositions[2].y }
          ]
        : null;
      const transform = (p && p.gradientTransform && Array.isArray(p.gradientTransform)) ? p.gradientTransform : null;
      
      out.push({ 
        type: p.type, 
        gradientStops, 
        gradientHandlePositions: handles,
        gradientTransform: transform,
        opacity: paintOpacity,
        blendMode: typeof p.blendMode === 'string' ? p.blendMode : undefined
      });
    }
  }
  
  return out.length ? { fills: out } : undefined;
}

function extractRadii(n) {
  const tl = Number(n && n.topLeftRadius);
  const tr = Number(n && n.topRightRadius);
  const br = Number(n && n.bottomRightRadius);
  const bl = Number(n && n.bottomLeftRadius);
  const hasCorners = [tl, tr, br, bl].every(v => Number.isFinite(v)) && (tl || tr || br || bl);
  if (hasCorners) return { radii: { corners: [tl || 0, tr || 0, br || 0, bl || 0] } };
  const uniform = typeof (n && n.cornerRadius) === 'number' ? n.cornerRadius : 0;
  return uniform > 0 ? { radii: { uniform } } : undefined;
}

function extractStrokes(n) {
  const strokes = Array.isArray(n && n.strokes) ? n.strokes : null;
  if (!strokes || strokes.length === 0) return undefined;
  const strokesOut = [];
  for (const s of strokes) {
    if (!s || s.visible === false) continue;
    if (s.type === 'SOLID' && s.color) {
      const a = (typeof s.opacity === 'number' ? s.opacity : 1);
      strokesOut.push({ type: 'SOLID', color: { r: s.color.r, g: s.color.g, b: s.color.b, a }, visible: true });
      continue;
    }
    if (s.type === 'GRADIENT_LINEAR') {
      const stops = Array.isArray(s.gradientStops) ? s.gradientStops : [];
      if (stops.length < 2) continue;
      const gradientStops = stops.map(stop => ({
        position: stop.position,
        color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a }
      }));
      const handles = Array.isArray(s.gradientHandlePositions) && s.gradientHandlePositions.length === 3
        ? [
            { x: s.gradientHandlePositions[0].x, y: s.gradientHandlePositions[0].y },
            { x: s.gradientHandlePositions[1].x, y: s.gradientHandlePositions[1].y },
            { x: s.gradientHandlePositions[2].x, y: s.gradientHandlePositions[2].y }
          ]
        : null;
      const transform = (s && s.gradientTransform && Array.isArray(s.gradientTransform)) ? s.gradientTransform : null;
      const paintOpacity = typeof s.opacity === 'number' ? s.opacity : 1;
      strokesOut.push({ type: 'GRADIENT_LINEAR', gradientStops, gradientHandlePositions: handles, gradientTransform: transform, opacity: paintOpacity, visible: true });
      continue;
    }
  }
  return strokesOut.length ? { strokes: strokesOut } : undefined;
}

function extractStrokeWeights(n) {
  if (!n) return undefined;

  const hasVisibleStroke = Array.isArray(n.strokes)
    && n.strokes.some(s => s && s.visible !== false && (s.type === 'SOLID' || s.type === 'GRADIENT_LINEAR'));
  if (!hasVisibleStroke) return undefined;

  const base = { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof n.strokeWeight === 'number') {
    base.top = base.right = base.bottom = base.left = n.strokeWeight;
  }
  const sw = n && n.individualStrokeWeights;
  if (sw && typeof sw === 'object') {
    if (typeof sw.top === 'number') base.top = sw.top;
    if (typeof sw.right === 'number') base.right = sw.right;
    if (typeof sw.bottom === 'number') base.bottom = sw.bottom;
    if (typeof sw.left === 'number') base.left = sw.left;
  }
  if (typeof n.strokeTopWeight === 'number') base.top = n.strokeTopWeight;
  if (typeof n.strokeRightWeight === 'number') base.right = n.strokeRightWeight;
  if (typeof n.strokeBottomWeight === 'number') base.bottom = n.strokeBottomWeight;
  if (typeof n.strokeLeftWeight === 'number') base.left = n.strokeLeftWeight;

  const t = base.top, r = base.right, b = base.bottom, l = base.left;
  const allZero = !(t || r || b || l);
  const align = n && n.strokeAlign ? n.strokeAlign : null;
  const out = {};
  if (!allZero) out.strokeWeights = { t, r, b, l };
  if (align) out.strokeAlign = align;
  return Object.keys(out).length ? out : undefined;
}

function extractEffects(n) {
  const effects = Array.isArray(n && n.effects) ? n.effects : null;
  if (!effects || effects.length === 0) return undefined;

  const out = [];
  for (const e of effects) {
    if (!e || e.visible === false || !e.type) continue;
    if (e.type === 'BACKGROUND_BLUR' || e.type === 'LAYER_BLUR') {
      const radius = typeof e.radius === 'number' ? e.radius : 0;
      out.push({ type: e.type, radius, visible: true });
      continue;
    }
    if (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW') {
      const offset = e.offset && typeof e.offset.x === 'number' && typeof e.offset.y === 'number'
        ? { x: e.offset.x, y: e.offset.y }
        : { x: 0, y: 0 };
      const radius = typeof e.radius === 'number' ? e.radius : 0;
      const spread = typeof e.spread === 'number' ? e.spread : 0;
      const color = e.color ? { r: e.color.r, g: e.color.g, b: e.color.b, a: (typeof e.color.a === 'number' ? e.color.a : 1) } : null;
      out.push({ type: e.type, offset, radius, spread, color, visible: true });
      continue;
    }
  }
  return out.length ? { effects: out } : undefined;
}

function extractNodeStyle(n) {
  const parts = [
    extractFills(n),
    extractRadii(n),
    extractStrokes(n),
    extractStrokeWeights(n),
    (function extractDash(n){
      try {
        const dp = (n && 'dashPattern' in n) ? n.dashPattern : undefined;
        if (Array.isArray(dp) && dp.length > 0 && dp.every(v => typeof v === 'number' && isFinite(v))) {
          return { dashPattern: dp.slice(0, 16) };
        }
      } catch (_) {}
      return undefined;
    })(n),
    extractEffects(n)
  ].filter(Boolean);
  const nodeOpacity = (n && typeof n.opacity === 'number') ? n.opacity : 1;
  if (nodeOpacity !== 1) parts.push({ opacity: nodeOpacity });
  if (n && n.blendMode && n.blendMode !== 'NORMAL' && n.blendMode !== 'PASS_THROUGH') {
    parts.push({ blendMode: String(n.blendMode).toLowerCase().replace(/_/g, '-') });
  }
  return parts.length ? Object.assign({}, ...parts) : undefined;
}


function collectTextSegments(n) {
  const fields = ['fontSize', 'fontName', 'fontWeight', 'fills', 'letterSpacing', 'lineHeight', 'textDecoration', 'textCase'];
  try {
    const raw = n.getStyledTextSegments(fields);
    return raw.map(seg => {
      const out = { start: seg.start, end: seg.end };
      if (typeof seg.fontSize === 'number') out.fontSize = seg.fontSize;
      if (seg.fontName && typeof seg.fontName.family === 'string') out.fontName = { family: seg.fontName.family, style: seg.fontName.style || 'Regular' };
      if (typeof seg.fontWeight === 'number') out.fontWeight = seg.fontWeight;
      if (Array.isArray(seg.fills) && seg.fills.length > 0) {
        const solid = seg.fills.find(f => f && f.visible !== false && f.type === 'SOLID' && f.color);
        if (solid && solid.color) {
          const a = (typeof solid.opacity === 'number' ? solid.opacity : 1);
          out.fills = [{ type: 'SOLID', color: { r: solid.color.r, g: solid.color.g, b: solid.color.b }, opacity: a }];
        }
      }
      if (seg.letterSpacing && typeof seg.letterSpacing.value === 'number') out.letterSpacing = { unit: seg.letterSpacing.unit || 'PERCENT', value: seg.letterSpacing.value };
      if (seg.lineHeight) {
        const lh = { unit: seg.lineHeight.unit || 'AUTO' };
        if (typeof seg.lineHeight.value === 'number') lh.value = seg.lineHeight.value;
        out.lineHeight = lh;
      }
      if (seg.textDecoration && seg.textDecoration !== 'NONE') out.textDecoration = seg.textDecoration;
      if (seg.textCase && seg.textCase !== 'ORIGINAL') out.textCase = seg.textCase;
      return out;
    });
  } catch (e) {
    return [];
  }
}

function collectTextData(n) {
  if (n.type !== 'TEXT') return null;
  const chars = typeof n.characters === 'string' ? n.characters : '';
  if (!chars) return null;
  const segments = collectTextSegments(n);
  return {
    characters: chars,
    textAutoResize: n.textAutoResize || 'NONE',
    textAlignHorizontal: n.textAlignHorizontal || 'LEFT',
    textAlignVertical: n.textAlignVertical || 'TOP',
    paragraphIndent: typeof n.paragraphIndent === 'number' ? n.paragraphIndent : 0,
    paragraphSpacing: typeof n.paragraphSpacing === 'number' ? n.paragraphSpacing : 0,
    segments
  };
}

function computeTopLevelRenderBounds(n, rootOffsetX, rootOffsetY) {
  const rb = n && n.absoluteRenderBounds;
  if (
    rb && typeof rb.x === 'number' && typeof rb.y === 'number' &&
    typeof rb.width === 'number' && typeof rb.height === 'number'
  ) {
    return { x: rb.x - rootOffsetX, y: rb.y - rootOffsetY, width: rb.width, height: rb.height };
  }

  const M = Array.isArray(n && n.absoluteTransform) ? n.absoluteTransform : null;
  const w = (n && typeof n.width === 'number') ? n.width : 0;
  const h = (n && typeof n.height === 'number') ? n.height : 0;
  if (M && w > 0 && h > 0) {
    const a = M[0][0], b = M[0][1], tx = M[0][2];
    const c = M[1][0], d = M[1][1], ty = M[1][2];
    const p = (x, y) => ({ x: a * x + b * y + tx, y: c * x + d * y + ty });
    const p00 = p(0, 0);
    const p10 = p(w, 0);
    const p01 = p(0, h);
    const p11 = p(w, h);
    const minX = Math.min(p00.x, p10.x, p01.x, p11.x);
    const minY = Math.min(p00.y, p10.y, p01.y, p11.y);
    const maxX = Math.max(p00.x, p10.x, p01.x, p11.x);
    const maxY = Math.max(p00.y, p10.y, p01.y, p11.y);
    return { x: minX - rootOffsetX, y: minY - rootOffsetY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
  }

  const hasTx = Array.isArray(M) && Array.isArray(M[0]) && Array.isArray(M[1]) && typeof M[0][2] === 'number' && typeof M[1][2] === 'number';
  if (hasTx) {
    const absX = M[0][2];
    const absY = M[1][2];
    const x = absX - rootOffsetX;
    const y = absY - rootOffsetY;
    const width = typeof n.width === 'number' ? n.width : 0;
    const height = typeof n.height === 'number' ? n.height : 0;
    return { x, y, width, height };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

async function collectNode(n, opts) {
  if (!n) return null;
  const {
    isTopLevel = false,
    parentIsAutoLayout = false,
    rootOffsetX = 0,
    rootOffsetY = 0,
    groupAncestors = []
  } = (opts || {});

  const visible = n.visible !== false;
  const style = extractNodeStyle(n);

  const entry = {
    id: n.id,
    type: n.type,
    name: typeof n.name === 'string' ? n.name : '',
    visible,
    width: n.width,
    height: n.height,
    absoluteTransform: Array.isArray(n.absoluteTransform) ? n.absoluteTransform : undefined,
    isTopLevel: !!isTopLevel,
  };
  // Subtree compatibility: include absoluteRenderBounds snapshot when present
  if (!isTopLevel && n.absoluteRenderBounds) {
    entry.absoluteRenderBounds = {
      x: n.absoluteRenderBounds.x,
      y: n.absoluteRenderBounds.y,
      width: n.absoluteRenderBounds.width,
      height: n.absoluteRenderBounds.height
    };
  }
  entry.clipsContent = n.clipsContent === true;
  if (n && n.parent && n.parent.type === 'FRAME' && n.constraints && typeof n.constraints === 'object') {
    const h = n.constraints.horizontal;
    const v = n.constraints.vertical;
    if (typeof h === 'string' && typeof v === 'string') {
      entry.constraints = { horizontal: h, vertical: v };
    }
  }
  if ('isMask' in n && n.isMask) {
    entry.isMask = true;
    if ('maskType' in n) entry.maskType = n.maskType;
  }
  if (style) entry.style = style;

  if (n.type === 'TEXT') {
    const textData = collectTextData(n);
    if (textData) entry.text = textData;
  }

  if (!entry.svgContent && VECTOR_TYPES.includes(n.type) && typeof n.exportAsync === 'function') {
    // Decide if this vector should export as SVG. For ELLIPSE with dashed + INSIDE/OUTSIDE
    // we skip SVG so downstream stroke pipeline can render true INSIDE/OUTSIDE.
    let allowSvg = true;
    try {
      const s = style || (entry && entry.style);
      const dash = s && Array.isArray(s.dashPattern) ? s.dashPattern : undefined;
      const align = s && typeof s.strokeAlign === 'string' ? s.strokeAlign : undefined;
      const alignUp = align ? align.toUpperCase() : undefined;
      if (n.type === 'ELLIPSE' && dash && dash.length > 0 && (alignUp === 'INSIDE' || alignUp === 'OUTSIDE')) {
        allowSvg = false;
        console.log(`[SVG] Skip export for ELLIPSE ${n.id}: dashed ${alignUp} stroke handled by CSS pipeline.`);
      }
      // For other vector shapes with dashed and non-center align, we warn once: SVG will center strokes.
      if (allowSvg && n.type !== 'ELLIPSE') {
        if (dash && dash.length > 0 && alignUp && alignUp !== 'CENTER') {
          console.warn(`[SVG] ${n.type} ${n.id}: dashed stroke align=${alignUp} will render centered in SVG.`);
        }
      }
    } catch (_) {}

    if (allowSvg) {
      try {
        const svgString = await n.exportAsync({ format: 'SVG_STRING', svgOutlineText: true, svgSimplifyStroke: true });
        if (svgString && typeof svgString === 'string') {
          entry.svgContent = svgString;
        } else {
          console.warn(`[SVG] Export returned non-string for ${n.type} node ${n.id}:`, typeof svgString);
        }
      } catch (e) {
        console.error(`[SVG] Export failed for ${n.type} node ${n.id}:`, e);
      }
    }
  }

  if (isTopLevel) {
    const absX = n.absoluteTransform[0][2];
    const absY = n.absoluteTransform[1][2];
    entry.x = absX - rootOffsetX;
    entry.y = absY - rootOffsetY;
    entry.renderBounds = computeTopLevelRenderBounds(n, rootOffsetX, rootOffsetY);

    if (Array.isArray(groupAncestors) && groupAncestors.length) {
      const path = groupAncestors.slice().reverse().map(g => (g.name && g.name.trim()) || g.id).join('/');
      entry.meta = {
        groupAncestors: groupAncestors.map(g => ({ id: g.id, name: g.name })),
        groupRootId: groupAncestors[0].id,
        groupPath: path
      };
    }
  } else {
    if (entry.svgContent && n.absoluteRenderBounds && typeof rootOffsetX === 'number' && typeof rootOffsetY === 'number') {
      const rb = n.absoluteRenderBounds;
      entry.renderBounds = { x: rb.x - rootOffsetX, y: rb.y - rootOffsetY, width: rb.width, height: rb.height };
    }
  }

  const containerProps = pickAutoLayoutContainerProps(n);
  if (containerProps) Object.assign(entry, containerProps);
  const childProps = pickAutoLayoutChildProps(n, parentIsAutoLayout);
  if (childProps) Object.assign(entry, childProps);

  const kids = Array.isArray(n.children) ? n.children : [];
  const selfIsAutoLayout = !!(containerProps && containerProps.layoutMode && containerProps.layoutMode !== 'NONE');
  if (kids.length && !entry.svgContent) {
    const childPromises = kids.map(k => collectNode(k, { isTopLevel: false, parentIsAutoLayout: selfIsAutoLayout, rootOffsetX, rootOffsetY }));
    const collected = (await Promise.all(childPromises)).filter(Boolean);
    if (collected.length) entry.children = collected;
  }

  return entry;
}

async function buildCompositionFromSelection() {
  const selection = figma.currentPage.selection || [];
  if (!selection.length) return null;

  const sorted = sortByDocumentOrder(selection);
  let renderables = expandGroupsWithAncestors(sorted);
  if (!renderables.length) return null;

  const boundsInfo = computeBoundsFromRenderables(renderables);

  let offsetX = boundsInfo.offsetX;
  let offsetY = boundsInfo.offsetY;
  let boundsWidth = boundsInfo.width;
  let boundsHeight = boundsInfo.height;

  const single = renderables.length === 1 ? renderables[0] : null;
  if (single && single.node && single.node.type === 'FRAME') {
    const M = single.node.absoluteTransform;
    const a = M && M[0] && typeof M[0][0] === 'number' ? M[0][0] : 1;
    const c = M && M[0] && typeof M[0][1] === 'number' ? M[0][1] : 0;
    const b = M && M[1] && typeof M[1][0] === 'number' ? M[1][0] : 0;
    const d = M && M[1] && typeof M[1][1] === 'number' ? M[1][1] : 1;
    const tx = M && M[0] && typeof M[0][2] === 'number' ? M[0][2] : 0;
    const ty = M && M[1] && typeof M[1][2] === 'number' ? M[1][2] : 0;
    const EPS = 1e-6;
    const isUnrotated = Math.abs(b) < EPS && Math.abs(c) < EPS && Math.abs(a - 1) < EPS && Math.abs(d - 1) < EPS;
    if (isUnrotated) {
      offsetX = tx;
      offsetY = ty;
      boundsWidth = typeof single.node.width === 'number' ? single.node.width : boundsInfo.width;
      boundsHeight = typeof single.node.height === 'number' ? single.node.height : boundsInfo.height;
    }
  }
  const children = await Promise.all(renderables.map(async (entry) => {
    const node = entry.node;
    const groupAncestors = Array.isArray(entry.ancestors) ? entry.ancestors : [];
    return collectNode(node, { isTopLevel: true, parentIsAutoLayout: false, rootOffsetX: offsetX, rootOffsetY: offsetY, groupAncestors });
  }));

  const root = {
    schemaVersion: '1.0',
    kind: 'composition',
    name: `Composition (${children.length} items)`,
    absOrigin: { x: offsetX, y: offsetY },
    bounds: { x: 0, y: 0, width: boundsWidth, height: boundsHeight },
    children
  };

  return root;
}

function collectImageIdsFromComposition(comp) {
  const ids = [];
  const seen = new Set();

  function takeFills(style) {
    if (!style || !Array.isArray(style.fills)) return;
    for (const f of style.fills) {
      if (f && f.type === 'IMAGE' && typeof f.imageId === 'string') {
        if (!seen.has(f.imageId)) {
          seen.add(f.imageId);
          ids.push(f.imageId);
        }
      }
    }
  }
  function walkNode(n) {
    if (!n || n.visible === false) return;
    if (n.style) takeFills(n.style);
    if (Array.isArray(n.children)) n.children.forEach(walkNode);
  }

  const children = (comp && Array.isArray(comp.children)) ? comp.children : [];
  for (const c of children) {
    walkNode(c);
  }
  return ids;
}

async function notifyComposition() {
  const composition = await buildCompositionFromSelection();
  const imageIds = composition ? collectImageIdsFromComposition(composition) : [];
  figma.ui.postMessage({ type: 'send-composition', composition, imageIds });
}

// Initial send
notifyComposition();

figma.on('selectionchange', () => {
  notifyComposition();
});

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  if (msg.type === 'close') {
    figma.closePlugin();
    return;
  }
  if (msg.type === 'export-missing-svgs') {
    try {
      const nodeIds = Array.isArray(msg.nodeIds) ? msg.nodeIds : [];
      console.log(`[export-missing-svgs] Received request for ${nodeIds.length} nodes:`, nodeIds);
      if (nodeIds.length === 0) {
        // @ts-ignore
        figma.ui.postMessage({ type: 'export-missing-svgs:result', items: [] });
        return;
      }
      const items = [];
      function fnv1a(str) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h.toString(36);
      }
      function sanitizeId(raw) { return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '_'); }

      const batchSize = 6;
      for (let i = 0; i < nodeIds.length; i += batchSize) {
        const batch = nodeIds.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (nid) => {
          try {
            const n = await figma.getNodeByIdAsync(nid);
            if (!n) {
              console.warn(`[export-missing-svgs] Node ${nid} not found`);
              return null;
            }
            if (typeof n.exportAsync !== 'function') {
              console.warn(`[export-missing-svgs] Node ${nid} has no exportAsync`);
              return null;
            }
            const text = await n.exportAsync({ format: 'SVG_STRING', svgOutlineText: true, svgSimplifyStroke: true });
            const id = sanitizeId(fnv1a(text));
            console.log(`[export-missing-svgs] Exported node ${nid}: id=${id}, length=${text.length}`);
            return { id, data: text };
          } catch (e) { 
            console.error(`[export-missing-svgs] Failed to export node ${nid}:`, e);
            return null; 
          }
        }));
        results.forEach(r => { if (r && r.id && r.data) items.push(r); });
      }
      console.log(`[export-missing-svgs] Returning ${items.length} items`);
      figma.ui.postMessage({ type: 'export-missing-svgs:result', items });
    } catch (e) {
      console.error('[export-missing-svgs] Top-level error:', e);
      figma.ui.postMessage({ type: 'export-missing-svgs:result', items: [] });
    }
  }
  if (msg.type === 'export-missing-images') {
    try {
      const ids = Array.isArray(msg.ids) ? msg.ids : [];
      if (ids.length === 0) {
        figma.ui.postMessage({ type: 'export-missing-images:result', items: [] });
        return;
      }
      const batchSize = 8;
      const items = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (imageId) => {
          try {
            const img = figma.getImageByHash(imageId);
            if (!img) return null;
            const bytes = await img.getBytesAsync();
            return { id: imageId, data: figma.base64Encode(bytes) };
          } catch (e) { return null; }
        }));
        results.forEach(r => { if (r) items.push(r); });
      }
      figma.ui.postMessage({ type: 'export-missing-images:result', items });
    } catch (e) {
      figma.ui.postMessage({ type: 'export-missing-images:result', items: [] });
    }
  }
  if (msg.type === 'export-figma-render') {
    try {
      const sel = figma.currentPage.selection || [];
      if (sel.length !== 1 || typeof sel[0].exportAsync !== 'function') {
        figma.ui.postMessage({ type: 'export-figma-render:result', base64: '' });
        return;
      }
      const bytes = await sel[0].exportAsync({ format: 'PNG' });
      const b64 = figma.base64Encode(bytes);
      figma.ui.postMessage({ type: 'export-figma-render:result', base64: b64 });
    } catch (e) {
      figma.ui.postMessage({ type: 'export-figma-render:result', base64: '' });
    }
  }
};
