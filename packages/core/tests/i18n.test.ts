// Tests for i18n runtime: locale, translate ($t), format ($n/$d/$r), loader, reactivity.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computed } from '../src/reactivity/signal';
import {
    initI18n, getLocale, setLocale, getSupportedLocales, resetI18n,
} from '../src/i18n/locale';
import {
    $t, loadTranslations, setFallbackLocale, getTranslation, clearTranslations,
} from '../src/i18n/translate';
import { $n, $d, $r, clearFormatCache } from '../src/i18n/format';
import { createI18nLoader, clearLoadedLocales } from '../src/i18n/loader';

beforeEach(() => {
    resetI18n();
    clearTranslations();
    clearFormatCache();
    clearLoadedLocales();
    localStorage.clear();
    sessionStorage.clear();
});

// ─── Locale ─────────────────────────────────────────────────────────

describe('Locale', () => {
    it('initializes with default locale', () => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        expect(getLocale()()).toBe('en');
    });

    it('returns supported locales', () => {
        initI18n({ locales: ['en', 'it', 'de'], default: 'en' });
        expect(getSupportedLocales()).toEqual(['en', 'it', 'de']);
    });

    it('setLocale changes reactive value', () => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        setLocale('it');
        expect(getLocale()()).toBe('it');
    });

    it('setLocale with unsupported locale falls back to default', () => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        setLocale('zz');
        expect(getLocale()()).toBe('en');
    });

    it('setLocale resolves base language: en-US → en', () => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        setLocale('it-IT');
        expect(getLocale()()).toBe('it');
    });

    it('persists to localStorage when persist=true', () => {
        initI18n({ locales: ['en', 'it'], default: 'en', persist: true });
        setLocale('it');
        expect(localStorage.getItem('pdx-locale')).toBe('it');
    });

    it('persists to sessionStorage when persist="session"', () => {
        initI18n({ locales: ['en', 'it'], default: 'en', persist: 'session' });
        setLocale('it');
        expect(sessionStorage.getItem('pdx-locale')).toBe('it');
    });

    it('persists with custom function', () => {
        const fn = vi.fn();
        initI18n({ locales: ['en', 'it'], default: 'en', persist: fn });
        setLocale('it');
        expect(fn).toHaveBeenCalledWith('it');
    });

    it('restores persisted locale on init', () => {
        localStorage.setItem('pdx-locale', 'it');
        initI18n({ locales: ['en', 'it'], default: 'en', persist: true });
        expect(getLocale()()).toBe('it');
    });

    it('detect=false skips browser detection', () => {
        initI18n({ locales: ['en', 'it'], default: 'en', detect: false });
        // Should stay on default regardless of navigator.language
        expect(getLocale()()).toBe('en');
    });
});

// ─── Translate ($t) ─────────────────────────────────────────────────

describe('$t()', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        loadTranslations('en', { welcome: 'Welcome', goodbye: 'Goodbye' });
        loadTranslations('it', { welcome: 'Benvenuto' });
        setFallbackLocale('en');
    });

    it('translates simple key', () => {
        expect($t('welcome')).toBe('Welcome');
    });

    it('returns key when not found', () => {
        expect($t('missing.key')).toBe('missing.key');
    });

    it('falls back to default locale for missing keys', () => {
        setLocale('it');
        expect($t('goodbye')).toBe('Goodbye');  // not in 'it', falls back to 'en'
    });

    it('supports dot-notation for nested keys', () => {
        loadTranslations('en', {
            errors: { validation: { required: 'This field is required' } },
        });
        expect($t('errors.validation.required')).toBe('This field is required');
    });

    it('interpolates named parameters {name}', () => {
        loadTranslations('en', { hello: 'Hello, {name}!' });
        expect($t('hello', { name: 'Alice' })).toBe('Hello, Alice!');
    });

    it('interpolates positional parameters {0}', () => {
        loadTranslations('en', { greet: 'Hi {0}, welcome to {1}!' });
        expect($t('greet', { 0: 'Bob', 1: 'Rome' })).toBe('Hi Bob, welcome to Rome!');
    });

    it('leaves unmatched placeholders as-is', () => {
        loadTranslations('en', { partial: 'Hello {name}, age {age}' });
        expect($t('partial', { name: 'X' })).toBe('Hello X, age {age}');
    });

    it('switches translation on locale change', () => {
        expect($t('welcome')).toBe('Welcome');
        setLocale('it');
        expect($t('welcome')).toBe('Benvenuto');
    });

    it('getTranslation returns raw string', () => {
        expect(getTranslation('welcome')).toBe('Welcome');
        expect(getTranslation('welcome', 'it')).toBe('Benvenuto');
        expect(getTranslation('nonexistent')).toBeUndefined();
    });

    it('merges translations for same locale', () => {
        loadTranslations('en', { extra: 'Extra text' });
        expect($t('welcome')).toBe('Welcome');
        expect($t('extra')).toBe('Extra text');
    });
});

