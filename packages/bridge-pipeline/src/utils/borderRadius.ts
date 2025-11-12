export interface RadiiData {
  uniform?: number;
  corners?: [number, number, number, number];
}

export function computeBorderRadius(radii: RadiiData | null | undefined): string | null {
  if (!radii) return null;

  if (radii.uniform !== undefined && radii.uniform > 0) {
    return `border-radius:${radii.uniform}px;`;
  }

  if (radii.corners) {
    const [tl, tr, br, bl] = radii.corners;
    if (tl || tr || br || bl) {
      return `border-radius:${tl}px ${tr}px ${br}px ${bl}px;`;
    }
  }

  return null;
}

