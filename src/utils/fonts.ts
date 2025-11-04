import fs from 'fs';
import path from 'path';
import { createLogger } from './logger';

const logger = createLogger();

const STANDARD_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const CHINESE_FONTS_INDEX_URL = 'https://raw.githubusercontent.com/KonghaYao/chinese-free-web-font-storage/branch/index.json';

const CDN_PROVIDERS = [
  'https://chinese-fonts-cdn.deno.dev/',
  'https://ik.imagekit.io/chinesefonts/',
  'https://chinese-font.netlify.app/'
];

const CACHE_FILE = path.join(process.cwd(), 'temp', 'chinese-fonts-mapping.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type FontMappingState =
  | { status: 'not-initialized' }
  | { status: 'loaded'; mapping: Record<string, string> }
  | { status: 'failed'; error: Error };

let fontMappingState: FontMappingState = { status: 'not-initialized' };

function generateCdnUrls(relativePath: string): string[] {
  return CDN_PROVIDERS.map(base => base + relativePath);
}

function ensureTempDir(): void {
  const tempDir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

function loadMappingFromFile(): Record<string, string> | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;

    const stat = fs.statSync(CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;

    const data = fs.readFileSync(CACHE_FILE, 'utf-8');
    const mapping = JSON.parse(data) as Record<string, string>;

    return mapping;
  } catch (err) {
    return null;
  }
}

function saveMappingToFile(mapping: Record<string, string>): void {
  try {
    ensureTempDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(mapping, null, 2), 'utf-8');
  } catch (err) {
    // Silent fail
  }
}

// --- Parsing helpers (pure) ---
interface ChineseFontRemote {
  css?: { family?: string };
  path?: string;
}
interface ChineseFontData {
  remotePath?: ChineseFontRemote[];
}
interface ChineseFontsIndex {
  [key: string]: ChineseFontData;
}

function parseFontData(fontData: ChineseFontData, mapping: Record<string, string>): void {
  const paths = fontData?.remotePath;
  if (!Array.isArray(paths)) return;
  for (const remote of paths) {
    const family = remote?.css?.family;
    const relPath = remote?.path;
    if (family && relPath) {
      mapping[family] = relPath;
    }
  }
}

function parseIndex(index: ChineseFontsIndex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fontData of Object.values(index)) parseFontData(fontData, out);
  return out;
}

