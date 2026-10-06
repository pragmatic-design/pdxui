// The i18n loader — branch coverage.
//
// Four strategies with different failure contracts, and the difference is the interesting part:
// `fetch` throws on a bad response because a missing language bundle is a broken app, while `route`
// swallows one because a route-specific bundle is optional and most routes will not have one. A
// test that only walks the happy path cannot tell those two apart.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createI18nLoader, isLocaleLoaded, clearLoadedLocales } from '../src/i18n/loader';
import { getTranslation, clearTranslations } from '../src/i18n/translate';
import { resetI18n } from '../src/i18n/locale';

/** A fetch that answers a fixed body, and records what it was asked for. */
function stubFetch(handler: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
        const url = String(input);
        calls.push(url);
        const r = handler(url);
        return {
            ok: r.ok,
            status: r.status ?? (r.ok ? 200 : 404),
            json: async () => r.body ?? {},
        } as Response;
    }));
    return calls;
}

beforeEach(() => {
    clearLoadedLocales();
    clearTranslations();
    resetI18n();
});

afterEach(() => {
    vi.unstubAllGlobals();
    clearLoadedLocales();
    clearTranslations();
    resetI18n();
});

describe('the loaded-locale registry', () => {
    it('starts empty and records what has been loaded', async () => {
        expect(isLocaleLoaded('it')).toBe(false);
        const loader = createI18nLoader({ mode: 'custom', fetcher: async () => ({ hi: 'Ciao' }) });
        await loader.load('it');
        expect(isLocaleLoaded('it')).toBe(true);
        loader.dispose();
    });

    it('can be cleared', async () => {
        const loader = createI18nLoader({ mode: 'custom', fetcher: async () => ({}) });
        await loader.load('it');
        clearLoadedLocales();
        expect(isLocaleLoaded('it')).toBe(false);
        loader.dispose();
    });
});

describe('custom mode', () => {
    it('calls the fetcher and loads what it returns', async () => {
        const fetcher = vi.fn(async () => ({ nav: { home: 'Casa' } }));
        const loader = createI18nLoader({ mode: 'custom', fetcher });

        await loader.load('it');

        expect(fetcher).toHaveBeenCalledWith('it');
        expect(getTranslation('nav.home', 'it'), 'the bundle was not flattened into the store')
            .toBe('Casa');
        loader.dispose();
    });

    it('refuses to be created without a fetcher, rather than loading nothing', async () => {
        const loader = createI18nLoader({ mode: 'custom' });
        await expect(loader.load('it')).rejects.toThrow(/fetcher/);
        loader.dispose();
    });

    it('lets a failure from the fetcher through', async () => {
        const loader = createI18nLoader({
            mode: 'custom',
            fetcher: async () => { throw new Error('backend down'); },
        });
        await expect(loader.load('it')).rejects.toThrow('backend down');
        expect(isLocaleLoaded('it'), 'a failed load must not be recorded as done').toBe(false);
        loader.dispose();
    });
});

describe('fetch mode', () => {
    it('asks the default endpoint and loads the answer', async () => {
        const calls = stubFetch(() => ({ ok: true, body: { hi: 'Ciao' } }));
        const loader = createI18nLoader({ mode: 'fetch' });

        await loader.load('it');

        expect(calls).toContain('/api/i18n/it.json');
        expect(getTranslation('hi', 'it')).toBe('Ciao');
        loader.dispose();
    });

    it('uses the base path it was given', async () => {
        const calls = stubFetch(() => ({ ok: true, body: {} }));
        const loader = createI18nLoader({ mode: 'fetch', basePath: '/locales' });
        await loader.load('de');
        expect(calls).toContain('/locales/de.json');
        loader.dispose();
    });

    it('THROWS on a bad response — a missing language bundle is not optional', async () => {
        stubFetch(() => ({ ok: false, status: 500 }));
        const loader = createI18nLoader({ mode: 'fetch' });
        await expect(loader.load('it')).rejects.toThrow(/500/);
        expect(isLocaleLoaded('it')).toBe(false);
        loader.dispose();
    });
});

