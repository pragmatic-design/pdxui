// A dictionary that arrives after the first render has to reach it.
//
// If `$t` read the locale — a signal — and then a plain `Map`, it would re-run when the LOCALE
// changed and never when the DICTIONARY did, and an application that renders before its
// translations resolve would show raw keys until something else happened to move the locale.
//
// It is not a corner. A production build with an English browser would show `app.name`,
// `app.nav.dashboard`, `app.nav.tickets` in its header — while the same build in Italian is
// correct, because there the locale actually changes (`en` → `it`) and everything re-runs.
//
// A common bootstrap makes the race easy to lose:
//
//     import { setupI18n } from './src/i18n';
//     setupI18n();
//     import './src/app.pdx';
//
// The second import is HOISTED above the call, so the app is defined and rendered before a
// single translation is loaded, whatever the order on the page says. With the dictionary reactive
// that ordering stops mattering, which is the point: an app should not have to win a race.

import { describe, it, expect, beforeEach } from 'vitest';
import { $t, loadTranslations, clearTranslations, getTranslation } from '../src/i18n/translate';
import { setComponentStrings, getComponentString } from '../src/i18n/component-strings';
import { computed, effect } from '../src/reactivity/signal';
import { initI18n, resetI18n, setLocale } from '../src/i18n/locale';

beforeEach(() => {
    clearTranslations();
    resetI18n();
    initI18n({ locales: ['en', 'it'], default: 'en', detect: false, persist: false });
});

describe('a dictionary loaded after the read', () => {
    it('invalidates a computed that had already returned the key', () => {
        const label = computed(() => $t('app.nav.dashboard'));
        // Before: the key itself, which is the documented fallback and is correct here.
        expect(label(), 'the control failed: something was already loaded').toBe('app.nav.dashboard');

        loadTranslations('en', { app: { nav: { dashboard: 'Dashboard' } } });

        expect(label(), 'the dictionary arrived and the computed never re-ran').toBe('Dashboard');
    });

    it('re-runs an effect, which is what a rendered template is', () => {
        const seen: string[] = [];
        const stop = effect(() => { seen.push($t('app.name')); });
        expect(seen).toEqual(['app.name']);

        loadTranslations('en', { app: { name: 'PDX Service Desk' } });
        expect(seen, 'the template that rendered the key was never told').toEqual(['app.name', 'PDX Service Desk']);
        stop();
    });

    it('does not re-run for a dictionary in another locale', () => {
        // The invalidation has to be worth its subscription: loading Italian must not redraw an
        // English screen. A version counter that bumps on every load would fail this.
        const label = computed(() => $t('app.name'));
        loadTranslations('en', { app: { name: 'Service Desk' } });
        expect(label()).toBe('Service Desk');

        let runs = 0;
        const counted = computed(() => { runs++; return $t('app.name'); });
        counted();
        expect(runs).toBe(1);

        loadTranslations('it', { app: { name: 'Assistenza' } });
        counted();
        expect(runs, 'loading a locale nobody is reading redrew the screen').toBe(1);
    });

    it('invalidates through the fallback chain too', async () => {
        // Reading `it` with only `en` loaded falls back to `en`; loading `it` LATER must reach it.
        loadTranslations('en', { greeting: 'Hello' });
        initI18n({ locales: ['en', 'it'], default: 'en', detect: false, persist: false });
        setLocale('it');
        const label = computed(() => $t('greeting'));
        expect(label(), 'the fallback did not apply').toBe('Hello');

        loadTranslations('it', { greeting: 'Ciao' });
        expect(label(), 'the real translation arrived and the fallback stayed on screen').toBe('Ciao');
    });

    it('getTranslation is reactive for the same reason', () => {
        const raw = computed(() => getTranslation('a.b'));
        expect(raw()).toBeUndefined();
        loadTranslations('en', { a: { b: 'value' } });
        expect(raw(), 'getTranslation is the same read and needs the same invalidation').toBe('value');
    });
});

describe('the second registry, which is read the same way', () => {
    it('a component string set after the read reaches it', () => {
        // `getComponentString` already returns a signal, so it may well be fine — this is here
        // because the two registries are read the same way and the issue said to check.
        const label = getComponentString('router', 'notFound', 'Not found');
        expect(label()).toBe('Not found');
        setComponentStrings('router', { notFound: '404 · Pagina non trovata' });
        expect(label(), 'an override set after the read never reached it').toBe('404 · Pagina non trovata');
    });
});
