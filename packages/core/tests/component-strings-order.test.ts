// A translation installed before a component is imported survives the import.
//
// Defaults and overrides are separate: with one map, `setComponentStrings` would be
// `registerComponentStrings`, and whoever wrote last would win. Every package registers its English
// defaults when it is imported, so an app that installed its strings first — as the recipe tells it
// to — would get them overwritten by the next component module to load, and stay in English without
// a word: `drawer.close` back at `Close` after startup.

import { describe, it, expect } from 'vitest';
import {
    registerComponentStrings, setComponentStrings, setLocaleStrings,
    getComponentString, getComponentStrings, clearComponentStrings,
} from '../src/i18n/component-strings';

let n = 0;
const fresh = (base: string) => `${base}-${n++}`;

describe('component strings — defaults and overrides are separate', () => {
    it('an override set before the defaults are registered still wins', () => {
        const c = fresh('drawer');
        setComponentStrings(c, { close: 'Chiudi' });
        registerComponentStrings(c, { close: 'Close' });
        expect(getComponentString(c, 'close')(), 'the component import overwrote the translation').toBe('Chiudi');
    });

    it('so does a locale installed with setLocaleStrings before the import', () => {
        const c = fresh('chip');
        setLocaleStrings({ [c]: { remove: 'Rimuovi' } });
        registerComponentStrings(c, { remove: 'Remove', add: 'Add' });
        expect(getComponentString(c, 'remove')()).toBe('Rimuovi');
        expect(getComponentString(c, 'add')(), 'a key the locale does not set keeps its default').toBe('Add');
    });

    it('a signal read before the override follows it', () => {
        const c = fresh('dialog');
        registerComponentStrings(c, { close: 'Close' });
        const close = getComponentString(c, 'close');
        expect(close()).toBe('Close');
        setComponentStrings(c, { close: 'Chiudi' });
        expect(close()).toBe('Chiudi');
    });

    it('getComponentStrings shows the overrides over the defaults, whatever the order', () => {
        const c = fresh('pager');
        setComponentStrings(c, { next: 'Successiva' });
        registerComponentStrings(c, { next: 'Next', previous: 'Previous' });
        expect(getComponentStrings(c)()).toEqual({ next: 'Successiva', previous: 'Previous' });
    });

    it('clearComponentStrings drops the overrides and goes back to the defaults, as documented', () => {
        const c = fresh('select');
        registerComponentStrings(c, { placeholder: 'Select...' });
        setComponentStrings(c, { placeholder: 'Seleziona...' });
        clearComponentStrings();
        expect(getComponentString(c, 'placeholder')(), 'clearing wiped the defaults too — every component now shows its keys').toBe('Select...');
    });

    it('control — with no override, the registered default is returned', () => {
        const c = fresh('tree');
        registerComponentStrings(c, { noData: 'No data' });
        expect(getComponentString(c, 'noData')()).toBe('No data');
    });

    it('control — with neither, the fallback, then the key', () => {
        const c = fresh('none');
        expect(getComponentString(c, 'x', 'fallback')()).toBe('fallback');
        expect(getComponentString(c, 'x')()).toBe('x');
    });
});
