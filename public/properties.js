function esc(value) {
  const s = String(value == null ? '' : value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label, value) {
  return `<div class="prop-row"><span class="prop-label">${esc(label)}</span><span class="prop-value">${esc(value)}</span></div>`;
}

function rowHTML(label, valueHtml) {
  return `<div class="prop-row"><span class="prop-label">${esc(label)}</span><span class="prop-value">${valueHtml}</span></div>`;
}

function group(title, rowsHtml) {
  return `<div class="prop-group"><div class="prop-group-title">${esc(title)}</div>${rowsHtml}</div>`;
}

const ENABLE_EDITING_UI = false;
function edit(html) { return ENABLE_EDITING_UI ? html : ''; }

function formatColor(color) {
  if (!color) return 'none';
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a !== undefined ? color.a : 1;
  const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  const rgba = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  return { hex, rgba, r, g, b, a };
}

function parseCornerRadiusFromCss(css) {
  if (!css || typeof css !== 'string') return null;
  const m = css.match(/border-radius\s*:\s*([^;]+);/i);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s*\/\s*/g, ' ').replace(/px/g, '').trim();
  return cleaned || null;
}

export function findNodeByIdInIR(id, ir) {
  if (!ir || !id) return null;

  function searchIRNodes(nodes) {
    if (!Array.isArray(nodes)) return null;
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.content?.type === 'children' && Array.isArray(node.content.nodes)) {
        const found = searchIRNodes(node.content.nodes);
        if (found) return found;
      }
    }
    return null;
  }

  return searchIRNodes(ir.nodes);
}

export function findNodeById(id, composition) {
  if (!composition || !id) return null;

  function searchSubtree(node) {
    if (!node) return null;
    if (node.id === id) return node;

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = searchSubtree(child);
        if (found) return found;
      }
    }

    return null;
  }

  if (Array.isArray(composition.children)) {
    for (const child of composition.children) {
      const found = searchSubtree(child);
      if (found) return found;
    }
  }

  return null;
}

function getElementDims(node) {
  if (node && node.layout) {
    return {
      w: node.layout.width,
      h: node.layout.height,
      x: node.layout.left,
      y: node.layout.top
    };
  }
  return {
    w: node.width,
    h: node.height,
    x: node.x,
    y: node.y
  };
}

function getRenderBounds(node) {
  if (node && node.renderBounds) {
    const { width, height, x, y } = node.renderBounds;
    return { w: width, h: height, x, y };
  }
  if (node && node.render) {
    const { width, height, x, y } = node.render;
    return { w: width, h: height, x, y };
  }
  return null;
}

const isNonNoneLayout = (m) => !!m && m !== 'NONE';

function getAutoLayout(node) {
  const src = node;
  const layout = isNonNoneLayout(src.layoutMode) ? {
    layoutMode: src.layoutMode,
    itemSpacing: src.itemSpacing,
    paddingTop: src.paddingTop,
    paddingRight: src.paddingRight,
    paddingBottom: src.paddingBottom,
    paddingLeft: src.paddingLeft,
    primaryAxisSizingMode: src.primaryAxisSizingMode,
    counterAxisSizingMode: src.counterAxisSizingMode,
    primaryAxisAlignItems: src.primaryAxisAlignItems,
    counterAxisAlignItems: src.counterAxisAlignItems,
    layoutWrap: src.layoutWrap,
    counterAxisAlignContent: src.counterAxisAlignContent,
    counterAxisSpacing: src.counterAxisSpacing,
  } : null;
  const child = (src.layoutAlign || src.layoutGrow !== undefined || src.layoutPositioning) ? {
    layoutAlign: src.layoutAlign,
    layoutGrow: src.layoutGrow,
    layoutPositioning: src.layoutPositioning,
  } : null;
  return { layout, child };
}

function extractPositionSection(node) {
  const dims = getElementDims(node);
  let rotationDeg = 0;
  try {
    const M = Array.isArray(node?.absoluteTransform) ? node.absoluteTransform : null;
    if (M && Array.isArray(M[0]) && Array.isArray(M[1])) {
      const a = Number(M[0][0]);
      const b = Number(M[1][0]);
      if (isFinite(a) && isFinite(b)) rotationDeg = (Math.atan2(b, a) * 180 / Math.PI);
    } else if (node && node.layout && node.layout.transform2x2) {
      const a = Number(node.layout.transform2x2.a);
      const b = Number(node.layout.transform2x2.b);
      if (isFinite(a) && isFinite(b)) rotationDeg = (Math.atan2(b, a) * 180 / Math.PI);
    }
  } catch {}
  const isRelative = !!(node && node.layout && node.layout.position === 'relative');
  return {
    title: 'Position',
    type: 'position',
    data: {
      x: isRelative ? '—' : Number(dims.x).toFixed(0),
      y: isRelative ? '—' : Number(dims.y).toFixed(0),
      rotation: Number(rotationDeg).toFixed(0)
    }
  };
}

