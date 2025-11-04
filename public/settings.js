import { loadLanguages, getAvailableLanguages, loadTranslations, applyTranslations } from './i18n.js';

const SETTINGS_KEY = 'bridge-settings';
const THEME_KEY = 'bridge-preview-theme';
const defaultSettings = {
  colorBg: '#F3F4F1',
  colorFg: '#111111',
  textColorLight: '#111111',
  textColorDark: '#F3F4F1',
  language: 'en',
  useOnlineFonts: true
};

const COLOR_DEFAULTS = {
  light: {
    bg: '#F3F4F1',
    text: '#111111'
  },
  dark: {
    bg: '#111111',
    text: '#F3F4F1'
  }
};

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  syncSettingsToServer(settings);
}

async function syncSettingsToServer(settings) {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useOnlineFonts: settings.useOnlineFonts })
    });
  } catch (e) {
    console.warn('[Settings] Failed to sync to server:', e);
  }
}

function isValidHex(color) {
  return /^#[0-9A-F]{6}$/i.test(color);
}

function normalizeHex(input) {
  const cleaned = input.trim().toUpperCase();
  if (cleaned.startsWith('#')) return cleaned;
  return '#' + cleaned;
}

function adjustBrightness(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) + Math.round(255 * percent);
  const g = ((num >> 8) & 0x00FF) + Math.round(255 * percent);
  const b = (num & 0x0000FF) + Math.round(255 * percent);
  
  return '#' + (
    0x1000000 +
    (Math.max(0, Math.min(255, r)) << 16) +
    (Math.max(0, Math.min(255, g)) << 8) +
    Math.max(0, Math.min(255, b))
  ).toString(16).slice(1).toUpperCase();
}

function mixColors(color1, color2, weight1) {
  const num1 = parseInt(color1.replace('#', ''), 16);
  const num2 = parseInt(color2.replace('#', ''), 16);
  
  const r1 = num1 >> 16;
  const g1 = (num1 >> 8) & 0x00FF;
  const b1 = num1 & 0x0000FF;
  
  const r2 = num2 >> 16;
  const g2 = (num2 >> 8) & 0x00FF;
  const b2 = num2 & 0x0000FF;
  
  const weight2 = 1 - weight1;
  const r = Math.round(r1 * weight1 + r2 * weight2);
  const g = Math.round(g1 * weight1 + g2 * weight2);
  const b = Math.round(b1 * weight1 + b2 * weight2);
  
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function applyCustomColors(settings) {
  const root = document.documentElement;
  const isDark = document.body.classList.contains('dark');
  
  if (isDark) {
    const textColor = settings.textColorDark || COLOR_DEFAULTS.dark.text;
    const borderColor = mixColors(settings.colorFg, textColor, 0.7);
    root.style.setProperty('--bg', settings.colorFg);
    root.style.setProperty('--fg', textColor);
    root.style.setProperty('--border', borderColor);
    root.style.setProperty('--stage-bg', settings.colorFg);
    root.style.setProperty('--stage-border', textColor);
    root.style.setProperty('--button-bg', textColor);
    root.style.setProperty('--button-fg', settings.colorFg);
  } else {
    const textColor = settings.textColorLight || COLOR_DEFAULTS.light.text;
    const borderColor = mixColors(settings.colorBg, textColor, 0.7);
    root.style.setProperty('--bg', settings.colorBg);
    root.style.setProperty('--fg', textColor);
    root.style.setProperty('--border', borderColor);
    root.style.setProperty('--stage-bg', settings.colorBg);
    root.style.setProperty('--stage-border', textColor);
    root.style.setProperty('--button-bg', textColor);
    root.style.setProperty('--button-fg', settings.colorBg);
  }
}

function updateColorPreviews(settings) {
  const bgPreview = document.getElementById('colorBgPreview');
  if (bgPreview) bgPreview.style.backgroundColor = settings.colorBg;
  
  const fgPreview = document.getElementById('colorFgPreview');
  if (fgPreview) fgPreview.style.backgroundColor = settings.colorFg;
  
  const textLightPreview = document.getElementById('textColorLightPreview');
  if (textLightPreview) textLightPreview.style.backgroundColor = settings.textColorLight || COLOR_DEFAULTS.light.text;
  
  const textDarkPreview = document.getElementById('textColorDarkPreview');
  if (textDarkPreview) textDarkPreview.style.backgroundColor = settings.textColorDark || COLOR_DEFAULTS.dark.text;
}

function updateResetButtons(settings) {
  const resetBg = document.getElementById('resetColorBg');
  if (resetBg) resetBg.style.display = settings.colorBg !== COLOR_DEFAULTS.light.bg ? 'flex' : 'none';
  
  const resetFg = document.getElementById('resetColorFg');
  if (resetFg) resetFg.style.display = settings.colorFg !== COLOR_DEFAULTS.dark.bg ? 'flex' : 'none';
  
  const resetTextLight = document.getElementById('resetTextColorLight');
  if (resetTextLight) resetTextLight.style.display = settings.textColorLight !== COLOR_DEFAULTS.light.text ? 'flex' : 'none';
  
  const resetTextDark = document.getElementById('resetTextColorDark');
  if (resetTextDark) resetTextDark.style.display = settings.textColorDark !== COLOR_DEFAULTS.dark.text ? 'flex' : 'none';
}

function updateThemeUI() {
  const isDark = document.body.classList.contains('dark');
  const lightGroup = document.getElementById('lightColorGroup');
  const darkGroup = document.getElementById('darkColorGroup');
  
  if (lightGroup) lightGroup.style.display = isDark ? 'none' : 'block';
  if (darkGroup) darkGroup.style.display = isDark ? 'block' : 'none';
  
  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (isDark ? 'dark' : 'light'));
  });
}

