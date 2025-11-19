import { buildLayers, selectLayerById, clearLayerSelection, filterLayers, attachToggleEvents } from './layers.js';
import { updatePropertiesPanel, findNodeByIdInIR } from './properties.js';
import { fit, updateStrokeScale, updateDebugOverlayVisibility, toggleRenderBounds } from './viewport.js';
import { attachPreviewInteractions, highlightByLayerId, clearHighlight, selectLayer, clearSelection } from './interactions.js';
import { applyTheme, initSettings, getCurrentSettings, loadCacheStats } from './settings.js';
import ToolbarManager from './toolbar.js';

const FILE_ICONS = {
  '.html': '/icons/file-html.svg',
  '.css': '/icons/drop.svg',
  '.json': '/icons/cube.svg'
};

function getFileIcon(filename) {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : '';
  return FILE_ICONS[ext] || FILE_ICONS['.html'];
}

const sidebarToggleBtn = document.getElementById('sidebarToggle');
      const propertiesToggleBtn = document.getElementById('propertiesToggle');
      const propertiesCollapseBtn = document.getElementById('propertiesCollapseBtn');
      const toggleBoundsBtn = document.getElementById('toggleBoundsBtn');
      const toggleThemeBtn = document.getElementById('toggleThemeBtn');
      const themeIcon = document.getElementById('themeIcon');
      const activitySettingsBtn = document.getElementById('activitySettingsBtn');
      const filesBtn = document.getElementById('filesBtn');
      const layersBtn = document.getElementById('layersBtn');
      const dslBtn = document.getElementById('dslBtn');
      const layersView = document.getElementById('layersView');
      const filesView = document.getElementById('filesView');
      const dslSidebarView = document.getElementById('dslSidebarView');
      const settingsView = document.getElementById('settingsView');
      const canvasView = document.getElementById('canvasView');
      const codeView = document.getElementById('codeView');
      const dslContentView = document.getElementById('dslContentView');
      const settingsContentView = document.getElementById('settingsContentView');
      const fileTree = document.getElementById('fileTree');
      const dslFileTree = document.getElementById('dslFileTree');
      const dslDirectFrame = document.getElementById('dslDirectFrame');
      const dslPipelineFrame = document.getElementById('dslPipelineFrame');
      const codeContent = document.getElementById('codeContent');
      const codeFilename = document.getElementById('codeFilename');
      const settingsNav = document.getElementById('settingsNav');
      const settingsContentScroll = document.getElementById('settingsContentScroll');
      const mainElement = document.querySelector('main');
      const previewFrame = document.getElementById('previewFrame');
      const overlayHost = document.getElementById('overlayHost');
      const stageWrap = document.querySelector('.stage-wrap');
      const layersList = document.getElementById('layersList');
      const layerFilter = document.getElementById('layerFilter');
      const layersFilter = document.getElementById('layersFilter');
      const searchToggleBtn = document.getElementById('searchToggleBtn');
      const propertiesContent = document.getElementById('propertiesContent');

const state = {
        html: null,
        compareHtml: null,
        debugHtml: null,
        debugCss: null,
        baseWidth: null,
        baseHeight: null,
        composition: null,
        ir: null,
        scale: 1,
        sidebarCollapsed: false,
        propertiesCollapsed: false,
        boundsVisible: true,
        selectedLayerId: null,
        currentView: 'layers',
        files: [],
        selectedFile: null,
        dslFiles: [],
        selectedDslFile: null,
        debugMode: false
      };

const VIEW_CONFIG = {
  layers: {
    btn: layersBtn,
    sidebar: layersView,
    content: canvasView,
    showProperties: true,
    onEnter: () => {
      const userCollapsed = localStorage.getItem('bridge-properties-collapsed') === '1';
      if (!userCollapsed) {
        mainElement.classList.remove('properties-collapsed');
        state.propertiesCollapsed = false;
      }
    }
  },
  files: {
    btn: filesBtn,
    sidebar: filesView,
    content: codeView,
    showProperties: false,
    onEnter: () => {
      if (state.files.length === 0) {
        loadFiles();
      } else if (!state.selectedFile && state.files.length > 0) {
        const firstHtmlFile = state.files.find(f => f.name.toLowerCase().endsWith('.html'));
        if (firstHtmlFile) {
          const firstHtmlItem = fileTree.querySelector(`[data-file="${firstHtmlFile.path}"]`);
          if (firstHtmlItem) {
            firstHtmlItem.click();
          }
        }
      }
      mainElement.classList.remove('sidebar-collapsed');
      mainElement.classList.add('properties-collapsed');
      state.sidebarCollapsed = false;
      state.propertiesCollapsed = true;
    }
  },
  dsl: {
    btn: dslBtn,
    sidebar: dslSidebarView,
    content: dslContentView,
    showProperties: false,
    onEnter: () => {
      if (state.dslFiles.length === 0) {
        loadDslFiles();
      }
      mainElement.classList.remove('sidebar-collapsed');
      mainElement.classList.add('properties-collapsed');
      state.sidebarCollapsed = false;
      state.propertiesCollapsed = true;
    }
  },
  settings: {
    btn: activitySettingsBtn,
    sidebar: settingsView,
    content: settingsContentView,
    showProperties: false,
    onEnter: () => {
      mainElement.classList.remove('sidebar-collapsed');
      mainElement.classList.add('properties-collapsed');
      state.sidebarCollapsed = false;
      state.propertiesCollapsed = true;
      loadCacheStats();
    }
  }
};

