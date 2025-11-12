import { mapEnum, normUpper } from './enum';
import type { FigmaNode as FigmaLayoutNode } from '../types/figma';

export type Axis = 'width' | 'height';
export type LayoutAxes = { main: Axis; cross: Axis };

const AXES_MAP: Record<string, LayoutAxes> = {
  HORIZONTAL: { main: 'width', cross: 'height' },
  VERTICAL: { main: 'height', cross: 'width' },
};

const JUSTIFY_MAP: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
};

const ALIGN_ITEMS_MAP: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  BASELINE: 'baseline',
  STRETCH: 'stretch',
};

const ALIGN_SELF_MAP: Record<string, string> = {
  INHERIT: 'auto',
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  STRETCH: 'stretch',
};

export function getLayoutAxes(mode: string | undefined): LayoutAxes {
  return mapEnum(mode, AXES_MAP, { main: 'width', cross: 'height' })!;
}

export function mapJustifyContent(v: string | undefined): string | undefined {
  return mapEnum(v, JUSTIFY_MAP);
}

export function mapAlignItems(v: string | undefined): string | undefined {
  return mapEnum(v, ALIGN_ITEMS_MAP);
}

export function mapAlignSelf(v: string | undefined): string | undefined {
  return mapEnum(v, ALIGN_SELF_MAP);
}

export function appendContainerCss(parts: string[], node: FigmaLayoutNode): void {
  const mode = normUpper(node?.layoutMode);
  const isAL = mode === 'HORIZONTAL' || mode === 'VERTICAL';
  if (isAL) {
    parts.push('display:flex;');
    parts.push(`flex-direction:${mode === 'HORIZONTAL' ? 'row' : 'column'};`);
    const jc = mapJustifyContent(node?.primaryAxisAlignItems);
    const spacing = node?.itemSpacing;
    if (jc !== 'space-between') {
      if (typeof spacing === 'number' && spacing > 0) {
        parts.push(`gap:${spacing}px;`);
      }
    }
    const wrap = normUpper(node?.layoutWrap) || 'NO_WRAP';
    if (wrap === 'WRAP') {
      parts.push('flex-wrap:wrap;');
      const cas = node?.counterAxisSpacing;
      if (typeof cas === 'number' && cas > 0) {
        if (mode === 'HORIZONTAL') parts.push(`row-gap:${cas}px;`);
        else parts.push(`column-gap:${cas}px;`);
      }
    }
    if (jc) parts.push(`justify-content:${jc};`);
    const ai = mapAlignItems(node?.counterAxisAlignItems);
    if (ai) parts.push(`align-items:${ai};`);
  }
  const pt = Number(node?.paddingTop) || 0;
  const pr = Number(node?.paddingRight) || 0;
  const pb = Number(node?.paddingBottom) || 0;
  const pl = Number(node?.paddingLeft) || 0;
  if (pt || pr || pb || pl) parts.push(`padding:${pt}px ${pr}px ${pb}px ${pl}px;`);
  if (node?.strokesIncludedInLayout) parts.push('box-sizing:border-box;');
  if (node?.clipsContent) parts.push('overflow:hidden;');
}

export function getContainerCss(node: FigmaLayoutNode): string {
  const parts: string[] = [];
  appendContainerCss(parts, node);
  return parts.join('');
}

export function computeIsStretch(layoutAlignRaw: string, parentAlignItemsCss?: string): boolean {
  const la = normUpper(layoutAlignRaw) || '';
  return la === 'STRETCH' || (la === 'INHERIT' && parentAlignItemsCss === 'stretch');
}

export function applyDims(
  styles: string[],
  flags: { autoWidth: boolean; autoHeight: boolean },
  w: number,
  h: number
) {
  styles.push(flags.autoWidth ? 'width:auto;' : `width:${w}px;`);
  styles.push(flags.autoHeight ? 'height:auto;' : `height:${h}px;`);
}

