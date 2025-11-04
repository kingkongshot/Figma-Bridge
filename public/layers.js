function getTypeIcon(item) {
  const baseType = item.type.toUpperCase();
  
  if (item.svgContent) return 'path.svg';
  
  switch (baseType) {
    case 'FRAME': return 'frame-corners.svg';
    case 'TEXT': return 'text-t.svg';
    case 'RECTANGLE': return 'rectangle.svg';
    case 'ELLIPSE': return 'circle.svg';
    case 'GROUP': return 'folder.svg';
    case 'VECTOR': return 'path.svg';
    case 'COMPONENT': return 'cube.svg';
    case 'INSTANCE': return 'diamonds-four.svg';
    case 'LINE': return 'line-segment.svg';
    case 'POLYGON': return 'polygon.svg';
    case 'STAR': return 'star.svg';
    default: return 'square.svg';
  }
}

function createLayerElement(item, depth, hasChildren) {
  const li = document.createElement('li');
  li.className = depth > 0 ? `item indent-${depth}` : 'item';
  const name = item.name.trim() || item.id;
  const iconClass = getTypeIcon(item);
  
  const toggleBtn = hasChildren ? '<span class="toggle-btn">▼</span>' : '<span class="toggle-spacer"></span>';
  li.innerHTML = `${toggleBtn}<img src="/icons/${iconClass}" class="type-icon" alt=""><span class="item-name">${name}</span>`;
  li.dataset.layerId = item.id;
  
  return li;
}

function attachLayerEvents(element, layerId, highlightCallback, clearHighlightCallback) {
  element.addEventListener('mouseenter', () => highlightCallback(layerId));
  element.addEventListener('mouseleave', () => clearHighlightCallback());
}

function renderNode(node, container, depth, highlightCallback, clearHighlightCallback) {
  if (node.visible === false) return;
  
  const children = (node.content?.type === 'children') ? node.content.nodes : [];
  const hasChildren = children.length > 0;
  
  const li = createLayerElement(node, depth, hasChildren);
  attachLayerEvents(li, node.id, highlightCallback, clearHighlightCallback);
  container.appendChild(li);
  
  if (hasChildren) {
    const ul = document.createElement('ul');
    ul.className = 'list children';
    container.appendChild(ul);
    
    for (const child of children) {
      renderNode(child, ul, depth + 1, highlightCallback, clearHighlightCallback);
    }
  }
}

export function buildLayers(ir, layersList, layerFilter, highlightCallback, clearHighlightCallback) {
  if (!layersList) return;
  layersList.innerHTML = '';
  
  const nodes = ir?.nodes ?? [];
  for (const node of nodes) {
    renderNode(node, layersList, 0, highlightCallback, clearHighlightCallback);
  }
  
  attachToggleEvents(layersList);
  
  if (layerFilter?.value) {
    filterLayers(layerFilter.value, layersList);
  }
}

export function selectLayerById(id, layersList, updatePropertiesCallback) {
  if (!layersList || !id) return;
  const items = layersList.querySelectorAll('.item');
  items.forEach((el) => el.classList.remove('selected'));
  const target = layersList.querySelector(`.item[data-layer-id="${CSS.escape(id)}"]`);
  if (target) {
    target.classList.add('selected');
    target.scrollIntoView({ block: 'nearest' });
  }
  if (updatePropertiesCallback) updatePropertiesCallback(id);
}

export function clearLayerSelection(layersList, updatePropertiesCallback) {
  if (!layersList) return;
  const items = layersList.querySelectorAll('.item.selected');
  items.forEach((el) => el.classList.remove('selected'));
  if (updatePropertiesCallback) updatePropertiesCallback(null);
}

export function filterLayers(query, layersList) {
  if (!layersList) return;
  const q = String(query ?? '').trim().toLowerCase();
  const items = layersList.querySelectorAll('.item');
  items.forEach((el) => {
    const text = (el.textContent ?? '').toLowerCase();
    el.style.display = (q === '' || text.includes(q)) ? '' : 'none';
  });
}

export function attachToggleEvents(layersList) {
  if (!layersList) return;
  const toggleBtns = layersList.querySelectorAll('.toggle-btn');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = btn.closest('.item');
      if (!item) return;
      
      const nextSibling = item.nextElementSibling;
      if (nextSibling && nextSibling.classList.contains('children')) {
        item.classList.toggle('collapsed');
      }
    });
  });
}
