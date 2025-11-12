import type { ParsedEffects, ShadowEffect } from './css';

export type EffectsTokens = {
  boxShadows: string[];
  textShadows: string[];
  filters: string[];
  backdropFilters: string[];
};

export function emptyTokens(): EffectsTokens {
  return { boxShadows: [], textShadows: [], filters: [], backdropFilters: [] };
}

function dropShadowToken(s: ShadowEffect): string {
  return `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`;
}

function insetShadowToken(s: ShadowEffect): string {
  return `inset ${s.x}px ${s.y}px ${s.blur}px ${s.spread || 0}px ${s.color}`;
}

export function tokensFromParsedEffects(effects: ParsedEffects | null | undefined, target: 'self' | 'content', isText?: boolean): EffectsTokens {
  const tok = emptyTokens();
  if (!effects) return tok;

  if (Array.isArray(effects.shadows) && effects.shadows.length > 0) {
    for (const s of effects.shadows) {
      if (!s) continue;
      if (target === 'self') {
        if (s.type === 'INNER_SHADOW') {
          // 文本节点不支持 INNER_SHADOW（Figma 原生行为）
          if (!isText) {
            tok.boxShadows.push(insetShadowToken(s));
          }
        } else {
          // DROP_SHADOW: 文本节点用 text-shadow，其他用 box-shadow
          if (isText) {
            tok.textShadows.push(`${s.x}px ${s.y}px ${s.blur}px ${s.color}`);
          } else {
            tok.boxShadows.push(`${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`);
          }
        }
      } else {
        if (s.type === 'DROP_SHADOW') tok.filters.push(dropShadowToken(s));
        else tok.boxShadows.push(insetShadowToken(s));
      }
    }
  }

  if (effects.layerBlur && effects.layerBlur > 0) {
    tok.filters.push(`blur(${effects.layerBlur / 2}px)`);
  }
  if (effects.backgroundBlur && effects.backgroundBlur > 0) {
    tok.backdropFilters.push(`blur(${effects.backgroundBlur / 2}px)`);
  }
  return tok;
}

export function mergeInherited(tokens: EffectsTokens, inherited?: ShadowEffect[] | null, isText?: boolean): EffectsTokens {
  if (!inherited || inherited.length === 0) return tokens;
  const merged: EffectsTokens = {
    boxShadows: tokens.boxShadows.slice(),
    textShadows: tokens.textShadows.slice(),
    filters: tokens.filters.slice(),
    backdropFilters: tokens.backdropFilters.slice(),
  };
  for (const s of inherited) {
    if (!s) continue;
    if (s.type === 'DROP_SHADOW') {
      merged.filters.push(dropShadowToken(s));
    } else {
      // INNER_SHADOW: 文本节点不继承（Figma 原生行为）
      if (!isText) {
        merged.boxShadows.push(insetShadowToken(s));
      }
    }
  }
  return merged;
}

export function formatTokensToCss(tokens: EffectsTokens): string {
  const parts: string[] = [];
  if (tokens.boxShadows.length > 0) parts.push(`box-shadow:${tokens.boxShadows.join(',')};`);
  if (tokens.textShadows.length > 0) parts.push(`text-shadow:${tokens.textShadows.join(',')};`);
  if (tokens.filters.length > 0) parts.push(`filter:${tokens.filters.join(' ')};`);
  if (tokens.backdropFilters.length > 0) {
    const v = tokens.backdropFilters.join(' ');
    parts.push(`backdrop-filter:${v};-webkit-backdrop-filter:${v};`);
  }
  return parts.join('');
}

