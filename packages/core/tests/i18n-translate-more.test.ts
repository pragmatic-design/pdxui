// $t() and the CLDR plural rules — branch coverage.
//
// Pluralisation is where a translation layer is either right or embarrassing, and it is not
// testable by inspection: Polish has four categories with a rule that turns on the last two digits,
// Arabic has six, and "n === 1 ? one : other" is wrong in most of the world. Every branch of the
// table below is a language somebody reads the product in.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    $t, loadTranslations, clearTranslations, getTranslation, setFallbackLocale,
} from '../src/i18n/translate';
import { setLocale, resetI18n, initI18n } from '../src/i18n/locale';
import { computed } from '../src/reactivity/signal';

/**
 * Switch to a locale, declaring it supported first.
 *
 * `setLocale` resolves against the configured list and falls back to the default when the code is
 * not in it — so with no `initI18n` every switch is silently a no-op and every assertion below
 * would have been measuring English. Worth knowing about the API, and the reason this helper
 * exists rather than a bare setLocale.
 */
function use(...locales: string[]): void {
    initI18n({ locales: [...locales, 'en'], default: 'en' });
    setLocale(locales[0]);
}

beforeEach(() => {
    clearTranslations();
    resetI18n();
    setFallbackLocale('en');
});

afterEach(() => {
    clearTranslations();
    resetI18n();
    setFallbackLocale('en');
});

describe('loadTranslations', () => {
    it('flattens nesting to dot keys, which is what $t asks for', () => {
        loadTranslations('en', { nav: { home: 'Home', user: { profile: 'Profile' } } });
        expect(getTranslation('nav.home', 'en')).toBe('Home');
        expect(getTranslation('nav.user.profile', 'en')).toBe('Profile');
    });

    it('merges rather than replacing, so a second bundle adds to the first', () => {
        loadTranslations('en', { a: 'A' });
        loadTranslations('en', { b: 'B' });
        expect(getTranslation('a', 'en')).toBe('A');
        expect(getTranslation('b', 'en')).toBe('B');
    });

    it('lets a later load override an earlier key', () => {
        loadTranslations('en', { a: 'first' });
        loadTranslations('en', { a: 'second' });
        expect(getTranslation('a', 'en')).toBe('second');
    });

    it('stringifies a value that is not a string', () => {
        loadTranslations('en', { n: 42, flag: true, list: ['x', 'y'] });
        expect(getTranslation('n', 'en')).toBe('42');
        expect(getTranslation('flag', 'en')).toBe('true');
        expect(getTranslation('list', 'en'), 'an array is a leaf, not a branch').toBe('x,y');
    });

    it('treats null as a leaf, not an object to walk into', () => {
        loadTranslations('en', { missing: null });
        expect(getTranslation('missing', 'en')).toBe('null');
    });

    it('keeps locales apart', () => {
        loadTranslations('en', { hi: 'Hello' });
        loadTranslations('it', { hi: 'Ciao' });
        expect(getTranslation('hi', 'en')).toBe('Hello');
        expect(getTranslation('hi', 'it')).toBe('Ciao');
    });
});

describe('getTranslation and clearTranslations', () => {
    it('reads the current locale when none is given', () => {
        loadTranslations('it', { hi: 'Ciao' });
        use('it');
        expect(getTranslation('hi')).toBe('Ciao');
    });

    it('returns undefined for a key that is not there', () => {
        expect(getTranslation('nope', 'en')).toBeUndefined();
    });

    it('clears everything', () => {
        loadTranslations('en', { hi: 'Hello' });
        clearTranslations();
        expect(getTranslation('hi', 'en')).toBeUndefined();
    });
});

describe('$t — the fallback chain', () => {
    it('uses the current locale', () => {
        loadTranslations('it', { hi: 'Ciao' });
        use('it');
        expect($t('hi')).toBe('Ciao');
    });

    it('falls back to the fallback locale for a key the current one is missing', () => {
        loadTranslations('en', { hi: 'Hello' });
        loadTranslations('it', { other: 'Altro' });
        use('it');
        expect($t('hi'), 'an untranslated string should read in English, not as a key').toBe('Hello');
    });

    it('returns the key itself when nothing has it', () => {
        use('it');
        expect($t('nav.settings.title')).toBe('nav.settings.title');
    });

    it('honours a changed fallback locale', () => {
        loadTranslations('de', { hi: 'Hallo' });
        setFallbackLocale('de');
        use('it');
        expect($t('hi')).toBe('Hallo');
    });

    it('does not look twice when the current locale IS the fallback', () => {
        loadTranslations('en', { a: 'A' });
        use('en');
        expect($t('missing')).toBe('missing');
    });

    it('is reactive: a computed reading it re-runs when the locale changes', () => {
        loadTranslations('en', { hi: 'Hello' });
        loadTranslations('it', { hi: 'Ciao' });
        const greeting = computed(() => $t('hi'));

        use('en');
        expect(greeting()).toBe('Hello');
        use('it');
        expect(greeting(), 'the template would keep the old language').toBe('Ciao');
    });
});

