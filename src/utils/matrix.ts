export function matMul(A: number[][], B: number[][]): number[][] {
  const a = A[0][0], c = A[0][1], e = A[0][2];
  const b = A[1][0], d = A[1][1], f = A[1][2];
  const a2 = B[0][0], c2 = B[0][1], e2 = B[0][2];
  const b2 = B[1][0], d2 = B[1][1], f2 = B[1][2];
  return [
    [a * a2 + c * b2, a * c2 + c * d2, a * e2 + c * f2 + e],
    [b * a2 + d * b2, b * c2 + d * d2, b * e2 + d * f2 + f],
  ];
}

const SINGULAR_THRESHOLD = 1e-8;

export function matInv(A: number[][]): number[][] | null {
  const a = A[0][0], c = A[0][1], e = A[0][2];
  const b = A[1][0], d = A[1][1], f = A[1][2];
  const det = a * d - b * c;
  if (!isFinite(det) || Math.abs(det) < SINGULAR_THRESHOLD) return null;
  const invDet = 1 / det;
  const ai = d * invDet;
  const ci = -c * invDet;
  const bi = -b * invDet;
  const di = a * invDet;
  const ei = -(ai * e + ci * f);
  const fi = -(bi * e + di * f);
  return [
    [ai, ci, ei],
    [bi, di, fi],
  ];
}

export function angleDegFrom(M: unknown): number | null {
  if (!Array.isArray(M) || !Array.isArray((M as any)[0]) || !Array.isArray((M as any)[1])) return null;
  const r0 = (M as any)[0];
  const r1 = (M as any)[1];
  if (r0.length < 2 || r1.length < 2) return null;
  const a = r0[0];
  const b = r1[0];
  if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) return null;
  return Math.atan2(b, a) * (180 / Math.PI);
}

export function toCssRotation(M: number[][]): string {
  const a = M[0][0];
  const b = M[1][0];
  const theta = Math.atan2(b, a);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return `matrix(${cos},${sin},${-sin},${cos},0,0)`;
}

export function toCssRotationInverse(M: number[][]): string {
  const a = M[0][0];
  const b = M[1][0];
  const theta = Math.atan2(b, a);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return `matrix(${cos},${-sin},${sin},${cos},0,0)`;
}

export function hasRotation(M: number[][], epsRad: number = 5e-5): boolean {
  const a = M[0][0];
  const b = M[1][0];
  if (!isFinite(a) || !isFinite(b)) return false;
  const theta = Math.atan2(b, a);
  return Math.abs(theta) > epsRad;
}

export function hasReflection(M: number[][], eps = 1e-10): boolean {
  const a = M[0][0], c = M[0][1];
  const b = M[1][0], d = M[1][1];
  if (!isFinite(a) || !isFinite(b) || !isFinite(c) || !isFinite(d)) return false;
  const det = a * d - b * c;
  return det < -eps;
}

export function toCssMatrixNoTranslate(M: number[][]): string {
  const a = M[0][0], c = M[0][1];
  const b = M[1][0], d = M[1][1];
  return `matrix(${a},${b},${c},${d},0,0)`;
}

export function toCssMatrix(M: number[][]): string {
  const a = M[0][0], c = M[0][1], e = M[0][2];
  const b = M[1][0], d = M[1][1], f = M[1][2];
  return `matrix(${a},${b},${c},${d},${e},${f})`;
}

export function matApply(M: number[][], x: number, y: number): { x: number; y: number } {
  const a = M[0][0], c = M[0][1], e = M[0][2];
  const b = M[1][0], d = M[1][1], f = M[1][2];
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function isAffine2x3(M: unknown): M is number[][] {
  if (!Array.isArray(M)) return false;
  const r0 = (M as any)[0];
  const r1 = (M as any)[1];
  if (!Array.isArray(r0) || !Array.isArray(r1)) return false;
  if (r0.length < 3 || r1.length < 3) return false;
  const nums = [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2]];
  return nums.every(v => typeof v === 'number' && isFinite(v));
}

// This compensates the pivot so that applying a center-origin rotation yields the same visual mapping
// as the original local transform (with translation at top-left).
export function centerPivotLeftTop(M: number[][], w: number, h: number): { left: number; top: number } {
  const a = M[0][0], c = M[0][1], e = M[0][2];
  const b = M[1][0], d = M[1][1], f = M[1][2];
  const cx = w / 2;
  const cy = h / 2;
  const left = e - cx + (a * cx + c * cy);
  const top = f - cy + (b * cx + d * cy);
  return { left, top };
}

export function cssTransformNoTranslate(M: number[][]): string {
  if (hasReflection(M)) return `transform:${toCssMatrixNoTranslate(M)};`;
  if (hasRotation(M)) return `transform:${toCssRotation(M)};`;
  return '';
}