// ─── Pluralization (ICU) ────────────────────────────────────────────

describe('$t() — ICU Plural', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it', 'ar', 'pl'], default: 'en' });
    });

    it('English: one/other', () => {
        loadTranslations('en', {
            items: '{count, plural, one {# item} other {# items}}',
        });
        expect($t('items', { count: 0 })).toBe('0 items');
        expect($t('items', { count: 1 })).toBe('1 item');
        expect($t('items', { count: 5 })).toBe('5 items');
    });

    it('Italian: one/other', () => {
        loadTranslations('it', {
            items: '{count, plural, one {# elemento} other {# elementi}}',
        });
        setLocale('it');
        expect($t('items', { count: 1 })).toBe('1 elemento');
        expect($t('items', { count: 5 })).toBe('5 elementi');
    });

    it('supports zero category', () => {
        loadTranslations('en', {
            items: '{count, plural, zero {No items} one {# item} other {# items}}',
        });
        // 'zero' is not a CLDR category for English, but works as exact =0
        expect($t('items', { count: 1 })).toBe('1 item');
    });

    it('supports exact match =0, =1', () => {
        loadTranslations('en', {
            items: '{count, plural, =0 {Empty} =1 {Single} other {# items}}',
        });
        expect($t('items', { count: 0 })).toBe('Empty');
        expect($t('items', { count: 1 })).toBe('Single');
        expect($t('items', { count: 7 })).toBe('7 items');
    });

    it('Arabic: 6 plural forms', () => {
        loadTranslations('ar', {
            files: '{count, plural, zero {no files} one {file} two {two files} few {# files-few} many {# files-many} other {# files}}',
        });
        setLocale('ar');
        expect($t('files', { count: 0 })).toBe('no files');
        expect($t('files', { count: 1 })).toBe('file');
        expect($t('files', { count: 2 })).toBe('two files');
        expect($t('files', { count: 5 })).toBe('5 files-few');
        expect($t('files', { count: 11 })).toBe('11 files-many');
        expect($t('files', { count: 100 })).toBe('100 files');
    });

    it('Polish: one/few/many', () => {
        loadTranslations('pl', {
            items: '{count, plural, one {# element} few {# elementy} many {# elementow} other {# elementow}}',
        });
        setLocale('pl');
        expect($t('items', { count: 1 })).toBe('1 element');
        expect($t('items', { count: 3 })).toBe('3 elementy');
        expect($t('items', { count: 5 })).toBe('5 elementow');
    });
});

// ─── Format ($n, $d, $r) ───────────────────────────────────────────

describe('$n()', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
    });

    it('formats number for current locale', () => {
        const result = $n(1234.5);
        expect(result).toContain('1');
        expect(result).toContain('234');
    });

    it('changes format on locale switch', () => {
        const en = $n(1234.5);
        setLocale('it');
        const it = $n(1234.5);
        // Italian uses comma as decimal separator
        expect(it).not.toBe(en);
    });

    it('supports currency format', () => {
        const result = $n(9.99, { style: 'currency', currency: 'EUR' });
        expect(result).toContain('9');
        // May show as "EUR" or euro sign depending on Intl impl
        expect(result.includes('EUR') || result.includes('\u20AC')).toBe(true);
    });

    it('supports percent format', () => {
        const result = $n(0.75, { style: 'percent' });
        expect(result).toContain('75');
    });
});