function renderLanguageButtons(container, currentLanguage) {
  if (!container) return;

  container.innerHTML = '';
  const languages = getAvailableLanguages();

  if (languages.length === 0) {
    languages.push({ code: 'en', name: 'English' }, { code: 'zh', name: '中文' });
  }

  languages.forEach(lang => {
    const button = document.createElement('button');
    button.className = 'setting-option';
    button.setAttribute('data-lang', lang.code);
    if (lang.code === currentLanguage) {
      button.classList.add('active');
    }

    const nameSpan = document.createElement('span');
    nameSpan.textContent = lang.name;
    button.appendChild(nameSpan);

    const checkSpan = document.createElement('span');
    checkSpan.className = 'check';
    checkSpan.textContent = '✓';
    button.appendChild(checkSpan);

    container.appendChild(button);
  });
}

function updateSettingsUI(settings) {
  const bgInput = document.getElementById('colorBg');
  if (bgInput) bgInput.value = settings.colorBg;

  const fgInput = document.getElementById('colorFg');
  if (fgInput) fgInput.value = settings.colorFg;

  const textLightInput = document.getElementById('textColorLight');
  if (textLightInput) textLightInput.value = settings.textColorLight || COLOR_DEFAULTS.light.text;

  const textDarkInput = document.getElementById('textColorDark');
  if (textDarkInput) textDarkInput.value = settings.textColorDark || COLOR_DEFAULTS.dark.text;

  updateColorPreviews(settings);
  updateResetButtons(settings);
  updateThemeUI();

  document.querySelectorAll('[data-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === settings.language);
  });

  const fontToggle = document.getElementById('useOnlineFontsToggle');
  if (fontToggle) {
    const isEnabled = settings.useOnlineFonts !== false;
    fontToggle.classList.toggle('active', isEnabled);
    const span = fontToggle.querySelector('span:first-child');
    if (span) {
      span.setAttribute('data-i18n', isEnabled ? 'preferences.enabled' : 'preferences.disabled');
      applyTranslations();
    }
  }
}

function setupColorInput(inputId, previewId, settingKey, currentSettings) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  
  if (!input) return;
  
  input.addEventListener('input', (e) => {
    const normalized = normalizeHex(e.target.value);
    if (isValidHex(normalized)) {
      currentSettings[settingKey] = normalized;
      saveSettings(currentSettings);
      applyCustomColors(currentSettings);
      updateColorPreviews(currentSettings);
      updateSettingsUI(currentSettings);
    }
  });
  
  input.addEventListener('blur', (e) => {
    const normalized = normalizeHex(e.target.value);
    if (!isValidHex(normalized)) {
      e.target.value = currentSettings[settingKey];
    } else {
      e.target.value = normalized;
    }
  });
}

export function applyTheme(mode, settings) {
  const highlightTheme = document.getElementById('highlightTheme');
  if (mode === 'dark') {
    document.body.classList.add('dark');
    if (highlightTheme) {
      highlightTheme.href = '/libs/styles/github-dark.min.css';
    }
  } else {
    document.body.classList.remove('dark');
    if (highlightTheme) {
      highlightTheme.href = '/libs/styles/github.min.css';
    }
  }
  localStorage.setItem(THEME_KEY, mode);
  if (settings) {
    updateThemeUI();
    applyCustomColors(settings);
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
  }
}

let currentSettings = null;

