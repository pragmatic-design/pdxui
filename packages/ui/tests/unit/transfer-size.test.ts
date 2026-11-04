// pdx-transfer's size is a variant axis (#748): sm, md and lg, reflected on the host, where the design
// CSS's `@variant` rules key on it. Its `pdx-transfer-{size}` class, drawn by no rule, is gone from its
// frame. Its search field is a native `.pdx-input` with the native size class, so it is drawn by the
// text fields' own size rule, the same height as a pdx-input of that size in every theme.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';
import '../../src/transfer/pdx-transfer';

const ITEMS = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

async function transfer(attrs: Record<string, string>): Promise<HTMLElement> {
    const el = await mount('pdx-transfer', { searchable: '', ...attrs }) as HTMLElement & { items: unknown };
    el.items = ITEMS;
    await tick(200);
    return el;
}

const searchClasses = (el: Element) => [...el.querySelectorAll('[data-part="search"]')].map((s) => s.className);

describe('pdx-transfer size axis', () => {
    beforeEach(cleanup);

    it('reflects its size on the host, md by default, and a size outside the axis reflects md', async () => {
        expect((await transfer({})).getAttribute('size')).toBe('md');
        expect((await transfer({ size: 'lg' })).getAttribute('size')).toBe('lg');
        expect((await transfer({ size: 'huge' })).getAttribute('size')).toBe('md');
    });

    it('puts no size class on its frame', async () => {
        const el = await transfer({ size: 'sm' });
        expect(el.querySelector('[data-part="root"]')!.className).toBe('pdx-transfer');
    });

    it('its search fields are native pdx-inputs of its size: no size class at md', async () => {
        expect(searchClasses(await transfer({}))).toEqual(['pdx-input', 'pdx-input']);
        expect(searchClasses(await transfer({ size: 'sm' }))).toEqual(['pdx-input pdx-input-sm', 'pdx-input pdx-input-sm']);
    });

    it('a size set as a property, as a .pdx binding does, is reflected and sizes the search fields', async () => {
        const el = await transfer({}) as HTMLElement & { size: string };
        el.size = 'sm';
        await tick();
        expect(el.getAttribute('size')).toBe('sm');
        expect(searchClasses(el)).toEqual(['pdx-input pdx-input-sm', 'pdx-input pdx-input-sm']);
    });

    it('a size set after the mount resizes the search fields', async () => {
        const el = await transfer({ size: 'sm' });
        el.setAttribute('size', 'lg');
        await tick();
        expect(searchClasses(el)).toEqual(['pdx-input pdx-input-lg', 'pdx-input pdx-input-lg']);
        el.setAttribute('size', 'md');
        await tick();
        expect(searchClasses(el)).toEqual(['pdx-input', 'pdx-input']);
    });
});