let previewInteractionsController = { current: null };

function update(changes = {}) {
        Object.assign(state, changes);

        if (changes.html && previewFrame) {
          previewFrame.setAttribute('srcdoc', state.html);
          const onLoad = () => {
            try {
        injectDebugIntoFrame(previewFrame, state);
        fit(previewFrame, stageWrap, state, () => updateStrokeScale(overlayHost, previewFrame, state.scale));
        updateDebugOverlayVisibility(overlayHost, previewFrame, state.boundsVisible);
              if (overlayHost) overlayHost.innerHTML = '';
        attachPreviewInteractions(previewFrame, {
          highlightCallback: (id) => highlightByLayerId(id, previewFrame),
          clearHighlightCallback: () => clearHighlight(previewFrame),
          selectCallback: (id) => selectLayer(id, previewFrame, (layerId) => selectLayerById(layerId, layersList, (id) => updatePropertiesPanel(id, state, propertiesContent))),
          clearSelectionCallback: () => {
            clearSelection(previewFrame, layersList, (id) => updatePropertiesPanel(id, state, propertiesContent));
            state.selectedLayerId = null;
          },
          controller: previewInteractionsController
        });
              captureHtmlRender();
            } catch (e) {}
            previewFrame.removeEventListener('load', onLoad);
          };
          previewFrame.addEventListener('load', onLoad);

          if (state.currentView === 'dsl' && dslPipelineFrame) {
            const pipelineHtml = state.compareHtml || state.html;
            dslPipelineFrame.setAttribute('srcdoc', pipelineHtml);
          }
        }
  if (changes.ir) {
    buildLayers(
      state.ir,
      layersList,
      layerFilter,
      (id) => highlightByLayerId(id, previewFrame),
      () => clearHighlight(previewFrame)
    );
  }
        if (changes.boundsVisible !== undefined) {
    updateDebugOverlayVisibility(overlayHost, previewFrame, state.boundsVisible);
        }
        if (changes.baseWidth || changes.baseHeight || changes.sidebarCollapsed !== undefined || changes.propertiesCollapsed !== undefined) {
    fit(previewFrame, stageWrap, state, () => updateStrokeScale(overlayHost, previewFrame, state.scale));
  }
  
  if ((changes.html || changes.composition || changes.ir) && state.currentView === 'files' && state.selectedFile) {
    loadFileContent(state.selectedFile);
  }
}

function mergePayloadIntoState(payload, keyPrefix = '') {
  const changes = {};
  const baseKeys = ['html', 'compareHtml', 'debugHtml', 'debugCss', 'composition', 'ir', 'baseWidth', 'baseHeight'];
  const keys = keyPrefix
    ? baseKeys.map(k => keyPrefix + k.charAt(0).toUpperCase() + k.slice(1))
    : baseKeys;

  keys.forEach((key, i) => {
    const targetKey = baseKeys[i];
    if (payload[key] !== undefined) changes[targetKey] = payload[key];
  });
  
  return changes;
}

      function connect() {
        const es = new EventSource('/events');
        es.addEventListener('ready', (e) => {
          try {
      const payload = JSON.parse(e.data ?? '{}');
      update(mergePayloadIntoState(payload, 'latest'));
          } catch {}
        });
        es.addEventListener('composition', (e) => {
          try {
      const payload = JSON.parse(e.data ?? '{}');
      update(mergePayloadIntoState(payload));
          } catch {}
        });
      }

