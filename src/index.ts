import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { processBatch as processImageBatch, ensureUploadsDir, listMissing } from './imageService';
import type { ImageItem } from './imageService';
import { compositionToIR } from './pipeline/ir';
import type { RenderNodeIR } from './pipeline/types';
import { createPreviewHtml, createPreviewAssets, createContentAssets, type PreviewHtmlResult } from './pipeline/html';
import { normalizeComposition } from './utils/normalize';
import { normalizeHtml } from './utils/htmlPost';
import { UPLOAD_DIR } from './imageService';
import * as SvgService from './svgService';
import { warmupChineseFontsMapping } from './utils/fonts';
import { getCacheStats, clearCache } from './cacheService';
import { createLogger, listLogFiles, readTail } from './utils/logger';

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

const logger = createLogger();

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
    });
  }
}
const previewManager = new PreviewManager();

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
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
  } catch {}
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
    logger.error('[output] failed to prepare output directory', { error: e });
  }
}

function ensurePreviewAssetsDir() {
  try {
    fs.mkdirSync(PREVIEW_ASSETS_DIR, { recursive: true });
  } catch (e) {
    logger.error('[preview] failed to prepare preview assets directory', { error: e });
  }
}

function rewriteUploadsToImages(html: string): string {
  return html.replace(/\/uploads\/([a-zA-Z0-9_-]+)\.png/g, 'images/$1.png');
}

