import { normalizeComposition } from '../utils/normalize';
import { compositionToIR } from '../pipeline/ir';
import { createPreviewAssets, createContentAssets } from '../pipeline/html';
import type { RenderNodeIR, Rect } from '../pipeline/types';

export type AssetType = 'image' | 'svg';
export type AssetUrlProvider = (id: string, type: AssetType, data?: string) => string;

export type FigmaToHtmlOptions = {
  assetUrlProvider?: AssetUrlProvider;
  debugEnabled?: boolean;
};

export async function figmaToHtml(input: { composition: any }, options: FigmaToHtmlOptions = {}) {
  const { composition } = input || {};
  if (!composition || typeof composition !== 'object') throw new Error('figmaToHtml: composition required');
  normalizeComposition(composition);
  const ir = compositionToIR(composition);

  const preview = await createPreviewAssets({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: !!options.debugEnabled,
  });

  // Also build content assets (for export packages)
  const content = await createContentAssets({
    composition,
    irNodes: ir.nodes,
    cssRules: ir.cssRules,
    renderUnion: ir.renderUnion,
    debugEnabled: false,
  });

  const mappedPreview = applyAssetUrlProvider(preview.html, preview.cssText, ir.nodes, options.assetUrlProvider);
  const mappedContent = applyAssetUrlProvider(content.bodyHtml, content.cssText, ir.nodes, options.assetUrlProvider);

  return {
    html: mappedPreview.html,
    cssText: mappedPreview.cssText,
    baseWidth: preview.baseWidth,
    baseHeight: preview.baseHeight,
    renderUnion: preview.renderUnion as Rect,
    assets: ir.assetMeta,
    debugHtml: preview.debugHtml,
    debugCss: preview.debugCss,
    content: {
      bodyHtml: mappedContent.htmlFragment || mappedContent.html,
      cssText: mappedContent.cssText,
      headLinks: '',
      baseWidth: content.baseWidth,
      baseHeight: content.baseHeight,
    }
  };
}

function applyAssetUrlProvider(htmlOrFragment: string, cssText: string, nodes: RenderNodeIR[], provider?: AssetUrlProvider): { html: string; cssText: string; htmlFragment?: string } {
  if (!provider) return { html: htmlOrFragment, cssText };
  let outHtml = htmlOrFragment;
  let outCss = cssText;
  let isFragment = false;

  // Detect if this is a fragment (no <html> tag)
  if (!/<!doctype html>/i.test(htmlOrFragment) && !/<html\b/i.test(htmlOrFragment)) {
    isFragment = true;
    outHtml = htmlOrFragment;
  } else {
    outHtml = htmlOrFragment;
  }

  // Build svg file -> content map if available
  const svgMap = new Map<string, string>();
  const stack: RenderNodeIR[] = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (n && n.svgFile && n.svgContent) svgMap.set(n.svgFile, n.svgContent);
    if (n && n.content && n.content.type === 'children') stack.push(...n.content.nodes);
  }

  // Replace image URLs in CSS and HTML (backgrounds)
  const imgRe = /(["'\(])(?:\/)?images\/([a-zA-Z0-9_-]+)\.png(["'\)])/g;
  outCss = outCss.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });
  outHtml = outHtml.replace(imgRe, (_m: string, p1: string, id: string, p3: string) => {
    const url = provider(String(id), 'image');
    return `${p1}${url}${p3}`;
  });

  // Replace svg <img src="/svgs/<file>">
  const svgRe = /(src=\")[^\"]*\/svgs\/([^\"]+)(\")/g;
  outHtml = outHtml.replace(svgRe, (_m: string, p1: string, file: string, p3: string) => {
    const data = svgMap.get(String(file));
    const url = provider(String(file), 'svg', data);
    return `${p1}${url}${p3}`;
  });

  return isFragment ? { html: outHtml, cssText: outCss, htmlFragment: outHtml } : { html: outHtml, cssText: outCss };
}
