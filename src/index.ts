import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { processBatch as processImageBatch, ensureUploadsDir, listMissing } from './imageService';
import type { ImageItem } from './imageService';
import { figmaToHtml, normalizeComposition, compositionToIR, normalizeHtml } from 'figma-html-bridge';
import { UPLOAD_DIR } from './imageService';
import * as SvgService from './svgService';
import { warmupChineseFontsMapping, extractFontsFromComposition } from './utils/fonts';
import { getCacheStats, clearCache } from './cacheService';

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const contents = fs.readFileSync(envPath, 'utf8');
    contents.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) return;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn('[bridge-env] failed to load .env file', error);
  }
}

loadEnvFile();

const app = express();
const PORT = 7788;

const corsOptions: cors.CorsOptions = {
  origin: true,
  credentials: false,
};
app.use(cors(corsOptions));
app.options('*', cors({ ...corsOptions, preflightContinue: true }), (req, res) => {
  const wantsPrivate = String(req.get('Access-Control-Request-Private-Network') || '').toLowerCase() === 'true';
  if (wantsPrivate) {
    res.set('Access-Control-Allow-Private-Network', 'true');
  }
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  const reqHeaders = req.get('Access-Control-Request-Headers');
  if (reqHeaders) res.set('Access-Control-Allow-Headers', reqHeaders);
  const origin = req.get('Origin');
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  res.sendStatus(204);
});

app.use(express.json({ limit: '25mb' }));


app.use((req, res, next) => {
  const rid = Math.random().toString(36).slice(2, 8);
  (req as any).rid = rid;
  res.setHeader('X-Request-Id', rid);
  next();
});

const DEBUG_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.BRIDGE_DEBUG || '').toLowerCase());
const DEBUG_ROOT = path.join(process.cwd(), 'debug');
const DEBUG_LATEST = path.join(DEBUG_ROOT, 'logs');

type PreviewData = {
  composition: any;
  ir: any;
  html: string;
  debugHtml: string;
  debugCss: string;
  baseWidth: number;
  baseHeight: number;
  // Optional: alternative HTML used for DSL compare views (no extra viewport padding).
  compareHtml?: string;
};
type PreviewState = PreviewData | null;

type SSEClient = { id: number; res: express.Response };
let clientSeq = 1;
const clients: SSEClient[] = [];
ensureUploadsDir();

