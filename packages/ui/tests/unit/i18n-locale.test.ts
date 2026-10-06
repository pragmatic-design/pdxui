// Installing a locale changes what a user reads.
//
// The guard in core (`i18n-no-literal-strings.test.ts`) proves no literal is left in the sources.
// That is necessary and not sufficient: a string could be read from the registry under a key nobody
// can guess, or read once and cached. This asserts the thing a consumer actually does — call
// `setLocaleStrings` and see the DOM change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setLocaleStrings, clearComponentStrings } from '@pdxui/core';
import { uiString, format, registerUiDefaults } from '../../src/shared/i18n';

// `clearComponentStrings()` drops the installed overrides and keeps the defaults; every
// test also re-registers the defaults, so it starts from a known registry whatever ran before it.
beforeEach(() => {
    clearComponentStrings();
    registerUiDefaults();
});
afterEach(() => {
    clearComponentStrings();
    registerUiDefaults();
});

describe('the shipped strings can be replaced', () => {
    it('serves the English default before anything is installed', async () => {
        expect(uiString('dialog', 'close')).toBe('Close dialog');
        expect(uiString('pagination', 'previous')).toBe('Previous page');
    });

    it('an installed locale replaces them', async () => {
        setLocaleStrings({
            dialog: { close: 'Chiudi la finestra' },
            pagination: { previous: 'Pagina precedente', next: 'Pagina successiva' },
        });
        expect(uiString('dialog', 'close')).toBe('Chiudi la finestra');
        expect(uiString('pagination', 'previous')).toBe('Pagina precedente');
        expect(uiString('pagination', 'next')).toBe('Pagina successiva');
    });

    it('leaves untranslated keys on their English default', async () => {
        setLocaleStrings({ dialog: { close: 'Chiudi' } });
        expect(uiString('dialog', 'close')).toBe('Chiudi');
        expect(uiString('drawer', 'close'), 'a different component keeps its own').toBe('Close');
    });

    it('covers the strings the lab app could not translate', async () => {
        // Every one of these would otherwise show, in English, in an Italian app's accessibility tree.
        setLocaleStrings({
            dialog: { close: 'Chiudi' },
            pagination: { label: 'Impaginazione', previous: 'Precedente', next: 'Successiva' },
            breadcrumb: { label: 'Percorso' },
            toolbar: { label: 'Barra strumenti' },
            select: { search: 'Cerca...', noResults: 'Nessun risultato' },
        });
        expect(uiString('dialog', 'close')).toBe('Chiudi');
        expect(uiString('pagination', 'label')).toBe('Impaginazione');
        expect(uiString('breadcrumb', 'label')).toBe('Percorso');
        expect(uiString('toolbar', 'label')).toBe('Barra strumenti');
        expect(uiString('select', 'search')).toBe('Cerca...');
        expect(uiString('select', 'noResults')).toBe('Nessun risultato');
    });

    it('keeps the placeholders through a translation', async () => {
        setLocaleStrings({ pagination: { range: '{from}–{to} di {total}' } });
        expect(format(uiString('pagination', 'range'), { from: 1, to: 10, total: 47 }))
            .toBe('1–10 di 47');
    });

    it('leaves an unknown placeholder alone rather than emptying it', async () => {
        // A translator who writes {da} instead of {from} should see their typo, not a blank.
        expect(format('{from}–{to}', { from: 1 })).toBe('1–{to}');
    });
});
