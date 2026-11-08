// @vitest-environment node
// The locale of a page no visitor asked for (#160). Node has a `navigator` of its own since v21, and
// its language is the build machine's: detected from it, a page a build generates comes out in
// whatever language the machine that ran the build is set to. On the server there is no visitor to
// detect, so it is the default — and a browser still detects, as before.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { initI18n, getLocale, resetI18n } from '../src/i18n/locale';

const CONFIG = { locales: ['en', 'it'], default: 'en', detect: true };

afterEach(() => {
    vi.unstubAllGlobals();
    resetI18n();
});

describe('detecting the locale', () => {
    it('on the server, takes the default: the process\'s navigator is the machine\'s, not a visitor\'s', () => {
        vi.stubGlobal('navigator', { language: 'it-IT', languages: ['it-IT'] });
        initI18n(CONFIG);
        expect(getLocale()()).toBe('en');
    });

    it('in a browser, takes the visitor\'s language', () => {
        vi.stubGlobal('navigator', { language: 'it-IT', languages: ['it-IT'] });
        vi.stubGlobal('window', {});
        initI18n(CONFIG);
        expect(getLocale()()).toBe('it');
    });
});