function extractLayoutSection(node) {
  const dims = getElementDims(node);
  const layout = node && node.layout ? node.layout : {};
  const isFlex = String(layout.display || '').toLowerCase() === 'flex';
  const flexDir = layout.flexDirection || 'row';
  const hasWrap = layout.flexWrap === 'wrap';

  const layoutMode = isFlex ? (hasWrap ? 'WRAP' : (flexDir === 'row' ? 'HORIZONTAL' : 'VERTICAL')) : 'NONE';
  const mainAxis = (flexDir === 'row') ? 'width' : 'height';
  const crossAxis = (flexDir === 'row') ? 'height' : 'width';
  const wVal = layout.width;
  const hVal = layout.height;
  const primaryAxisSizingMode = (isFlex && layout[mainAxis] === 'auto') ? 'AUTO' : 'FIXED';
  const counterAxisSizingMode = (isFlex && layout[crossAxis] === 'auto') ? 'AUTO' : 'FIXED';
  function mapJcToFigma(v) {
    if (!v) return 'MIN';
    if (v === 'flex-start') return 'MIN';
    if (v === 'center') return 'CENTER';
    if (v === 'flex-end') return 'MAX';
    if (v === 'space-between') return 'SPACE_BETWEEN';
    return 'MIN';
  }
  function mapAiToFigma(v) {
    if (!v) return 'MIN';
    if (v === 'flex-start') return 'MIN';
    if (v === 'center') return 'CENTER';
    if (v === 'flex-end') return 'MAX';
    if (v === 'stretch') return 'STRETCH';
    if (v === 'baseline') return 'BASELINE';
    return 'MIN';
  }
  const padding = layout.padding || { t: 0, r: 0, b: 0, l: 0 };
  const jc = layout.justifyContent;
  const ai = layout.alignItems;
  const gap = typeof layout.gap === 'number' ? layout.gap : 0;

  return {
    title: 'Layout',
    type: 'layout',
    data: {
      w: typeof dims.w === 'number' ? dims.w.toFixed(0) : '',
      h: typeof dims.h === 'number' ? dims.h.toFixed(0) : '',
      layoutMode,
      hasAutoLayout: isFlex,
      primaryAxisSizingMode,
      counterAxisSizingMode,
      primaryAxisAlignItems: mapJcToFigma(jc),
      counterAxisAlignItems: mapAiToFigma(ai),
      itemSpacing: gap,
      paddingLeft: padding.l || 0,
      paddingRight: padding.r || 0,
      paddingTop: padding.t || 0,
      paddingBottom: padding.b || 0,
      clipContent: String(layout.overflow || 'visible') === 'hidden'
    }
  };
}

function extractAppearanceSection(node) {
  const opacityRaw = node?.style?.raw?.opacity;
  const opacity = (opacityRaw !== undefined) ? Math.round(opacityRaw * 100) : 100;
  let cornerRadius = '';
  try {
    const fromCss = parseCornerRadiusFromCss(node?.style?.boxCss || '');
    if (fromCss) cornerRadius = fromCss;
  } catch {}
  if (!cornerRadius && node?.style?.raw && node.style.raw.radii) {
    const r = node.style.raw.radii;
    if (typeof r.uniform === 'number') cornerRadius = String(r.uniform);
    else if (Array.isArray(r.corners)) cornerRadius = r.corners.map(v => (v ?? 0)).join(' ');
  }
  return {
    title: 'Appearance',
    type: 'appearance',
    data: {
      opacity,
      cornerRadius
    }
  };
}

function extractFillSection(node) {
  const fills = [];
  const rawStyle = node?.style?.raw;
  if (rawStyle?.fills && rawStyle.fills.length > 0) {
    fills.push(...rawStyle.fills.map(fill => {
      if (fill.type === 'SOLID' && fill.color) {
        const r = Math.round(fill.color.r * 255);
        const g = Math.round(fill.color.g * 255);
        const b = Math.round(fill.color.b * 255);
        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase();
        const opacity = fill.opacity !== undefined ? Math.round(fill.opacity * 100) : 100;
        return {
          type: 'SOLID',
          hex: hex,
          opacity: opacity,
          visible: fill.visible !== false
        };
      }
      return {
        type: fill.type,
        visible: fill.visible !== false
      };
    }));
  }
  
  return {
    title: 'Fill',
    type: 'fill',
    data: { fills }
  };
}

