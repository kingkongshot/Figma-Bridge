/**
 * BridgeText - Text Component
 *
 * Maps TEXT-like properties to CSS text styles for the Bridge DSL.
 */
export class BridgeText extends HTMLElement {
  connectedCallback() {
    this.applyStyles();
  }

  applyStyles() {
    const color = this.getAttribute('color') || '#000000';
    const size = this.getAttribute('size') || '16';
    const weight = this.getAttribute('weight') || '400';
    const family = this.getAttribute('family') || 'Inter, system-ui, sans-serif';

    this.style.color = color;
    this.style.fontSize = `${size}px`;
    this.style.fontWeight = weight;
    this.style.fontFamily = family;
    this.style.margin = '0';
    this.style.whiteSpace = 'pre-wrap';
  }

  /**
   * Extract Composition data from this element
   */
  toComposition() {
    const color = this.getAttribute('color') || '#000000';
    const size = Number(this.getAttribute('size') || '16');
    const weight = Number(this.getAttribute('weight') || '400');
    const family = this.getAttribute('family') || 'Inter';
    const name = this.getAttribute('name') || 'Text';
    const text = this.textContent;

    const node = {
      id: this.id || `text-${Math.random().toString(36).slice(2, 9)}`,
      name,
      type: 'TEXT',
      visible: true,
      absoluteTransform: [[1, 0, 0], [0, 1, 0]],
      // Placeholder bounds for DSL text; actual size from textAutoResize
      renderBounds: { x: 0, y: 0, width: 50, height: 20 },
      text: {
        characters: text,
        textAutoResize: 'WIDTH_AND_HEIGHT'
      }
    };

    const colorObj = this.parseColor(color);

    node.style = {
      fontSize: size,
      fontWeight: weight,
      fontFamily: family,
      fills: [{
        type: 'SOLID',
        color: colorObj
      }]
    };

    return node;
  }

  parseColor(hexOrRgb) {
    if (typeof hexOrRgb === 'string' && hexOrRgb.startsWith('#')) {
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
}

if (!customElements.get('bridge-text')) {
  customElements.define('bridge-text', BridgeText);
}
