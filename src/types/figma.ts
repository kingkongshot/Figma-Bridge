// Minimal Figma-like type shapes used across the pipeline.
// Keep fields optional so upstream can evolve without breaking callers.

export type FigmaVec2 = { x: number; y: number };
export type FigmaRect = { x: number; y: number; width: number; height: number };

export interface FigmaColor { r: number; g: number; b: number; a?: number }

// Effects
export type FigmaEffectType = 'LAYER_BLUR' | 'BACKGROUND_BLUR' | 'DROP_SHADOW' | 'INNER_SHADOW';
export interface FigmaEffect {
  type: FigmaEffectType;
  radius?: number;
  spread?: number;
  offset?: FigmaVec2;
  color?: FigmaColor;
  visible?: boolean;
}

// Paints
export interface FigmaSolidPaint {
  type: 'SOLID';
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
}

export interface FigmaImagePaint {
  type: 'IMAGE';
  imageId?: string;
  scaleMode?: 'FILL' | 'FIT' | 'TILE' | 'STRETCH' | 'CROP';
  imageTransform?: number[][]; // 2x3 affine
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
}

export type FigmaGradientType = 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
export type FigmaGradientStop = { color: FigmaColor; position: number };
export interface FigmaGradientPaint {
  type: FigmaGradientType;
  gradientStops: FigmaGradientStop[];
  gradientHandlePositions?: FigmaVec2[] | null;
  gradientTransform?: number[][] | null;
  opacity?: number;
  visible?: boolean;
  blendMode?: string;
}

export type FigmaPaint = FigmaSolidPaint | FigmaImagePaint | FigmaGradientPaint;

export interface FigmaStyle {
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeights?: { t: number; r: number; b: number; l: number };
  strokeAlign?: string;
  effects?: FigmaEffect[];
  opacity?: number;
  blendMode?: string;
  radii?: { tl?: number; tr?: number; br?: number; bl?: number } | any; // kept loose; normalized downstream
}

// Text
export interface FigmaTextSegment {
  start?: number;
  end?: number;
  fontSize?: number;
  fontName?: { family: string; style?: string };
  fontWeight?: number;
  letterSpacing?: { unit: 'PERCENT' | 'PIXELS'; value: number };
  lineHeight?: { unit: 'PIXELS' | 'PERCENT'; value: number };
  fills?: FigmaPaint[];
  textDecoration?: string;
  textCase?: string;
}

export interface FigmaText {
  characters: string;
  segments?: FigmaTextSegment[];
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' | string;
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM' | string;
  textAutoResize?: 'WIDTH' | 'HEIGHT' | 'WIDTH_AND_HEIGHT' | 'TRUNCATE' | string;
  textTruncation?: 'ENDING' | string;
  paragraphIndent?: number;
}

// Node
export interface FigmaNode {
  id?: string | number;
  name?: string;
  type?: string; // TEXT, FRAME, RECTANGLE, VECTOR, etc.
  visible?: boolean;
  width?: number;
  height?: number;
  absoluteTransform?: number[][]; // [[a,c,e],[b,d,f]]
  renderBounds?: FigmaRect; // upstream-provided content bounds (with stroke/effects)
  absoluteRenderBounds?: FigmaRect | null;
  element?: { width?: number; height?: number };

  // Layout container semantics
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE' | string;
  layoutWrap?: 'WRAP' | 'NO_WRAP' | string;
  itemSpacing?: number;
  itemReverseZIndex?: boolean;
  counterAxisSpacing?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: 'AUTO' | 'FIXED' | string;
  counterAxisSizingMode?: 'AUTO' | 'FIXED' | string;
  paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  strokesIncludedInLayout?: boolean;
  clipsContent?: boolean;

  // Flex item semantics
  layoutPositioning?: 'AUTO' | 'ABSOLUTE' | string;
  layoutGrow?: number;
  layoutAlign?: string; // INHERIT/MIN/CENTER/MAX/STRETCH

  // Styling
  style?: FigmaStyle;

  // Hierarchy
  children?: FigmaNode[];

  // Content kinds
  text?: FigmaText;
  svgId?: string;
  svgContent?: string;
  isMask?: boolean;
}

export interface CompositionInput {
  absOrigin: { x: number; y: number };
  children: FigmaNode[];
}