function sseSend(event: string, data: any) {
  const payload = `event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(({ res }) => res.write(payload));
}

class PreviewManager {
  private state: PreviewState = null;
  getSnapshot(): PreviewState { return this.state; }
  update(preview: PreviewData) {
    this.state = preview;
    sseSend('composition', {
      composition: preview.composition,
      ir: preview.ir,
      html: preview.html,
      debugHtml: preview.debugHtml,
      debugCss: preview.debugCss,
      baseWidth: preview.baseWidth,
      baseHeight: preview.baseHeight,
      compareHtml: preview.compareHtml,
    });
  }
}
const previewManager = new PreviewManager();

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/config', (_req, res) => {
  res.json({
    debugMode: DEBUG_ENABLED
  });
});

function ensureDebugDir() {
  if (!DEBUG_ENABLED) return;
  fs.rmSync(DEBUG_LATEST, { recursive: true, force: true });
  fs.mkdirSync(DEBUG_LATEST, { recursive: true });
}

function writeDebugJson(name: string, data: unknown) {
  if (!DEBUG_ENABLED) return;
  const filePath = path.join(DEBUG_LATEST, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeDebugHtml(name: string, html: string) {
  if (!DEBUG_ENABLED) return;
  const filePath = path.join(DEBUG_LATEST, `${name}.html`);
  fs.writeFileSync(filePath, html, 'utf8');
}

function buildHeadFontLinks(googleFontsUrl?: string | null, chineseFontsUrls?: string[]): string {
  const lines: string[] = [];
  const seenOrigins = new Set<string>();
  const seenHrefs = new Set<string>();
  if (googleFontsUrl) {
    if (!seenOrigins.has('https://fonts.googleapis.com')) {
      lines.push(`    <link rel="preconnect" href="https://fonts.googleapis.com">`);
      seenOrigins.add('https://fonts.googleapis.com');
    }
    if (!seenOrigins.has('https://fonts.gstatic.com')) {
      lines.push(`    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`);
      seenOrigins.add('https://fonts.gstatic.com');
    }
    if (!seenHrefs.has(googleFontsUrl)) {
      lines.push(`    <link href="${googleFontsUrl}" rel="stylesheet">`);
      seenHrefs.add(googleFontsUrl);
    }
  }
  if (Array.isArray(chineseFontsUrls)) {
    for (const href of chineseFontsUrls) {
      try {
        const origin = new URL(href).origin;
        if (!seenOrigins.has(origin)) {
          lines.push(`    <link rel="preconnect" href="${origin}">`);
          seenOrigins.add(origin);
        }
        if (!seenHrefs.has(href)) {
          lines.push(`    <link href="${href}" rel="stylesheet">`);
          seenHrefs.add(href);
        }
      } catch { }
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

function injectHeadLinks(html: string, headLinks: string): string {
  if (!headLinks) return html;
  return html.replace(/<\/head>/i, headLinks + '</head>');
}

function writeDebugBinary(filename: string, data: Buffer) {
  if (!DEBUG_ENABLED) return;
  const filePath = path.join(DEBUG_LATEST, filename);
  fs.writeFileSync(filePath, data);
}

function writeDebugDataUrl(name: string, dataUrl: string) {
  if (!DEBUG_ENABLED) return;
  try {
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return;
    const mime = m[1];
    const base64 = m[2];
    const buf = Buffer.from(base64, 'base64');
    const ext = mime === 'image/jpeg' ? 'jpg' : (mime === 'image/webp' ? 'webp' : 'png');
    writeDebugBinary(`${name}.${ext}`, buf);
  } catch { }
}

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const SVGS_DIR = path.join(process.cwd(), 'temp', 'svgs');
const PREVIEW_ASSETS_DIR = path.join(process.cwd(), 'temp', 'preview');

let globalSettings = {
  useOnlineFonts: true
};

function ensureOutputDir() {
  try {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUTPUT_DIR, 'images'), { recursive: true });
    fs.mkdirSync(path.join(OUTPUT_DIR, 'svgs'), { recursive: true });
  } catch (e) {
    // ignore: non-critical output dir preparation error; API will still respond
  }
}

function ensurePreviewAssetsDir() {
  try {
    fs.mkdirSync(PREVIEW_ASSETS_DIR, { recursive: true });
  } catch (e) {
    // ignore: non-critical preview assets dir preparation error
  }
}

function rewriteUploadsToImages(html: string): string {
  return html.replace(/\/uploads\/([a-zA-Z0-9_-]+)\.png/g, 'images/$1.png');
}

type Bounds = { width: number; height: number };
type Rect = { x: number; y: number; width: number; height: number };

function buildViewportWrapper(
  contentHtml: string,
  bounds: Bounds,
  renderUnion: Rect,
  padding: number,
  headLinks: string
): { html: string; viewportWidth: number; viewportHeight: number } {
  const minX = Math.min(0, renderUnion.x) - padding;
  const minY = Math.min(0, renderUnion.y) - padding;
  const maxX = Math.max(bounds.width, renderUnion.x + renderUnion.width) + padding;
  const maxY = Math.max(bounds.height, renderUnion.y + renderUnion.height) + padding;
  const viewportWidth = Math.ceil(maxX - minX);
  const viewportHeight = Math.ceil(maxY - minY);

  const viewportStyles = `
.viewport {
  position: relative;
  width: ${viewportWidth}px;
  min-height: max(${viewportHeight}px, 100vh);
  background: transparent;
  box-sizing: border-box;
  transform-origin: top left;
}
.view-offset {
  position: absolute;
  left: ${-minX}px;
  top: ${-minY}px;
  width: 100%;
  min-height: 100%;
  background: transparent;
  box-sizing: border-box;
}
.composition {
  position: relative;
  left: 0;
  top: 0;
  width: ${bounds.width}px;
  min-height: max(${bounds.height}px, 100vh);
  background: transparent;
  box-sizing: border-box;
}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bridge Preview</title>
${headLinks}    <base href="/">
    <link rel="stylesheet" href="/preview/styles.css"/>
    <style>${viewportStyles}</style>
  </head>
  <body>
    <div class="viewport">
      <div class="view-offset">
        <div class="composition" data-figma-render="1">
${contentHtml}
        </div>
      </div>
    </div>
  </body>
</html>`;

  return { html, viewportWidth, viewportHeight };
}

function writeOutputPackage(bodyHtml: string, cssText: string, headLinks: string, imageIds: string[], svgFiles: string[], baseWidth: number, baseHeight: number) {
  try {
    ensureOutputDir();
    for (const id of imageIds) {
      if (typeof id !== 'string') continue;
      const src = path.join(UPLOAD_DIR, `${id}.png`);
      if (fs.existsSync(src)) {
        const dst = path.join(OUTPUT_DIR, 'images', `${id}.png`);
        try {
          fs.copyFileSync(src, dst);
        } catch (e) {
          // ignore individual copy failures; continue others
        }
      }
    }
    for (const name of svgFiles || []) {
      const src = path.join(SVGS_DIR, name);
      if (fs.existsSync(src)) {
        const dst = path.join(OUTPUT_DIR, 'svgs', name);
        try {
          fs.copyFileSync(src, dst);
        } catch (e) {
          // ignore individual copy failures; continue others
        }
      }
    }
    const { formatCss, formatHtml } = require('./utils/format');
    const formattedCss = formatCss(cssText);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'styles.css'), formattedCss, 'utf8');

    const viewportStyles = `
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      min-height: 100vh;
      overflow-x: hidden;
      overflow-y: auto;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      background: #f0f0f0;
    }
    .viewport {
      width: ${baseWidth}px;
      min-height: ${baseHeight}px;
      transform-origin: top center;
    }`;

    const viewportScript = `
    window.addEventListener('DOMContentLoaded', function() {
      var baseWidth = ${baseWidth};

      function fit() {
        var viewport = document.querySelector('.viewport');
        if (!viewport) return;

        var scale = window.innerWidth / baseWidth;

        viewport.style.transform = 'scale(' + scale + ')';
      }

      fit();
      window.addEventListener('resize', fit);
    });`;

    const wrappedBody = `<div class=\"viewport\">\n${bodyHtml}\n    </div>`;

    let rawHtmlDoc = `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Exported Content</title>\n${headLinks}    <link rel=\"stylesheet\" href=\"styles.css\"/>\n    <style>${viewportStyles}</style>\n  </head>\n  <body>\n${wrappedBody}\n    <script>${viewportScript}</script>\n  </body>\n</html>`;
    try {
      const post = normalizeHtml(rawHtmlDoc);
      if (post && post.html) rawHtmlDoc = post.html;
    } catch { }
    const htmlDoc = formatHtml(rawHtmlDoc);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), htmlDoc, 'utf8');
    // output package written
  } catch (e) {
    // ignore: output package write failure will be surfaced via API usage
  }
}

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const id = clientSeq++;
  clients.push({ id, res });

  res.write(`event: ready\n`);
  const cur = previewManager.getSnapshot();
  const snap = cur ? {
    latestComposition: cur.composition,
    latestIr: cur.ir,
    latestHtml: cur.html,
    latestDebugHtml: cur.debugHtml,
    latestDebugCss: cur.debugCss,
    latestBaseWidth: cur.baseWidth,
    latestBaseHeight: cur.baseHeight,
    latestCompareHtml: cur.compareHtml,
  } : {};
  res.write(`data: ${JSON.stringify(snap)}\n\n`);

  req.on('close', () => {
    const idx = clients.findIndex(c => c.id === id);
    if (idx >= 0) clients.splice(idx, 1);
  });
});

