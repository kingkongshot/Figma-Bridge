export function normUpper(v: unknown): string | undefined {
  return typeof v === 'string' ? v.toUpperCase() : undefined;
}

export function mapEnum<T>(
  v: unknown,
  mapping: Record<string, T>,
  fallback?: T
): T | undefined {
  const k = normUpper(v);
  if (k && Object.prototype.hasOwnProperty.call(mapping, k)) return mapping[k];
  return fallback;
}

