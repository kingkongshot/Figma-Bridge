import path from 'path';
import fs from 'fs';

export type ImageItem = { id: string; data: string };

export const UPLOAD_DIR = path.join(process.cwd(), 'temp', 'images');

export function ensureUploadsDir(): void {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    throw e;
  }
}

export function sanitizeId(raw: string): string | null {
  const m = raw && String(raw).match(/^[a-zA-Z0-9_-]+$/);
  return m ? raw : null;
}

export function getImagePath(id: string): string | null {
  const safe = sanitizeId(id);
  if (!safe) return null;
  const filename = `${safe}.png`;
  const abs = path.join(UPLOAD_DIR, filename);
  return fs.existsSync(abs) ? `/images/${filename}` : null;
}

export function isImageAvailable(id: string): boolean {
  const safe = sanitizeId(id);
  if (!safe) return false;
  const filename = `${safe}.png`;
  const abs = path.join(UPLOAD_DIR, filename);
  return fs.existsSync(abs);
}

export function listMissing(ids: string[]): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const missing: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    if (!isImageAvailable(raw)) missing.push(raw);
  }
  return missing;
}

export function saveBase64Png(id: string, base64: string): void {
  const safe = sanitizeId(id);
  if (!safe) throw new Error('Invalid image id');
  const filename = `${safe}.png`;
  const abs = path.join(UPLOAD_DIR, filename);
  ensureUploadsDir();
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(abs, buf);
}

export function processBatch(items: ImageItem[]): { saved: number; failed: Array<{ id: string; error: string }> } {
  if (!Array.isArray(items)) return { saved: 0, failed: [] };
  let saved = 0;
  const failed: Array<{ id: string; error: string }> = [];
  for (const it of items) {
    try {
      if (!it || typeof it.id !== 'string' || typeof it.data !== 'string') {
        failed.push({ id: String((it as any)?.id || ''), error: 'Invalid item' });
        continue;
      }
      saveBase64Png(it.id, it.data);
      saved += 1;
    } catch (e: any) {
      failed.push({ id: String((it as any)?.id || ''), error: String(e?.message || e) });
    }
  }
  return { saved, failed };
}