function writeOutputPackage(bodyHtml: string, cssText: string, headLinks: string, imageIds: string[], svgFiles: string[]) {
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
          logger.warn('[output] copy image failed', { id, error: e });
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
          logger.warn('[output] copy svg failed', { name, error: e });
        }
      }
    }
    const { formatCss, formatHtml } = require('./utils/format');
    const formattedCss = formatCss(cssText);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'styles.css'), formattedCss, 'utf8');

    let rawHtmlDoc = `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Exported Content</title>\n${headLinks}    <link rel=\"stylesheet\" href=\"styles.css\"/>\n  </head>\n  <body>\n    <div class=\"figma-export\">\n${bodyHtml}\n    </div>\n  </body>\n</html>`;
    try {
      const post = normalizeHtml(rawHtmlDoc);
      if (post && post.html) rawHtmlDoc = post.html;
    } catch {}
    const htmlDoc = formatHtml(rawHtmlDoc);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), htmlDoc, 'utf8');
    logger.info('Output package written', { path: 'output/index.html' });
  } catch (e) {
    logger.warn('[output] failed to write output package', { error: e });
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
    logger.error('[api] /api/images/batch failed', { error: e });
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
    logger.error('[api] /api/svgs/check failed', { error: e });
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
    logger.error('[api] /api/svgs/batch failed', { error: e });
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
        } catch (e) {
          logger.warn(`[languages] failed to parse ${file}`, { error: e });
        }
      }
    }

    res.json(languages);
  } catch (e: any) {
    logger.error('[api] /api/languages failed', { error: e });
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
    logger.error('[api] /api/languages/:code failed', { error: e });
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/composition', async (req, res) => {
  try { logger.resetEphemeral(); } catch {}
  const originalPayload = req.body ?? null;
  const composition = originalPayload?.composition ?? null;

  if (!composition) {
    logger.error('composition payload missing');
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
    } catch (e) {
      logger.error('[Server] Failed to save original debug data', { error: e });
    }
  }

  let renderRes: PreviewHtmlResult;
  let irResult: { nodes: RenderNodeIR[]; cssRules: string; renderUnion: { x: number; y: number; width: number; height: number }; fontMeta: { googleFontsUrl: string | null; chineseFontsUrls: string[]; fonts: any[] }; assetMeta: { images: string[] } };
  try {
    normalizeComposition(composition);
    if (DEBUG_ENABLED) {
      try { writeDebugJson('composition', composition); } catch {}
    }

    irResult = compositionToIR(composition);
    if (DEBUG_ENABLED) {
      try { writeDebugJson('ir', { nodes: irResult.nodes, cssRules: irResult.cssRules, renderUnion: irResult.renderUnion, fontMeta: irResult.fontMeta, assetMeta: irResult.assetMeta }); } catch {}
    }

    const previewAssets = await createPreviewAssets({
      composition,
      irNodes: irResult.nodes,
      cssRules: irResult.cssRules,
      renderUnion: irResult.renderUnion,
      googleFontsUrl: globalSettings.useOnlineFonts ? irResult.fontMeta.googleFontsUrl : null,
      chineseFontsUrls: globalSettings.useOnlineFonts ? irResult.fontMeta.chineseFontsUrls : [],
      debugEnabled: true,
    });
    try {
      ensurePreviewAssetsDir();
      fs.writeFileSync(path.join(PREVIEW_ASSETS_DIR, 'styles.css'), previewAssets.cssText, 'utf8');
    } catch (e) {
      logger.warn('[preview] failed to write styles.css', { error: e });
    }
    renderRes = { html: previewAssets.html, baseWidth: previewAssets.baseWidth, baseHeight: previewAssets.baseHeight, renderUnion: previewAssets.renderUnion, debugHtml: previewAssets.debugHtml, debugCss: previewAssets.debugCss };
    if (DEBUG_ENABLED) {
      try {
        if (renderRes.html) writeDebugHtml('render.before', renderRes.html);
        if (renderRes.debugHtml) writeDebugHtml('debug-overlay', renderRes.debugHtml);
      } catch {}
    }
  } catch (error: any) {
    logger.error('render composition failed', { error: error?.message || String(error) });
    res.status(400).json({ error: error?.message || 'failed to render composition' });
    return;
  }

  const post = normalizeHtml(renderRes.html);
  
  try {
    const assets = await createContentAssets(irResult.nodes, irResult.cssRules, irResult.fontMeta.googleFontsUrl, irResult.fontMeta.chineseFontsUrls);
    writeOutputPackage(assets.bodyHtml, assets.cssText, assets.headLinks, irResult.assetMeta?.images || [], (irResult as any).assetMeta?.svgs || []);
  } catch (e) {
    logger.warn('[output] failed to build content HTML', { error: e });
  }
  if (DEBUG_ENABLED) {
    try {
      writeDebugHtml('render.after', post.html);
      if (post.report.changed) {
        logger.info('HTML post-processing', {
          valuesNormalized: post.report.stats.valuesNormalized,
          elementsProcessed: post.report.stats.elementsProcessed,
          steps: post.report.steps,
        });
      }
      if (post.report.warnings.length > 0) {
        logger.warn('HTML post-processing warnings', { warnings: post.report.warnings });
      }
    } catch {}
  }

  previewManager.update({
    composition,
    ir: irResult,
    html: post.html,
    debugHtml: renderRes.debugHtml,
    debugCss: renderRes.debugCss,
    baseWidth: renderRes.baseWidth,
    baseHeight: renderRes.baseHeight,
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

app.post('/api/debug/log', (req, res) => {
  const body = req.body || {};
  const level = String(body.level || 'info').toLowerCase();
  const message = typeof body.message === 'string' ? body.message : '';
  const source = typeof body.source === 'string' ? body.source : undefined;
  const context = body.context === undefined ? undefined : body.context;
  if (!message) {
    res.status(400).json({ success: false, error: 'message required' });
    return;
  }
  const lvl = (['debug','info','warn','error'].includes(level) ? level : 'info') as 'debug'|'info'|'warn'|'error';
  const rid = (req as any).rid;
  logger.log(lvl, message, { source, rid, context });
  res.json({ success: true });
});

app.get('/api/debug/logs', (_req, res) => {
  const files = listLogFiles(logger.dir);
  res.json({ dir: logger.dir, files });
});

app.get('/api/debug/logs/latest', (_req, res) => {
  const lines = readTail(logger.file, 200);
  res.json({ file: logger.file, lines });
});

app.get('/api/debug/logs/current', (_req, res) => {
  let lines: string[] = [];
  try {
    const data = fs.readFileSync(logger.file, 'utf8');
    lines = data.split(/\r?\n/).filter(Boolean);
  } catch {}
  res.json({ file: logger.file, lines });
});

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
    logger.error('Failed to list files', { error });
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
    logger.error('Failed to read file', { error });
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
        logger.error('Failed to open directory', { error, command });
        return res.status(500).json({ error: 'Failed to open directory' });
      }
      res.json({ success: true });
    });
  } catch (error) {
    logger.error('Failed to open directory', { error });
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
app.use('/', express.static(publicDir, { extensions: ['html'] }));

warmupChineseFontsMapping().finally(() => {
  app.listen(PORT, () => {
    logger.info('Server started', {
      url: `http://localhost:${PORT}`,
      preview: `http://localhost:${PORT}/index.html`
    });
  });
});
