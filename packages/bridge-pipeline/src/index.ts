export { figmaToHtml } from './public-api/figmaToHtml';
// Expose IR builder for upstream needs (e.g., inspector/sidebar trees)
export { compositionToIR } from './pipeline/ir';
export { normalizeComposition } from './utils/normalize';
export { normalizeHtml } from './utils/htmlPost';
export { extractFontsFromComposition, FontCollector } from './utils/fonts';
export { dslHtmlToComposition } from './utils/dslToComposition';
export type { FigmaNode, CompositionInput, FigmaVec2, FigmaRect, FigmaStyle, FigmaPaint, FigmaEffect, FigmaText, FigmaTextSegment } from './types/figma';
