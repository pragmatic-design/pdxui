// A menu item can say what language its label is in.
//
// A language picker lists each language in itself — «English», «Italiano» — and a screen reader
// reading «Italiano» with an English voice mispronounces it. WCAG 3.1.2 (Language of Parts): `lang`
// on the part. `MenuItem` is shared by five builders, so the field is honoured by all five: a shared
// type that some of its readers ignore is a field that works depending on which menu you picked.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/dropdown-menu/pdx-dropdown-menu';
import '../../src/menu/pdx-menu';
import '../../src/context-menu/pdx-context-menu';
import '../../src/split-button/pdx-split-button';
import '../../src/menubar/pdx-menubar';

const items = () => [
    { key: 'en', label: 'English · EN', type: 'radio', radioGroup: 'locale', lang: 'en', checked: true },
    { key: 'it', label: 'Italiano · IT', type: 'radio', radioGroup: 'locale', lang: 'it' },
    { key: 'plain', label: 'Plain' },
];

/** Every rendered item with this key, wherever its builder put it. */
const rendered = (key: string) => [...document.querySelectorAll(`[data-menu-key="${key}"]`)] as HTMLElement[];

describe('MenuItem.lang', () => {
    beforeEach(cleanup);

    it('pdx-menu writes it on the item', async () => {
        const menu = document.createElement('pdx-menu');
        (menu as any).items = items();
        menu.setAttribute('open', '');
        document.body.appendChild(menu);
        await tick(50);
        expect(rendered('it').map(el => el.lang)).toEqual(['it']);
        expect(rendered('en').map(el => el.lang)).toEqual(['en']);
    });

    it('pdx-dropdown-menu writes it on the item', async () => {
        const el = document.createElement('pdx-dropdown-menu');
        el.setAttribute('label', 'Language');
        (el as any).items = items();
        document.body.appendChild(el);
        await tick(50);
        (el as any).open();
        await tick(50);
        expect(rendered('it').map(b => b.lang)).toEqual(['it']);
    });

    it('the three other builders write it too', async () => {
        const ctxMenu = document.createElement('pdx-context-menu');
        (ctxMenu as any).items = items();
        document.body.appendChild(ctxMenu);

        const split = document.createElement('pdx-split-button');
        split.setAttribute('label', 'Save');
        (split as any).items = items();
        document.body.appendChild(split);

        const bar = document.createElement('pdx-menubar');
        document.body.appendChild(bar);
        await tick(50);
        (bar as any).items = [{ key: 'file', label: 'File', children: items() }];
        await tick(50);

        (ctxMenu as any).open(20, 20);
        (split.querySelector('.pdx-split-arrow') as HTMLButtonElement).click();
        (bar.querySelector('.pdx-menubar-trigger') as HTMLButtonElement).click();
        await tick(50);

        const langs = rendered('it').map(el => el.lang);
        expect(langs, 'one rendered item per builder').toHaveLength(3);
        expect(langs).toEqual(['it', 'it', 'it']);
    });

    it('control — an item that does not say stays unmarked, and inherits the page’s', async () => {
        const menu = document.createElement('pdx-menu');
        (menu as any).items = items();
        menu.setAttribute('open', '');
        document.body.appendChild(menu);
        await tick(50);
        expect(rendered('plain')[0].hasAttribute('lang')).toBe(false);
    });
});
