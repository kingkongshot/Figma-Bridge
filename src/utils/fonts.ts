import fs from 'fs';
import path from 'path';
import { FontCollector as BaseFontCollector, extractFontsFromComposition as baseExtractFontsFromComposition } from '@bridge/pipeline';

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
  }
}

export function isChineseFontsReady(): boolean {
  return fontMappingState.status === 'loaded';
}

// Extend pipeline FontCollector to add Chinese CDN URLs without duplicating logic
export class FontCollector extends BaseFontCollector {
  // Build a unique list of Chinese font CSS URLs from collected families
  getChineseFontsUrls(): string[] {
    const urls: string[] = [];
    const mapping = getChineseFontsMapping();
    const seenPaths = new Set<string>();
    for (const info of this.getAllFonts()) {
      const relativePath = mapping[info.family];
      if (relativePath && !seenPaths.has(relativePath)) {
        seenPaths.add(relativePath);
        urls.push(...generateCdnUrls(relativePath));
      }
    }
    return urls;
  }
}

// Wrap pipeline extractor so downstream gets the extended collector API
export function extractFontsFromComposition(composition: any): FontCollector {
  const base = baseExtractFontsFromComposition(composition);
  const ext = new FontCollector();
  // Rehydrate extended collector using public getters
  for (const f of base.getAllFonts()) {
    // Add weights
    for (const w of f.weights) ext.add(f.family, w);
    // Add styles
    for (const s of f.styles) ext.add(f.family, undefined, s);
  }
  return ext;
}
