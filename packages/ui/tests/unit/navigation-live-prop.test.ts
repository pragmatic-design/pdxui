// After a user move, a navigation widget's own property equals the value it emitted, already when
// the event is dispatched. The check of form-controls-live-prop.test.ts, for three navigation
// widgets: pdx-tabs `value`, pdx-pagination `page` / `pageSize`, pdx-wizard `value`.
//
// And writing the value back is not a second move: no second event, no second rebuild, and the
// keyboard keeps working.

import { describe, it, expect, beforeEach } from 'vitest';
import { createDataSource } from '@pdxui/core';
import { cleanup, tick } from './helpers';

import '../../src/tabs/pdx-tabs';
import '../../src/pagination/pdx-pagination';
import '../../src/wizard/pdx-wizard';

type Detail = Record<string, unknown>;
type Host = HTMLElement & Record<string, unknown>;

const TABS = `
    <pdx-tabs value="a">
        <div class="pdx-tabs"><button class="pdx-tab" data-tab="a">A</button><button class="pdx-tab" data-tab="b">B</button><button class="pdx-tab" data-tab="c">C</button></div>
        <div data-tab-panel="a">A</div><div data-tab-panel="b">B</div><div data-tab-panel="c">C</div>
    </pdx-tabs>`;

const WIZARD = `
    <pdx-wizard>
        <div data-wizard-step data-label="One">1</div>
        <div data-wizard-step data-label="Two">2</div>
        <div data-wizard-step data-label="Three">3</div>
    </pdx-wizard>`;

async function mount(html: string): Promise<Host> {
    document.body.innerHTML = html;
    await tick(50);
    return document.body.firstElementChild as Host;
}

/** Every `event` dispatched, with the listed properties read INSIDE the listener. */
function record(el: Host, event: string, props: string[]): { detail: Detail; atEmit: Record<string, unknown> }[] {
    const seen: { detail: Detail; atEmit: Record<string, unknown> }[] = [];
    el.addEventListener(event, (e) => {
        const atEmit: Record<string, unknown> = {};
        for (const p of props) atEmit[p] = el[p];
        seen.push({ detail: (e as CustomEvent<Detail>).detail, atEmit });
    });
    return seen;
}

beforeEach(cleanup);

