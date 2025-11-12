import { collectPaintCss, collectBorderRadiusCss, parseEffects, type ParsedEffects } from './css';
import { collectStrokeStyle } from './stroke';
import { CssCollector } from './cssCollector';
import { tokensFromParsedEffects, mergeInherited, formatTokensToCss } from './effectsTokens';

export type EffectTarget = 'self' | 'content';
export interface NodeStyleShape {
  effectTarget: EffectTarget;
  opacity?: number;
  blendMode?: string;
  fills?: unknown[];
}

function hasVisibleFills(node: any): boolean {
  const fills = Array.isArray(node?.style?.fills) ? node.style.fills : null;
  if (!fills || fills.length === 0) return false;
  return fills.some((f: any) => f && f.visible !== false);
}

export function collectNodeBoxCss(
  node: any,
  cssCollector: CssCollector,
  opts?: { pseudoHostSelector?: string; suppressEffects?: boolean; effectsForStroke?: ParsedEffects; inheritedShadows?: import('./css').ShadowEffect[] }
): string {
  if (!node) return '';
  const isText = node?.type === 'TEXT';
  const isSvg = node?.svgId || node?.svgContent;
  const paintCss = (isSvg ? '' : collectPaintCss(node, isText)) || '';
  const effects = opts?.suppressEffects ? { shadows: [] } as ParsedEffects : parseEffects(node);
  let radiusCss = collectBorderRadiusCss(node) || '';
  // Ensure ellipse stays circular when not using SVG path
  if (!isSvg && node?.type === 'ELLIPSE' && !/border-radius\s*:/i.test(radiusCss)) {
    radiusCss += 'border-radius:50%;overflow:hidden;';
  }
  
  const hasFills = hasVisibleFills(node);
  const stroke = collectStrokeStyle(node, cssCollector, opts?.pseudoHostSelector, opts?.effectsForStroke);
  
  const style: NodeStyleShape | undefined = node && (node.style as NodeStyleShape);
  const opacityVal = style?.opacity;
  const opacityCss = (typeof opacityVal === 'number' && opacityVal !== 1) ? `opacity:${opacityVal};` : '';
  
  const blendMode = style?.blendMode;
  const blendModeCss = (typeof blendMode === 'string' && blendMode !== 'normal' && blendMode !== 'pass-through')
    ? `mix-blend-mode:${blendMode};`
    : '';
  const target: EffectTarget = style?.effectTarget || 'self';
  let tokens = tokensFromParsedEffects(effects, target, isText);
  if (stroke.boxShadow.length > 0) tokens.boxShadows.push(...stroke.boxShadow);
  if (opts?.inheritedShadows && opts.inheritedShadows.length > 0) {
    tokens = mergeInherited(tokens, opts.inheritedShadows, isText);
  }
  const effectsCss = formatTokensToCss(tokens);
  const mergedCss = effectsCss + stroke.css;

  return paintCss + mergedCss + radiusCss + opacityCss + blendModeCss;
}