function injectDebugIntoFrame(previewFrame, state) {
        try {
          function sanitizeSvgForOutlineStr(svgRaw) {
            if (!svgRaw) return '';
            try {
              const vbMatch = String(svgRaw).match(/<svg[^>]*viewBox\s*=\s*"([^"]+)"[^>]*>/i);
              const vb = vbMatch ? ` viewBox="${vbMatch[1]}"` : '';
              const inner = String(svgRaw).replace(/<\/?svg[^>]*>/gi, '');
              return `
<svg${vb} xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:100%;pointer-events:auto;overflow:visible;shape-rendering:geometricPrecision">\n  <style>\n    *{fill:none!important;stroke:var(--bridge-debug-blue)!important;stroke-opacity:var(--bridge-debug-alpha)!important;vector-effect:non-scaling-stroke!important;stroke-width:var(--bridge-stroke, calc(1px/var(--bridge-scale)))!important}\n  </style>\n  <rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" pointer-events=\"all\" style=\"stroke:none!important;fill:transparent!important\"/>\n  <g>${inner}</g>\n</svg>`;
            } catch (e) {
              return `<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:block;width:100%;height:100%;pointer-events:auto;overflow:visible;fill:none;stroke:var(--bridge-debug-blue);stroke-opacity:var(--bridge-debug-alpha);vector-effect:non-scaling-stroke;stroke-width:var(--bridge-stroke, calc(1px/var(--bridge-scale)));shape-rendering:geometricPrecision\"><rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" pointer-events=\"all\" style=\"stroke:none!important;fill:transparent!important\"/>${String(svgRaw).replace(/<\/?svg[^>]*>/gi, '')}</svg>`;
            }
          }
          async function hydrateSvgShapes(doc) {
            try {
              const nodes = Array.from(doc.querySelectorAll('.debug-svg .debug-svg-shape[data-svg-file]:not([data-hydrated="1"])'));
              for (const holder of nodes) {
                const file = holder.getAttribute('data-svg-file');
                if (!file) { holder.setAttribute('data-hydrated', '1'); continue; }
                try {
                  const res = await fetch(`/svgs/${encodeURIComponent(file)}`);
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const raw = await res.text();
                  holder.innerHTML = sanitizeSvgForOutlineStr(raw);
                  holder.setAttribute('data-hydrated', '1');
                  const container = holder.closest('.debug-svg');
                  if (container) container.classList.add('shape-only');
                } catch (e) {
                  holder.setAttribute('data-hydrated', '1');
                }
              }
            } catch (e) {}
          }
          function readFontCache() {
            try {
              const raw = localStorage.getItem('bridge-font-cache');
              const obj = raw ? JSON.parse(raw) : { families: {} };
              return (obj && typeof obj === 'object' && obj.families) ? obj : { families: {} };
            } catch { return { families: {} }; }
          }
          function writeFontCache(cache) {
            try { localStorage.setItem('bridge-font-cache', JSON.stringify(cache)); } catch {}
          }
          function getIrFontsFromState(state) {
            try { return (((state || {}).ir || {}).fontMeta || {}).fonts || []; } catch { return []; }
          }
          function normalizeIrFonts(irFonts) {
            return (Array.isArray(irFonts) ? irFonts : []).map(f => ({
              family: f.family,
              weights: Array.isArray(f.weights) ? f.weights.slice().sort((a,b)=>a-b) : [],
              italic: Array.isArray(f.styles) ? f.styles.some(s => String(s).toLowerCase().includes('italic')) : false,
            }));
          }
          async function loadFontCombos(doc, combos, maxWaitMs = 3000) {
            if (!doc.fonts || typeof doc.fonts.load !== 'function') return;
            const start = Date.now();
            const promises = [];
            for (const c of combos) {
              const desc = `${c.italic ? 'italic ' : ''}${c.weight} 16px ${c.family}`;
              promises.push(doc.fonts.load(desc));
            }
            let done = false;
            const timer = new Promise(r => setTimeout(r, Math.max(0, maxWaitMs - (Date.now() - start))));
            try { await Promise.race([Promise.all(promises).then(()=>{done = true;}), timer]); } catch {}
            if (!done) console.warn('[Snapshot] Preload fonts timed out; continue');
          }
          function computeCombosFromSpec(spec) {
            const combos = [];
            for (const f of spec) {
              const fam = (f.family || '').replace(/["']/g, '').trim();
              const italic = !!f.italic;
              const weights = Array.isArray(f.weights) ? f.weights : [];
              for (const w of weights) { combos.push({ family: fam, weight: w, italic }); }
            }
            return combos;
          }
          function mergeCacheWithIR(cache, irSpec) {
            const next = JSON.parse(JSON.stringify(cache || { families: {} }));
            for (const f of irSpec) {
              const fam = f.family;
              if (!fam) continue;
              if (!next.families[fam]) next.families[fam] = { weights: [], italic: false };
              const cur = next.families[fam];
              const set = new Set(cur.weights || []);
              for (const w of (f.weights || [])) set.add(w);
              cur.weights = Array.from(set).sort((a,b)=>a-b);
              cur.italic = !!(cur.italic || f.italic);
            }
            return next;
          }
          const doc = previewFrame && previewFrame.contentDocument;
          if (!doc) return;
          if (state.debugCss) {
            let styleEl = doc.getElementById('bridge-debug-style');
            if (!styleEl) {
              styleEl = doc.createElement('style');
              styleEl.id = 'bridge-debug-style';
              styleEl.type = 'text/css';
              styleEl.textContent = state.debugCss;
              doc.head.appendChild(styleEl);
            } else {
              styleEl.textContent = state.debugCss;
            }
          }
          const comp = doc.querySelector('.composition');
          if (!comp) return;
          const old = doc.querySelector('.debug-overlay');
          if (old && old.parentNode) old.parentNode.removeChild(old);
          if (state.debugHtml) {
            const wrap = doc.createElement('div');
            wrap.className = 'debug-overlay';
            wrap.innerHTML = state.debugHtml;
            comp.appendChild(wrap);
            try { hydrateSvgShapes(doc); } catch (e) {}
          }
        } catch (e) {
          console.warn('[Preview] injectDebugIntoFrame failed:', e);
        }
      }

      function isDslComposition() {
        try {
          const comp = (state && state.composition) || null;
          return !!(comp && comp._bridgeSource === 'dsl');
        } catch {
          return false;
        }
      }

      function resolveSnapshotContext() {
        if (!previewFrame) {
          console.log('[Snapshot] No iframe element');
          return null;
        }
        const win = previewFrame.contentWindow;
        if (!win) {
          console.log('[Snapshot] No contentWindow');
          return null;
        }
        const doc = win.document;
        if (!doc) {
          console.log('[Snapshot] No document');
          return null;
        }
        const viewport = doc.querySelector('.viewport');
        if (!viewport) {
          console.log('[Snapshot] .viewport not found, waiting...');
          setTimeout(captureHtmlRender, 500);
          return null;
        }
        let target = viewport;
        if (isDslComposition()) {
          const comp = doc.querySelector('.composition');
          if (comp) target = comp;
        }
        return { win, doc, viewport: target };
      }

      function ensureHtmlToImageLoaded() {
        if (!(window.htmlToImage && window.htmlToImage.toPng)) {
          console.error('[Snapshot] html-to-image not loaded');
          return false;
        }
        return true;
      }

      async function waitForFontsInUse(win, doc, maxWaitMs) {
        if (!doc.fonts || typeof doc.fonts.load !== 'function') return;
        const start = Date.now();
        const spans = Array.from(doc.querySelectorAll('span[style*="font-family"], span[style*="font-weight"]'));
        const combos = new Map();
        for (const el of spans) {
          const style = (el instanceof HTMLElement) ? el.getAttribute('style') || '' : '';
          const famMatch = style.match(/font-family\s*:\s*([^;]+)/i);
          const wMatch = style.match(/font-weight\s*:\s*(\d{2,3})/i);
          const italic = /font-style\s*:\s*italic/i.test(style);
          if (!famMatch || !wMatch) continue;
          let fam = famMatch[1].split(',')[0].trim();
          fam = fam.replace(/["']/g, '');
          const weight = parseInt(wMatch[1], 10) || 400;
          const key = `${fam}|${italic ? 'italic' : 'normal'}|${weight}`;
          combos.set(key, { fam, italic, weight });
        }
        if (!combos.size) return;

        try {
          const map = win.__fontWeightMapping || {};
          for (const [k, v] of Object.entries(map)) {
            const mapped = parseInt(String(v), 10);
            if (!mapped) continue;
            for (const c of combos.values()) {
              if (c.weight === parseInt(String(k), 10)) {
                const key2 = `${c.fam}|${c.italic ? 'italic' : 'normal'}|${mapped}`;
                combos.set(key2, { fam: c.fam, italic: c.italic, weight: mapped });
              }
            }
          }
        } catch {}

        const promises = [];
        for (const c of combos.values()) {
          const desc = `${c.italic ? 'italic ' : ''}${c.weight} 16px ${c.fam}`;
          promises.push(doc.fonts.load(desc));
        }
        let done = false;
        const timer = new Promise((resolve) => setTimeout(resolve, Math.max(0, maxWaitMs - (Date.now() - start))));
        try { await Promise.race([Promise.all(promises).then(() => { done = true; }), timer]); } catch {}
        if (!done) {
          console.warn('[Snapshot] Font loads timed out; proceeding');
        }
      }

      async function preloadFontsForSnapshot(doc) {
        try {
          const cache = readFontCache();
          const irFontsRaw = getIrFontsFromState(state);
          const irFonts = normalizeIrFonts(irFontsRaw);
          const irFamilies = new Set(irFonts.map(f => f.family));
          const cachedSubset = [];
          for (const fam in (cache.families || {})) {
            if (!irFamilies.has(fam)) continue;
            const entry = cache.families[fam] || { weights: [], italic: false };
            cachedSubset.push({ family: fam, weights: entry.weights || [], italic: !!entry.italic });
          }
          const cachedCombos = computeCombosFromSpec(cachedSubset);
          if (cachedCombos.length) await loadFontCombos(doc, cachedCombos, 2000);
          const irCombos = computeCombosFromSpec(irFonts);
          if (irCombos.length) await loadFontCombos(doc, irCombos, 3000);
        } catch (e) {
          console.warn('[Snapshot] preloadFontsForSnapshot failed:', e);
        }
      }

      function nextAnimationFrame(win) {
        if (!win.requestAnimationFrame) return Promise.resolve();
        return new Promise((resolve) => win.requestAnimationFrame(() => resolve()));
      }

      async function ensureFontsReady(win, doc) {
        await preloadFontsForSnapshot(doc);

        if (doc.fonts && doc.fonts.ready && typeof doc.fonts.ready.then === 'function') {
          try { await doc.fonts.ready; } catch (e) {}
        }

        await nextAnimationFrame(win);
        await waitForFontsInUse(win, doc, 6000);
        await nextAnimationFrame(win);
      }

      async function captureViewportToDataUrl(doc, viewport) {
        console.log('[Snapshot] Capturing viewport via html-to-image...');
        const debugOverlay = doc.querySelector('.debug-overlay');
        const oldDisplay = debugOverlay && debugOverlay instanceof HTMLElement ? debugOverlay.style.display : '';
        if (debugOverlay && debugOverlay instanceof HTMLElement) debugOverlay.style.display = 'none';

        const dataUrl = await window.htmlToImage.toPng(viewport, {
          pixelRatio: 1,
          cacheBust: true,
          backgroundColor: 'transparent'
        });

        if (debugOverlay && debugOverlay instanceof HTMLElement) debugOverlay.style.display = oldDisplay;
        return dataUrl;
      }

      async function uploadSnapshot(dataUrl) {
        console.log('[Snapshot] Capture success, uploading to server...');
        const response = await fetch('/api/debug/html-render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ htmlRender: { format: 'png', dataUrl } })
        });
        const json = await response.json();
        console.log('[Snapshot] Server response:', json);
      }

      function updateFontCacheFromIR() {
        try {
          const cache0 = readFontCache();
          const irFontsRaw = getIrFontsFromState(state);
          const irFonts = normalizeIrFonts(irFontsRaw);
          const merged = mergeCacheWithIR(cache0, irFonts);
          writeFontCache(merged);
        } catch (e) {
          console.warn('[Snapshot] updateFontCacheFromIR failed:', e);
        }
      }

      async function captureHtmlRender() {
        const ctx = resolveSnapshotContext();
        if (!ctx) return;
        if (!ensureHtmlToImageLoaded()) return;

        const { win, doc, viewport } = ctx;

        try {
          await ensureFontsReady(win, doc);
          const dataUrl = await captureViewportToDataUrl(doc, viewport);
          await uploadSnapshot(dataUrl);
          updateFontCacheFromIR();
        } catch (e) {
          console.error('[Snapshot] Exception:', e);
        }
      }

      sidebarToggleBtn.addEventListener('click', () => {
        state.sidebarCollapsed = false;
        mainElement.classList.remove('sidebar-collapsed');
        localStorage.setItem('bridge-sidebar-collapsed', '0');
        update({ sidebarCollapsed: false });
      });

      document.querySelector('.left-sidebar').addEventListener('click', (e) => {
        const collapseBtn = e.target.closest('.sidebar-collapse-btn');
        if (collapseBtn) {
          state.sidebarCollapsed = true;
          mainElement.classList.add('sidebar-collapsed');
          localStorage.setItem('bridge-sidebar-collapsed', '1');
          update({ sidebarCollapsed: true });
        }
      });

      propertiesToggleBtn.addEventListener('click', () => {
        state.propertiesCollapsed = false;
        mainElement.classList.remove('properties-collapsed');
        localStorage.setItem('bridge-properties-collapsed', '0');
        update({ propertiesCollapsed: false });
      });

      propertiesCollapseBtn.addEventListener('click', () => {
        state.propertiesCollapsed = true;
        mainElement.classList.add('properties-collapsed');
        localStorage.setItem('bridge-properties-collapsed', '1');
        update({ propertiesCollapsed: true });
      });

(function initSidebar() {
        const saved = localStorage.getItem('bridge-sidebar-collapsed');
        if (saved === '1') {
          state.sidebarCollapsed = true;
          mainElement.classList.add('sidebar-collapsed');
        }
      })();

      (function initProperties() {
        const saved = localStorage.getItem('bridge-properties-collapsed');
        if (saved === '1') {
          state.propertiesCollapsed = true;
          mainElement.classList.add('properties-collapsed');
        }
      })();
      
(function initViewClasses() {
        const currentView = VIEW_CONFIG[state.currentView];
        if (currentView) {
          mainElement.classList.toggle('no-properties-view', !currentView.showProperties);
        }
      })();

      (function initBoundsVisibility() {
        const saved = localStorage.getItem('bridge-bounds-visible');
        state.boundsVisible = saved !== '0';
        if (toggleBoundsBtn) {
          toggleBoundsBtn.classList.toggle('active', state.boundsVisible);
        }
      })();

if (toggleBoundsBtn) {
  toggleBoundsBtn.addEventListener('click', () => {
    toggleRenderBounds(state, toggleBoundsBtn, update);
  });
}

if (toggleThemeBtn && themeIcon) {
  function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark');
    const newSrc = isDark ? '/icons/sun.svg' : '/icons/moon.svg';
    
    const iconElement = toggleThemeBtn.querySelector('[data-colorized="1"]') || themeIcon;
    
    if (iconElement.tagName === 'SPAN') {
      const currentStyle = iconElement.getAttribute('style') || '';
      const updatedStyle = currentStyle
        .replace(/mask-image:\s*url\([^)]+\)/g, `mask-image: url(${newSrc})`)
        .replace(/-webkit-mask-image:\s*url\([^)]+\)/g, `-webkit-mask-image: url(${newSrc})`);
      iconElement.setAttribute('style', updatedStyle);
    } else {
      themeIcon.src = newSrc;
    }
  }
  
  updateThemeIcon();
  
  toggleThemeBtn.addEventListener('click', () => {
    const currentTheme = document.body.classList.contains('dark') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const settings = getCurrentSettings();
    applyTheme(newTheme, settings);
    updateThemeIcon();
  });
}