describe('after a user move, the property is the emitted value', () => {
    it('pdx-tabs: a click on a tab', async () => {
        const el = await mount(TABS);
        const seen = record(el, 'pdx-change', ['value']);
        el.querySelector<HTMLElement>('[data-tab="b"]')!.click();
        await tick();
        expect(seen, 'one pdx-change for one click').toHaveLength(1);
        expect(seen[0].detail.value).toBe('b');
        expect(seen[0].atEmit.value, 'el.value when pdx-change was dispatched').toBe('b');
        expect(el.value, 'el.value after the frame').toBe('b');
        expect(el.querySelector('[data-tab="b"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('pdx-pagination: a click on a page', async () => {
        const el = await mount('<pdx-pagination total="100" page-size="10" page="1"></pdx-pagination>');
        const seen = record(el, 'pdx-change', ['page']);
        el.querySelector<HTMLElement>('[data-page-key="page:2"]')!.click();
        await tick();
        expect(seen, 'one pdx-change for one click').toHaveLength(1);
        expect(seen[0].detail.page).toBe(2);
        expect(seen[0].atEmit.page, 'el.page when pdx-change was dispatched').toBe(2);
        expect(el.page, 'el.page after the frame').toBe(2);
        expect(el.querySelector('[aria-current="page"]')!.textContent).toBe('2');
    });

    it('pdx-pagination: a page with no page prop at all (the default -1)', async () => {
        const el = await mount('<pdx-pagination total="100"></pdx-pagination>');
        el.querySelector<HTMLElement>('[data-page-key="page:2"]')!.click();
        await tick();
        expect(el.page).toBe(2);
    });

    it('pdx-pagination: a new page size, and page 1 with it', async () => {
        const el = await mount('<pdx-pagination total="100" page-size="10" page="3" show-page-size></pdx-pagination>');
        const seen = record(el, 'pdx-change', ['page', 'pageSize']);
        // The size control is a pdx-select: opened and picked as a person does.
        (el.querySelector('.pdx-pagination-size .pdx-select-trigger') as HTMLElement).click();
        await tick();
        [...el.querySelectorAll<HTMLElement>('.pdx-pagination-size [role="option"]')].find(o => o.textContent?.trim() === '50')!.click();
        await tick();
        expect(seen).toHaveLength(1);
        expect(seen[0].atEmit, 'el.page and el.pageSize when pdx-change was dispatched').toEqual({ page: 1, pageSize: 50 });
        expect({ page: el.page, pageSize: el.pageSize }).toEqual({ page: 1, pageSize: 50 });
        // The size sticks: with the prop left at 10, a rebuild would go back to 10 pages of 10.
        expect(el.querySelector<HTMLElement & { value: string }>('.pdx-pagination-size')!.value).toBe('50');
        expect(el.querySelector('[data-page-key="page:3"]'), '100 items in pages of 50 is two pages').toBeNull();
    });

    it('pdx-wizard: Next', async () => {
        const el = await mount(WIZARD);
        const seen = record(el, 'pdx-change', ['value']);
        el.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await tick();
        expect(seen, 'one pdx-change for one click').toHaveLength(1);
        expect(seen[0].detail.value).toBe(1);
        expect(seen[0].atEmit.value, 'el.value when pdx-change was dispatched').toBe(1);
        expect(el.value, 'el.value after the frame').toBe(1);
    });
});

describe('writing the value back is not a second move', () => {
    it('pdx-pagination: the page buttons are built once per click, not again a frame later', async () => {
        const el = await mount('<pdx-pagination total="100" page-size="10" page="1"></pdx-pagination>');
        el.querySelector<HTMLElement>('[data-page-key="page:2"]')!.click();
        const built = el.querySelector('[data-page-key="next"]');
        await tick();
        expect(el.querySelector('[data-page-key="next"]'), 'the buttons were rebuilt by the reflection').toBe(built);
    });

    it('pdx-pagination on a DataSource, with no page prop: a click leaves the page to the source', async () => {
        // The data-grid footer is built this way. Writing `page` would pin it: the source moving
        // back to page 1 (a new filter, a new sort) would no longer move the pager.
        const el = await mount('<pdx-pagination></pdx-pagination>');
        const source = createDataSource({ data: Array.from({ length: 100 }, (_, i) => ({ id: i })), pageSize: 10 });
        el.source = source;
        await tick(50);
        el.querySelector<HTMLElement>('[data-page-key="page:2"]')!.click();
        await tick();
        expect(source.page()).toBe(2);
        expect(el.page, 'the prop stays "follow the source"').toBe(-1);
        source.setPage(1);
        await tick();
        expect(el.querySelector('[aria-current="page"]')!.textContent).toBe('1');
    });

    it('control: a page set by the parent is still applied', async () => {
        const el = await mount('<pdx-pagination total="100" page-size="10" page="1"></pdx-pagination>');
        el.page = 5;
        await tick();
        expect(el.querySelector('[aria-current="page"]')!.textContent).toBe('5');
    });

    it('pdx-tabs: a value set by the parent activates that tab, once', async () => {
        const el = await mount(TABS);
        const seen = record(el, 'pdx-change', ['value']);
        el.value = 'c';
        await tick();
        expect(seen.map((s) => s.detail.value)).toEqual(['c']);
        expect(el.querySelector('[data-tab="c"]')!.getAttribute('aria-selected')).toBe('true');
    });

    it('pdx-wizard: after a step, the arrow keys still move between the step buttons', async () => {
        const el = await mount(WIZARD);
        el.querySelector<HTMLButtonElement>('[data-wizard-next]')!.click();
        await tick();
        const buttons = el.querySelectorAll<HTMLElement>('[data-step-btn]');
        buttons[0].focus();
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(buttons[1]);
    });

    it('pdx-wizard: after the parent sets the step, the arrow keys still move between the step buttons', async () => {
        const el = await mount(WIZARD);
        el.value = 1;
        await tick();
        const buttons = el.querySelectorAll<HTMLElement>('[data-step-btn]');
        buttons[0].focus();
        buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(buttons[1]);
    });
});
