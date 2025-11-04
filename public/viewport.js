function getPreviewDoc(previewFrame) {
  return (previewFrame && previewFrame.contentDocument) ? previewFrame.contentDocument : null;
}

export function fit(previewFrame, stageWrap, state, updateStrokeScaleCallback) {
  if (!previewFrame || !stageWrap || !state.baseWidth || !state.baseHeight) return;
  const rect = stageWrap.getBoundingClientRect();
  const baseW = state.baseWidth;
  const baseH = state.baseHeight;
  const scale = Math.min(rect.width / baseW, rect.height / baseH);
  const scaledW = baseW * scale;
  const scaledH = baseH * scale;
  const offsetX = Math.max(0, (rect.width - scaledW) / 2);
  const offsetY = 0;
  previewFrame.style.width = baseW + 'px';
  previewFrame.style.height = baseH + 'px';
  previewFrame.style.transform = 'scale(' + scale + ')';
  previewFrame.style.left = offsetX + 'px';
  previewFrame.style.top = offsetY + 'px';
  state.scale = scale;
  if (updateStrokeScaleCallback) updateStrokeScaleCallback();
}

export function updateStrokeScale(overlayHost, previewFrame, scale) {
  if (overlayHost) overlayHost.style.setProperty('--bridge-scale', String(scale));
  
  const doc = getPreviewDoc(previewFrame);
  if (doc && doc.documentElement) {
    doc.documentElement.style.setProperty('--bridge-scale', String(scale));
  }
}

export function updateDebugOverlayVisibility(overlayHost, previewFrame, boundsVisible) {
  const alpha = boundsVisible ? '0.25' : '0';
  if (overlayHost) overlayHost.style.setProperty('--bridge-debug-alpha', alpha);
  
  const doc = getPreviewDoc(previewFrame);
  if (doc && doc.documentElement) {
    doc.documentElement.style.setProperty('--bridge-debug-alpha', alpha);
  }
}

export function toggleRenderBounds(state, toggleBoundsBtn, updateCallback) {
  const next = !state.boundsVisible;
  toggleBoundsBtn.classList.toggle('active', next);
  localStorage.setItem('bridge-bounds-visible', next ? '1' : '0');
  state.boundsVisible = next;
  if (updateCallback) updateCallback({ boundsVisible: next });
}