window.addEventListener('resize', () => fit(previewFrame, stageWrap, state, () => updateStrokeScale(overlayHost, previewFrame, state.scale)));
      if (window.ResizeObserver && stageWrap) {
  const ro = new ResizeObserver(() => fit(previewFrame, stageWrap, state, () => updateStrokeScale(overlayHost, previewFrame, state.scale)));
        ro.observe(stageWrap);
      }

if (layersList) {
        layersList.addEventListener('click', (e) => {
          let el = e.target;
          while (el && el.nodeType !== 1) el = el.parentNode;
          while (el && el.nodeType === 1 && !el.classList.contains('item')) el = el.parentElement;
          if (!el || !el.dataset) {
      clearSelection(previewFrame, layersList, (id) => {
        state.selectedLayerId = null;
        updatePropertiesPanel(id, state, propertiesContent);
      });
            return;
          }
          const id = el.dataset.layerId;
    if (id) {
      selectLayer(id, previewFrame, (layerId) => {
        state.selectedLayerId = layerId;
        selectLayerById(layerId, layersList, (id) => updatePropertiesPanel(id, state, propertiesContent));
      });
    } else {
      clearSelection(previewFrame, layersList, (id) => {
        state.selectedLayerId = null;
        updatePropertiesPanel(id, state, propertiesContent);
      });
    }
  });
}

      if (layerFilter) {
        layerFilter.addEventListener('input', (e) => {
          const target = e.target || {};
    filterLayers(target.value || '', layersList);
        });
      }

