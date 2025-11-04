/*
 Run visual regression over fixtures.
 Each fixture dir must contain ONLY these names:
   - original.json (either { composition: {...} } or a composition object)
   - figma-render.png (1x PNG export from Figma)
 Optional meta.json: { thresholdPercent?: number, maxSizeDeltaPercent?: number, notes?: string }

 Usage:
  npm run test-fixtures -- [--fixtures fixtures] [--pattern name-substring] [--threshold 2.5] [--size-tolerance-percent 2.5] [--server http://localhost:3000] [--timeout-ms 15000]

 Preconditions:
   - Backend running with BRIDGE_DEBUG=1 (so html-render.png is written)
   - Preview page open at /index.html (so screenshot upload is triggered)
*/

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
// @ts-ignore - pngjs has no types
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

type AnyObj = Record<string, any>;

type CliArgs = {
  fixtures: string;
  pattern: string | null;
  thresholdPercent: number;
  maxSizeDeltaPercent: number;
  server: string;
  timeoutMs: number;
};

type FixtureMeta = {
  thresholdPercent?: number;
  maxSizeDeltaPercent?: number;
  notes?: string;
};

type FixtureCase = {
  name: string;
  dir: string;
  originPath: string;
  figmaPath: string;
  metaPath: string | null;
  meta: FixtureMeta;
};

type DiffStats = {
  width: number;
  height: number;
  totalPixels: number;
  differentPixels: number;
  diffPercent: number;
  cropped: boolean;
  widthDiff?: number;
  heightDiff?: number;
  resized?: boolean;
  alignMode?: 'stretch' | 'crop' | 'none';
};

type CaseResult = {
  case: string;
  passed: boolean;
  thresholdPercent: number;
  stats: DiffStats | null;
  paths: { html: string; figma: string; diff: string; outDir: string };
  error?: string;
};

function parseArgs(argv: string[]): CliArgs {
  let fixtures = 'fixtures';
  let pattern: string | null = null;
  let thresholdPercent = 3.0;
  let maxSizeDeltaPercent = 2.5;
  let server = 'http://localhost:3000';
  let timeoutMs = 15000;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--fixtures' || a === '-f') { fixtures = argv[++i]; continue; }
    if (a === '--pattern' || a === '-p') { pattern = argv[++i]; continue; }
    if (a === '--threshold') { thresholdPercent = Number(argv[++i] || '3.0'); continue; }
    if (a === '--size-tolerance-percent' || a === '--max-size-delta-percent') { maxSizeDeltaPercent = Number(argv[++i] || '2.5'); continue; }
    if (a === '--server' || a === '-s') { server = argv[++i] || server; continue; }
    if (a === '--timeout-ms') { timeoutMs = Number(argv[++i] || '15000'); continue; }
  }

  return { fixtures, pattern, thresholdPercent, maxSizeDeltaPercent, server, timeoutMs };
}

function readJson(filePath: string): AnyObj {
  const full = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  const raw = fs.readFileSync(full, 'utf8');
  return JSON.parse(raw);
}

function resolveComposition(payload: AnyObj): AnyObj | null {
  if (payload && typeof payload === 'object') {
    if (payload.composition && typeof payload.composition === 'object') return payload.composition;
    if (payload.kind === 'composition' && payload.bounds && payload.children) return payload;
  }
  return null;
}

function httpGet(urlStr: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'GET',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpPostJson(urlStr: string, json: AnyObj): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(json));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'content-type': 'application/json',
        'content-length': String(data.length)
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(String(d))));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function listFixtureDirs(root: string): string[] {
  const full = path.isAbsolute(root) ? root : path.join(process.cwd(), root);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .map((name) => path.join(full, name))
    .filter((p) => {
      try { return fs.statSync(p).isDirectory(); } catch { return false; }
    });
}

