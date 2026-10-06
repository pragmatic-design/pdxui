// A locale installed AFTER a component is on screen reaches it.
//
// `getComponentString()` is a computed, so the registry is reactive where it is read reactively.
// `uiString()` reads it once, and a component that writes the result into an attribute at build
// time captures the value of that moment:
//
//     nav.setAttribute('aria-label', uiString('breadcrumb', 'label'));
//
// Nothing re-runs that line when the registry changes, and `aria-label` is where a library string
// usually lands — so choosing Italian would leave every component already on screen in English
// until a reload. A test whose string belongs to a component created AFTER the switch does not
// see it: a component that renders after `setLocaleStrings` reads the new value on its first read.
//
// The library string is reactive at the point of use.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setLocaleStrings, clearComponentStrings } from '@pdxui/core';
import '../../src/breadcrumb/pdx-breadcrumb';
import '../../src/pagination/pdx-pagination';
import { cleanup, tick } from './helpers';

const ITALIAN = {
    breadcrumb: { label: 'Percorso di navigazione', expand: 'Mostra percorso' },
    pagination: { label: 'Impaginazione', previous: 'Pagina precedente', next: 'Pagina successiva' },
};

async function mountBreadcrumb(): Promise<HTMLElement> {
    const el = document.createElement('pdx-breadcrumb') as HTMLElement & Record<string, unknown>;
    el.items = [{ label: 'Home', href: '/' }, { label: 'Tickets', href: '/tickets' }, { label: 'T-1042' }];
    document.body.appendChild(el);
    await tick();
    return el;
}

const navLabel = (el: HTMLElement) => el.querySelector('nav')?.getAttribute('aria-label') ?? null;

beforeEach(() => { cleanup(); clearComponentStrings(); });
afterEach(() => clearComponentStrings());

describe('a locale switch reaches what is already on screen', () => {
    it('the control: a component mounted AFTER the switch is in the new language', async () => {
        // The case a first read alone handles. Without it, a change that broke the first read would
        // look like a pass.
        setLocaleStrings(ITALIAN);
        const el = await mountBreadcrumb();
        expect(navLabel(el)).toBe('Percorso di navigazione');
    });

    it('a component mounted BEFORE the switch changes with it', async () => {
        const el = await mountBreadcrumb();
        expect(navLabel(el), 'the fixture did not start in English, so this proves nothing')
            .toBe('Breadcrumb');

        setLocaleStrings(ITALIAN);
        await tick();

        expect(navLabel(el), 'the locale reached nothing that was already rendered')
            .toBe('Percorso di navigazione');
    });

    it('and goes back when the overrides are cleared', async () => {
        const el = await mountBreadcrumb();
        setLocaleStrings(ITALIAN);
        await tick();
        // Asserted BEFORE the clear, or this block passes on an element that never left English:
        // with the re-apply switched off it stays green and proves nothing.
        expect(navLabel(el), 'the switch did not take, so the return proves nothing')
            .toBe('Percorso di navigazione');

        clearComponentStrings();
        await tick();

        expect(navLabel(el), 'clearing the overrides left the translation behind').toBe('Breadcrumb');
    });

    it('a second component, to show this is not one element special-cased', async () => {
        const el = document.createElement('pdx-pagination') as HTMLElement & Record<string, unknown>;
        el.total = 47;
        el.pageSize = 10;
        document.body.appendChild(el);
        await tick();

        const nav = () => el.querySelector('nav')?.getAttribute('aria-label') ?? null;
        expect(nav(), 'the fixture did not start in English').toBe('Pagination');

        setLocaleStrings(ITALIAN);
        await tick();
        expect(nav(), 'the locale reached the breadcrumb and not the pagination').toBe('Impaginazione');
    });
});
