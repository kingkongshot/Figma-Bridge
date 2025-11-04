import { parseEffects, type ShadowEffect } from './css';
import type { FigmaNode } from '../types/figma';

export function shouldInheritShadows(node: FigmaNode): boolean {
  const hasFills = Array.isArray(node?.style?.fills)
    && node.style.fills.some((f: any) => f && f.visible !== false);
  const hasStrokes = Array.isArray(node?.style?.strokes)
    && node.style.strokes.some((s: any) => s && s.visible !== false);
  const hasShadow = Array.isArray(node?.style?.effects)
    && node.style.effects.some((e: any) => e && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'));
  return !hasFills && !hasStrokes && hasShadow;
}

export function computeEffectsMode(node: FigmaNode): 'self' | 'inherit' {
  return shouldInheritShadows(node) ? 'inherit' : 'self';
}

export function getInheritedShadows(node: FigmaNode): ShadowEffect[] {
  const eff = parseEffects(node);
  return eff?.shadows || [];
}
