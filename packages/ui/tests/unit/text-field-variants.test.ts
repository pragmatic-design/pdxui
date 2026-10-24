// The text fields declare `size` as a variant axis (#627): reflected on the host, where the design
// CSS's `@variant` rules key on it, and no longer assembled into a class on their own elements.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/input/pdx-input';
import '../../src/password-input/pdx-password-input';
import '../../src/search-input/pdx-search-input';
import '../../src/textarea/pdx-textarea';
import '../../src/masked-input/pdx-masked-input';
import '../../src/tag-input/pdx-tag-input';
import '../../src/number-input/pdx-number-input';
import '../../src/otp-input/pdx-otp-input';
import '../../src/label/pdx-label';
import '../../src/form-field/pdx-form-field';

/** Each component, the size it is mounted with, and the class it used to put on its own elements. */
const FIELDS: [tag: string, size: string, oldClass: string][] = [
    ['pdx-input', 'sm', 'pdx-input-sm'],
    ['pdx-password-input', 'lg', 'pdx-input-lg'],
    ['pdx-search-input', 'xs', 'pdx-input-xs'],
    ['pdx-textarea', 'xl', 'pdx-input-xl'],
    ['pdx-masked-input', 'sm', 'pdx-input-sm'],
    ['pdx-tag-input', 'lg', 'pdx-input-lg'],
    ['pdx-number-input', 'sm', 'pdx-input-sm'],
    ['pdx-otp-input', 'lg', 'pdx-otp-lg'],
    ['pdx-label', 'xl', 'pdx-field-label-xl'],
    ['pdx-form-field', 'lg', 'pdx-field-label-lg'],
];

describe('the text fields\' size axis', () => {
    beforeEach(cleanup);

    for (const [tag, size, oldClass] of FIELDS) {
        it(`${tag} reflects its size on the host, md by default, and draws it with no class of its own`, async () => {
            const plain = await mount(tag, tag === 'pdx-form-field' ? { label: 'Name' } : {});
            const sized = await mount(tag, { size, ...(tag === 'pdx-form-field' ? { label: 'Name' } : {}) });
            await tick();
            expect([plain.getAttribute('size'), sized.getAttribute('size')]).toEqual(['md', size]);
            expect(sized.querySelector(':scope > [data-part="root"]'), 'the root part the @variant rules key on').not.toBeNull();
            expect(sized.querySelector(`.${oldClass}`), `${oldClass} is drawn from the host's size now`).toBeNull();
        });
    }

    it('a size outside the axis reflects md', async () => {
        expect((await mount('pdx-input', { size: 'huge' })).getAttribute('size')).toBe('md');
    });

    it('pdx-number-input marks its inner field, which the rules size with the group', async () => {
        const el = await mount('pdx-number-input', { size: 'sm' });
        expect(el.querySelector(':scope > [data-part="root"] > [data-part="field"].pdx-input-wrap')).not.toBeNull();
    });
});

describe('pdx-form-field passes a size on to its controls', () => {
    beforeEach(cleanup);

    async function field(size?: string): Promise<HTMLElement> {
        const el = document.createElement('pdx-form-field');
        el.setAttribute('label', 'Name');
        if (size) el.setAttribute('size', size);
        el.innerHTML = '<pdx-input size="xs"></pdx-input>';
        document.body.appendChild(el);
        await tick(); await tick();
        return el;
    }

    it('a size the author gave it', async () => {
        expect((await field('lg')).querySelector('pdx-input')!.getAttribute('size')).toBe('lg');
    });

    it('control — not its default, md, which every field reflects: the control keeps its own', async () => {
        expect((await field()).querySelector('pdx-input')!.getAttribute('size')).toBe('xs');
    });
});
