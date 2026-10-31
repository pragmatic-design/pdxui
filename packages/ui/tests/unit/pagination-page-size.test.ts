// `show-page-size` shows a page-size selector.
//
// `showPageSize` and `pageSizes` are declared, typed, defaulted, and listed in the generated
// catalogue — the pair a reader looks for first on a pager — so they must also do something: a prop
// that is declared, documented, demoed and inert is what no-dead-props.test.ts scans for.
//
// The selector is a `pdx-select`, not the browser's `<select>`: turned on in a list, it would be the
// one native dropdown on a page otherwise kept free of them.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tick, whenUpgraded } from './helpers';
import '../../src/pagination/pdx-pagination';

// The pager imports pdx-select lazily (#407). Held back here, as a contended gate holds it, so a test
// that reads the select before it is upgraded fails every time instead of once in a while (#692).
vi.mock('../../src/select/pdx-select', async (importOriginal) => {
    await new Promise((r) => setTimeout(r, 300));
    return importOriginal();
});

type SizeSelect = HTMLElement & { value: string | null; options: { value: string; label: string }[] };

// ⚠️ `await tick()`: the component builds its DOM in a frame after connection, so a synchronous read
// finds nothing — and a test asserting ABSENCE would pass for that reason rather than the one it
// claims. The "absent by default" case below is exactly that shape, so it waits too.
async function mount(attrs: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    // `attrs` first: the parser keeps the first of two equal attributes, so a `page="3"` passed in
    // would otherwise lose to the default `page="1"`.
    host.innerHTML = `<pdx-pagination ${attrs} total="100" page="1" page-size="10"></pdx-pagination>`;
    document.body.appendChild(host);
    await tick(20);
    // The selector is a lazily imported pdx-select: read once it is upgraded (#692).
    await whenUpgraded(host.querySelector('.pdx-pagination-size'));
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

const selector = (host: HTMLElement): SizeSelect | null =>
    host.querySelector('.pdx-pagination-size');

/** Pick a size the way a person does: open the select, click the option. */
async function chooseSize(host: HTMLElement, size: string): Promise<void> {
    const sel = selector(host)!;
    (sel.querySelector('.pdx-select-trigger') as HTMLElement).click();
    await tick(20);
    const option = [...sel.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.trim() === size);
    if (!option) throw new Error(`no option ${size} in the page-size select`);
    option.click();
    await tick(20);
}

describe('pdx-pagination page size', () => {
    it('is absent by default, because the prop defaults to false', async () => {
        const host = await mount('');
        expect(host.querySelector('.pdx-pagination'), 'the pager rendered at all').not.toBeNull();
        expect(selector(host)).toBeNull();
    });

    it('appears when asked for, as a pdx-select and not a native select', async () => {
        const host = await mount('show-page-size');
        const sel = selector(host);
        expect(sel, 'show-page-size rendered no selector').not.toBeNull();
        expect(sel!.tagName).toBe('PDX-SELECT');
        expect(host.querySelector('select'), 'a native <select> in the pager').toBeNull();
    });

    it('offers the default sizes', async () => {
        const sel = selector(await mount('show-page-size'))!;
        expect(sel.options.map((o) => Number(o.value))).toEqual([10, 20, 50, 100]);
    });

    it('marks the size currently in use', async () => {
        const sel = selector(await mount('show-page-size'))!;
        expect(Number(sel.value)).toBe(10);
    });

    it('announces the new size by page-size-change, and page 1 by page-change', async () => {
        // Page 1 is not a detail: staying on page 9 of 20 while the size triples lands past the end.
        const host = await mount('show-page-size page="3"');
        const el = host.querySelector('pdx-pagination')!;
        const seen: unknown[] = [];
        // The models' events since #289.
        for (const name of ['page-size-change', 'page-change', 'value-change']) {
            el.addEventListener(name, (e) => seen.push([name, (e as CustomEvent).detail]));
        }

        await chooseSize(host, '50');

        // The pager's own, one each: the select's value-change does not bubble out of it as a third.
        expect(seen).toEqual([['page-size-change', { value: 50 }], ['page-change', { value: 1 }]]);
    });

    it('has an accessible name, and a translatable one', async () => {
        const host = await mount('show-page-size');
        const combobox = selector(host)!.querySelector('[role="combobox"]')!;
        expect(combobox.getAttribute('aria-label')).toBe('Rows per page');
    });
});
