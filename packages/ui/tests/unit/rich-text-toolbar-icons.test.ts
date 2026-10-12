// pdx-rich-text's toolbar draws its icons when nothing else on the page loaded pdx-icon.
//
// The toolbar builds a `<pdx-icon>` per button, and no module of the editor imported pdx-icon: on a
// page where the editor was the only thing that drew an icon, every button stayed an unknown element
// with nothing inside. Nothing showed it while a test or an app imported the whole library. This file
// is its own module graph: it imports the editor and nothing else.
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';
import { PRAGMATIC_LOADERS } from '../../src/icon/pragmatic-loaders';

const settle = (ms = 100): Promise<void> => new Promise(r => setTimeout(r, ms));

describe('pdx-rich-text toolbar icons', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('registers pdx-icon and draws the icon of every button', async () => {
        const el = document.createElement('pdx-rich-text');
        el.setAttribute('toolbar', 'full');
        document.body.appendChild(el);
        await settle();
        const icons = Array.from(el.querySelectorAll('.pdx-rt-toolbar-btn pdx-icon'));
        expect(icons.length, 'the toolbar has no icons: nothing is being measured').toBeGreaterThan(5);
        expect(customElements.get('pdx-icon'), 'the toolbar draws <pdx-icon> and nothing registers it').toBeDefined();
        await settle();
        // A name the set does not have draws nothing whoever registers what: heading-1…3 are #332.
        const inSet = icons.filter(i => Object.hasOwn(PRAGMATIC_LOADERS, i.getAttribute('name') ?? ''));
        expect(inSet.length).toBeGreaterThan(5);
        const empty = inSet.filter(i => !i.querySelector('svg')).map(i => i.getAttribute('name'));
        expect(empty, 'toolbar icons drawn with nothing inside').toEqual([]);
    });
});