function extractStrokeSection(node) {
  const strokes = [];
  
  const rawStyle = node?.style?.raw;
  if (rawStyle?.strokes && rawStyle.strokes.length > 0) {
    strokes.push(...rawStyle.strokes.map(stroke => {
      if (stroke.type === 'SOLID' && stroke.color) {
        const r = Math.round(stroke.color.r * 255);
        const g = Math.round(stroke.color.g * 255);
        const b = Math.round(stroke.color.b * 255);
        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase();
        const opacity = stroke.opacity !== undefined ? Math.round(stroke.opacity * 100) : 100;
        return {
          type: 'SOLID',
          hex: hex,
          opacity: opacity,
          visible: stroke.visible !== false
        };
      }
      return {
        type: stroke.type,
        visible: stroke.visible !== false
      };
    }));
  }
  
  const strokeWeight = rawStyle?.strokeWeights?.t ?? 0;
  const strokeAlign = rawStyle?.strokeAlign ?? 'INSIDE';
  
  return {
    title: 'Stroke',
    type: 'stroke',
    data: { 
      strokes,
      strokeWeight,
      strokeAlign
    }
  };
}

function extractEffectsSection(node) {
  const effects = [];
  const rawStyle = node?.style?.raw;
  if (rawStyle?.effects && rawStyle.effects.length > 0) {
    effects.push(...rawStyle.effects.map(effect => ({
      type: effect.type,
      visible: effect.visible !== false
    })));
  }
  return {
    title: 'Effects',
    type: 'effects',
    data: { effects }
  };
}

function extractRenderBoundsSection(node) {
  const rb = getRenderBounds(node);
  if (!rb) return null;
  
  return {
    title: 'Render Bounds',
    rows: [
      { label: 'Width', value: `${rb.w.toFixed(2)}px` },
      { label: 'Height', value: `${rb.h.toFixed(2)}px` },
      { label: 'X', value: `${rb.x.toFixed(2)}px` },
      { label: 'Y', value: `${rb.y.toFixed(2)}px` }
    ]
  };
}

function extractFillsSection(node) {
  const rawStyle = node?.style?.raw;
  if (!rawStyle || !rawStyle.fills || rawStyle.fills.length === 0) return null;
  const rows = rawStyle.fills.map((fill, i) => {
    const label = `Fill ${i + 1}`;
    if (fill.type === 'SOLID' && fill.color) {
      const c = formatColor(fill.color);
      const valueHtml = `${esc(c.hex)}<span class="color-swatch" style="background:${c.rgba}"></span>`;
      return { label, value: valueHtml, html: true };
    }
    return { label, value: String(fill.type) };
  });
  return { title: 'Fills', rows };
}

function extractClipSection(node) {
  return null;
}

function extractAutoLayoutSection(node) {
  const { layout, child } = getAutoLayout(node);
  const sections = [];
  
  if (layout) {
    const rows = [{ label: 'Mode', value: layout.layoutMode }];
    if (layout.itemSpacing !== undefined) rows.push({ label: 'Spacing', value: `${layout.itemSpacing}px` });
    if (layout.paddingLeft !== undefined || layout.paddingTop !== undefined) {
      const pt = layout.paddingTop ?? 0;
      const pr = layout.paddingRight ?? 0;
      const pb = layout.paddingBottom ?? 0;
      const pl = layout.paddingLeft ?? 0;
      rows.push({ label: 'Padding', value: `${pt} ${pr} ${pb} ${pl}` });
    }
    if (layout.primaryAxisSizingMode) rows.push({ label: 'Primary Sizing', value: layout.primaryAxisSizingMode });
    if (layout.counterAxisSizingMode) rows.push({ label: 'Counter Sizing', value: layout.counterAxisSizingMode });
    if (layout.primaryAxisAlignItems) rows.push({ label: 'Primary Align', value: layout.primaryAxisAlignItems });
    if (layout.counterAxisAlignItems) rows.push({ label: 'Counter Align', value: layout.counterAxisAlignItems });
    if (layout.layoutWrap) rows.push({ label: 'Wrap', value: layout.layoutWrap });
    if (layout.counterAxisAlignContent) rows.push({ label: 'Align Content', value: layout.counterAxisAlignContent });
    if (layout.counterAxisSpacing !== undefined && layout.counterAxisSpacing !== null) {
      rows.push({ label: 'Counter Spacing', value: `${layout.counterAxisSpacing}px` });
    }
    sections.push({ title: 'Auto Layout', rows });
  }
  
  if (child) {
    const rows = [];
    if (child.layoutAlign) rows.push({ label: 'Align', value: child.layoutAlign });
    if (child.layoutGrow !== undefined) rows.push({ label: 'Grow', value: String(child.layoutGrow) });
    if (child.layoutPositioning) rows.push({ label: 'Positioning', value: child.layoutPositioning });
    if (rows.length) sections.push({ title: 'Layout Child', rows });
  }
  
  return sections;
}

