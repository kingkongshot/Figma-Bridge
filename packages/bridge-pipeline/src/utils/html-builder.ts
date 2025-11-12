import type { DocumentConfig, Viewport, Bounds } from '../pipeline/types';

export function buildBaseStyles(viewport: Viewport, bounds: Bounds): string {
  return `html, body {\n  margin: 0;\n  font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Helvetica, Arial, sans-serif;\n  font-synthesis-weight: none;\n  background: transparent;\n  box-sizing: border-box;\n  overflow: hidden;\n}\n.viewport {\n  position: relative;\n  width: ${viewport.width}px;\n  height: ${viewport.height}px;\n  background: transparent;\n  box-sizing: border-box;\n  transform-origin: top left;\n}\n.view-offset {\n  position: absolute;\n  left: ${-viewport.offsetX}px;\n  top: ${-viewport.offsetY}px;\n  width: 100%;\n  height: 100%;\n  background: transparent;\n  box-sizing: border-box;\n}\n.composition {\n  position: absolute;\n  left: 0px;\n  top: 0px;\n  width: ${bounds.width}px;\n  height: ${bounds.height}px;\n  background: transparent;\n  box-sizing: border-box;\n}\n.content-layer {\n  position: relative;\n  z-index: 0;\n}\n.frame, .shape, .text, .svg-container, .mask-container {\n  box-sizing: border-box;\n  position: relative;\n  z-index: 0;\n}\n.svg-container > svg {\n  display: block;\n  width: 100%;\n  height: 100%;\n  shape-rendering: geometricPrecision;\n}\n.svg-container > img {\n  display: block;\n  width: 100%;\n  height: 100%;\n}`;
}

export function buildHtmlHead(config: DocumentConfig): string {
  const { viewport, bounds, styles } = config;
  const baseStyles = buildBaseStyles(viewport, bounds);
  const stylesText = `${baseStyles}\n${styles?.utilityCss || ''}\n${styles?.cssRules || ''}`;
  const baseTag = `    <base href=\"/\">\n`;
  return `  <head>\n    <meta charset=\"utf-8\" />\n    <title>Bridge Preview</title>\n\n${baseTag}    <style>${stylesText}</style>\n  </head>`;
}

export function buildHtmlBody(config: DocumentConfig): string {
  const { viewport, bounds, bodyHtml, contentLayerStyle } = config;
  const contentLayerHtml = `<div class=\"content-layer\"${contentLayerStyle ? ` style=\\\"${contentLayerStyle}\\\"` : ''}>\n${bodyHtml}\n</div>`;
  return `  <body>\n    <div class=\"viewport\">\n      <div class=\"view-offset\">\n        <div class=\"composition\" data-figma-render=\"1\">\n${contentLayerHtml}\n        </div>\n      </div>\n    </div>\n  </body>`;
}