app.post('/api/images/batch', (req, res) => {
  type ImageBatchBody = { items?: unknown[] } | null;
  const body = req.body as ImageBatchBody;
  const items = (Array.isArray(body?.items) ? (body!.items as unknown[]) : []) as ImageItem[];
  if (!items.length) {
    res.status(400).json({ success: false, error: 'Missing items' });
    return;
  }
  try {
    const result = processImageBatch(items);
    if (result.failed.length && result.saved === 0) {
      res.status(500).json({ success: false, ...result });
    } else {
      res.json({ success: true, ...result });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/api/images/check', (req, res) => {
  type CheckBody = { ids?: unknown[] } | null;
  const body = req.body as CheckBody;
  const rawIds = Array.isArray(body?.ids) ? (body!.ids as unknown[]) : [];
  const ids = rawIds.filter((x): x is string => typeof x === 'string');
  if (!ids.length) {
    res.status(400).json({ success: false, error: 'Missing ids' });
    return;
  }
  try {
    const missing = listMissing(ids);
    res.json({ success: true, missing });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/api/svgs/check', (req, res) => {
  type CheckBody = { ids?: unknown[] } | null;
  const body = req.body as CheckBody;
  const rawIds = Array.isArray(body?.ids) ? (body!.ids as unknown[]) : [];
  const ids = rawIds.filter((x): x is string => typeof x === 'string');
  if (!ids.length) {
    res.status(400).json({ success: false, error: 'Missing ids' });
    return;
  }
  try {
    const missing = SvgService.listMissing(ids);
    res.json({ success: true, missing });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/api/svgs/batch', (req, res) => {
  type SvgBatchBody = { items?: unknown[] } | null;
  const body = req.body as SvgBatchBody;
  const items = (Array.isArray(body?.items) ? (body!.items as unknown[]) : []) as Array<{ id: string; data: string }>;
  if (!items.length) {
    res.status(400).json({ success: false, error: 'Missing items' });
    return;
  }
  try {
    const result = SvgService.processBatch(items);
    if (result.failed.length && result.saved === 0) {
      res.status(500).json({ success: false, ...result });
    } else {
      res.json({ success: true, ...result });
    }
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body || {};
    if (typeof settings.useOnlineFonts === 'boolean') {
      globalSettings.useOnlineFonts = settings.useOnlineFonts;
    }
    res.json({ success: true, settings: globalSettings });
  } catch (e: any) {
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get('/api/cache/stats', (_req, res) => {
  try {
    const stats = getCacheStats();
    res.json(stats);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/cache/clear', (_req, res) => {
  try {
    const result = clearCache();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/languages', (_req, res) => {
  try {
    const localesDir = path.join(process.cwd(), 'locales');
    if (!fs.existsSync(localesDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(localesDir);
    const languages = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = path.join(localesDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const lang = JSON.parse(content);
          if (lang.code && lang.name) {
            languages.push({ code: lang.code, name: lang.name });
          }
        } catch (e) { /* ignore parse error; skip file */ }
      }
    }

    res.json(languages);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/languages/:code', (req, res) => {
  try {
    const code = req.params.code;
    if (!code || !/^[a-z]{2}(-[A-Z]{2})?$/.test(code)) {
      return res.status(400).json({ error: 'Invalid language code' });
    }

    const localesDir = path.join(process.cwd(), 'locales');
    const filePath = path.join(localesDir, `${code}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Language not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lang = JSON.parse(content);
    res.json(lang);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/composition', async (req, res) => {
  const originalPayload = req.body ?? null;
  const composition = originalPayload?.composition ?? null;

  if (!composition) {
    res.status(400).json({ error: 'composition payload missing' });
    return;
  }

  if (DEBUG_ENABLED) {
    try {
      ensureDebugDir();
      const cleanPayload = originalPayload?.composition ?? originalPayload;
      if (cleanPayload !== undefined) writeDebugJson('original', cleanPayload);
      const fr = originalPayload && (originalPayload as any).figmaRender;
      const pp = originalPayload && (originalPayload as any).pluginPreview;
      const snap = (fr && typeof fr === 'object') ? fr : ((pp && typeof pp === 'object') ? pp : null);
      if (snap) {
        if (typeof (snap as any).dataUrl === 'string') {
          writeDebugDataUrl('figma-render', (snap as any).dataUrl);
        } else if (typeof (snap as any).base64 === 'string') {
          const buf = Buffer.from((snap as any).base64, 'base64');
          writeDebugBinary('figma-render.png', buf);
        }
      }
    } catch (e) { /* ignore debug write failures */ }
  }

  let renderRes: { html: string; baseWidth: number; baseHeight: number; renderUnion: any; debugHtml: string; debugCss: string };
  let lastResult: any;
  let irResult: { nodes: any[] } | null = null;
  let compareHtml: string | undefined;
  // Fonts: compute once and reuse for preview + export
  let googleFontsUrl: string | null = null;
  let chineseFontsUrls: string[] = [];
  try {
    normalizeComposition(composition);
    if (DEBUG_ENABLED) {
      try { writeDebugJson('composition', composition); } catch { }
    }

    const fc = extractFontsFromComposition(composition);
    googleFontsUrl = globalSettings.useOnlineFonts ? fc.getGoogleFontsUrl() : null;
    chineseFontsUrls = globalSettings.useOnlineFonts ? fc.getChineseFontsUrls() : [];

    // Build IR for sidebar/properties (keep simple structure used by frontend)
    try {
      const ir = compositionToIR(composition as any);
      irResult = { nodes: ir.nodes };
      if (DEBUG_ENABLED) {
        try { writeDebugJson('ir', { nodes: ir.nodes }); } catch { }
      }
    } catch (e) {
      // IR generation failed; sidebar tree may be empty
    }

    const result = await figmaToHtml({ composition }, {
      assetUrlProvider: (id, type, data) => {
        if (type === 'image') return `images/${id}.png`;
        if (type === 'svg' && data) {
          const encoded = Buffer.from(data).toString('base64');
          return `data:image/svg+xml;base64,${encoded}`;
        }
        return `svgs/${id}`;
      },
      debugEnabled: true,
    });
    lastResult = result;
    try {
      ensurePreviewAssetsDir();
      fs.writeFileSync(path.join(PREVIEW_ASSETS_DIR, 'styles.css'), result.cssText, 'utf8');
    } catch (e) {
      // ignore preview styles write failure
    }
    const headLinks = buildHeadFontLinks(googleFontsUrl, chineseFontsUrls);

    // Host-level viewport/composition wrappers: core pipeline now returns content-only HTML.
    const bounds = composition.bounds;
    const renderUnion = result.renderUnion;

    // Preview viewport (with 4px padding for debug overlay)
    const previewWrapper = buildViewportWrapper(result.html, bounds, renderUnion, 4, headLinks);

    // Compare viewport (no padding for pixel-perfect comparison)
    const compareWrapper = buildViewportWrapper(result.html, bounds, renderUnion, 0, headLinks);
    compareHtml = compareWrapper.html;

    renderRes = {
      html: previewWrapper.html,
      baseWidth: previewWrapper.viewportWidth,
      baseHeight: previewWrapper.viewportHeight,
      renderUnion: result.renderUnion,
      debugHtml: result.debugHtml,
      debugCss: result.debugCss
    };
    if (DEBUG_ENABLED) {
      try {
        if (renderRes.html) writeDebugHtml('render.before', renderRes.html);
        if (renderRes.debugHtml) writeDebugHtml('debug-overlay', renderRes.debugHtml);
      } catch { }
    }
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'failed to render composition' });
    return;
  }

  const post = normalizeHtml(renderRes.html);

  try {
    const headLinks2 = buildHeadFontLinks(googleFontsUrl, chineseFontsUrls);
    const images = Array.isArray((lastResult as any)?.assets?.images) ? (lastResult as any).assets.images : [];
    const svgs = Array.isArray((lastResult as any)?.assets?.svgs) ? (lastResult as any).assets.svgs : [];
    const baseWidth = (lastResult.content as any).baseWidth || renderRes.baseWidth;
    const baseHeight = (lastResult.content as any).baseHeight || renderRes.baseHeight;
    writeOutputPackage(lastResult.content.bodyHtml, lastResult.content.cssText, headLinks2, images, svgs, baseWidth, baseHeight);
  } catch (e) {
    // ignore content build failure
  }
  if (DEBUG_ENABLED) {
    try {
      writeDebugHtml('render.after', post.html);
      // omit runtime logging of post-processing; data remains available in report
    } catch { }
  }

  previewManager.update({
    composition,
    ir: irResult || undefined,
    html: post.html,
    debugHtml: renderRes.debugHtml,
    debugCss: renderRes.debugCss,
    baseWidth: renderRes.baseWidth,
    baseHeight: renderRes.baseHeight,
    compareHtml,
  });
  res.status(204).end();
});

app.post('/api/debug/html-render', (req, res) => {
  if (!DEBUG_ENABLED) {
    res.status(200).json({ success: true, skipped: true });
    return;
  }
  try {
    const body = req.body || {};
    const hr = body && body.htmlRender ? body.htmlRender : null;
    const dataUrl = typeof (hr && hr.dataUrl) === 'string' ? hr.dataUrl : (typeof body.dataUrl === 'string' ? body.dataUrl : '');
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      res.status(400).json({ success: false, error: 'htmlRender.dataUrl required' });
      return;
    }
    writeDebugDataUrl('html-render', dataUrl);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

app.post('/api/debug/snapshot', (req, res) => {
  if (!DEBUG_ENABLED) {
    res.status(200).json({ success: true, skipped: true });
    return;
  }
  try {
    const body = req.body || {};
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      res.status(400).json({ success: false, error: 'dataUrl required' });
      return;
    }
    writeDebugDataUrl('html-render', dataUrl);
    res.json({ success: true, legacy: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: String(e?.message || e) });
  }
});

// removed /api/debug/* routes per request: no runtime logging nor log endpoints

app.get('/api/files', (_req, res) => {
  try {
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      return res.json([]);
    }

    const files: any[] = [];

    const entries = fs.readdirSync(outputDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.css', '.json'].includes(ext)) {
          files.push({
            name: entry.name,
            path: `output/${entry.name}`,
            type: ext.slice(1)
          });
        }
      }
    }

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files' });
  }
});

app.get('/api/files/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const outputDir = path.join(process.cwd(), 'output');
    const filePath = path.join(outputDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, filename });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

app.post('/api/open-directory', (req, res) => {
  try {
    const { filePath: requestPath } = req.body;
    if (!requestPath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const filename = path.basename(requestPath);
    const outputDir = path.join(process.cwd(), 'output');
    const fullPath = path.join(outputDir, filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    let command: string;
    const platform = process.platform;

    if (platform === 'darwin') {
      command = `open -R "${fullPath}"`;
    } else if (platform === 'win32') {
      command = `explorer /select,"${fullPath.replace(/\//g, '\\')}"`;
    } else {
      command = `xdg-open "${outputDir}"`;
    }

    exec(command, (error) => {
      if (error) {
        return res.status(500).json({ error: 'Failed to open directory' });
      }
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to open directory' });
  }
});


app.get('/api/languages', (_req, res) => {
  try {
    const dir = path.join(process.cwd(), 'locales');
    if (!fs.existsSync(dir)) {
      return res.json([]);
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const langs = entries
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => {
        try {
          const full = path.join(dir, e.name);
          const raw = fs.readFileSync(full, 'utf8');
          const obj = JSON.parse(raw);
          const code = (obj && obj.code) || e.name.replace(/\.json$/, '');
          const name = (obj && obj.name) || code;
          return { code, name };
        } catch { return null; }
      })
      .filter(Boolean);
    res.json(langs);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});


app.get('/api/languages/:code', (req, res) => {
  try {
    const dir = path.join(process.cwd(), 'locales');
    const code = String(req.params.code || '').toLowerCase();
    const file = path.join(dir, `${code}.json`);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'Language not found' });
    }
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw);
    res.json(obj);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/dsl/files', (_req, res) => {
  try {
    const { listDslEntries } = require('./utils/dsl');
    const entries = listDslEntries();
    res.json(entries);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/dsl/:name', (req, res) => {
  try {
    const { loadDslEntry, readDslHtml } = require('./utils/dsl');
    const name = path.basename(req.params.name);
    const entry = loadDslEntry(name);
    const content = readDslHtml(entry);
    res.json({ content, filename: name, baseHref: entry.baseHref });
  } catch (e: any) {
    res.status(404).json({ error: String(e?.message || e) });
  }
});

app.post('/api/dsl/composition', async (req, res) => {
  try {
    const { html, filename } = req.body;
    if (!html || typeof html !== 'string') {
      return res.status(400).json({ error: 'HTML content required' });
    }
    const { dslHtmlToComposition } = require('figma-html-bridge');
    const { loadDslEntry } = require('./utils/dsl');

    let basePath: string | undefined;
    if (filename && typeof filename === 'string') {
      const entry = loadDslEntry(filename);
      basePath = entry.basePath;
    }

    const composition = dslHtmlToComposition(html, basePath);
    res.json({ composition });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const publicDir = path.join(process.cwd(), 'public');
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), display-capture=(), clipboard-write=(self)');
  next();
});
const imagesRoot = path.join(process.cwd(), 'temp', 'images');
app.use('/images', express.static(imagesRoot));
const svgsRoot = path.join(process.cwd(), 'temp', 'svgs');
app.use('/svgs', express.static(svgsRoot));
app.use('/preview', express.static(PREVIEW_ASSETS_DIR));
const fixturesRoot = path.join(process.cwd(), 'fixtures');
app.use('/fixtures', express.static(fixturesRoot));
app.use('/', express.static(publicDir, { extensions: ['html'] }));

warmupChineseFontsMapping().finally(() => {
  app.listen(PORT, () => {
    // server started
  });
});
