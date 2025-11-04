const TOOLBAR_CONFIGS = {
  layers: {
    left: [],
    right: [
      { id: 'toggleBounds', icon: 'layout-grid.svg', title: 'Toggle Debug Overlay', i18nKey: 'toolbar.debug', action: 'toggleBounds' },
      { id: 'toggleTheme', icon: 'moon.svg', title: 'Toggle Theme', i18nKey: 'toolbar.theme', action: 'toggleTheme', dynamic: true }
    ]
  },
  files: {
    left: [],
    right: [
      { id: 'openDirectory', icon: 'folder-open.svg', title: 'Open in File Manager', i18nKey: 'toolbar.openDirectory', action: 'openDirectory' },
      { id: 'copyCode', icon: 'copy.svg', title: 'Copy Code', i18nKey: 'toolbar.copyCode', action: 'copyCode' },
      { id: 'toggleTheme', icon: 'moon.svg', title: 'Toggle Theme', i18nKey: 'toolbar.theme', action: 'toggleTheme', dynamic: true }
    ]
  },
  settings: {
    left: [],
    right: [
      { id: 'toggleTheme', icon: 'moon.svg', title: 'Toggle Theme', i18nKey: 'toolbar.theme', action: 'toggleTheme', dynamic: true }
    ]
  }
};

const TOOLBAR_ACTIONS = {
  toggleTheme: () => {
    const event = new CustomEvent('toolbar-action', { detail: { action: 'toggleTheme' } });
    document.dispatchEvent(event);
  },
  toggleBounds: () => {
    const event = new CustomEvent('toolbar-action', { detail: { action: 'toggleBounds' } });
    document.dispatchEvent(event);
  },
  openDirectory: async () => {
    const codeFilename = document.getElementById('codeFilename');
    if (!codeFilename) return;
    
    const filePath = codeFilename.textContent;
    if (!filePath || filePath === 'No file selected') return;
    
    try {
      const response = await fetch('/api/open-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        console.error('Failed to open directory:', result.error);
        return;
      }
      
      const btn = document.getElementById('openDirectory');
      if (!btn) return;
      
      btn.style.backgroundColor = '#7ee787';
      const originalTitle = btn.title;
      const openedText = (window.i18n && typeof window.i18n.translate === 'function')
        ? window.i18n.translate('toolbar.opened')
        : 'Opened!';
      btn.title = openedText;
      
      setTimeout(() => {
        btn.style.backgroundColor = '';
        btn.title = originalTitle;
      }, 300);
    } catch (err) {
      console.error('Failed to open directory:', err);
    }
  },
  copyCode: async () => {
    const codeContent = document.getElementById('codeContent');
    if (!codeContent) return;
    
    const text = codeContent.textContent;
    
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById('copyCode');
      if (!btn) return;
      
      btn.style.backgroundColor = '#7ee787';
      const copiedText = (window.i18n && typeof window.i18n.translate === 'function')
        ? window.i18n.translate('toolbar.copied')
        : 'Copied!';
      btn.title = copiedText;
      
      setTimeout(() => {
        btn.style.backgroundColor = '';
        const copyTitle = (window.i18n && typeof window.i18n.translate === 'function')
          ? window.i18n.translate('toolbar.copyCode')
          : 'Copy Code';
        btn.title = copyTitle;
      }, 300);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }
};

class ToolbarManager {
  constructor() {
    this.currentView = 'layers';
    this.toolbarLeft = document.querySelector('.toolbar-left');
    this.toolbarRight = document.querySelector('.toolbar-right');
    this.sidebarToggle = null;
    this.propertiesToggle = null;
  }

  init() {
    this.extractFixedButtons();
    this.render(this.currentView);
  }

  extractFixedButtons() {
    const sidebarBtn = document.getElementById('sidebarToggle');
    const propertiesBtn = document.getElementById('propertiesToggle');
    
    if (sidebarBtn) {
      this.sidebarToggle = sidebarBtn.cloneNode(true);
    }
    if (propertiesBtn) {
      this.propertiesToggle = propertiesBtn.cloneNode(true);
    }
  }

  switchView(viewName) {
    if (this.currentView === viewName) return;
    this.currentView = viewName;
    this.render(viewName);
  }

  render(viewName) {
    const config = TOOLBAR_CONFIGS[viewName];
    if (!config) return;

    this.toolbarLeft.innerHTML = '';
    this.toolbarRight.innerHTML = '';

    if (this.sidebarToggle) {
      const clone = this.sidebarToggle.cloneNode(true);
      clone.addEventListener('click', () => {
        const event = new CustomEvent('toolbar-action', { detail: { action: 'toggleSidebar' } });
        document.dispatchEvent(event);
      });
      this.toolbarLeft.appendChild(clone);
    }

    config.left.forEach(item => {
      this.toolbarLeft.appendChild(this.createButton(item));
    });

    config.right.forEach(item => {
      this.toolbarRight.appendChild(this.createButton(item));
    });

    if (this.propertiesToggle) {
      const clone = this.propertiesToggle.cloneNode(true);
      clone.addEventListener('click', () => {
        const event = new CustomEvent('toolbar-action', { detail: { action: 'toggleProperties' } });
        document.dispatchEvent(event);
      });
      this.toolbarRight.appendChild(clone);
    }

    if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
      try { window.i18n.applyTranslations(); } catch {}
    }
  }

  createButton(item) {
    const btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.id = item.id;
    btn.title = item.title;
    if (item.i18nKey) btn.setAttribute('data-i18n', item.i18nKey);
    
    const img = document.createElement('img');
    img.src = `/icons/${item.icon}`;
    img.alt = item.title;
    if (item.i18nKey) img.setAttribute('data-i18n', item.i18nKey);
    
    if (item.id === 'toggleTheme') {
      const isDark = document.body.classList.contains('dark');
      img.src = isDark ? '/icons/sun.svg' : '/icons/moon.svg';
    }
    
    btn.appendChild(img);
    
    if (item.action && TOOLBAR_ACTIONS[item.action]) {
      btn.addEventListener('click', TOOLBAR_ACTIONS[item.action]);
    }
    
    return btn;
  }

  updateButton(buttonId, updates) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    
    if (updates.icon) {
      const icon = btn.querySelector('img, span[data-colorized="1"]');
      if (icon) {
        if (icon.tagName === 'IMG') {
          icon.src = `/icons/${updates.icon}`;
        } else {
          icon.style.maskImage = `url(/icons/${updates.icon})`;
          icon.style.webkitMaskImage = `url(/icons/${updates.icon})`;
        }
      }
    }
    
    if (updates.title) {
      btn.title = updates.title;
    }
  }
}

export default ToolbarManager;