async function fetchChineseFontsMapping(): Promise<Record<string, string>> {
  const res = await fetch(CHINESE_FONTS_INDEX_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const index = (await res.json()) as ChineseFontsIndex;
  const mapping = parseIndex(index);
  saveMappingToFile(mapping);
  return mapping;
}

function getChineseFontsMapping(): Record<string, string> {
  if (fontMappingState.status === 'loaded') return fontMappingState.mapping;
  if (fontMappingState.status === 'failed') {
    logger.debug('Chinese fonts mapping not available, using fallback');
    return {};
  }
  throw new Error('BUG: getChineseFontsMapping called before warmup');
}

function shouldRefreshCache(): boolean {
  try {
    if (!fs.existsSync(CACHE_FILE)) return false;
    const stat = fs.statSync(CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    return age > CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function refreshInBackground(): void {
  fetchChineseFontsMapping()
    .then((mapping) => {
      if (mapping && Object.keys(mapping).length) {
        fontMappingState = { status: 'loaded', mapping };
      }
    })
    .catch((err) => {
      // Silent fail
    });
}

export async function warmupChineseFontsMapping(): Promise<void> {
  if (fontMappingState.status === 'loaded') return;

  const cached = loadMappingFromFile();
  if (cached && Object.keys(cached).length > 0) {
    fontMappingState = { status: 'loaded', mapping: cached };
    if (shouldRefreshCache()) refreshInBackground();
    return;
  }

  try {
    const mapping = await fetchChineseFontsMapping();
    fontMappingState = { status: 'loaded', mapping };
  } catch (err) {
    fontMappingState = { status: 'failed', error: err as Error };
    logger.warn('Chinese fonts warmup failed; server will run without online fonts', { error: err });
  }
}

export function isChineseFontsReady(): boolean {
  return fontMappingState.status === 'loaded';
}

export interface FontInfo {
  family: string;
  weights: Set<number>;
  styles: Set<string>;
}


export class FontCollector {
  private fonts = new Map<string, FontInfo>();

  add(family: string, weight?: number, style?: string): void {
    if (!this.fonts.has(family)) {
      this.fonts.set(family, {
        family,
        weights: new Set(),
        styles: new Set(),
      });
    }
    const info = this.fonts.get(family)!;
    if (weight) info.weights.add(weight);
    if (style) info.styles.add(style);
  }

  getGoogleFontsUrl(): string | null {
    const specs: string[] = [];
    
    for (const [family, info] of this.fonts) {
      const googleName = family.replace(/\s+/g, '+');
      const hasItalic = Array.from(info.styles).some(s => s.toLowerCase().includes('italic'));
      
      const allWeights = [...new Set([...STANDARD_FONT_WEIGHTS, ...info.weights])].sort((a, b) => a - b);
      
      const axes = hasItalic ? 'ital,wght' : 'wght';
      const values = allWeights.flatMap(w => 
        hasItalic ? [`0,${w}`, `1,${w}`] : [`${w}`]
      );
      specs.push(`family=${googleName}:${axes}@${values.join(';')}`);
    }

    return specs.length ? `https://fonts.googleapis.com/css2?${specs.join('&')}&display=swap` : null;
  }

  getChineseFontsUrls(): string[] {
    const urls: string[] = [];
    const mapping = getChineseFontsMapping();
    const seenPaths = new Set<string>();

    for (const [family] of this.fonts) {
      const relativePath = mapping[family];
      if (relativePath && !seenPaths.has(relativePath)) {
        seenPaths.add(relativePath);
        const cdnUrls = generateCdnUrls(relativePath);
        urls.push(...cdnUrls);
      }
    }

    return urls;
  }

  getAllFonts(): FontInfo[] {
    return Array.from(this.fonts.values());
  }
}

export function buildFontStack(family: string): string {
  const needsQuotes = family.includes(' ') || family.includes('-');
  return needsQuotes ? `'${family}', sans-serif` : `${family}, sans-serif`;
}

export function extractFontsFromComposition(composition: any): FontCollector {
  const collector = new FontCollector();

  function walkNode(node: any): void {
    if (!node) return;

    if (node.text?.segments) {
      for (const seg of node.text.segments) {
        if (seg.fontName?.family) {
          const weight = seg.fontWeight || inferWeightFromStyle(seg.fontName.style);
          collector.add(seg.fontName.family, weight, seg.fontName.style);
        }
      }
    }

    // subtree deprecated; children are already traversed

    if (Array.isArray(node.children)) {
      node.children.forEach((c: any) => walkNode(c));
    }
  }

  if (Array.isArray(composition?.children)) {
    composition.children.forEach((c: any) => walkNode(c));
  }

  return collector;
}

function inferWeightFromStyle(style?: string): number {
  if (!style) return 400;
  const s = style
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (s.includes('thin') || s.includes('hairline')) return 100;
  if (s.includes('extra light') || s.includes('ultra light') || s.includes('extralight') || s.includes('ultralight')) return 200;
  if (s.includes('light') && !s.includes('extralight') && !s.includes('ultralight')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semi bold') || s.includes('semibold') || s.includes('demi bold') || s.includes('demibold')) return 600;
  if (s.includes('extra bold') || s.includes('ultra bold') || s.includes('extrabold') || s.includes('ultrabold')) return 800;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold') && !s.includes('semibold') && !s.includes('extrabold') && !s.includes('ultrabold')) return 700;
  
  return 400;
}