describe('route mode', () => {
    it('loads the bundle for the first path segment, and the common one beside it', async () => {
        history.replaceState(null, '', '/admin/users');
        const calls = stubFetch((url) => ({
            ok: true,
            body: url.includes('admin') ? { title: 'Utenti' } : { save: 'Salva' },
        }));
        const loader = createI18nLoader({ mode: 'route' });

        await loader.load('it');

        expect(calls).toContain('/api/i18n/it/admin.json');
        expect(calls, 'the shared keys must come too, or every route re-declares them')
            .toContain('/api/i18n/it/common.json');
        expect(getTranslation('title', 'it')).toBe('Utenti');
        expect(getTranslation('save', 'it')).toBe('Salva');
        loader.dispose();
    });

    it('calls the route group "common" at the root', async () => {
        history.replaceState(null, '', '/');
        const calls = stubFetch(() => ({ ok: true, body: {} }));
        const loader = createI18nLoader({ mode: 'route' });
        await loader.load('it');
        // `contains`, not `[0]`: the loader auto-loads the CURRENT locale the moment it is created,
        // so the first request in the list belongs to that and not to this call.
        expect(calls).toContain('/api/i18n/it/common.json');
        loader.dispose();
    });

    it('takes a resolver when the layout is not the default one', async () => {
        history.replaceState(null, '', '/shop');
        const calls = stubFetch(() => ({ ok: true, body: {} }));
        const loader = createI18nLoader({
            mode: 'route',
            resolve: (loc, group) => `/i18n?l=${loc}&g=${group}`,
        });
        await loader.load('it');
        expect(calls).toContain('/i18n?l=it&g=shop');
        loader.dispose();
    });

    it('SWALLOWS a missing route bundle — most routes will not have one', async () => {
        history.replaceState(null, '', '/rarely-translated');
        stubFetch((url) => ({ ok: url.includes('common'), body: { save: 'Salva' } }));
        const loader = createI18nLoader({ mode: 'route' });

        await expect(loader.load('it')).resolves.toBeUndefined();

        expect(getTranslation('save', 'it'), 'the common bundle should still have loaded')
            .toBe('Salva');
        loader.dispose();
    });

    it('swallows a network error too', async () => {
        history.replaceState(null, '', '/x');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        const loader = createI18nLoader({ mode: 'route' });
        await expect(loader.load('it')).resolves.toBeUndefined();
        loader.dispose();
    });

    it('does not fetch the same route group twice', async () => {
        history.replaceState(null, '', '/admin');
        const calls = stubFetch(() => ({ ok: true, body: {} }));
        const loader = createI18nLoader({ mode: 'route' });

        await loader.load('it');
        const afterFirst = calls.length;
        await loader.load('it');

        expect(calls.length, 'every navigation re-fetched the same bundle').toBe(afterFirst);
        loader.dispose();
    });

    it('merges rather than replacing, so an earlier group survives', async () => {
        const calls = stubFetch((url) => ({
            ok: true,
            body: url.includes('admin') ? { a: 'A' } : url.includes('shop') ? { s: 'S' } : {},
        }));
        history.replaceState(null, '', '/admin');
        const loader = createI18nLoader({ mode: 'route' });
        await loader.load('it');

        history.replaceState(null, '', '/shop');
        await loader.load('it');

        expect(getTranslation('a', 'it'), 'navigating away dropped the previous route\'s keys').toBe('A');
        expect(getTranslation('s', 'it')).toBe('S');
        expect(calls.length).toBeGreaterThan(2);
        loader.dispose();
    });
});

describe('auto-loading on a locale change', () => {
    it('loads the current locale as soon as it is created', async () => {
        const fetcher = vi.fn(async () => ({}));
        const loader = createI18nLoader({ mode: 'custom', fetcher });
        await Promise.resolve();
        expect(fetcher, 'the app starts in a locale, and it needs its bundle').toHaveBeenCalled();
        loader.dispose();
    });

    it('reports a failed auto-load instead of failing silently', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const loader = createI18nLoader({
            mode: 'custom',
            fetcher: async () => { throw new Error('nope'); },
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(warn.mock.calls.some(c => String(c[0]).includes('i18n')),
            'a language that failed to load left no trace').toBe(true);
        warn.mockRestore();
        loader.dispose();
    });

    it('stops auto-loading once disposed', async () => {
        const fetcher = vi.fn(async () => ({}));
        const loader = createI18nLoader({ mode: 'custom', fetcher });
        await Promise.resolve();
        loader.dispose();
        const before = fetcher.mock.calls.length;

        clearLoadedLocales();
        await Promise.resolve();

        expect(fetcher.mock.calls.length).toBe(before);
    });
});
