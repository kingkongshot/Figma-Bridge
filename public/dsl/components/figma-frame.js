/**
 * FigmaFrame - Auto Layout Frame Component
 *
 * Maps Figma FRAME properties to CSS flexbox
 */
export class FigmaFrame extends HTMLElement {
  connectedCallback() {
    this.applyStyles();
  }

  applyStyles() {
    const layout = this.getAttribute('layout');
    const gap = this.getAttribute('gap') || '0';
    const padding = this.parsePadding(this.getAttribute('padding'));
    const fill = this.getAttribute('fill');
    const radius = this.parseRadius(this.getAttribute('radius'));
    const stroke = this.getAttribute('stroke');
    const strokeWeight = this.getAttribute('stroke-weight');
    const strokeAlign = this.getAttribute('stroke-align');
    const alignMain = this.getAttribute('align-main') || 'MIN';
    const alignCross = this.getAttribute('align-cross') || 'MIN';
    const selfAlign = this.getAttribute('self-align');
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');

    // Absolute positioning
    if (x !== null || y !== null) {
      this.style.position = 'absolute';
      if (x !== null) this.style.left = `${x}px`;
      if (y !== null) this.style.top = `${y}px`;
    }

    // If no layout specified but has children, set as positioning container
    if (!layout) {
      this.style.position = 'relative';
    }

    // Self alignment (override parent's align-items)
    if (selfAlign) {
      this.style.alignSelf = this.mapAlignment(selfAlign);
    }

    // Flex grow (fill container along main axis)
    const grow = this.getAttribute('grow');
    if (grow !== null) {
      const growValue = grow === '' || grow === 'true' ? 1 : Number(grow);
      if (growValue > 0) {
        this.style.flexGrow = String(growValue);
        // Match pipeline semantics: grow items share remaining space, keep shrink behavior default,
        // but avoid intrinsic min-size clipping.
        this.style.flexBasis = '0';
        this.style.minWidth = '0';
        this.style.minHeight = '0';
      }
    }

    // Base flexbox layout (only if layout is specified)
    if (layout) {
      this.style.display = 'flex';
      this.style.flexDirection = layout === 'horizontal' ? 'row' : 'column';
      this.style.gap = `${gap}px`;

      // Alignment
      this.style.justifyContent = this.mapAlignment(alignMain);
      this.style.alignItems = this.mapAlignment(alignCross);
    }

    // Padding
    if (padding) {
      this.style.paddingTop = `${padding.t}px`;
      this.style.paddingRight = `${padding.r}px`;
      this.style.paddingBottom = `${padding.b}px`;
      this.style.paddingLeft = `${padding.l}px`;
    }

    // Fill color
    if (fill) {
      this.style.backgroundColor = fill;
    }

    // Border radius
    if (radius) {
      if (typeof radius === 'number') {
        this.style.borderRadius = `${radius}px`;
      } else {
        this.style.borderRadius = `${radius.tl}px ${radius.tr}px ${radius.br}px ${radius.bl}px`;
      }
    }

    // Stroke (border)
    if (stroke) {
      const weight = strokeWeight || '1';
      const align = strokeAlign || 'INSIDE';

      this.style.borderStyle = 'solid';
      this.style.borderColor = stroke;
      this.style.borderWidth = `${weight}px`;

      // Handle stroke alignment (Figma: INSIDE, OUTSIDE, CENTER)
      if (align === 'OUTSIDE') {
        // Use box-shadow to simulate outside stroke
        this.style.boxShadow = `0 0 0 ${weight}px ${stroke}`;
        this.style.borderWidth = '0';
      } else if (align === 'CENTER') {
        // Default CSS border is center-aligned
        this.style.borderWidth = `${weight}px`;
      } else {
        // INSIDE (default): use padding compensation if needed
        this.style.borderWidth = `${weight}px`;
        this.style.boxSizing = 'border-box';
      }
    }

    // Sizing - support px, %, vw, vh units
    if (width) {
      // Check if width contains unit (%, vw, vh, etc)
      if (typeof width === 'string' && /[a-z%]/.test(width)) {
        this.style.width = width;
      } else {
        this.style.width = `${width}px`;
      }
    }
    // Why: don't set fit-content by default, let flexbox handle stretching

    if (height) {
      // Check if height contains unit (%, vw, vh, etc)
      if (typeof height === 'string' && /[a-z%]/.test(height)) {
        this.style.height = height;
      } else {
        this.style.height = `${height}px`;
      }
    }
    // Why: don't set fit-content by default, let flexbox handle stretching
  }

  parsePadding(value) {
    if (!value) return null;

    const parts = value.split(',').map(v => Number(v.trim()));

    if (parts.length === 1) {
      // Single value: all sides
      return { t: parts[0], r: parts[0], b: parts[0], l: parts[0] };
    } else if (parts.length === 2) {
      // Two values: vertical, horizontal
      return { t: parts[0], r: parts[1], b: parts[0], l: parts[1] };
    } else if (parts.length === 4) {
      // Four values: top, right, bottom, left
      return { t: parts[0], r: parts[1], b: parts[2], l: parts[3] };
    }

    return null;
  }

  parseRadius(value) {
    if (!value) return null;

    const parts = value.split(',').map(v => Number(v.trim()));

    if (parts.length === 1) {
      return parts[0];
    } else if (parts.length === 4) {
      return { tl: parts[0], tr: parts[1], br: parts[2], bl: parts[3] };
    }

    return null;
  }