function loadFixture(dir: string): FixtureCase | null {
  const originPath = path.join(dir, 'original.json');
  const figmaPath = path.join(dir, 'figma-render.png');
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(originPath) || !fs.existsSync(figmaPath)) return null;
  let meta: FixtureMeta = {};
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
  }
  return { name: path.basename(dir), dir, originPath, figmaPath, metaPath: fs.existsSync(metaPath) ? metaPath : null, meta };
}

async function waitForScreenshotSince(sinceMs: number, timeoutMs: number): Promise<string | null> {
  const debugDir = path.join(process.cwd(), 'debug', 'logs');
  const target = path.join(debugDir, 'html-render.png');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const st = fs.statSync(target);
      if (st.mtimeMs >= sinceMs - 5) return target;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function loadPng(filePath: string): PNG {
  const buffer = fs.readFileSync(filePath);
  return PNG.sync.read(buffer);
}

function savePng(png: PNG, filePath: string): void {
  const buffer = PNG.sync.write(png);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
}

function resizeNearest(src: PNG, targetW: number, targetH: number): PNG {
  const dst = new PNG({ width: targetW, height: targetH });
  const sx = src.width / targetW;
  const sy = src.height / targetH;
  for (let y = 0; y < targetH; y++) {
    const syIdx = Math.min(src.height - 1, Math.max(0, Math.floor(y * sy)));
    for (let x = 0; x < targetW; x++) {
      const sxIdx = Math.min(src.width - 1, Math.max(0, Math.floor(x * sx)));
      const si = (syIdx * src.width + sxIdx) * 4;
      const di = (y * targetW + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

function diffPng(img1: PNG, img2: PNG, opts: { maxSizeDeltaPercent: number }): { diff: PNG; stats: DiffStats } {
  let a = img1, b = img2;
  let cropped = false;
  let resized = false;

  if (a.width !== b.width || a.height !== b.height) {
    const wDiff = Math.abs(a.width - b.width);
    const hDiff = Math.abs(a.height - b.height);
    const wPct = a.width > 0 ? (wDiff / a.width) * 100 : 100;
    const hPct = a.height > 0 ? (hDiff / a.height) * 100 : 100;
    if (wPct <= opts.maxSizeDeltaPercent && hPct <= opts.maxSizeDeltaPercent) {
      // Align by resizing HTML preview (b) to match Figma reference (a)
      const targetW = a.width;
      const targetH = a.height;
      if (b.width !== targetW || b.height !== targetH) { b = resizeNearest(b, targetW, targetH); resized = true; }
    } else {
      throw new Error(`images have significantly different dimensions: ${a.width}x${a.height} vs ${b.width}x${b.height} (Δw=${wPct.toFixed(2)}%, Δh=${hPct.toFixed(2)}%)`);
    }
  }

  const { width, height } = a;
  const diff = new PNG({ width, height });
  const differentPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.15 });
  const totalPixels = width * height;
  const diffPercent = (differentPixels / totalPixels) * 100;
  return { diff, stats: { width, height, totalPixels, differentPixels, diffPercent, cropped, resized, alignMode: resized ? 'stretch' : (cropped ? 'crop' : 'none') } };
}

function copyDir(srcDir: string, dstDir: string) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, entry);
    const d = path.join(dstDir, entry);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

async function runCase(f: FixtureCase, args: CliArgs, outRoot: string): Promise<CaseResult> {
  const outDir = path.join(outRoot, f.name);
  ensureDir(outDir);
  const health = await httpGet(args.server.replace(/\/$/, '') + '/health').catch(() => null);
  if (!health || health.status !== 200) {
    return { case: f.name, passed: false, thresholdPercent: args.thresholdPercent, stats: null, paths: { html: path.join(outDir, 'html.png'), figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir }, error: `backend not reachable at ${args.server}` };
  }

  let comp: AnyObj | null = null;
  try { comp = resolveComposition(readJson(f.originPath)); } catch {}
  if (!comp) {
    return { case: f.name, passed: false, thresholdPercent: args.thresholdPercent, stats: null, paths: { html: path.join(outDir, 'html.png'), figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir }, error: 'invalid origin.json (expect composition)' };
  }

  const threshold = (typeof f.meta.thresholdPercent === 'number' ? f.meta.thresholdPercent! : args.thresholdPercent);
  const sizeDeltaPercent = (typeof (f.meta as any).maxSizeDeltaPercent === 'number' ? (f.meta as any).maxSizeDeltaPercent : args.maxSizeDeltaPercent);

  const t0 = Date.now();
  const postRes = await httpPostJson(args.server.replace(/\/$/, '') + '/api/composition', { composition: comp });
  if (postRes.status !== 204) {
    return { case: f.name, passed: false, thresholdPercent: threshold, stats: null, paths: { html: path.join(outDir, 'html.png'), figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir }, error: `server error: ${postRes.status} ${postRes.body}` };
  }

  const shotPath = await waitForScreenshotSince(t0, args.timeoutMs);
  if (!shotPath) {
    return { case: f.name, passed: false, thresholdPercent: threshold, stats: null, paths: { html: path.join(outDir, 'html.png'), figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir }, error: 'screenshot not received (ensure preview page is open and BRIDGE_DEBUG=1)' };
  }

  const htmlOut = path.join(outDir, 'html.png');
  fs.copyFileSync(shotPath, htmlOut);

  const sessionSrc = path.join(process.cwd(), 'debug', 'logs');
  const sessionDst = path.join(outDir, 'session');
  copyDir(sessionSrc, sessionDst);

  let stats: DiffStats | null = null;
  try {
    const htmlPng = loadPng(htmlOut);
    const figmaPng = loadPng(f.figmaPath);
    const { diff, stats: s } = diffPng(figmaPng, htmlPng, { maxSizeDeltaPercent: sizeDeltaPercent });
    const diffOut = path.join(outDir, 'diff.png');
    savePng(diff, diffOut);
    stats = s;
  } catch (e: any) {
    return { case: f.name, passed: false, thresholdPercent: threshold, stats: null, paths: { html: htmlOut, figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir }, error: String(e?.message || e) };
  }

  const passed = stats.diffPercent <= threshold;
  const statsOut = path.join(outDir, 'stats.json');
  fs.writeFileSync(statsOut, JSON.stringify({ case: f.name, thresholdPercent: threshold, ...stats }, null, 2), 'utf8');

  return { case: f.name, passed, thresholdPercent: threshold, stats, paths: { html: htmlOut, figma: f.figmaPath, diff: path.join(outDir, 'diff.png'), outDir } };
}

async function main() {
  const args = parseArgs(process.argv);
  const fixturesRoot = path.isAbsolute(args.fixtures) ? args.fixtures : path.join(process.cwd(), args.fixtures);
  const outRoot = path.join(process.cwd(), 'debug', 'fixtures');
  ensureDir(outRoot);

  const dirs = listFixtureDirs(fixturesRoot).filter((d) => args.pattern ? path.basename(d).includes(args.pattern!) : true);
  if (!dirs.length) {
    console.error(`No fixtures found in ${fixturesRoot}${args.pattern ? ` (pattern: ${args.pattern})` : ''}`);
    process.exit(1);
  }

  const cases: FixtureCase[] = dirs.map(loadFixture).filter(Boolean) as FixtureCase[];
  if (!cases.length) {
    console.error('No valid fixtures (origin.json + figma.png)');
    process.exit(1);
  }

  console.log(`Running ${cases.length} fixture(s)...`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`- ${c.name} ... `);
    const r = await runCase(c, args, outRoot);
    results.push(r);
    if (r.passed) {
      console.log(`OK (${r.stats ? r.stats.diffPercent.toFixed(2) : 'n/a'}%)`);
    } else {
      console.log(`FAIL${r.stats ? ` (${r.stats.diffPercent.toFixed(2)}%)` : ''}${r.error ? ` - ${r.error}` : ''}`);
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const report = { total: results.length, passed, failed, results };
  const reportPath = path.join(outRoot, 'fixtures-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log(`Summary: ${passed}/${results.length} passed, ${failed} failed`);
  console.log(`Report: ${reportPath}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
