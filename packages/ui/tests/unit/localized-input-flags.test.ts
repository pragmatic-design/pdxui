// pdx-localized-input with flags (#1091): `flags` draws a culture's flag before its name, in its tab or
// its stacked row; `layout="flag"` is one field whose prefix, a button with the active culture's flag,
// opens a menu of the cultures. The flag is decorative: the culture's name stays the accessible name.
// A culture's region is its subtag, or `regions`; a bare language left unmapped shows no flag.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, tick, whenUpgraded } from './helpers';
import '../../src/localized-input/pdx-localized-input.pdx';

afterEach(() => cleanup());

interface LocalizedInput extends HTMLElement {
    value: Record<string, string> | null;
    cultures: string[];
    regions: Record<string, string>;
}

async function field(props: Partial<LocalizedInput>, attrs: Record<string, string> = {}): Promise<LocalizedInput> {
    const el = document.createElement('pdx-localized-input') as LocalizedInput;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    Object.assign(el, props);
    document.body.appendChild(el);
    await tick();
    return el;
}

const flagsIn = (root: Element) => [...root.querySelectorAll('pdx-flag')];
/** A flag's region: a property, which `:region=` binds, not an attribute. Null when there is no flag. */
const region = (f: Element | null | undefined) => f ? (f as HTMLElement & { region: string }).region : null;

describe('pdx-localized-input, flags', () => {
    it('pdx-flag is registered with the field: the compiler imports the tag it renders', async () => {
        await field({ cultures: ['it-IT'] }, { flags: '' });
        expect(customElements.get('pdx-flag')).toBeDefined();
    });

    it('draws no flag unless asked', async () => {
        const el = await field({ cultures: ['it-IT', 'de-DE'] });
        expect(flagsIn(el)).toHaveLength(0);
    });

    it('flags: a decorative flag before the name in each tab, by subtag or `regions`, none for an unmapped language', async () => {
        const el = await field({ cultures: ['it-IT', 'en', 'fr'], regions: { en: 'GB' } }, { flags: '' });
        const tabs = [...el.querySelectorAll('[data-part="tab"]')];
        const regionOfTab = (lang: string) => region(tabs.find((t) => t.getAttribute('lang') === lang)?.querySelector('pdx-flag'));
        expect(regionOfTab('it-IT')).toBe('IT');
        expect(regionOfTab('en')).toBe('GB');
        expect(regionOfTab('fr'), 'a bare language with no mapping gets no guessed flag').toBeNull();
        for (const f of flagsIn(el)) expect(f.hasAttribute('decorative')).toBe(true);
        // The tab is still named by the culture: the flag adds nothing to its name.
        const it = tabs.find((t) => t.getAttribute('lang') === 'it-IT')!;
        expect(it.getAttribute('aria-label')).toMatch(/^italiano/);
    });

    it('flags with layout="stacked": each row label carries its flag', async () => {
        const el = await field({ cultures: ['it-IT', 'de-DE'] }, { flags: '', layout: 'stacked' });
        const regions = [...el.querySelectorAll('.pdx-localized-row-label pdx-flag')].map(region);
        expect(regions).toEqual(['IT', 'DE']);
    });
});

describe('pdx-localized-input, layout="flag"', () => {
    async function flagField(value: Record<string, string> | null = { 'it-IT': 'Ciao' }) {
        const el = await field({ cultures: ['it-IT', 'de-DE', 'fr'], value }, { layout: 'flag', label: 'Title' });
        const button = el.querySelector<HTMLButtonElement>('[data-part="cultureButton"]');
        return { el, button };
    }
    const visibleFields = (el: Element) => [...el.querySelectorAll<HTMLInputElement>('[data-part="panel"]:not([hidden]) [data-part="field"]')];

    it('is one field, the active culture\'s, with no tablist', async () => {
        const { el } = await flagField();
        expect(el.querySelector('[role="tablist"]')).toBeNull();
        const fields = visibleFields(el);
        expect(fields).toHaveLength(1);
        expect(fields[0].getAttribute('lang')).toBe('it-IT');
        expect(fields[0].value).toBe('Ciao');
    });

    it('its prefix is a menu button with the active culture\'s flag, named by the culture', async () => {
        const { button } = await flagField();
        expect(button).not.toBeNull();
        expect(button!.getAttribute('aria-haspopup')).toBe('menu');
        expect(region(button!.querySelector('pdx-flag'))).toBe('IT');
        expect(button!.querySelector('pdx-flag')?.hasAttribute('decorative')).toBe(true);
        expect(button!.getAttribute('aria-label')).toMatch(/italiano/);
    });

    it('a culture with no flag shows its code on the button instead', async () => {
        const el = await field({ cultures: ['fr', 'it-IT'] }, { layout: 'flag' });
        const button = el.querySelector('[data-part="cultureButton"]')!;
        expect(button.querySelector('pdx-flag')).toBeNull();
        expect(button.textContent).toContain('FR');
    });

    it('marks the button while the active culture has no text', async () => {
        const { el, button } = await flagField({ 'de-DE': 'Hallo' });
        expect(button!.querySelector('[data-part="marker"]')).not.toBeNull();
        expect(button!.getAttribute('aria-label')).toMatch(/missing/);
        el.value = { 'it-IT': 'Ciao' };
        await tick();
        expect(button!.querySelector('[data-part="marker"]')).toBeNull();
    });

    it('the menu lists the cultures, the active one checked, and choosing one shows its field', async () => {
        const { el, button } = await flagField();
        await whenUpgraded(el.querySelector('pdx-dropdown-menu'));
        button!.click();
        await tick();
        const items = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
        expect(items.map((i) => i.getAttribute('lang'))).toEqual(['it-IT', 'de-DE', 'fr']);
        expect(items[0].getAttribute('aria-checked')).toBe('true');
        expect(region(items[1].querySelector('pdx-flag'))).toBe('DE');
        // A culture with no text says so in its name, as its tab does, with no stray space before the comma.
        expect(items[2].textContent?.trim()).toBe('français, missing');
        // A culture with no flag keeps a flag's room, so the names line up with the others'.
        expect(items[2].querySelector('pdx-flag')).toBeNull();
        expect(items[2].querySelector('.pdx-localized-flag-space')).not.toBeNull();
        items[1].click();
        await tick();
        const fields = visibleFields(el);
        expect(fields).toHaveLength(1);
        expect(fields[0].getAttribute('lang')).toBe('de-DE');
        expect(region(el.querySelector('[data-part="cultureButton"] pdx-flag'))).toBe('DE');
        // Choosing a culture is the menu's whole job: it closes, and the focus is back on the button.
        expect(document.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0);
        expect(button!.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(button);
    });
});