export function getCurrentSettings() {
  return currentSettings;
}

export async function initSettings() {
  currentSettings = loadSettings();

  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark' ? 'dark' : 'light', null);

  applyCustomColors(currentSettings);
  syncSettingsToServer(currentSettings);

  await loadLanguages();
  const languageContainer = document.getElementById('languageButtons');
  if (languageContainer) {
    renderLanguageButtons(languageContainer, currentSettings.language);
  }

  await loadTranslations(currentSettings.language || 'en');
  applyTranslations();

  document.addEventListener('click', (e) => {
    const themeBtn = e.target.closest('[data-theme]');
    if (themeBtn) {
      const theme = themeBtn.dataset.theme;
      applyTheme(theme, currentSettings);
      updateSettingsUI(currentSettings);
    }
  });

  document.addEventListener('click', async (e) => {
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) {
      const newLang = langBtn.dataset.lang;
      if (newLang !== currentSettings.language) {
        currentSettings.language = newLang;
        saveSettings(currentSettings);
        await loadTranslations(newLang);
        applyTranslations();
        updateSettingsUI(currentSettings);
      }
    }
  });

  setupColorInput('colorBg', 'colorBgPreview', 'colorBg', currentSettings);
  setupColorInput('colorFg', 'colorFgPreview', 'colorFg', currentSettings);
  setupColorInput('textColorLight', 'textColorLightPreview', 'textColorLight', currentSettings);
  setupColorInput('textColorDark', 'textColorDarkPreview', 'textColorDark', currentSettings);
  
  document.addEventListener('click', (e) => {
    const resetBtn = e.target.closest('[data-reset-color]');
    if (resetBtn) {
      const colorKey = resetBtn.dataset.resetColor;
      const defaults = {
        colorBg: COLOR_DEFAULTS.light.bg,
        colorFg: COLOR_DEFAULTS.dark.bg,
        textColorLight: COLOR_DEFAULTS.light.text,
        textColorDark: COLOR_DEFAULTS.dark.text
      };
      
      if (defaults[colorKey]) {
        currentSettings[colorKey] = defaults[colorKey];
        saveSettings(currentSettings);
        applyCustomColors(currentSettings);
        updateSettingsUI(currentSettings);
      }
    }
  });

  const fontToggle = document.getElementById('useOnlineFontsToggle');
  if (fontToggle) {
    fontToggle.addEventListener('click', () => {
      currentSettings.useOnlineFonts = !currentSettings.useOnlineFonts;
      saveSettings(currentSettings);
      updateSettingsUI(currentSettings);
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: currentSettings }));
    });
  }
  
  setTimeout(() => {
    updateSettingsUI(currentSettings);
  }, 100);

  initCacheManagement();

  return currentSettings;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export async function loadCacheStats() {
  try {
    const response = await fetch('/api/cache/stats');
    const stats = await response.json();

    document.getElementById('cacheImagesCount').textContent = stats.images.count;
    document.getElementById('cacheImagesSize').textContent = formatBytes(stats.images.totalSize);

    document.getElementById('cacheSvgsCount').textContent = stats.svgs.count;
    document.getElementById('cacheSvgsSize').textContent = formatBytes(stats.svgs.totalSize);

    document.getElementById('cacheTotalCount').textContent = stats.total.count;
    document.getElementById('cacheTotalSize').textContent = formatBytes(stats.total.totalSize);
  } catch (e) {
    console.error('[Cache] Failed to load stats:', e);
  }
}

async function clearCacheHandler() {
  const btn = document.getElementById('clearCacheBtn');
  if (!btn) return;

  if (!confirm('Are you sure you want to clear all cached files? They will be re-fetched from Figma when needed.')) {
    return;
  }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Clearing...';

  try {
    const response = await fetch('/api/cache/clear', { method: 'POST' });
    const result = await response.json();

    if (result.errors > 0) {
      console.warn('[Cache] Cleared with errors:', result);
      alert(`Cache cleared with ${result.errors} errors. ${result.deleted} files deleted.`);
    }

    await loadCacheStats();
  } catch (e) {
    console.error('[Cache] Failed to clear cache:', e);
    alert('Failed to clear cache: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Clear Cache';
  }
}

function initCacheManagement() {
  const clearBtn = document.getElementById('clearCacheBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearCacheHandler);
  }

  const settingsNav = document.getElementById('settingsNav');
  if (settingsNav) {
    settingsNav.addEventListener('click', (e) => {
      const navItem = e.target.closest('[data-section="cache"]');
      if (navItem) {
        loadCacheStats();
      }
    });
  }
}

