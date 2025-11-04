import type { DocumentConfig, Viewport, Bounds } from '../pipeline/types';

function buildBaseStyles(viewport: Viewport, bounds: Bounds): string {
  return `html, body {\n  margin: 0;\n  font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", Helvetica, Arial, sans-serif;\n  font-synthesis-weight: none;\n  background: transparent;\n  box-sizing: border-box;\n  overflow: hidden;\n}\n.viewport {\n  position: relative;\n  width: ${viewport.width}px;\n  height: ${viewport.height}px;\n  background: transparent;\n  box-sizing: border-box;\n  transform-origin: top left;\n}\n.view-offset {\n  position: absolute;\n  left: ${-viewport.offsetX}px;\n  top: ${-viewport.offsetY}px;\n  width: 100%;\n  height: 100%;\n  background: transparent;\n  box-sizing: border-box;\n}\n.composition {\n  position: absolute;\n  left: 0px;\n  top: 0px;\n  width: ${bounds.width}px;\n  height: ${bounds.height}px;\n  background: transparent;\n  box-sizing: border-box;\n}\n.content-layer {\n  position: relative;\n  z-index: 0;\n}\n.frame, .shape, .text, .svg-container, .mask-container {\n  box-sizing: border-box;\n  position: relative;\n  z-index: 0;\n}\n.svg-container > svg {\n  display: block;\n  width: 100%;\n  height: 100%;\n  shape-rendering: geometricPrecision;\n}\n.svg-container > img {\n  display: block;\n  width: 100%;\n  height: 100%;\n}`;
}

export function buildFontLinks(googleFontsUrl?: string | null, chineseFontsUrls?: string[]): string {
  const lines: string[] = [];
  const seenOrigins = new Set<string>();
  const seenHrefs = new Set<string>();

  if (googleFontsUrl) {
    if (!seenOrigins.has('https://fonts.googleapis.com')) {
      lines.push(`    <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">`);
      seenOrigins.add('https://fonts.googleapis.com');
    }
    if (!seenOrigins.has('https://fonts.gstatic.com')) {
      lines.push(`    <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>`);
      seenOrigins.add('https://fonts.gstatic.com');
    }
    if (!seenHrefs.has(googleFontsUrl)) {
      lines.push(`    <link href=\"${googleFontsUrl}\" rel=\"stylesheet\">`);
      seenHrefs.add(googleFontsUrl);
    }
  }

  if (Array.isArray(chineseFontsUrls) && chineseFontsUrls.length > 0) {
    for (const href of chineseFontsUrls) {
      try {
        const { origin } = new URL(href);
        if (!seenOrigins.has(origin)) {
          lines.push(`    <link rel=\"preconnect\" href=\"${origin}\">`);
          seenOrigins.add(origin);
        }
        if (!seenHrefs.has(href)) {
          lines.push(`    <link href=\"${href}\" rel=\"stylesheet\">`);
          seenHrefs.add(href);
        }
      } catch {}
    }
  }

  return lines.length ? lines.join('\n') + '\n' : '';
}

function buildWeightMappingScript(googleFontsUrl?: string | null): string {
  if (!googleFontsUrl) return '';
  return `    <script>\n      (function() {\n        const STANDARD_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];\n        function findClosestWeight(requested, available) {\n          if (!available.length) return requested;\n          let closest = available[0];\n          let minDist = Math.abs(requested - closest);\n          for (const w of available) {\n            const dist = Math.abs(requested - w);\n            if (dist < minDist) {\n              minDist = dist;\n              closest = w;\n            } else if (dist === minDist) {\n              if (requested >= 400) {\n                closest = Math.max(w, closest);\n              } else {\n                closest = Math.min(w, closest);\n              }\n            }\n          }\n          return closest;\n        }\n        window.__fontWeightMapping = {};\n        document.fonts.ready.then(() => {\n          document.querySelectorAll('span[style*=\\\"font-weight\\\"]').forEach((el) => {\n            const style = el.style;\n            const currentWeight = parseInt(style.fontWeight);\n            if (!currentWeight || STANDARD_WEIGHTS.includes(currentWeight)) return;\n            const family = style.fontFamily.replace(/[\\\"']/g, '').split(',')[0].trim();\n            const available = [];\n            document.fonts.forEach((font) => {\n              if (font.family === family) {\n                const w = parseInt(font.weight);\n                if (w && !available.includes(w)) available.push(w);\n              }\n            });\n            if (available.length) {\n              const mapped = findClosestWeight(currentWeight, available.sort((a,b) => a-b));\n              if (mapped !== currentWeight) {\n                window.__fontWeightMapping[currentWeight] = mapped;\n              }\n              style.fontWeight = mapped;\n            }\n          });\n        });\n      })();\n    </script>\n`;
}

export function buildHtmlHead(config: DocumentConfig): string {
  const { viewport, bounds, styles, fonts } = config;
  const baseStyles = buildBaseStyles(viewport, bounds);
  const stylesText = `${baseStyles}\n${styles?.utilityCss || ''}\n${styles?.cssRules || ''}`;
  const baseTag = `    <base href=\"/\">\n`;
  const fontLinks = buildFontLinks(fonts?.googleFontsUrl, fonts?.chineseFontsUrls);
  const weightMappingScript = buildWeightMappingScript(fonts?.googleFontsUrl);
  return `  <head>\n    <meta charset=\"utf-8\" />\n    <title>Bridge Preview</title>\n\n${baseTag}${fontLinks}    <style>${stylesText}</style>\n${weightMappingScript}  </head>`;
}

export function buildHtmlBody(config: DocumentConfig): string {
  const { viewport, bounds, bodyHtml, contentLayerStyle } = config;
  const contentLayerHtml = `<div class=\"content-layer\"${contentLayerStyle ? ` style=\\\"${contentLayerStyle}\\\"` : ''}>\n${bodyHtml}\n</div>`;
  return `  <body>\n    <div class=\"viewport\">\n      <div class=\"view-offset\">\n        <div class=\"composition\" data-figma-render=\"1\">\n${contentLayerHtml}\n        </div>\n      </div>\n    </div>\n  </body>`;
}