function extractChildrenSection(node) {
  const kids = (node && node.content && node.content.type === 'children' && Array.isArray(node.content.nodes))
    ? node.content.nodes
    : null;
  if (kids && kids.length > 0) {
    return { title: 'Children', rows: [{ label: 'Count', value: String(kids.length) }] };
  }
  return null;
}

async function checkFontAvailable(fontFamily, fontWeight = 400) {
  if (!fontFamily || !document.fonts) return false;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);
    return document.fonts.check(`${fontWeight} 12px "${fontFamily}"`);
  } catch {
    return false;
  }
}

function extractTextSection(node) {
  if (!node || !node.text) return null;
  
  const text = node.text;
  const rows = [];
  
  if (text.characters) {
    const preview = text.characters.length > 30 
      ? text.characters.slice(0, 30) + '...' 
      : text.characters;
    rows.push({ label: 'Content', value: preview });
  }
  
  if (text.textAutoResize) {
    rows.push({ label: 'Auto Resize', value: text.textAutoResize });
  }
  
  if (text.textAlignHorizontal) {
    rows.push({ label: 'Align H', value: text.textAlignHorizontal });
  }
  if (text.textAlignVertical) {
    rows.push({ label: 'Align V', value: text.textAlignVertical });
  }
  
  if (text.paragraphIndent) {
    rows.push({ label: 'Indent', value: `${text.paragraphIndent}px` });
  }
  if (text.paragraphSpacing) {
    rows.push({ label: 'P Spacing', value: `${text.paragraphSpacing}px` });
  }
  
  return rows.length > 0 ? { title: 'Text', rows } : null;
}

async function extractTextStylesSection(node) {
  if (!node || !node.text || !Array.isArray(node.text.segments)) return null;
  
  const segments = node.text.segments;
  if (segments.length === 0) return null;
  
  const rows = [];
  
  const fonts = new Map();
  for (const seg of segments) {
    if (seg.fontName && seg.fontName.family) {
      const style = seg.fontName.style ?? 'Regular';
      const key = `${seg.fontName.family}|${style}`;
      if (!fonts.has(key)) {
        const weight = seg.fontWeight ?? 400;
        fonts.set(key, {
          family: seg.fontName.family,
          style,
          weight
        });
      }
    }
  }
  
  for (const [key, font] of fonts) {
    const isAvailable = await checkFontAvailable(font.family, font.weight);
    const displayName = `${font.family} ${font.style}`;
    
    if (isAvailable) {
      rows.push({ label: 'Font', value: displayName });
    } else {
      const valueHtml = `<span class="font-missing">${esc(displayName)} (missing)</span>`;
      rows.push({ label: 'Font', value: valueHtml, html: true });
    }
  }
  
  const weights = new Set();
  for (const seg of segments) {
    if (typeof seg.fontWeight === 'number') {
      weights.add(seg.fontWeight);
    }
  }
  if (weights.size > 0) {
    const weightArray = Array.from(weights).sort((a, b) => a - b);
    const mapping = window.__fontWeightMapping ?? {};
    const weightInfo = weightArray.map(w => {
      const mapped = mapping[w];
      if (mapped && mapped !== w) {
        return `<span class="font-weight-warning" title="Requested ${w}, using ${mapped} (closest available)">${w} → ${mapped}</span>`;
      }
      return `${w}`;
    }).join(', ');
    rows.push({ label: 'Weight', value: weightInfo, html: true });
  }
  
  const sizes = new Set();
  for (const seg of segments) {
    if (typeof seg.fontSize === 'number') {
      sizes.add(seg.fontSize);
    }
  }
  if (sizes.size > 0) {
    const sizeStr = Array.from(sizes).sort((a, b) => a - b).map(s => `${s}px`).join(', ');
    rows.push({ label: 'Size', value: sizeStr });
  }
  
  const lineHeights = new Set();
  for (const seg of segments) {
    if (seg.lineHeight) {
      const lh = seg.lineHeight;
      if (lh.unit === 'AUTO') {
        lineHeights.add('Auto');
      } else if (lh.unit === 'PIXELS' && typeof lh.value === 'number') {
        lineHeights.add(`${lh.value}px`);
      } else if (lh.unit === 'PERCENT' && typeof lh.value === 'number') {
        lineHeights.add(`${lh.value}%`);
      }
    }
  }
  if (lineHeights.size > 0) {
    rows.push({ label: 'Line Height', value: Array.from(lineHeights).join(', ') });
  }
  
  const letterSpacings = new Set();
  for (const seg of segments) {
    if (seg.letterSpacing) {
      const ls = seg.letterSpacing;
      if (ls.unit === 'PERCENT') {
        letterSpacings.add(`${ls.value}%`);
      } else if (ls.unit === 'PIXELS') {
        letterSpacings.add(`${ls.value}px`);
      }
    }
  }
  if (letterSpacings.size > 0) {
    rows.push({ label: 'Letter Spacing', value: Array.from(letterSpacings).join(', ') });
  }
  
  const decorations = new Set();
  for (const seg of segments) {
    if (seg.textDecoration && seg.textDecoration !== 'NONE') {
      decorations.add(seg.textDecoration);
    }
  }
  if (decorations.size > 0) {
    rows.push({ label: 'Decoration', value: Array.from(decorations).join(', ') });
  }
  
  const cases = new Set();
  for (const seg of segments) {
    if (seg.textCase && seg.textCase !== 'ORIGINAL') {
      cases.add(seg.textCase);
    }
  }
  if (cases.size > 0) {
    rows.push({ label: 'Case', value: Array.from(cases).join(', ') });
  }
  
  return rows.length > 0 ? { title: 'Typography', rows } : null;
}

