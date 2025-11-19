/**
 * BridgeImage - Image Component
 *
 * Maps DSL <bridge-image> to a RECTANGLE node with IMAGE fill.
 */
export class BridgeImage extends HTMLElement {
  connectedCallback() {
    this.applyStyles();
    this.render();
  }

  applyStyles() {
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');
    const opacityAttr = this.getAttribute('opacity');
    const radius = this.parseRadius(this.getAttribute('radius'));

    // Absolute positioning
    if (x !== null || y !== null) {
      this.style.position = 'absolute';
      if (x !== null) this.style.left = `${x}px`;
      if (y !== null) this.style.top = `${y}px`;
    } else {
      this.style.position = 'relative';
    }

    // Sizing
    if (width) {
      this.style.width = typeof width === 'string' && /[a-z%]/i.test(width) ? width : `${width}px`;
    }
    if (height) {
      this.style.height = typeof height === 'string' && /[a-z%]/i.test(height) ? height : `${height}px`;
    }

    // Opacity
    if (opacityAttr !== null) {
      const op = Number(opacityAttr);
      if (Number.isFinite(op) && op >= 0 && op <= 1) {
        this.style.opacity = String(op);
      }
    }

    // Border Radius
    if (radius) {
      if (typeof radius === 'number') {
        this.style.borderRadius = `${radius}px`;
      } else {
        this.style.borderRadius = `${radius.tl}px ${radius.tr}px ${radius.br}px ${radius.bl}px`;
      }
    }
  }

  render() {
    const src = this.getAttribute('src');
    if (!src) {
      throw new Error('BridgeImage: src attribute is required');
    }
    const mode = this.getAttribute('mode') || 'FILL'; // FILL, FIT, CROP, TILE

    // Clear existing content
    this.innerHTML = '';

    const img = document.createElement('img');
    img.src = src;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';

    // Map scaleMode to object-fit
    switch (mode.toUpperCase()) {
      case 'FIT':
        img.style.objectFit = 'contain';
        break;
      case 'CROP':
        img.style.objectFit = 'cover';
        break;
      case 'TILE':
        img.style.objectFit = 'none';
        break;
      case 'FILL':
      default:
        img.style.objectFit = 'cover';
        break;
    }

    this.appendChild(img);
  }

  parseRadius(value) {
    if (!value) return null;
    const parts = value.split(',').map(v => Number(v.trim()));
    if (parts.length === 1) return parts[0];
    if (parts.length === 4) {
      return { tl: parts[0], tr: parts[1], br: parts[2], bl: parts[3] };
    }
    return null;
  }

  /**
   * Extract Composition data from this element
   */
  toComposition() {
    const src = this.getAttribute('src');
    if (!src) {
      throw new Error('BridgeImage: src attribute is required for toComposition()');
    }
    const mode = this.getAttribute('mode') || 'FILL';
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const opacityAttr = this.getAttribute('opacity');
    const radius = this.parseRadius(this.getAttribute('radius'));
    const name = this.getAttribute('name') || 'Image';

    const node = {
      id: this.id || `image-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: 'RECTANGLE',
      visible: true,
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      style: {
        fills: [{
          type: 'IMAGE',
          scaleMode: mode,
          imageId: src
        }]
      }
    };

    // Absolute positioning & Render Bounds
    if (x !== null || y !== null) {
      const numX = Number(x) || 0;
      const numY = Number(y) || 0;
      node.isTopLevel = true;
      node.x = numX;
      node.y = numY;
      node.renderBounds = {
        x: numX,
        y: numY,
        width: Number(width) || 100,
        height: Number(height) || 100
      };
    } else {
      node.renderBounds = { x: 0, y: 0, width: 100, height: 100 };
    }

    // Dimensions
    if (width !== null) {
      node.width = /[a-z%]/i.test(width) ? width : Number(width);
    }
    if (height !== null) {
      node.height = /[a-z%]/i.test(height) ? height : Number(height);
    }

    // Styling props
    if (radius) {
      if (typeof radius === 'number') {
        node.style.radii = { uniform: radius };
      } else {
        node.style.radii = { corners: [radius.tl, radius.tr, radius.br, radius.bl] };
      }
    }

    if (opacityAttr !== null) {
      const op = Number(opacityAttr);
      if (Number.isFinite(op) && op >= 0 && op <= 1) {
        node.style.opacity = op;
      }
    }

    return node;
  }
}

if (!customElements.get('bridge-image')) {
  customElements.define('bridge-image', BridgeImage);
}
