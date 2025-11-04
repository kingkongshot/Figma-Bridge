/*
 Generate IR and HTML from a composition JSON using the same renderer as the server.
 Usage: npm run render-ir -- <json-path>
*/

import fs from 'fs';
import path from 'path';
import { compositionToIR } from '../pipeline/ir';
import { warmupChineseFontsMapping } from '../utils/fonts';
import { createPreviewHtml } from '../pipeline/html';

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

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function writeHtml(file: string, html: string) {
  fs.writeFileSync(file, html, 'utf8');
}

async function main() {
  const { file } = parseArgs(process.argv);
  if (!file) {
    console.error('Usage: npm run render-ir -- <json-path>');
    process.exit(1);
  }
  const payload = readJson(file);
  const composition = resolveComposition(payload);
  if (!composition) {
    console.error('Input must be either { composition: {...} } or a composition object with kind="composition".');
    process.exit(1);
  }

  // Ensure font mapping is ready for consistent output (CLI parity with server)
  try {
    await warmupChineseFontsMapping();
  } catch {}

  const ir = compositionToIR(composition);
  const dir = path.join(process.cwd(), 'debug', 'logs');
  ensureCleanDir(dir);
  const p1 = path.join(dir, `01_figma_raw.json`);
  const p2 = path.join(dir, `02_ir.json`);
  const p3 = path.join(dir, `03_render.html`);
  writeJson(p1, composition);
  writeJson(p2, { nodes: ir.nodes, cssRules: ir.cssRules, renderUnion: ir.renderUnion, fontMeta: ir.fontMeta, assetMeta: ir.assetMeta });

  const preview = await createPreviewHtml({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    googleFontsUrl: ir.fontMeta.googleFontsUrl,
    chineseFontsUrls: ir.fontMeta.chineseFontsUrls || [],
    debugEnabled: false,
  });
  const html = preview.html;
  writeHtml(p3, html);
  console.log('IR and HTML generated. Inspect files:');
  console.log(' - ' + p1);
  console.log(' - ' + p2);
  console.log(' - ' + p3);
  console.log('\nOpen in browser: file://' + p3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
