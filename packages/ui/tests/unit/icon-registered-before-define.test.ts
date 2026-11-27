// A <pdx-icon> already in the page when pdx-icon's module loads draws its icon (#1264).
//
// customElements.define upgrades the <pdx-icon>s already in the document at once, and each one's first
// draw asks resolveIcon for its name. The default set's resolver has to be registered before that
// define, or the first resolveIcon returns null and the icon is never drawn: the effect does not run
// again. The registration is a side-effect import, icon-setup.ts, that the component's module imports
// first, so ES module order runs it before the component's own code — with no code at the component's
// module level, which a .pdx does not have.
//
// This file is its own module graph: nothing imports pdx-icon before the element is in the page.

import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, tick } from './helpers';

afterEach(cleanup);

/** Wait, a frame at a time, until `el` holds an SVG, or give up after `frames`. */
async function svgOf(el: Element, frames = 50): Promise<SVGElement | null> {
    for (let i = 0; i < frames && !el.querySelector('svg'); i++) await tick();
    return el.querySelector('svg');
}

describe('pdx-icon in the page before its module loads', () => {
    it('<pdx-icon name="check"> draws its SVG once the module defines it', async () => {
        const el = document.createElement('pdx-icon');
        el.setAttribute('name', 'check');
        document.body.appendChild(el);
        expect(customElements.get('pdx-icon'), 'pdx-icon was defined before the test put one in the page').toBeUndefined();

        await import('../../src/icon/pdx-icon.pdx');
        expect(customElements.get('pdx-icon'), 'the module did not define pdx-icon').toBeDefined();

        // Not imported by anything: the default set's resolver loads the check icon's module on demand.
        expect(await svgOf(el), 'the icon in the page before the define drew nothing').not.toBeNull();
    });
});