  mapAlignment(align) {
    switch (align) {
      case 'MIN': return 'flex-start';
      case 'CENTER': return 'center';
      case 'MAX': return 'flex-end';
      case 'SPACE_BETWEEN': return 'space-between';
      case 'STRETCH': return 'stretch';
      case 'BASELINE': return 'baseline';
      default: return 'flex-start';
    }
  }

  /**
   * Extract Figma Composition data from this element
   */
  toComposition() {
    const layout = this.getAttribute('layout');
    const gap = Number(this.getAttribute('gap') || '0');
    const padding = this.parsePadding(this.getAttribute('padding'));
    const fill = this.getAttribute('fill');
    const radius = this.parseRadius(this.getAttribute('radius'));
    const stroke = this.getAttribute('stroke');
    const strokeWeight = this.getAttribute('stroke-weight');
    const strokeAlign = this.getAttribute('stroke-align');
    const alignMain = this.getAttribute('align-main') || 'MIN';
    const alignCross = this.getAttribute('align-cross') || 'MIN';
    const selfAlign = this.getAttribute('self-align');
    const grow = this.getAttribute('grow');
    const sizeMain = this.getAttribute('size-main') || 'AUTO';
    const sizeCross = this.getAttribute('size-cross') || 'AUTO';
    const name = this.getAttribute('name') || 'Frame';
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');

    const node = {
      id: this.id || `frame-${Math.random().toString(36).slice(2, 9)}`,
      name: name,
      type: 'FRAME',
      visible: true,
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      children: []
    };

    // Absolute positioning
    if (x !== null || y !== null) {
      node.isTopLevel = true;
      node.x = Number(x) || 0;
      node.y = Number(y) || 0;
      node.renderBounds = {
        x: Number(x) || 0,
        y: Number(y) || 0,
        width: Number(width) || 100,
        height: Number(height) || 100
      };
    } else {
      // Why: use placeholder bounds for DSL; actual size determined by auto-layout
      node.renderBounds = { x: 0, y: 0, width: 100, height: 100 };
    }

    // Explicit dimensions - preserve CSS units (vw, vh, %, etc)
    if (width !== null) {
      node.width = /[a-z%]/.test(width) ? width : Number(width);
    }
    if (height !== null) {
      node.height = /[a-z%]/.test(height) ? height : Number(height);
    }

    // Auto Layout properties (only if layout is specified)
    if (layout) {
      node.layoutMode = layout.toUpperCase();
      node.itemSpacing = gap;
      node.primaryAxisAlignItems = alignMain;
      node.counterAxisAlignItems = alignCross;
      node.primaryAxisSizingMode = sizeMain;
      node.counterAxisSizingMode = sizeCross;
      node.layoutWrap = 'NO_WRAP';
    }

    // Self alignment (child override parent's alignment)
    if (selfAlign) {
      node.layoutAlign = selfAlign;
    }

    // Flex grow (fill container)
    if (grow !== null) {
      const growValue = grow === '' || grow === 'true' ? 1 : Number(grow);
      if (growValue > 0) {
        node.layoutGrow = growValue;
      }
    }

    // Add padding if specified
    if (padding) {
      node.paddingTop = padding.t;
      node.paddingRight = padding.r;
      node.paddingBottom = padding.b;
      node.paddingLeft = padding.l;
    }

    // Add style if fill, radius, or stroke specified
    if (fill || radius || stroke) {
      node.style = {};

      if (fill) {
        const color = this.parseColor(fill);
        node.style.fills = [{
          type: 'SOLID',
          color: color
        }];
      }

      if (radius) {
        // Convert to RadiiData format that the pipeline expects
        if (typeof radius === 'number') {
          node.style.radii = { uniform: radius };
        } else {
          node.style.radii = { corners: [radius.tl, radius.tr, radius.br, radius.bl] };
        }
      }

      if (stroke) {
        if (!strokeWeight) {
          throw new Error(`FigmaFrame: stroke-weight attribute is required when stroke is set (element id="${this.id || ''}")`);
        }
        const weightNum = Number(strokeWeight);
        if (!Number.isFinite(weightNum)) {
          throw new Error(`FigmaFrame: invalid stroke-weight "${strokeWeight}" (element id="${this.id || ''}")`);
        }
        const color = this.parseColor(stroke);
        node.style.strokes = [{
          type: 'SOLID',
          color: color,
          visible: true
        }];

        node.style.strokeWeights = { t: weightNum, r: weightNum, b: weightNum, l: weightNum };

        if (strokeAlign) {
          node.style.strokeAlign = strokeAlign;
        }
      }
    }

    // Recursively extract children
    for (const child of this.children) {
      if (typeof child.toComposition === 'function') {
        node.children.push(child.toComposition());
      }
    }

    return node;
  }

  parseColor(hexOrRgb) {
    // Simple hex color parser: #RRGGBB or #RGB
    if (hexOrRgb.startsWith('#')) {
      let hex = hexOrRgb.slice(1);

      // Expand shorthand #RGB to #RRGGBB
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }

      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;

      return { r, g, b, a: 1 };
    }

    // Default to black if parsing fails
    return { r: 0, g: 0, b: 0, a: 1 };
  }
}

customElements.define('figma-frame', FigmaFrame);