describe('$t — interpolation', () => {
    it('replaces a named placeholder', () => {
        loadTranslations('en', { hello: 'Hello {name}!' });
        use('en');
        expect($t('hello', { name: 'Alice' })).toBe('Hello Alice!');
    });

    it('replaces a positional one', () => {
        loadTranslations('en', { pair: '{0} and {1}' });
        use('en');
        expect($t('pair', { 0: 'salt', 1: 'pepper' })).toBe('salt and pepper');
    });

    it('leaves a placeholder alone when nothing was passed for it', () => {
        // Better a visible {name} in the UI than the word "undefined", which reads like data.
        loadTranslations('en', { hello: 'Hello {name}!' });
        use('en');
        expect($t('hello', { other: 'x' })).toBe('Hello {name}!');
    });

    it('stringifies whatever it is given', () => {
        loadTranslations('en', { n: 'You have {count}' });
        use('en');
        expect($t('n', { count: 0 })).toBe('You have 0');
    });

    it('does nothing without params', () => {
        loadTranslations('en', { hello: 'Hello {name}!' });
        use('en');
        expect($t('hello')).toBe('Hello {name}!');
    });
});

describe('$t — ICU plurals', () => {
    beforeEach(() => {
        loadTranslations('en', {
            items: '{count, plural, one {# item} other {# items}}',
            exact: '{count, plural, =0 {nothing at all} one {# thing} other {# things}}',
            mixed: 'Cart: {count, plural, one {# item} other {# items}} for {name}',
        });
        use('en');
    });

    it('picks the category and substitutes the number for #', () => {
        expect($t('items', { count: 1 })).toBe('1 item');
        expect($t('items', { count: 5 })).toBe('5 items');
    });

    it('prefers an exact match over the category', () => {
        expect($t('exact', { count: 0 }), 'a =0 clause exists to say something other than "0 things"')
            .toBe('nothing at all');
        expect($t('exact', { count: 1 })).toBe('1 thing');
    });

    it('interpolates around the plural block', () => {
        expect($t('mixed', { count: 2, name: 'Ana' })).toBe('Cart: 2 items for Ana');
    });

    it('treats a missing count as zero', () => {
        expect($t('items', {})).toBe('0 items');
    });

    it('leaves a message with braces but no plural clause to plain interpolation', () => {
        loadTranslations('en', { plain: 'A {thing} here' });
        expect($t('plain', { thing: 'cat' })).toBe('A cat here');
    });

    it('falls back to `other` when the category has no clause', () => {
        loadTranslations('en', { onlyOther: '{count, plural, other {# of them}}' });
        expect($t('onlyOther', { count: 1 })).toBe('1 of them');
    });

    it('survives an unclosed brace instead of hanging or throwing', () => {
        loadTranslations('en', { broken: '{count, plural, one {# item} other {# items}' });
        expect(() => $t('broken', { count: 2 })).not.toThrow();
    });
});

