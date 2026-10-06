// pdx-relation-picker — the way in.
//
// The picker exists for a list too long to scroll, so it must be searchable: a grid with no filter
// row and no prop to ask for one gives a screen over fourteen customers fifteen checkboxes and
// nowhere to type.
//
// The geometry is the manifest's (`packages/responsive/tests/manifests/relation-picker.manifest.ts`,
// two scenarios, 13 themes). What is here is the wiring `searchable` does, including the half that
// is easy to get wrong: a prop that only works when it is set BEFORE the first build.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/relation-picker/pdx-relation-picker';

/** Enough of a DataSource for the picker to build: it only checks that there is one. */
const fakeSource = () => ({ data: () => [], getById: () => undefined });

async function mount(attrs: Record<string, string> = {}) {
    const el = document.createElement('pdx-relation-picker');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    (el as unknown as { source: unknown }).source = fakeSource();
    (el as unknown as { columns: unknown }).columns = [{ field: 'name', header: 'Name' }];
    document.body.appendChild(el);
    await tick(30);
    return el;
}

const grid = (el: HTMLElement) => el.querySelector('pdx-data-grid');

beforeEach(cleanup);

describe('pdx-relation-picker builds its grid', () => {
    it('with multiple selection and the id field it was given', async () => {
        const el = await mount({ 'id-field': 'code' });
        expect(grid(el)?.getAttribute('selection')).toBe('multiple');
        expect(grid(el)?.getAttribute('id-field')).toBe('code');
    });

    it('and NO filter row by default', async () => {
        // The control for the assertion below, and the behaviour every existing caller has.
        const el = await mount();
        expect(grid(el)?.hasAttribute('filterable'),
            'the picker turned filtering on for a caller that did not ask').toBe(false);
    });
});

describe('searchable is the way in', () => {
    it('turns the grid\'s filter row on', async () => {
        const el = await mount({ searchable: '' });
        expect(grid(el)?.hasAttribute('filterable'),
            'searchable did not reach the grid: the picker cannot be searched').toBe(true);
    });

    it('and follows the prop after the first build', async () => {
        // A prop read once at build time is a prop that stops working the moment anything changes
        // it.
        const el = await mount();
        expect(grid(el)?.hasAttribute('filterable')).toBe(false);

        (el as unknown as { searchable: boolean }).searchable = true;
        await tick(30);
        expect(grid(el)?.hasAttribute('filterable'), 'the picker ignored the prop after its build').toBe(true);

        (el as unknown as { searchable: boolean }).searchable = false;
        await tick(30);
        expect(grid(el)?.hasAttribute('filterable'), 'and it never turns back off').toBe(false);
    });
});