if (searchToggleBtn && layersView && layersFilter && layerFilter) {
        const layersHeader = layersView.querySelector('.sidebar-header');
        
        searchToggleBtn.addEventListener('click', () => {
          if (layersHeader) layersHeader.classList.add('hidden');
          layersFilter.classList.add('active');
          layerFilter.focus();
        });

        layerFilter.addEventListener('blur', () => {
          if (!layerFilter.value.trim()) {
            layersFilter.classList.remove('active');
            if (layersHeader) layersHeader.classList.remove('hidden');
          }
        });

        layerFilter.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            layerFilter.value = '';
            filterLayers('', layersList);
            layersFilter.classList.remove('active');
            if (layersHeader) layersHeader.classList.remove('hidden');
          }
        });
      }

if (stageWrap) {
  stageWrap.addEventListener('click', (e) => {
    if (e.target === stageWrap) {
      clearSelection(previewFrame, layersList, (id) => {
        state.selectedLayerId = null;
        updatePropertiesPanel(id, state, propertiesContent);
      });
    }
  });
}

if (mainElement) {
  mainElement.addEventListener('click', (e) => {
    if (e.target === mainElement) {
      clearSelection(previewFrame, layersList, (id) => {
        state.selectedLayerId = null;
        updatePropertiesPanel(id, state, propertiesContent);
      });
    }
  });
}


