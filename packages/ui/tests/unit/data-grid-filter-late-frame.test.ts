// A key typed into an inline filter is kept when a frame comes late (#1107).
//
// The filter row is rebuilt with the header, and each rebuild creates its controls anew. pdx-number-input
// bound its inner <input> in the frame after its first render: until that frame came it heard no key,
// and the frame wrote the stored filter over what had been typed. The text filter is the control: its
// value follows each key, so the same late frame changes nothing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/data-grid/pdx-data-grid.pdx';

type Grid = HTMLElement & Record<string, unknown>;

const PEOPLE = [
    { id: 1, name: 'Ada', age: 36 },
    { id: 2, name: 'Grace', age: 41 },
];
const COLS = [
    { field: 'name', header: 'Name' },
    { field: 'age', header: 'Age', type: 'number' },
];

async function mountGrid(): Promise<Grid> {
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLS;
    el.data = PEOPLE;
    el.filterable = true;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

/** The filter input of column `index` (0-based), the inner <input> once its control has upgraded. */
async function filterInput(el: Element, index: number): Promise<HTMLInputElement> {
    const find = () => el.querySelectorAll<HTMLElement>('.pdx-dg-filter-row [role="gridcell"]')[index]?.querySelector<HTMLInputElement>('input');
    await vi.waitFor(() => expect(find(), `no filter input in column ${index}`).toBeTruthy(), { timeout: 3000 });
    return find()!;
}

function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

const frame = window.requestAnimationFrame;
/** Every frame from now on comes 60 ms late, as on a loaded machine. */
const lateFrames = () => { window.requestAnimationFrame = (cb) => frame(() => setTimeout(() => cb(performance.now()), 60)); };

beforeEach(cleanup);
afterEach(() => { window.requestAnimationFrame = frame; });

describe('an inline filter rebuilt while a frame is late', () => {
    for (const [what, index, stored, typed] of [['number', 1, '30', '40'], ['text (the control)', 0, 'Ad', 'Gra']] as const) {
        it(`the ${what} filter keeps the key typed before the frame`, async () => {
            const el = await mountGrid();
            type(await filterInput(el, index), stored);
            await tick(400); // the filter applies, debounced, and the row is rebuilt with it

            lateFrames();
            el.columns = [...COLS]; // a header rebuild: new filter controls, set from the stored value
            await tick(10);
            const input = await filterInput(el, index);
            type(input, typed);
            await new Promise((r) => setTimeout(r, 150)); // past the late frame

            expect(input.value, `the ${what} filter's typed "${typed}" was written over`).toBe(typed);
        });
    }
});
