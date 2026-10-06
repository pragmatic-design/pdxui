// i18n Locale — reactive signal-based locale management.
// Detection chain: persisted → navigator.language → default.
// Changing locale triggers $t()/$n()/$d() reactivity automatically.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface I18nConfig {
    /** Supported locale codes: ['en', 'it', 'de'] */
    locales: string[];
    /** Default locale when no detection matches */
    default: string;
    /** Auto-detect from navigator.language */
    detect?: boolean;
    /** Persist locale choice: true = localStorage, 'session' = sessionStorage, function = custom */
    persist?: boolean | 'session' | ((locale: string) => void);
}

// ─── State ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'pdx-locale';
let supportedLocales: string[] = [];
let defaultLocale = 'en';
let persistMode: I18nConfig['persist'] = false;
const _locale = signal('en', { name: 'i18n.locale' });

/** Reactive locale signal — read in $t()/$n()/$d() for auto-update. */
export const locale: ReadonlySignal<string> = computed(() => _locale());

// ─── Public API ────────────────────────────────────────────────────

/** Get the current locale as a reactive signal. */
export function getLocale(): ReadonlySignal<string> {
    return locale;
}

/** Get supported locale codes. */
export function getSupportedLocales(): string[] {
    return [...supportedLocales];
}

/** Change the active locale. Validates against supported list. */
export function setLocale(loc: string): void {
    const resolved = resolveLocale(loc);
    _locale.set(resolved);
    persistLocale(resolved);
}

/** Initialize i18n with configuration. Called once (typically from app root). */
export function initI18n(config: I18nConfig): void {
    supportedLocales = [...config.locales];
    defaultLocale = config.default;
    persistMode = config.persist ?? false;

    const detected = detectLocale(config);
    _locale.set(detected);
}

/** Reset i18n state (for testing). */
export function resetI18n(): void {
    supportedLocales = [];
    defaultLocale = 'en';
    persistMode = false;
    _locale.set('en');
}

// ─── Internal ──────────────────────────────────────────────────────

/** Resolve locale to a supported one, with base language fallback. */
function resolveLocale(loc: string): string {
    if (supportedLocales.includes(loc)) return loc;
    // Try base language: 'en-US' → 'en'
    const base = loc.split('-')[0];
    if (supportedLocales.includes(base)) return base;
    return defaultLocale;
}

/** Detect locale: persisted → navigator → default. */
function detectLocale(config: I18nConfig): string {
    // 1. Try persisted value
    const persisted = readPersistedLocale(config.persist);
    if (persisted) {
        const resolved = resolveLocale(persisted);
        if (resolved !== defaultLocale || persisted === defaultLocale) return resolved;
    }

    // 2. Auto-detect from browser
    if (config.detect !== false && typeof navigator !== 'undefined') {
        const browserLocales = navigator.languages ?? [navigator.language];
        for (const bl of browserLocales) {
            const resolved = resolveLocale(bl);
            if (supportedLocales.includes(resolved)) return resolved;
        }
    }

    // 3. Default
    return defaultLocale;
}

function readPersistedLocale(persist: I18nConfig['persist']): string | null {
    if (!persist || typeof persist === 'function') return null;
    if (typeof window === 'undefined') return null;

    const storage = persist === 'session' ? sessionStorage : localStorage;
    try { return storage.getItem(STORAGE_KEY); } catch { return null; }
}

function persistLocale(loc: string): void {
    if (!persistMode) return;

    if (typeof persistMode === 'function') {
        persistMode(loc);
        return;
    }

    if (typeof window === 'undefined') return;
    const storage = persistMode === 'session' ? sessionStorage : localStorage;
    try { storage.setItem(STORAGE_KEY, loc); } catch { /* quota exceeded — ignore */ }
}
