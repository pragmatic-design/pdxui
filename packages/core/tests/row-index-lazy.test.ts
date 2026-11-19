// A `@for` row's index is a signal only once something reads it (#1204).
//
// `eachRow` hands a row two getters, `item()` and `index()`, and each was backed by a signal of its own:
// a Set and five closures per row. Most rows never read their index — js-framework-benchmark's do not —
// and paid for it anyway, 1,000 times in the benchmark's memory case. The index is now a plain number
// until it is read; the first read makes the signal, and a moved row's index then follows.

import { describe, it, expect, vi, afterEach } from 'vitest';
import type * as SignalModule from '../src/reactivity/signal';

vi.mock('../src/reactivity/signal', async (importOriginal) => {
    const real = await importOriginal<typeof SignalModule>();
    return { ...real, signal: vi.fn(real.signal) };
});

import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { eachRow } from '../src/renderer/helpers';

type Row = { id: number; v: string };
const created = vi.mocked(signal);

afterEach(() => { document.body.innerHTML = ''; created.mockClear(); });

function mount(frag: DocumentFragment): HTMLElement {
    const host = document.createElement('ul');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
}

const ROWS: Row[] = [1, 2, 3, 4, 5].map((id) => ({ id, v: `r${id}` }));

describe("a @for row's index", () => {
    it('costs no signal when the row never reads it: one signal a row, its item', () => {
        const rows = signal(ROWS);
        created.mockClear();
        mount(eachRow(() => rows(), 'id', (item: () => Row) => html`<li>${() => item().v}</li>`));
        expect(created).toHaveBeenCalledTimes(ROWS.length);
    });

    it('control: a row that reads it has its index signal too', () => {
        const rows = signal(ROWS);
        created.mockClear();
        mount(eachRow(() => rows(), 'id', (item: () => Row, index: () => number) =>
            html`<li>${() => `${index()}:${item().v}`}</li>`));
        expect(created).toHaveBeenCalledTimes(ROWS.length * 2);
    });

    it('read in a binding, it follows the row when the row moves', () => {
        const rows = signal(ROWS);
        const host = mount(eachRow(() => rows(), 'id', (item: () => Row, index: () => number) =>
            html`<li>${() => `${index()}:${item().v}`}</li>`));
        rows.set([...ROWS].reverse());
        expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['0:r5', '1:r4', '2:r3', '3:r2', '4:r1']);
    });

    it('read for the first time after the row moved, it is the new position', () => {
        const rows = signal(ROWS);
        const getters: (() => number)[] = [];
        mount(eachRow(() => rows(), 'id', (item: () => Row, index: () => number) => {
            getters[item().id] = index;
            return html`<li>${() => item().v}</li>`;
        }));
        rows.set([...ROWS].reverse());
        expect(getters[1](), 'row 1 is last after the reverse').toBe(4);
        expect(getters[5]()).toBe(0);
    });
});
