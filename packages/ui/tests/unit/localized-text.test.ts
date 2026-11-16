// The model of pdx-localized-input (#1024): a text in several cultures, `{ [culture]: string }`, the
// shape of Pragmatic's LocalizedString. Which cultures are missing, whether the value is complete for
// `required`, writing one culture, and how a culture is named and written (its native name, its direction).
import { describe, it, expect } from 'vitest';
import { missing, isComplete, withText, cultureName, directionOf, orderCultures, regionOf } from '../../src/localized-input/localized-text';

describe('missing', () => {
    it('is every culture with no text, a blank one included, in the given order', () => {
        expect(missing({ en: 'Hello', it: '  ', fr: '' }, ['en', 'it', 'fr', 'de'])).toEqual(['it', 'fr', 'de']);
        expect(missing({ en: 'Hello' }, ['en'])).toEqual([]);
    });
});

describe('isComplete', () => {
    const cultures = ['en', 'it'];
    it("'all' needs every culture", () => {
        expect(isComplete({ en: 'Hi' }, cultures, 'all', 'en')).toBe(false);
        expect(isComplete({ en: 'Hi', it: 'Ciao' }, cultures, 'all', 'en')).toBe(true);
    });
    it("'default' needs the default culture only", () => {
        expect(isComplete({ en: 'Hi' }, cultures, 'default', 'en')).toBe(true);
        expect(isComplete({ it: 'Ciao' }, cultures, 'default', 'en')).toBe(false);
    });
});

describe('withText', () => {
    it('sets one culture on a copy, and drops it when the text is empty', () => {
        const value = { en: 'Hi' };
        expect(withText(value, 'it', 'Ciao')).toEqual({ en: 'Hi', it: 'Ciao' });
        expect(withText({ en: 'Hi', it: 'Ciao' }, 'it', '')).toEqual({ en: 'Hi' });
        expect(value, 'the input was changed').toEqual({ en: 'Hi' });
    });
});

describe('orderCultures', () => {
    it('puts the current culture first, the others in their order, and leaves the list alone when it is not listed', () => {
        expect(orderCultures(['en', 'it', 'fr'], 'it')).toEqual(['it', 'en', 'fr']);
        expect(orderCultures(['en', 'it'], 'en')).toEqual(['en', 'it']);
        expect(orderCultures(['en', 'it'], 'de')).toEqual(['en', 'it']);
    });
});

describe('a culture, named and written', () => {
    it('is named in its own language, falling back to its code', () => {
        expect(cultureName('it')).toBe('italiano');
        expect(cultureName('fr-CA')).toMatch(/^français/);
        expect(cultureName('zz-not-a-tag')).toBe('zz-not-a-tag');
    });
    it('has the region of its subtag, or of `regions`, and none for a bare language left unmapped (#1091)', () => {
        expect(regionOf('it-IT', {})).toBe('IT');
        expect(regionOf('pt-BR', {})).toBe('BR');
        expect(regionOf('zh-Hant-TW', {})).toBe('TW');
        expect(regionOf('en', { en: 'GB' })).toBe('GB');
        expect(regionOf('en', {}), 'a bare language is never given a guessed country').toBe('');
        // `regions` names the culture's flag even when it has a subtag: an author's choice wins.
        expect(regionOf('ca-ES', { 'ca-ES': 'es' })).toBe('ES');
        // A numeric region (Latin America) has no flag.
        expect(regionOf('es-419', {})).toBe('');
        expect(regionOf('zz-not-a-tag', {})).toBe('');
    });
    it('is written right to left for Arabic, Hebrew and Persian, left to right otherwise', () => {
        expect(directionOf('ar')).toBe('rtl');
        expect(directionOf('he-IL')).toBe('rtl');
        expect(directionOf('fa')).toBe('rtl');
        expect(directionOf('it')).toBe('ltr');
    });
});
