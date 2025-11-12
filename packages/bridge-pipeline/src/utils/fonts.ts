export interface FontInfo {
  family: string;
  weights: Set<number>;
  styles: Set<string>;
}

const STANDARD_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export class FontCollector {
  private fonts = new Map<string, FontInfo>();

  add(family: string, weight?: number, style?: string): void {
    if (!this.fonts.has(family)) {
      this.fonts.set(family, {
        family,
        weights: new Set(),
        styles: new Set(),
      });
    }
    const info = this.fonts.get(family)!;
    if (weight) info.weights.add(weight);
    if (style) info.styles.add(style);
  }

  getGoogleFontsUrl(): string | null {
    const specs: string[] = [];
    for (const [, info] of this.fonts) {
      const googleName = info.family.replace(/\s+/g, '+');
      const hasItalic = Array.from(info.styles).some(s => s.toLowerCase().includes('italic'));
      const allWeights = [...new Set([...STANDARD_FONT_WEIGHTS, ...info.weights])].sort((a, b) => a - b);
      const axes = hasItalic ? 'ital,wght' : 'wght';
      const values = allWeights.flatMap(w => hasItalic ? [`0,${w}`, `1,${w}`] : [`${w}`]);
      specs.push(`family=${googleName}:${axes}@${values.join(';')}`);
    }
    return specs.length ? `https://fonts.googleapis.com/css2?${specs.join('&')}&display=swap` : null;
  }

  getAllFonts(): FontInfo[] {
    return Array.from(this.fonts.values());
  }
}

export function buildFontStack(family: string): string {
  const needsQuotes = family.includes(' ') || family.includes('-');
  return needsQuotes ? `'${family}', sans-serif` : `${family}, sans-serif`;
}

export function extractFontsFromComposition(composition: any): FontCollector {
  const collector = new FontCollector();

  function inferWeightFromStyle(style?: string): number {
    if (!style) return 400;
    const s = style.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.includes('thin') || s.includes('hairline')) return 100;
    if (s.includes('extra light') || s.includes('ultra light') || s.includes('extralight') || s.includes('ultralight')) return 200;
    if (s.includes('light') && !s.includes('extralight') && !s.includes('ultralight')) return 300;
    if (s.includes('medium')) return 500;
    if (s.includes('semi bold') || s.includes('semibold') || s.includes('demi bold') || s.includes('demibold')) return 600;
    if (s.includes('extra bold') || s.includes('ultra bold') || s.includes('extrabold') || s.includes('ultrabold')) return 800;
    if (s.includes('black') || s.includes('heavy')) return 900;
    if (s.includes('bold') && !s.includes('semibold') && !s.includes('extrabold') && !s.includes('ultrabold')) return 700;
    return 400;
  }

  function walkNode(node: any): void {
    if (!node) return;
    if (node.text?.segments) {
      for (const seg of node.text.segments) {
        if (seg.fontName?.family) {
          const weight = seg.fontWeight || inferWeightFromStyle(seg.fontName.style);
          collector.add(seg.fontName.family, weight, seg.fontName.style);
        }
      }
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((c: any) => walkNode(c));
    }
  }

  if (Array.isArray(composition?.children)) {
    composition.children.forEach((c: any) => walkNode(c));
  }
  return collector;
}

