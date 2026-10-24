// The pickers declare `size` as a variant axis (#628): reflected on the host, where the design CSS's
// `@variant` rules key on it, and no longer assembled into a class on their own elements.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/select/pdx-select';
import '../../src/autocomplete/pdx-autocomplete';
import '../../src/cascader/pdx-cascader';
import '../../src/tree-select/pdx-tree-select';
import '../../src/date-picker/pdx-date-picker';
import '../../src/time-picker/pdx-time-picker';
import '../../src/color-picker/pdx-color-picker';
import '../../src/file-upload/pdx-file-upload';

/** Each picker, the size it is mounted with, and the class it used to put on its own elements. */
const PICKERS: [tag: string, size: string, oldClass: string][] = [
    ['pdx-select', 'sm', 'pdx-input-sm'],
    ['pdx-autocomplete', 'lg', 'pdx-input-lg'],
    ['pdx-cascader', 'xs', 'pdx-input-xs'],
    ['pdx-tree-select', 'xl', 'pdx-input-xl'],
    ['pdx-date-picker', 'sm', 'pdx-input-sm'],
    ['pdx-time-picker', 'lg', 'pdx-time-picker-lg'],
    ['pdx-color-picker', 'sm', 'pdx-color-swatch-sm'],
    ['pdx-file-upload', 'lg', 'pdx-file-upload-lg'],
];

describe('the pickers\' size axis', () => {
    beforeEach(cleanup);

    for (const [tag, size, oldClass] of PICKERS) {
        it(`${tag} reflects its size on the host, md by default, and draws it with no class of its own`, async () => {
            const plain = await mount(tag);
            const sized = await mount(tag, { size });
            await tick(100);
            expect([plain.getAttribute('size'), sized.getAttribute('size')]).toEqual(['md', size]);
            expect(sized.querySelector(':scope > [data-part="root"]'), 'the root part the @variant rules key on').not.toBeNull();
            expect(sized.querySelector(`.${oldClass}`), `${oldClass} is drawn from the host's size now`).toBeNull();
        });
    }

    it('a size outside the axis reflects md', async () => {
        expect((await mount('pdx-time-picker', { size: 'xl' })).getAttribute('size'), 'xl is not one of the time picker\'s sizes').toBe('md');
    });
});
