// i18n — barrel export for @pdxui/core/i18n sub-path

// Locale management
export { getLocale, setLocale, getSupportedLocales, initI18n, resetI18n } from './locale';
export type { I18nConfig } from './locale';

// Translation
export { $t, formatMessage, loadTranslations, setFallbackLocale, getTranslation, clearTranslations } from './translate';
export type { PdxMessages, PdxMessageKey } from './translate';

// ICU validation (build-time tooling)
export { validateIcu } from './validate-icu';

// Formatting
export { $n, $d, $r, clearFormatCache } from './format';

// Loader
export { createI18nLoader, isLocaleLoaded, clearLoadedLocales } from './loader';
export type { LoaderConfig, I18nLoader } from './loader';
