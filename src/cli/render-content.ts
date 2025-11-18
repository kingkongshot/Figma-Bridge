/*
 Export content assets (for front-end integration) from a composition JSON.
 Usage: npm run render-content -- <json-path>
*/

import fs from 'fs';
import path from 'path';
import { figmaToHtml } from 'figma-html-bridge';
import { warmupChineseFontsMapping } from '../utils/fonts';

type AnyObj = Record<string, any>;

function parseArgs(argv: string[]): { file: string | null } {
  let file: string | null = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!file) file = a;
  }
  return { file };
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

function ensureCleanDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function write(file: string, text: string) {
  fs.writeFileSync(file, text, 'utf8');
}

async function main() {
  const { file } = parseArgs(process.argv);
  if (!file) {
    console.error('Usage: npm run render-content -- <json-path>');
    process.exit(1);
  }
  const payload = readJson(file);
  const composition = resolveComposition(payload);
  if (!composition) {
    console.error('Input must be either { composition: {...} } or a composition object with kind="composition".');
    process.exit(1);
  }

  // Keep parity with server: warm up fonts mapping but never fail
  try { await warmupChineseFontsMapping(); } catch {}

  const result = await figmaToHtml({ composition }, { assetUrlProvider: (id, type) => (type === 'image' ? `images/${id}.png` : `svgs/${id}`), debugEnabled: false });
  const outDir = path.join(process.cwd(), 'debug', 'logs', 'content');
  ensureCleanDir(outDir);

  const bodyPath = path.join(outDir, 'body.html');
  const cssPath = path.join(outDir, 'styles.css');
  const headLinksPath = path.join(outDir, 'head-links.html');
  write(bodyPath, result.content.bodyHtml);
  write(cssPath, result.content.cssText);
  write(headLinksPath, '');

  const indexHtml = `<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\"/>\n    <title>Content Preview</title>\n    <link rel=\"stylesheet\" href=\"./styles.css\"/>\n  </head>\n  <body>\n${result.content.bodyHtml}\n  </body>\n</html>`;
  write(path.join(outDir, 'index.html'), indexHtml);

  write(path.join(outDir, 'single-file.html'), result.html);

  console.log('Content assets generated. Open for quick preview:');
  console.log(' - ' + path.join(outDir, 'index.html'));
  console.log('Or copy-paste from:');
  console.log(' - ' + bodyPath);
  console.log(' - ' + cssPath);
  console.log(' - ' + headLinksPath);
  console.log('Single-file variant:');
  console.log(' - ' + path.join(outDir, 'single-file.html'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