if (propertiesContent) {
  propertiesContent.addEventListener('click', (e) => {
    if (e.target === propertiesContent) {
      clearSelection(previewFrame, layersList, (id) => {
        state.selectedLayerId = null;
        updatePropertiesPanel(id, state, propertiesContent);
      });
          }
        });
      }

function switchView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.activity-btn').forEach(btn => btn.classList.remove('active'));

  Object.values(VIEW_CONFIG).forEach(v => {
    v.sidebar && v.sidebar.classList.add('hidden');
    v.content && v.content.classList.add('hidden');
  });

  const view = VIEW_CONFIG[viewName];
  if (!view) return;
  view.btn && view.btn.classList.add('active');
  view.sidebar && view.sidebar.classList.remove('hidden');
  view.content && view.content.classList.remove('hidden');
  
  mainElement.classList.toggle('no-properties-view', !view.showProperties);
  
  if (window.toolbarManager) {
    window.toolbarManager.switchView(viewName);
  }
  
  if (typeof view.onEnter === 'function') view.onEnter();
}

async function loadFiles() {
  try {
    const response = await fetch('/api/files');
    const files = await response.json();
    state.files = files;
    renderFileTree(files);
  } catch (error) {
    console.error('Failed to load files:', error);
    fileTree.innerHTML = '<div class="empty">Failed to load files</div>';
  }
}