export function composeFlexGrowCss(grow: number, parentWrapRaw?: string): string {
  const parts: string[] = [];
  const g = typeof grow === 'number' ? grow : 0;
  if (g > 0) {
    const parentWrap = normUpper(parentWrapRaw) || 'NO_WRAP';
    const basis = parentWrap === 'WRAP' ? 'auto' : '0';
    parts.push(`flex-grow:${g};`);
    parts.push('flex-shrink:1;');
    parts.push(`flex-basis:${basis};`);
    parts.push('min-width:0;');
    parts.push('min-height:0;');
  } else {
    parts.push('flex-shrink:0;');
  }
  return parts.join('');
}

export function computePositionCss(
  parentIsAutoLayout: boolean,
  childPositioning: string,
  left: number,
  top: number,
  opts?: {
    constraints?: { horizontal?: string; vertical?: string } | null;
    parentSize?: { width: number; height: number } | null;
    size?: { width: number; height: number } | null;
  }
): string {
  const needsAbsolute = !parentIsAutoLayout || childPositioning === 'ABSOLUTE';
  if (!needsAbsolute) return 'position:relative;';

  const parts: string[] = ['position:absolute;'];
  const cons = opts?.constraints || null;
  const pSize = opts?.parentSize || null;
  const s = opts?.size || null;

  const hasCons = !!(cons && typeof cons.horizontal === 'string' && typeof cons.vertical === 'string' && pSize && s);
  if (!hasCons) {
    parts.push(`left:${left}px;top:${top}px;`);
    return parts.join('');
  }

  const pw = Math.max(0, Number(pSize!.width) || 0);
  const ph = Math.max(0, Number(pSize!.height) || 0);
  const w = Math.max(0, Number(s!.width) || 0);
  const h = Math.max(0, Number(s!.height) || 0);
  const right = pw - (left + w);
  const bottom = ph - (top + h);

  switch ((cons!.horizontal as string) || 'MIN') {
    case 'MIN':
      parts.push(`left:${left}px;`);
      break;
    case 'MAX':
      parts.push(`right:${right}px;`);
      break;
    case 'CENTER': {
      const ml = left - pw / 2;
      parts.push(`left:50%;margin-left:${ml}px;`);
      break;
    }
    case 'STRETCH':
      parts.push(`left:${left}px;right:${right}px;width:auto;`);
      break;
    case 'SCALE': {
      const lp = pw ? (left / pw) * 100 : 0;
      const wp = pw ? (w / pw) * 100 : 0;
      parts.push(`left:${lp}%;width:${wp}%;`);
      break;
    }
    default:
      parts.push(`left:${left}px;`);
      break;
  }

  switch ((cons!.vertical as string) || 'MIN') {
    case 'MIN':
      parts.push(`top:${top}px;`);
      break;
    case 'MAX':
      parts.push(`bottom:${bottom}px;`);
      break;
    case 'CENTER': {
      const mt = top - ph / 2;
      parts.push(`top:50%;margin-top:${mt}px;`);
      break;
    }
    case 'STRETCH':
      parts.push(`top:${top}px;bottom:${bottom}px;height:auto;`);
      break;
    case 'SCALE': {
      const tp = ph ? (top / ph) * 100 : 0;
      const hp = ph ? (h / ph) * 100 : 0;
      parts.push(`top:${tp}%;height:${hp}%;`);
      break;
    }
    default:
      parts.push(`top:${top}px;`);
      break;
  }

  return parts.join('');
}

export function transformOriginCss(
  parentIsAutoLayout: boolean,
  childPositioning: string,
  nodeType?: string
): string {
  if (nodeType === 'TEXT') {
    return 'transform-origin:top left;';
  }
  const isFlexItem = parentIsAutoLayout && childPositioning !== 'ABSOLUTE';
  return isFlexItem ? 'transform-origin:center;' : 'transform-origin:top left;';
}
