// `show-page-size` shows a page-size selector.
//
// `showPageSize` and `pageSizes` are declared, typed, defaulted, and listed in the generated
// catalogue — the pair a reader looks for first on a pager — so they must also do something: a prop
// that is declared, documented, demoed and inert is what no-dead-props.test.ts scans for.
//
// The selector is a `pdx-select`, not the browser's `<select>`: turned on in a list, it would be the
// one native dropdown on a page otherwise kept free of them.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/pagination/pdx-pagination';

type SizeSelect = HTMLElement & { value: string | null; options: { value: string; label: string }[] };

// ⚠️ `await tick()`: the component builds its DOM in a frame after connection, so a synchronous read
// finds nothing — and a test asserting ABSENCE would pass for that reason rather than the one it
// claims. The "absent by default" case below is exactly that shape, so it waits too.
async function mount(attrs: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = `<pdx-pagination total="100" page="1" page-size="10" ${attrs}></pdx-pagination>`;
    document.body.appendChild(host);
    await tick(20);
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

    it('emits pdx-change with the new size, and goes back to page 1', async () => {
        // Page 1 is not a detail: staying on page 9 of 20 while the size triples lands past the end.
        const host = await mount('show-page-size page="3"');
        const el = host.querySelector('pdx-pagination')!;
        const seen: unknown[] = [];
        el.addEventListener('pdx-change', (e) => seen.push((e as CustomEvent).detail));

        await chooseSize(host, '50');

        // One event, the pager's: the select's own pdx-change does not leak out of it as a second.
        expect(seen).toEqual([{ page: 1, pageSize: 50 }]);
    });

    it('has an accessible name, and a translatable one', async () => {
        const host = await mount('show-page-size');
        const combobox = selector(host)!.querySelector('[role="combobox"]')!;
        expect(combobox.getAttribute('aria-label')).toBe('Rows per page');
    });
});
