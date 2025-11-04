function colorizeIcons() {
  const selectors = [
    '.sidebar-search-btn img',
    '.sidebar-collapse-btn img',
    '.list .type-icon',
    '.file-icon',
    '.toolbar-btn img',
    '.activity-btn img',
    '.properties .align-btn img',
    '.properties .flow-btn img',
    '.properties .prop-input-group .input-icon',
    '.properties .prop-icon-btn img',
    '.properties .align-grid-btn img',
    '.about-qr .qr-image'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(img => {
    if (img.dataset.colorized === '1' || img.tagName !== 'IMG') return;
    
    const src = img.getAttribute('src');
    if (!src) return;

    const mask = document.createElement('span');
    mask.className = img.className;
    
    const computedStyle = getComputedStyle(img);
    const width = computedStyle.width;
    const height = computedStyle.height;
    
    let originalStyle = '';
    if (img.hasAttribute('style')) {
      originalStyle = img.getAttribute('style');
    }
    
    const maskStyles = [
      'display: inline-block',
      `width: ${width}`,
      `height: ${height}`,
      'background-color: var(--fg)',
      `mask-image: url(${src})`,
      `-webkit-mask-image: url(${src})`,
      'mask-size: contain',
      '-webkit-mask-size: contain',
      'mask-repeat: no-repeat',
      '-webkit-mask-repeat: no-repeat',
      'mask-position: center',
      '-webkit-mask-position: center'
    ];
    
    const fullStyle = originalStyle ? maskStyles.join('; ') + '; ' + originalStyle : maskStyles.join('; ');
    mask.setAttribute('style', fullStyle);
    
    Array.from(img.attributes).forEach(attr => {
      if (attr.name !== 'src' && attr.name !== 'class' && attr.name !== 'style') {
        mask.setAttribute(attr.name, attr.value);
      }
    });
    
    mask.dataset.colorized = '1';
    
    img.replaceWith(mask);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', colorizeIcons);
} else {
  colorizeIcons();
}

window.addEventListener('settings-changed', () => {
  setTimeout(colorizeIcons, 50);
});

window.addEventListener('translations-applied', () => {
  setTimeout(colorizeIcons, 50);
});

const observer = new MutationObserver((mutations) => {
  let shouldColorize = false;
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1 && (node.tagName === 'IMG' || node.querySelector('img'))) {
        shouldColorize = true;
      }
    });
  });
  if (shouldColorize) {
    setTimeout(colorizeIcons, 0);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
