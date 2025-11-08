export type Matrix2x3 = number[][];

export type LayoutInfo = {
  display: 'block' | 'flex';
  flexDirection?: 'row' | 'column';
  gap?: number;
  rowGap?: number;
  columnGap?: number;
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'baseline' | 'stretch';
  flexWrap?: 'nowrap' | 'wrap';
  padding?: { t: number; r: number; b: number; l: number };
  boxSizing?: 'content-box' | 'border-box';
  overflow?: 'visible' | 'hidden';

  position: 'absolute' | 'relative';
  left?: number;
  top?: number;

  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | 'auto';
  alignSelf?: 'auto' | 'flex-start' | 'center' | 'flex-end' | 'stretch';

  width: number | 'auto';
  height: number | 'auto';
  transform2x2: { a: number; b: number; c: number; d: number };
  origin: 'top left' | 'center';
  // For rotated/reflected flex items, renderer may allocate an outer reserved box
  // and put the visual transform on an inner box to avoid non-uniform stroke scaling.
  // centerStrategy is optional to keep backward compatibility with existing renders.
  wrapper?: { contentWidth: number; contentHeight: number; centerStrategy?: 'inset' | 'translate' };
};

export type StyleInfo = {
  boxCss: string;
  raw?: {
    fills?: any[];
    strokes?: any[];
    strokeWeights?: { t: number; r: number; b: number; l: number };
    strokeAlign?: string;
    effects?: any[];
    opacity?: number;
    blendMode?: string;
  };
};

export type TextContent = { type: 'text'; html: string };
export type SvgContent = { type: 'svg'; svg: string };
export type ChildrenContent = { type: 'children'; nodes: RenderNodeIR[] };
export type EmptyContent = { type: 'empty' };
export type Content = TextContent | SvgContent | ChildrenContent | EmptyContent;

export type RenderNodeIR = {
  id: string;
  kind: 'frame' | 'shape' | 'text' | 'svg';
  layout: LayoutInfo;
  style: StyleInfo;
  content: Content;
  isMask?: boolean;
  absoluteTransform?: number[][];
  effectsMode?: 'self' | 'inherit';
  name: string;
  type: string;
  visible?: boolean;
  svgContent?: string;
  svgFile?: string;
  text?: any;
};

export type Viewport = { width: number; height: number; offsetX: number; offsetY: number };
export type Bounds = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type DocumentConfig = {
  bodyHtml: string;
  viewport: Viewport;
  bounds: Bounds;
  fonts?: {
    googleFontsUrl?: string | null;
    chineseFontsUrls?: string[];
  };
  styles?: {
    cssRules?: string;
    utilityCss?: string;
  };
  contentLayerStyle?: string;
};

export type RenderBoxOptions = {
  outerOverflowVisible?: boolean;
  innerClassName?: string;
  debugOverrideSize?: boolean;
  omitPosition?: boolean;
  mode?: 'content' | 'debug';
  hasStroke?: boolean;
};
export type RenderBoxConfig = {
  className: string;
  id: string;
  layout: LayoutInfo;
  boxCss: string;
  innerContent: string;
  options?: RenderBoxOptions;
};

export type PreviewBuildInput = {
  composition: any;
  irNodes: RenderNodeIR[];
  cssRules: string;
  renderUnion: Rect;
  googleFontsUrl?: string | null;
  chineseFontsUrls?: string[];
  debugEnabled?: boolean;
};
