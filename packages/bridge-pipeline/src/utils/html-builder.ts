import type { DocumentConfig } from '../pipeline/types';

// Core base styles should only care about document and content semantics.
// Viewport/composition wrappers are now the responsibility of the host app.
export function buildBaseStyles(): string {
  return `html, body {\n  margin: 0;\n  font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Helvetica, Arial, sans-serif;\n  font-synthesis-weight: none;\n  background: transparent;\n  box-sizing: border-box;\n  overflow: hidden;\n}\n.content-layer {\n  position: relative;\n  z-index: 0;\n}\n.frame, .shape, .text, .svg-container, .mask-container {\n  box-sizing: border-box;\n  position: relative;\n  z-index: 0;\n}\n.svg-container > svg {\n  display: block;\n  width: 100%;\n  height: 100%;\n  shape-rendering: geometricPrecision;\n}\n.svg-container > img {\n  display: block;\n  width: 100%;\n  height: 100%;\n}`;
}

export function buildHtmlHead(config: DocumentConfig): string {
  const { styles } = config;
  const baseStyles = buildBaseStyles();
  const stylesText = `${baseStyles}\n${styles?.utilityCss || ''}\n${styles?.cssRules || ''}`;
  const baseTag = `    <base href=\"/\">\n`;
  return `  <head>\n    <meta charset=\"utf-8\" />\n    <title>Bridge Preview</title>\n\n${baseTag}    <style>${stylesText}</style>\n  </head>`;
}

export function buildHtmlBody(config: DocumentConfig): string {
  const { bodyHtml, contentLayerStyle } = config;
  const contentLayerHtml = `<div class=\"content-layer\"${contentLayerStyle ? ` style=\\\"${contentLayerStyle}\\\"` : ''}>\n${bodyHtml}\n</div>`;
  return `  <body>\n${contentLayerHtml}\n  </body>`;
}
