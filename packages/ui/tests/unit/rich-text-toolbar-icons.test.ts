// pdx-rich-text's toolbar draws its icons when nothing else on the page loaded pdx-icon.
//
// The toolbar builds a `<pdx-icon>` per button, and no module of the editor imported pdx-icon: on a
// page where the editor was the only thing that drew an icon, every button stayed an unknown element
// with nothing inside. Nothing showed it while a test or an app imported the whole library. This file
// is its own module graph: it imports the editor and nothing else.
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/rich-text/pdx-rich-text';

const settle = (ms = 100): Promise<void> => new Promise(r => setTimeout(r, ms));

/** The toolbar's buttons as a config draws them, once their icons have had time to load. */
async function toolbarIcons(toolbar: string): Promise<Element[]> {
    const el = document.createElement('pdx-rich-text');
    el.setAttribute('toolbar', toolbar);
    document.body.appendChild(el);
    await settle();
    await settle();
    return Array.from(el.querySelectorAll('.pdx-rt-toolbar-btn pdx-icon'));
}

describe('pdx-rich-text toolbar icons', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('registers pdx-icon and draws the icon of every button', async () => {
        const icons = await toolbarIcons('full');
        expect(icons.length, 'the toolbar has no icons: nothing is being measured').toBeGreaterThan(5);
        expect(customElements.get('pdx-icon'), 'the toolbar draws <pdx-icon> and nothing registers it').toBeDefined();
        const empty = icons.filter(i => !i.querySelector('svg')).map(i => i.getAttribute('name'));
        expect(empty, 'toolbar icons drawn with nothing inside').toEqual([]);
    });

    it('draws the numbered heading buttons, whose icons the set lacked (#332)', async () => {
        const icons = await toolbarIcons('heading1 heading2 heading3');
        expect(icons.map(i => i.getAttribute('name'))).toEqual(['heading-1', 'heading-2', 'heading-3']);
        const empty = icons.filter(i => !i.querySelector('svg')).map(i => i.getAttribute('name'));
        expect(empty, 'toolbar icons drawn with nothing inside').toEqual([]);
    });
});