function renderFileTree(files) {
  if (!files || files.length === 0) {
    fileTree.innerHTML = '<div class="empty">No files found</div>';
    return;
  }
  
  const html = files.map(file => `
    <div class="file-item" data-file="${file.path}">
      <img class="file-icon" src="${getFileIcon(file.name)}" alt="">
      <span>${file.name}</span>
    </div>
  `).join('');
  
  fileTree.innerHTML = html;
  
  fileTree.querySelectorAll('.file-item').forEach(item => {
    item.addEventListener('click', () => {
      const filePath = item.dataset.file;
      loadFileContent(filePath);

      fileTree.querySelectorAll('.file-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
    });
  });

  requestAnimationFrame(() => {
    const firstHtmlFile = files.find(f => f.name.toLowerCase().endsWith('.html'));
    if (firstHtmlFile) {
      const firstHtmlItem = fileTree.querySelector(`[data-file="${firstHtmlFile.path}"]`);
      if (firstHtmlItem) {
        firstHtmlItem.click();
      }
    }
  });
}

async function loadFileContent(filePath) {
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(filePath)}`);
    const data = await response.json();

    state.selectedFile = filePath;
    codeFilename.textContent = filePath;
    codeContent.textContent = data.content;

    const ext = filePath.split('.').pop().toLowerCase();
    const languageMap = {
      'html': 'language-html',
      'css': 'language-css',
      'json': 'language-json'
    };
    codeContent.className = languageMap[ext] || 'language-html';

    delete codeContent.dataset.highlighted;
    hljs.highlightElement(codeContent);

    if (typeof hljs.lineNumbersBlock === 'function') {
      hljs.lineNumbersBlock(codeContent);
    }
  } catch (error) {
    console.error('Failed to load file:', error);
    codeContent.textContent = 'Failed to load file content';
  }
}

async function loadDslFiles() {
  try {
    const response = await fetch('/api/dsl/files');
    const files = await response.json();
    state.dslFiles = files;
    renderDslFileTree(files);
  } catch (error) {
    console.error('Failed to load DSL files:', error);
    if (dslFileTree) {
      dslFileTree.innerHTML = '<div class="empty">Failed to load DSL files</div>';
    }
  }
}

function renderDslFileTree(files) {
  if (!dslFileTree) return;

  if (files.length === 0) {
    dslFileTree.innerHTML = '<div class="empty">No DSL files found</div>';
    return;
  }

  dslFileTree.innerHTML = '';

  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.file = file.path;
    item.innerHTML = `
      <div class="file-item-content">
        <img src="/icons/file-html.svg" alt="HTML" class="file-icon">
        <span class="file-name">${file.name}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      dslFileTree.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      loadDslFileContent(file.name);
    });

    dslFileTree.appendChild(item);
  });

  requestAnimationFrame(() => {
    if (files.length > 0) {
      const firstItem = dslFileTree.querySelector('.file-item');
      if (firstItem) {
        firstItem.click();
      }
    }
  });
}