async function extractProperties(node) {
  const sections = [
    extractPositionSection(node),
    extractLayoutSection(node),
    extractAppearanceSection(node),
    extractFillSection(node),
    extractStrokeSection(node),
    extractEffectsSection(node),
    extractRenderBoundsSection(node),
    extractFillsSection(node),
    extractClipSection(node),
    ...extractAutoLayoutSection(node),
    extractTextSection(node),
    await extractTextStylesSection(node),
    extractChildrenSection(node)
  ].filter(Boolean);
  return sections;
}

function renderPositionSection(section) {
  const alignmentHtml = edit(`
        <div class="prop-subsection">
          <div class="prop-subsection-label">Alignment</div>
          <div class="alignment-buttons">
            <div class="alignment-group">
              <button class="align-btn" title="Align left"><img src="/icons/align-left.svg" alt=""></button>
              <button class="align-btn" title="Align center horizontal"><img src="/icons/align-center-h.svg" alt=""></button>
              <button class="align-btn" title="Align right"><img src="/icons/align-right.svg" alt=""></button>
            </div>
            <div class="alignment-group">
              <button class="align-btn" title="Align top"><img src="/icons/align-top.svg" alt=""></button>
              <button class="align-btn" title="Align center vertical"><img src="/icons/align-center-v.svg" alt=""></button>
              <button class="align-btn" title="Align bottom"><img src="/icons/align-bottom.svg" alt=""></button>
            </div>
          </div>
        </div>
  `);

  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
      </div>
      <div class="prop-section-content">
        ${alignmentHtml}
        <div class="prop-subsection">
          <div class="prop-subsection-label">Position</div>
          <div class="prop-row-inline">
            <div class="prop-input-group">
              <label>X</label>
              <input type="text" value="${section.data.x}" readonly>
            </div>
            <div class="prop-input-group">
              <label>Y</label>
              <input type="text" value="${section.data.y}" readonly>
            </div>
          </div>
        </div>
        <div class="prop-subsection">
          <div class="prop-subsection-label">Rotation</div>
          <div class="prop-row-inline">
            <div class="prop-input-group rotation-input">
              <img src="/icons/rotate.svg" class="input-icon" alt="">
              <input type="text" value="${section.data.rotation}°" readonly>
            </div>
            ${edit(`
            <button class="prop-icon-btn" title="Rotate 90° right"><img src="/icons/rotate.svg" alt=""></button>
            <button class="prop-icon-btn" title="Flip horizontal"><img src="/icons/flip-h.svg" alt=""></button>
            <button class="prop-icon-btn" title="Flip vertical"><img src="/icons/flip-v.svg" alt=""></button>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAutoLayoutMode(section) {
  const { data } = section;
  const layoutMode = data.layoutMode ?? 'NONE';
  
  return `
    <div class="prop-subsection">
      <div class="prop-subsection-label">Flow</div>
      <div class="flow-buttons">
        <button class="flow-btn ${layoutMode === 'NONE' ? 'active' : ''}" title="None"><img src="/icons/flow-none.svg" alt=""></button>
        <button class="flow-btn ${layoutMode === 'VERTICAL' ? 'active' : ''}" title="Vertical"><img src="/icons/flow-vertical.svg" alt=""></button>
        <button class="flow-btn ${layoutMode === 'HORIZONTAL' ? 'active' : ''}" title="Horizontal"><img src="/icons/flow-horizontal.svg" alt=""></button>
        <button class="flow-btn ${layoutMode === 'WRAP' ? 'active' : ''}" title="Wrap"><img src="/icons/flow-wrap.svg" alt=""></button>
      </div>
    </div>
    <div class="prop-subsection">
      <div class="prop-subsection-label">Resizing</div>
      <div class="prop-row-inline">
        <div class="resizing-col">
          <div class="resizing-label">W</div>
          <div class="resizing-number">${data.w}</div>
          <div class="resizing-mode">${data.primaryAxisSizingMode === 'FIXED' ? 'Fixed' : data.primaryAxisSizingMode === 'AUTO' ? 'Hug' : 'Fill'}</div>
        </div>
        <div class="resizing-col">
          <div class="resizing-label">H</div>
          <div class="resizing-number">${data.h}</div>
          <div class="resizing-mode">${data.counterAxisSizingMode === 'FIXED' ? 'Fixed' : data.counterAxisSizingMode === 'AUTO' ? 'Hug' : 'Fill'}</div>
        </div>
        ${edit(`<button class="prop-icon-btn" title="Constraints"><img src="/icons/frame-corners.svg" alt=""></button>`)}
      </div>
    </div>
  `;
}

function renderAutoLayoutAlignment(section) {
  const { data } = section;
  
  return `
    <div class="prop-subsection">
      <div class="align-gap-header">
        <div class="prop-subsection-label">Alignment</div>
        <div class="prop-subsection-label">Gap</div>
      </div>
      <div class="align-gap-content">
        <div class="alignment-grid">
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'MIN' ? 'active' : ''}" title="Align top left">
            <img src="/icons/${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'MIN' ? 'align-left-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'MIN' ? 'active' : ''}" title="Align top center">
            <img src="/icons/${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'MIN' ? 'align-center-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'MIN' ? 'active' : ''}" title="Align top right">
            <img src="/icons/${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'MIN' ? 'align-right-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'CENTER' ? 'active' : ''}" title="Align middle left">
            <img src="/icons/${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'CENTER' ? 'align-left-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'CENTER' ? 'active' : ''}" title="Align center">
            <img src="/icons/${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'CENTER' ? 'align-center-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'CENTER' ? 'active' : ''}" title="Align middle right">
            <img src="/icons/${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'CENTER' ? 'align-right-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'MAX' ? 'active' : ''}" title="Align bottom left">
            <img src="/icons/${data.primaryAxisAlignItems === 'MIN' && data.counterAxisAlignItems === 'MAX' ? 'align-left-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'MAX' ? 'active' : ''}" title="Align bottom center">
            <img src="/icons/${data.primaryAxisAlignItems === 'CENTER' && data.counterAxisAlignItems === 'MAX' ? 'align-center-bars' : 'dot'}.svg" alt="">
          </button>
          <button disabled class="align-grid-btn ${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'MAX' ? 'active' : ''}" title="Align bottom right">
            <img src="/icons/${data.primaryAxisAlignItems === 'MAX' && data.counterAxisAlignItems === 'MAX' ? 'align-right-bars' : 'dot'}.svg" alt="">
          </button>
        </div>
        <div class="gap-controls">
          <div class="prop-input-group">
            <img src="/icons/arrows-vertical.svg" class="input-icon" alt="">
            <input type="text" value="${data.itemSpacing}" readonly>
          </div>
          ${edit(`<button class="prop-icon-btn" title="Gap dropdown"><img src="/icons/caret-down.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Gap options"><img src="/icons/sliders.svg" alt=""></button>`)}
        </div>
      </div>
    </div>
    <div class="prop-subsection">
      <div class="prop-subsection-label">Padding</div>
      <div class="prop-row-inline">
        <div class="prop-input-group">
          <img src="/icons/padding-horizontal.svg" class="input-icon" alt="">
          <input type="text" value="${data.paddingLeft}" readonly>
        </div>
        <div class="prop-input-group">
          <img src="/icons/padding-vertical.svg" class="input-icon" alt="">
          <input type="text" value="${data.paddingTop}" readonly>
        </div>
        ${edit(`<button class="prop-icon-btn" title="Independent padding"><img src="/icons/frame-corners.svg" alt=""></button>`)}
      </div>
    </div>
    ${edit(`
    <div class="prop-subsection">
      <label class="prop-checkbox">
        <input type="checkbox" ${data.clipContent ? 'checked' : ''} disabled>
        <span>Clip content</span>
      </label>
    </div>
    `)}
  `;
}

function renderLayoutSection(section) {
  const hasAutoLayout = section.data.hasAutoLayout;
  
  if (hasAutoLayout) {
    return `
      <div class="prop-section">
        <div class="prop-section-header">
          <div class="prop-section-title">${section.title}</div>
          ${edit(`<button class="prop-icon-btn" title="Remove auto layout"><img src="/icons/layout-auto.svg" alt=""></button>`)}
        </div>
        <div class="prop-section-content">
          ${renderAutoLayoutMode(section)}
          ${renderAutoLayoutAlignment(section)}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
        <div class="prop-header-icons">
          ${edit(`<button class="prop-icon-btn" title="Auto layout"><img src="/icons/layout-auto.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Layout grid"><img src="/icons/layout-grid.svg" alt=""></button>`)}
        </div>
      </div>
      <div class="prop-section-content">
        <div class="prop-subsection">
          <div class="prop-subsection-label">Dimensions</div>
          <div class="prop-row-inline">
            <div class="prop-input-group">
              <label>W</label>
              <input type="text" value="${section.data.w}" readonly>
            </div>
            <div class="prop-input-group">
              <label>H</label>
              <input type="text" value="${section.data.h}" readonly>
            </div>
            ${edit(`<button class="prop-icon-btn" title="Constraints"><img src="/icons/square.svg" alt=""></button>`)}
          </div>
        </div>
        ${edit(`
        <div class="prop-subsection">
          <label class="prop-checkbox">
            <input type="checkbox" ${section.data.clipContent ? 'checked' : ''} disabled>
            <span>Clip content</span>
          </label>
        </div>
        `)}
      </div>
    </div>
  `;
}

function renderAppearanceSection(section) {
  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
        <div class="prop-header-icons">
          ${edit(`<button class="prop-icon-btn" title="Show/Hide"><img src="/icons/eye.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Blend mode"><img src="/icons/drop.svg" alt=""></button>`)}
        </div>
      </div>
      <div class="prop-section-content">
        <div class="prop-row-inline">
          <div class="prop-col">
            <div class="prop-subsection-label">Opacity</div>
            <div class="prop-input-group">
              <input type="text" value="${section.data.opacity}%" readonly>
            </div>
          </div>
          <div class="prop-col">
            <div class="prop-subsection-label">Corner radius</div>
            <div class="prop-input-group">
              ${edit(`<button class="prop-icon-btn-small" title="Independent corners"><img src="/icons/frame-corners.svg" alt=""></button>`)}
              <input type="text" value="${section.data.cornerRadius}" readonly>
              ${edit(`<button class="prop-icon-btn-small" title="Expand"><img src="/icons/arrows-out.svg" alt=""></button>`)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFillSection(section) {
  const hasFills = section.data.fills.length > 0;
  
  const fillsHtml = hasFills ? section.data.fills.map((fill, index) => {
    if (fill.type === 'SOLID') {
      return `
        <div class="fill-item">
          <div class="fill-row">
            <div class="color-swatch" style="background: #${fill.hex};"></div>
            <input type="text" class="fill-color-input" value="${fill.hex}" readonly>
            <input type="text" class="fill-opacity-input" value="${fill.opacity}" readonly>
            <span class="fill-percent">%</span>
            ${edit(`<button class="prop-icon-btn" title="Show/Hide"><img src="/icons/eye.svg" alt=""></button>`)}
            ${edit(`<button class="prop-icon-btn" title="Remove"><img src="/icons/minus.svg" alt=""></button>`)}
          </div>
        </div>
      `;
    }
    return `
      <div class="fill-item">
        <div class="fill-row">
          <span>${fill.type}</span>
          ${edit(`<button class="prop-icon-btn" title="Remove"><img src="/icons/minus.svg" alt=""></button>`)}
        </div>
      </div>
    `;
  }).join('') : '';
  
  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
        <div class="prop-header-icons">
          ${edit(`<button class="prop-icon-btn" title="Reorder"><img src="/icons/dots-six-vertical.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Add fill"><img src="/icons/plus.svg" alt=""></button>`)}
        </div>
      </div>
      <div class="prop-section-content">
        ${fillsHtml}
      </div>
    </div>
  `;
}

function renderStrokeSection(section) {
  const hasStrokes = section.data.strokes.length > 0;
  
  const strokesHtml = hasStrokes ? section.data.strokes.map((stroke, index) => {
    if (stroke.type === 'SOLID') {
      return `
        <div class="fill-item">
          <div class="fill-row">
            <div class="color-swatch" style="background: #${stroke.hex};"></div>
            <input type="text" class="fill-color-input" value="${stroke.hex}" readonly>
            <input type="text" class="fill-opacity-input" value="${stroke.opacity}" readonly>
            <span class="fill-percent">%</span>
            ${edit(`<button class="prop-icon-btn" title="Show/Hide"><img src="/icons/eye.svg" alt=""></button>`)}
            ${edit(`<button class="prop-icon-btn" title="Remove"><img src="/icons/minus.svg" alt=""></button>`)}
          </div>
        </div>
      `;
    }
    return `
      <div class="fill-item">
        <div class="fill-row">
          <span>${stroke.type}</span>
          ${edit(`<button class="prop-icon-btn" title="Remove"><img src="/icons/minus.svg" alt=""></button>`)}
        </div>
      </div>
    `;
  }).join('') : '';
  
  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
        <div class="prop-header-icons">
          ${edit(`<button class="prop-icon-btn" title="Reorder"><img src="/icons/dots-six-vertical.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Add stroke"><img src="/icons/plus.svg" alt=""></button>`)}
        </div>
      </div>
      <div class="prop-section-content">
        ${strokesHtml}
        ${hasStrokes ? `
          <div class="prop-row-inline">
            <div class="prop-col">
              <div class="prop-subsection-label">Position</div>
              <select class="prop-select" disabled>
                <option ${section.data.strokeAlign === 'INSIDE' ? 'selected' : ''}>Inside</option>
                <option ${section.data.strokeAlign === 'CENTER' ? 'selected' : ''}>Center</option>
                <option ${section.data.strokeAlign === 'OUTSIDE' ? 'selected' : ''}>Outside</option>
              </select>
            </div>
            <div class="prop-col">
              <div class="prop-subsection-label">Weight</div>
              <div class="prop-input-group">
                <input type="text" value="${section.data.strokeWeight}" readonly>
                ${edit(`<button class="prop-icon-btn-small" title="Stroke options"><img src="/icons/sliders.svg" alt=""></button>`)}
                ${edit(`<button class="prop-icon-btn-small" title="Stroke style"><img src="/icons/square.svg" alt=""></button>`)}
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderEffectsSection(section) {
  const hasEffects = section.data.effects.length > 0;
  
  const effectsHtml = hasEffects ? section.data.effects.map((effect, index) => {
    return `
      <div class="fill-item">
        <div class="fill-row">
          <input type="checkbox" class="prop-checkbox-inline" ${effect.visible ? 'checked' : ''} disabled>
          <select class="prop-select" disabled>
            <option selected>${effect.type === 'DROP_SHADOW' ? 'Drop shadow' : effect.type === 'INNER_SHADOW' ? 'Inner shadow' : effect.type === 'LAYER_BLUR' ? 'Layer blur' : effect.type === 'BACKGROUND_BLUR' ? 'Background blur' : effect.type}</option>
          </select>
          ${edit(`<button class="prop-icon-btn" title="Show/Hide"><img src="/icons/eye.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Remove"><img src="/icons/minus.svg" alt=""></button>`)}
        </div>
      </div>
    `;
  }).join('') : '';
  
  return `
    <div class="prop-section">
      <div class="prop-section-header">
        <div class="prop-section-title">${section.title}</div>
        <div class="prop-header-icons">
          ${edit(`<button class="prop-icon-btn" title="Reorder"><img src="/icons/dots-six-vertical.svg" alt=""></button>`)}
          ${edit(`<button class="prop-icon-btn" title="Add effect"><img src="/icons/plus.svg" alt=""></button>`)}
        </div>
      </div>
      <div class="prop-section-content">
        ${effectsHtml}
      </div>
    </div>
  `;
}

// --- Main update function ---

export async function updatePropertiesPanel(id, state, propertiesContent) {
  if (!propertiesContent) return;

  if (!id) {
    propertiesContent.innerHTML = '<div class="empty">Select a layer to view properties</div>';
    return;
  }

  const irNode = findNodeByIdInIR(id, state.ir);
  const node = irNode;
  
  if (!node) {
    propertiesContent.innerHTML = '<div class="empty">Node not found in IR</div>';
    return;
  }

  const sections = await extractProperties(node);
  const html = sections.map(sec => {
    if (sec.type === 'position') return renderPositionSection(sec);
    if (sec.type === 'layout') return renderLayoutSection(sec);
    if (sec.type === 'appearance') return renderAppearanceSection(sec);
    if (sec.type === 'fill') return renderFillSection(sec);
    if (sec.type === 'stroke') return renderStrokeSection(sec);
    if (sec.type === 'effects') return renderEffectsSection(sec);
    if (sec.rows) {
      const rowsHtml = sec.rows.map(r => r.html ? rowHTML(r.label, r.value) : row(r.label, r.value)).join('');
      return group(sec.title, rowsHtml);
    }
    return '';
  }).join('');
  propertiesContent.innerHTML = html;
}
