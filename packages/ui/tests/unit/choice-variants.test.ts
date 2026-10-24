// The choice controls declare `size` as a variant axis, and pdx-slider its `color` (#629): reflected
// on the host, where the design CSS's `@variant` rules key on them, and no longer assembled into a
// class on their own elements.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/checkbox/pdx-checkbox';
import '../../src/radio/pdx-radio';
import '../../src/switch-toggle/pdx-switch';
import '../../src/segmented/pdx-segmented';
import '../../src/slider/pdx-slider';
import '../../src/rating/pdx-rating';

/** Each control, the root part's selector from the host, and the class it used to put on itself. */
const CONTROLS: [tag: string, root: string, oldClass: string][] = [
    ['pdx-checkbox', ':scope > label > [data-part="root"]', 'pdx-checkbox-sm'],
    ['pdx-radio', ':scope > label > [data-part="root"]', 'pdx-radio-sm'],
    ['pdx-switch', ':scope > label > [data-part="root"]', 'pdx-toggle-sm'],
    ['pdx-segmented', ':scope > [data-part="root"]', 'pdx-segmented-sm'],
    ['pdx-slider', ':scope > [data-part="root"]', 'pdx-slider-sm'],
    ['pdx-rating', ':scope > [data-part="root"]', 'pdx-rating-sm'],
];

describe('the choice controls\' size axis', () => {
    beforeEach(cleanup);

    for (const [tag, root, oldClass] of CONTROLS) {
        it(`${tag} reflects its size on the host, md by default, and draws it with no class of its own`, async () => {
            const plain = await mount(tag);
            const sized = await mount(tag, { size: 'sm' });
            await tick(50);
            expect([plain.getAttribute('size'), sized.getAttribute('size')]).toEqual(['md', 'sm']);
            expect(sized.querySelector(root), 'the root part the @variant rules key on').not.toBeNull();
            expect(sized.querySelector(`.${oldClass}`), `${oldClass} is drawn from the host's size now`).toBeNull();
        });
    }

    it('a size outside the axis reflects md', async () => {
        expect((await mount('pdx-checkbox', { size: 'xl' })).getAttribute('size')).toBe('md');
    });
});

describe('pdx-slider\'s color axis', () => {
    beforeEach(cleanup);

    it('reflects its colour on the host, primary by default, and puts no class for it on its root', async () => {
        const plain = await mount('pdx-slider');
        const warning = await mount('pdx-slider', { color: 'warning' });
        await tick(50);
        expect([plain.getAttribute('color'), warning.getAttribute('color')]).toEqual(['primary', 'warning']);
        expect(warning.querySelector('.pdx-slider-warning')).toBeNull();
    });
});
