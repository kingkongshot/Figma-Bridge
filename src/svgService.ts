import fs from 'fs';
import path from 'path';

export const SVG_DIR = path.join(process.cwd(), 'temp', 'svgs');

export function ensureSvgDir(): void {
  try {
    fs.mkdirSync(SVG_DIR, { recursive: true });
  } catch (e) {
    throw e;
  }
}

export function sanitizeSvgId(raw: string): string | null {
  const m = raw && String(raw).match(/^[a-zA-Z0-9_-]+$/);
  return m ? raw : null;
}

export function getSvgPath(id: string): string | null {
  const safe = sanitizeSvgId(id);
  if (!safe) return null;
  return path.join(SVG_DIR, `${safe}.svg`);
}

export function isSvgAvailable(id: string): boolean {
  const p = getSvgPath(id);
  return !!(p && fs.existsSync(p));
}

export function listMissing(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const missing: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    if (!isSvgAvailable(raw)) missing.push(raw);
  }
  return missing;
}

function fixBackdropFilterOrder(svgText: string): string {
  if (!svgText || typeof svgText !== 'string') return svgText;
  if (!svgText.includes('backdrop-filter') && !svgText.includes('bgblur')) return svgText;

  let result = svgText;
  
  result = result.replace(/(<foreignObject[^>]*>.*?<\/foreignObject>)/s, '');
  
  result = result.replace(/<defs>\s*<clipPath[^>]*id="bgblur[^"]*"[^>]*>.*?<\/clipPath>\s*<\/defs>/s, '');
  
  result = result.replace(/<defs>\s*<\/defs>/s, '');
  
  return result;
}

export function saveSvg(id: string, text: string): void {
  const safe = sanitizeSvgId(id);
  if (!safe) throw new Error('Invalid svg id');
  ensureSvgDir();
  const fixedText = fixBackdropFilterOrder(text);
  const abs = path.join(SVG_DIR, `${safe}.svg`);
  fs.writeFileSync(abs, fixedText, 'utf8');
}

export function processBatch(items: Array<{ id: string; data: string }>): { saved: number; failed: Array<{ id: string; error: string }> } {
  if (!Array.isArray(items)) return { saved: 0, failed: [] };
  let saved = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const it of items) {
    try {
      if (!it || typeof it.id !== 'string' || typeof it.data !== 'string') {
        failed.push({ id: String((it as any)?.id || ''), error: 'Invalid item' });
        continue;
      }
      saveSvg(it.id, it.data);
      saved += 1;
    } catch (e: any) {
      failed.push({ id: String((it as any)?.id || ''), error: String(e?.message || e) });
    }
  }
  return { saved, failed };
}

