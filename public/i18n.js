let availableLanguages = [];
let currentTranslations = {};
let currentLanguage = 'en';
let englishTranslations = {};
let englishLoaded = false;

export async function loadLanguages() {
  try {
    const response = await fetch('/api/languages');
    if (!response.ok) {
      console.warn('[i18n] Failed to load languages, using defaults');
      availableLanguages = [
        { code: 'en', name: 'English' },
        { code: 'zh', name: '中文' }
      ];
      return availableLanguages;
    }
    const languages = await response.json();
    availableLanguages = Array.isArray(languages) && languages.length > 0
      ? languages
      : [{ code: 'en', name: 'English' }, { code: 'zh', name: '中文' }];
    return availableLanguages;
  } catch (error) {
    console.error('[i18n] Error loading languages:', error);
    availableLanguages = [
      { code: 'en', name: 'English' },
      { code: 'zh', name: '中文' }
    ];
    return availableLanguages;
  }
}

export function getAvailableLanguages() {
  return availableLanguages;
}

async function fetchTranslationsFor(languageCode) {
  try {
    const response = await fetch(`/api/languages/${languageCode}`);
    if (!response.ok) return null;
    const data = await response.json();
    return (data && data.translations) ? data.translations : null;
  } catch (error) {
    console.error(`[i18n] Error fetching translations for ${languageCode}:`, error);
    return null;
  }
}

export async function loadTranslations(languageCode) {
  // Always ensure English base is loaded for fallback
  if (!englishLoaded) {
    const en = await fetchTranslationsFor('en');
    if (en) {
      englishTranslations = en;
      englishLoaded = true;
    } else {
      console.warn('[i18n] Failed to load base English translations');
    }
  }

  const tr = await fetchTranslationsFor(languageCode);
  if (!tr) {
    if (languageCode !== 'en') {
      // Fallback to en as the only fallback source
      if (englishLoaded) {
        currentTranslations = englishTranslations;
        currentLanguage = 'en';
        return true;
      }
    }
    return false;
  }
  currentTranslations = tr;
  currentLanguage = languageCode;
  return true;
}

export function translate(key, _fallbackIgnored) {
  const fromCurrent = currentTranslations[key];
  if (fromCurrent !== undefined && fromCurrent !== null && fromCurrent !== '') {
    return fromCurrent;
  }
  const fromEnglish = englishTranslations[key];
  if (fromEnglish !== undefined && fromEnglish !== null && fromEnglish !== '') {
    return fromEnglish;
  }
  // As a last resort, return the key so missing items are visible during dev.
  return key;
}

export function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');

  console.log('[i18n] Applying translations to', elements.length, 'elements');

  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (!key) return;

    const translatedText = translate(key);

    if (element.hasAttribute('placeholder')) {
      element.setAttribute('placeholder', translatedText);
    } else if (element.hasAttribute('title')) {
      element.setAttribute('title', translatedText);
    } else if (element.hasAttribute('alt')) {
      element.setAttribute('alt', translatedText);
    } else {
      element.textContent = translatedText;
    }
  });

  window.dispatchEvent(new CustomEvent('translations-applied', {
    detail: { language: currentLanguage }
  }));
}

export function getCurrentLanguage() {
  return currentLanguage;
}

export async function initI18n(initialLanguage = 'en') {
  await loadLanguages();
  const success = await loadTranslations(initialLanguage);
  if (success) {
    applyTranslations();
  }
  return success;
}

window.i18n = {
  loadLanguages,
  getAvailableLanguages,
  loadTranslations,
  translate,
  applyTranslations,
  getCurrentLanguage,
  initI18n
};
