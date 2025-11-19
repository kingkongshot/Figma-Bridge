/**
 * BridgeSvg - SVG Component
 *
 * Maps DSL <bridge-svg> to a VECTOR node with svgContent.
 */
export class BridgeSvg extends HTMLElement {
  connectedCallback() {
    this.applyStyles();
    this.ensureSvgScaling();
  }

  applyStyles() {
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');
    const opacityAttr = this.getAttribute('opacity');

    // Absolute positioning
    if (x !== null || y !== null) {
      this.style.position = 'absolute';
      if (x !== null) this.style.left = `${x}px`;
      if (y !== null) this.style.top = `${y}px`;
    } else {
      this.style.position = 'relative';
      this.style.display = 'inline-block';
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
  }

  ensureSvgScaling() {
    const src = this.getAttribute('src');
    if (src && !this.querySelector('svg')) {
      fetch(src)
        .then(response => response.text())
        .then(svgContent => {
          this.innerHTML = svgContent;
          this.styleSvg();
        })
        .catch(err => console.error('BridgeSvg: failed to load src', src, err));
    } else {
      this.styleSvg();
    }
  }

  styleSvg() {
    const svg = this.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
    }
  }

  /**
   * Extract Composition data from this element
   */
  toComposition() {
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');
    const x = this.getAttribute('x');
    const y = this.getAttribute('y');
    const opacityAttr = this.getAttribute('opacity');
    const name = this.getAttribute('name') || 'Vector';

    const svgContent = (this.innerHTML || '').trim();
    const simpleHash = svgContent.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0).toString(16);

    const node = {
      id: this.id || `svg-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: 'VECTOR',
      visible: true,
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      svgContent,
      svgId: simpleHash,
      style: {},
      renderBounds: { x: 0, y: 0, width: 24, height: 24 }
    };

    if (x !== null || y !== null) {
      const numX = Number(x) || 0;
      const numY = Number(y) || 0;
      node.isTopLevel = true;
      node.x = numX;
      node.y = numY;
      node.renderBounds = {
        x: numX,
        y: numY,
        width: Number(width) || 24,
        height: Number(height) || 24
      };
    }

    if (width !== null) {
      node.width = /[a-z%]/i.test(width) ? width : Number(width);
    }
    if (height !== null) {
      node.height = /[a-z%]/i.test(height) ? height : Number(height);
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

if (!customElements.get('bridge-svg')) {
  customElements.define('bridge-svg', BridgeSvg);
}
