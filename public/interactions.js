function getPreviewDoc(previewFrame) {
  return (previewFrame && previewFrame.contentDocument) ? previewFrame.contentDocument : null;
}

function getElementByLayerId(id, previewFrame) {
  const doc = getPreviewDoc(previewFrame);
  if (!doc || !id) return null;
  const root = doc.querySelector(`.debug-overlay .debug-box[data-layer-id="${CSS.escape(id)}"], .debug-overlay .debug-svg[data-layer-id="${CSS.escape(id)}"]`);
  if (!root) return null;
  if (root.classList.contains('has-wrapper')) {
    if (root.classList.contains('debug-svg')) return root;
    const inner = root.querySelector(':scope > .debug-box, :scope > .debug-svg');
    if (inner) return inner;
  }
  return root;
}

export function highlightByLayerId(id, previewFrame) {
  if (!id) return;
  const doc = getPreviewDoc(previewFrame);
  if (!doc) return;
  const prevs = doc.querySelectorAll('.debug-overlay .debug-box.is-hover, .debug-overlay .debug-svg.is-hover');
  prevs.forEach((el) => el.classList.remove('is-hover'));
  const target = getElementByLayerId(id, previewFrame);
  if (target) target.classList.add('is-hover');
}

export function clearHighlight(previewFrame) {
  const doc = getPreviewDoc(previewFrame);
  if (!doc) return;
  const prevs = doc.querySelectorAll('.debug-overlay .debug-box.is-hover, .debug-overlay .debug-svg.is-hover');
  prevs.forEach((el) => el.classList.remove('is-hover'));
}

function applySelectionHighlight(id, previewFrame) {
  const doc = getPreviewDoc(previewFrame);
  if (!doc) return;
  const prevSelList = doc.querySelectorAll('.debug-overlay .debug-box.is-selected, .debug-overlay .debug-svg.is-selected');
  prevSelList.forEach((el) => el.classList.remove('is-selected'));
  const target = getElementByLayerId(id, previewFrame);
  if (target) target.classList.add('is-selected');
}

export function selectLayer(id, previewFrame, selectLayerByIdCallback) {
  if (!id) return;
  applySelectionHighlight(id, previewFrame);
  if (selectLayerByIdCallback) selectLayerByIdCallback(id);
}

export function clearSelection(previewFrame, layersList, updatePropertiesCallback) {
  const doc = getPreviewDoc(previewFrame);
  if (!doc) return;
  const prevSel = doc.querySelector('.debug-overlay .debug-box.is-selected, .debug-overlay .debug-svg.is-selected');
  if (prevSel) prevSel.classList.remove('is-selected');
  if (layersList) {
    const prevItem = layersList.querySelector('.item.selected');
    if (prevItem) prevItem.classList.remove('selected');
  }
  const prevHover = doc.querySelector('.debug-overlay .debug-box.is-hover, .debug-overlay .debug-svg.is-hover');
  if (prevHover) prevHover.classList.remove('is-hover');
  if (updatePropertiesCallback) updatePropertiesCallback(null);
}

export function attachPreviewInteractions(previewFrame, callbacks) {
  const { highlightCallback, clearHighlightCallback, selectCallback, clearSelectionCallback, controller } = callbacks;
  const doc = getPreviewDoc(previewFrame);
  if (!doc) {
    console.warn('[Preview] Cannot attach interactions: doc is null');
    return;
  }

  const debugOverlay = doc.querySelector('.debug-overlay');
  if (!debugOverlay) {
    console.warn('[Preview] No .debug-overlay found; interactions disabled');
    return;
  }

  if (controller.current) controller.current.abort();
  controller.current = new AbortController();
  const eventOptions = { signal: controller.current.signal };

  console.log('[Preview] Attaching preview interactions to iframe');

  const DEBUG_NODE_SELECTOR = '.debug-box[data-layer-id], .debug-svg[data-layer-id]';
  const getDebugNode = (el) => el.closest(DEBUG_NODE_SELECTOR);
  const getLayerId = (el) => {
    const node = getDebugNode(el);
    return node ? node.dataset.layerId : null;
  };

  const handleMouseOver = (e) => {
    const layerId = getLayerId(e.target);
    if (layerId) highlightCallback(layerId);
  };

  const handleMouseOut = (e) => {
    const layerId = getLayerId(e.target);
    if (!layerId) return;

    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || !getDebugNode(relatedTarget)) {
      clearHighlightCallback();
    }
  };

  const handleClick = (e) => {
    const layerId = getLayerId(e.target);
    if (layerId) {
      e.stopPropagation();
      selectCallback(layerId);
    } else {
      clearSelectionCallback();
    }
  };

  const isDebugNode = (el) => !!getDebugNode(el);
  const handleBodyClick = (e) => {
    if (!isDebugNode(e.target)) clearSelectionCallback();
  };

  debugOverlay.addEventListener('mouseover', handleMouseOver, eventOptions);
  debugOverlay.addEventListener('mouseout', handleMouseOut, eventOptions);
  debugOverlay.addEventListener('click', handleClick, eventOptions);
  doc.body.addEventListener('click', handleBodyClick, eventOptions);

  console.log('[Preview] Preview interactions attached successfully');
}