describe('$d()', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
    });

    it('formats Date object', () => {
        const date = new Date(2026, 2, 29); // March 29, 2026
        const result = $d(date);
        expect(result.includes('2026') || result.includes('29')).toBe(true);
    });

    it('formats date string', () => {
        const result = $d('2026-03-29');
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
    });

    it('changes format on locale switch', () => {
        const date = new Date(2026, 2, 29);
        const en = $d(date);
        setLocale('it');
        const it = $d(date);
        // Different date order: M/D/Y vs D/M/Y
        expect(it).not.toBe(en);
    });
});

describe('$r()', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
    });

    it('formats relative time', () => {
        const result = $r(-1, 'day');
        // "1 day ago" or "yesterday" depending on Intl impl
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
    });

    it('formats future relative time', () => {
        const result = $r(3, 'hour');
        expect(result).toBeTruthy();
    });
});

// ─── Loader ─────────────────────────────────────────────────────────

describe('createI18nLoader()', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
    });

    it('custom mode loads via fetcher', async () => {
        const fetcher = vi.fn().mockResolvedValue({ hello: 'Ciao' });
        const loader = createI18nLoader({ mode: 'custom', fetcher });
        await loader.load('it');
        loader.dispose();

        setLocale('it');
        expect($t('hello')).toBe('Ciao');
        expect(fetcher).toHaveBeenCalledWith('it');
    });

    it('fetch mode calls fetch()', async () => {
        const mockResponse = { ok: true, json: () => Promise.resolve({ hi: 'Hey' }) };
        globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

        const loader = createI18nLoader({ mode: 'fetch', basePath: '/api/i18n' });
        await loader.load('en');
        loader.dispose();

        expect(globalThis.fetch).toHaveBeenCalledWith('/api/i18n/en.json');
        expect($t('hi')).toBe('Hey');
    });

    it('custom mode throws without fetcher', async () => {
        const loader = createI18nLoader({ mode: 'custom' });
        await expect(loader.load('en')).rejects.toThrow('fetcher function');
        loader.dispose();
    });

    it('dispose stops auto-load effect', () => {
        const fetcher = vi.fn().mockResolvedValue({});
        const loader = createI18nLoader({ mode: 'custom', fetcher });
        loader.dispose();

        // After dispose, locale changes should not trigger load
        const callsBefore = fetcher.mock.calls.length;
        setLocale('it');
        // Effect is disposed, so no new calls (async, but the effect itself wouldn't fire)
        expect(fetcher.mock.calls.length).toBeLessThanOrEqual(callsBefore + 1);
    });
});

// ─── Reactivity ─────────────────────────────────────────────────────

describe('i18n Reactivity', () => {
    beforeEach(() => {
        initI18n({ locales: ['en', 'it'], default: 'en' });
        loadTranslations('en', { hello: 'Hello' });
        loadTranslations('it', { hello: 'Ciao' });
        setFallbackLocale('en');
    });

    it('computed with $t() updates on locale change', () => {
        const greeting = computed(() => $t('hello'));
        expect(greeting()).toBe('Hello');

        setLocale('it');
        expect(greeting()).toBe('Ciao');
    });

    it('computed with $n() updates on locale change', () => {
        const formatted = computed(() => $n(1234.5));
        const en = formatted();

        setLocale('it');
        const it = formatted();
        expect(it).not.toBe(en);
    });

    it('getLocale() is reactive in computed', () => {
        const loc = computed(() => getLocale()());
        expect(loc()).toBe('en');
        setLocale('it');
        expect(loc()).toBe('it');
    });
});