async function loadDslFileContent(filename) {
  try {
    state.selectedDslFile = filename;

    const response = await fetch(`/api/dsl/${encodeURIComponent(filename)}`);
    const data = await response.json();
    const htmlContent = data.content;

    if (dslDirectFrame) {
      const baseUrl = window.location.origin;
      const baseHref = data.baseHref || '/';
      const fullHtml = htmlContent.replace(/<head>/i, `<head><base href="${baseUrl}${baseHref}">`);
      dslDirectFrame.setAttribute('srcdoc', fullHtml);
    }

    const compositionResponse = await fetch('/api/dsl/composition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: htmlContent, filename })
    });

    if (!compositionResponse.ok) {
      throw new Error('Failed to convert DSL to composition');
    }

    const { composition } = await compositionResponse.json();

    console.log('[DEBUG] Sending composition to /api/composition:', {
      compositionType: typeof composition,
      compositionKeys: composition ? Object.keys(composition) : null,
      hasChildren: composition && composition.children ? composition.children.length : 0
    });

    const compositionForRender = composition && typeof composition === 'object'
      ? { ...composition, _bridgeSource: 'dsl' }
      : composition;

    const renderResponse = await fetch('/api/composition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ composition: compositionForRender })
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error('[DEBUG] Render failed:', {
        status: renderResponse.status,
        statusText: renderResponse.statusText,
        errorBody: errorText
      });
      throw new Error(`Failed to render composition: ${renderResponse.status} - ${errorText}`);
    }

  } catch (error) {
    console.error('Failed to load DSL file:', error);
  }
}

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    state.debugMode = config.debugMode;

    if (dslBtn) {
      if (config.debugMode) {
        dslBtn.classList.remove('hidden');
      } else {
        dslBtn.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

if (settingsNav && settingsContentScroll) {
  settingsNav.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item');
    if (!navItem) return;
    
    const section = navItem.dataset.section;
    const targetSection = document.querySelector(`[data-section="${section}"].settings-section`);
    
    if (targetSection) {
      settingsNav.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      navItem.classList.add('active');
      
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

Object.entries(VIEW_CONFIG).forEach(([name, cfg]) => {
  cfg.btn && cfg.btn.addEventListener('click', () => switchView(name));
});

window.toolbarManager = new ToolbarManager();
window.toolbarManager.init();

initSettings();

document.addEventListener('toolbar-action', (e) => {
  const { action } = e.detail;
  
  switch (action) {
    case 'toggleTheme':
      const currentTheme = document.body.classList.contains('dark') ? 'dark' : 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      const settings = getCurrentSettings();
      applyTheme(newTheme, settings);
      
      const isDark = newTheme === 'dark';
      const icon = isDark ? 'sun.svg' : 'moon.svg';
      window.toolbarManager.updateButton('toggleTheme', { icon });
      break;
      
    case 'toggleBounds':
      toggleRenderBounds(state, document.getElementById('toggleBounds'), update);
      break;
      
    case 'toggleSidebar':
      if (sidebarToggleBtn) sidebarToggleBtn.click();
      break;
      
    case 'toggleProperties':
      if (propertiesToggleBtn) propertiesToggleBtn.click();
      break;
  }
});

window.addEventListener('settings-changed', (e) => {
});

loadConfig();
connect();
