// i18n Loader — lazy loading translations per locale.
// Supports static import, HTTP fetch, and custom loader.
// Auto-loads on locale change via effect().

import { effect } from '../reactivity/signal';
import { locale } from './locale';
import { loadTranslations } from './translate';
import type { Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface LoaderConfig {
    /** Loading strategy: 'static' = dynamic import, 'fetch' = HTTP GET, 'custom' = user function, 'route' = per-route lazy */
    mode: 'static' | 'fetch' | 'custom' | 'route';
    /** Base path for translation files (for static, fetch, and route modes) */
    basePath?: string;
    /** Custom loader function (for 'custom' mode) */
    fetcher?: (locale: string) => Promise<Record<string, unknown>>;
    /** Route path resolver (for 'route' mode). Default: basePath/{locale}/{routeGroup}.json */
    resolve?: (locale: string, routePath: string) => string;
}

export interface I18nLoader {
    /** Manually load translations for a locale. */
    load(locale: string): Promise<void>;
    /** Dispose the auto-load effect. */
    dispose(): void;
}

// ─── Loaded Tracking ────────────────────────────────────────────────

const loadedLocales = new Set<string>();

/** Check if a locale's translations have been loaded. */
export function isLocaleLoaded(loc: string): boolean {
    return loadedLocales.has(loc);
}

/** Clear loaded tracking (for testing). */
export function clearLoadedLocales(): void {
    loadedLocales.clear();
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Create an i18n loader that auto-loads translations when locale changes.
 * Returns a loader with manual load() and dispose() methods.
 *
 * @example
 * const loader = createI18nLoader({ mode: 'fetch', basePath: '/api/i18n' });
 * // Auto-loads when locale changes via effect()
 * // Manual: await loader.load('it');
 */
export function createI18nLoader(config: LoaderConfig): I18nLoader {
    const loadFn = createLoadFunction(config);

    // Auto-load on locale change
    const dispose: Dispose = effect(() => {
        const loc = locale();  // reactive dependency
        if (!loadedLocales.has(loc)) {
            loadFn(loc).catch((err) => {
                console.warn(`[i18n] Failed to load translations for "${loc}":`, err);
            });
        }
    });

    return {
        async load(loc: string): Promise<void> {
            await loadFn(loc);
        },
        dispose,
    };
}

// ─── Internal ──────────────────────────────────────────────────────

function createLoadFunction(config: LoaderConfig): (loc: string) => Promise<void> {
    switch (config.mode) {
        case 'static':
            return async (loc: string) => {
                const path = config.basePath ?? './translations';
                // Dynamic import — bundler resolves at build time
                const mod = await import(/* @vite-ignore */ `${path}/${loc}.json`);
                const messages = mod.default ?? mod;
                loadTranslations(loc, messages);
                loadedLocales.add(loc);
            };

        case 'fetch':
            return async (loc: string) => {
                const base = config.basePath ?? '/api/i18n';
                const url = `${base}/${loc}.json`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
                const messages = await res.json();
                loadTranslations(loc, messages);
                loadedLocales.add(loc);
            };

        case 'custom':
            return async (loc: string) => {
                if (!config.fetcher) throw new Error('[i18n] Custom mode requires fetcher function');
                const messages = await config.fetcher(loc);
                loadTranslations(loc, messages);
                loadedLocales.add(loc);
            };

        case 'route':
            // Route-based lazy: loads translations per route-group
            // Keys loaded are MERGED (not replaced) so shared keys stay available
            return async (loc: string) => {
                const routePath = typeof location !== 'undefined' ? location.pathname : '/';
                const routeGroup = routePath.split('/').filter(Boolean)[0] || 'common';
                const cacheKey = `${loc}:${routeGroup}`;
                if (loadedLocales.has(cacheKey)) return;

                const base = config.basePath ?? '/api/i18n';
                const url = config.resolve
                    ? config.resolve(loc, routeGroup)
                    : `${base}/${loc}/${routeGroup}.json`;

                try {
                    const res = await fetch(url);
                    // A route group may have no dedicated bundle, which is the NORMAL case — most
                    // routes do not. A non-ok response falls through like a network error does: a
                    // `return` here would leave before the common bundle below is fetched, and a
                    // route without its own translations would get none, not even the shared ones.
                    if (res.ok) {
                        const messages = await res.json();
                        loadTranslations(loc, messages); // Merges with existing
                        loadedLocales.add(cacheKey);
                    }
                } catch {
                    // Silently fail — route-specific translations are optional
                }
                // Also ensure base locale is loaded
                if (!loadedLocales.has(loc)) {
                    const baseUrl = `${base}/${loc}/common.json`;
                    try {
                        const res = await fetch(baseUrl);
                        if (res.ok) {
                            const messages = await res.json();
                            loadTranslations(loc, messages);
                        }
                    } catch { /* optional */ }
                    loadedLocales.add(loc);
                }
            };
    }
}