describe('$t — the CLDR plural table', () => {
    /** Load the same message shape into a locale and ask for `n`. */
    function say(loc: string, n: number, clauses: string): string {
        clearTranslations();
        loadTranslations(loc, { k: `{count, plural, ${clauses}}` });
        use(loc);
        return $t('k', { count: n });
    }

    const TWO_WAY = 'one {ONE} other {OTHER}';

    it('English-shaped languages: one at exactly 1', () => {
        for (const loc of ['en', 'de', 'it', 'es', 'nl', 'sv', 'da', 'no', 'fi', 'el', 'hu', 'tr']) {
            expect(say(loc, 1, TWO_WAY), loc).toBe('ONE');
            expect(say(loc, 0, TWO_WAY), loc).toBe('OTHER');
            expect(say(loc, 2, TWO_WAY), loc).toBe('OTHER');
        }
    });

    it('French and Portuguese: zero is singular too', () => {
        for (const loc of ['fr', 'pt']) {
            expect(say(loc, 0, TWO_WAY), `${loc} 0`).toBe('ONE');
            expect(say(loc, 1, TWO_WAY), `${loc} 1`).toBe('ONE');
            expect(say(loc, 2, TWO_WAY), `${loc} 2`).toBe('OTHER');
        }
    });

    it('languages with no plural at all', () => {
        for (const loc of ['ko', 'ja', 'zh', 'vi', 'th', 'id', 'ms']) {
            expect(say(loc, 1, TWO_WAY), loc).toBe('OTHER');
            expect(say(loc, 5, TWO_WAY), loc).toBe('OTHER');
        }
    });

    it('Russian and Ukrainian: one / few / many, decided by the last two digits', () => {
        const CL = 'one {ONE} few {FEW} many {MANY} other {OTHER}';
        for (const loc of ['ru', 'uk']) {
            expect(say(loc, 1, CL), `${loc} 1`).toBe('ONE');
            expect(say(loc, 21, CL), `${loc} 21`).toBe('ONE');
            expect(say(loc, 11, CL), `${loc} 11 — the exception to the ...1 rule`).toBe('MANY');
            expect(say(loc, 3, CL), `${loc} 3`).toBe('FEW');
            expect(say(loc, 13, CL), `${loc} 13 — teens are many, not few`).toBe('MANY');
            expect(say(loc, 5, CL), `${loc} 5`).toBe('MANY');
        }
    });

    it('Polish: 1 is one, 2-4 are few, and the teens are not', () => {
        const CL = 'one {ONE} few {FEW} many {MANY} other {OTHER}';
        expect(say('pl', 1, CL)).toBe('ONE');
        expect(say('pl', 2, CL)).toBe('FEW');
        expect(say('pl', 22, CL)).toBe('FEW');
        expect(say('pl', 12, CL), 'twelve is not "few" in Polish').toBe('MANY');
        expect(say('pl', 5, CL)).toBe('MANY');
    });

    it('Czech: 2-4 are few, the rest other', () => {
        const CL = 'one {ONE} few {FEW} other {OTHER}';
        expect(say('cs', 1, CL)).toBe('ONE');
        expect(say('cs', 3, CL)).toBe('FEW');
        expect(say('cs', 5, CL)).toBe('OTHER');
    });

    it('Croatian: like Russian but the last bucket is other', () => {
        const CL = 'one {ONE} few {FEW} other {OTHER}';
        expect(say('hr', 21, CL)).toBe('ONE');
        expect(say('hr', 11, CL)).toBe('OTHER');
        expect(say('hr', 3, CL)).toBe('FEW');
    });

    it('Arabic: all six categories', () => {
        const CL = 'zero {ZERO} one {ONE} two {TWO} few {FEW} many {MANY} other {OTHER}';
        expect(say('ar', 0, CL)).toBe('ZERO');
        expect(say('ar', 1, CL)).toBe('ONE');
        expect(say('ar', 2, CL)).toBe('TWO');
        expect(say('ar', 5, CL)).toBe('FEW');
        expect(say('ar', 15, CL)).toBe('MANY');
        expect(say('ar', 100, CL)).toBe('OTHER');
    });

    it('Irish: one, two, few, many, other', () => {
        const CL = 'one {ONE} two {TWO} few {FEW} many {MANY} other {OTHER}';
        expect(say('ga', 1, CL)).toBe('ONE');
        expect(say('ga', 2, CL)).toBe('TWO');
        expect(say('ga', 4, CL)).toBe('FEW');
        expect(say('ga', 8, CL)).toBe('MANY');
        expect(say('ga', 20, CL)).toBe('OTHER');
    });

    it('uses the base language of a regional tag', () => {
        expect(say('pt-BR', 0, TWO_WAY), 'pt-BR must follow pt, not the fallback rule').toBe('ONE');
        expect(say('en-GB', 1, TWO_WAY)).toBe('ONE');
    });

    it('falls back to one/other for a language the table does not know', () => {
        expect(say('xx', 1, TWO_WAY)).toBe('ONE');
        expect(say('xx', 7, TWO_WAY)).toBe('OTHER');
    });

    it('categorises by magnitude, so -1 is singular', () => {
        expect(say('en', -1, TWO_WAY), '"-1 items" reads as a bug').toBe('ONE');
    });
});
