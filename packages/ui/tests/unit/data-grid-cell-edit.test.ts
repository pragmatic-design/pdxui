// A cell edited by TYPING is saved.
//
// A test that starts the edit and sets the value programmatically never types, and typing is the
// path that matters: double-click "Alice Johnson", type, press Enter. The grid reads the editor's
// value from the pdx-input HOST (it precedes the inner <input> in document order), so the host's
// `value` must follow typing; otherwise the "new" value equals the original, the edit is treated as
// unchanged, the grid emits pdx-cell-edit-cancel and the cell shows the old name again. Tab and a
// click outside behave the same way, and in batch mode "Save All" would have nothing to save.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { createDataSource } from '@pdxui/core';
import '../../src/data-grid/pdx-data-grid';

interface Row extends Record<string, unknown> { id: number; name: string; city: string; age: number }

const ROWS: Row[] = [
    { id: 1, name: 'Alice Johnson', city: 'Torino', age: 36 },
    { id: 2, name: 'Bob Smith', city: 'Milano', age: 41 },
];
const COLUMNS = [
    { field: 'name', header: 'Name' },
    { field: 'city', header: 'City' },
    { field: 'age', header: 'Age', type: 'number' },
];

type Grid = HTMLElement & { columns: unknown; source: unknown; editable: boolean; editMode: string; commitBatch(): void };

async function mountGrid(editMode: 'cell' | 'batch') {
    const source = createDataSource<Row>({ data: ROWS.map(r => ({ ...r })), pageSize: 0 });
    const el = document.createElement('pdx-data-grid') as Grid;
    el.columns = COLUMNS;
    el.source = source;
    el.editable = true;
    el.editMode = editMode;
    document.body.appendChild(el);
    await tick(30);
    const events: { type: string; detail: Record<string, unknown> }[] = [];
    for (const type of ['pdx-cell-edit-end', 'pdx-cell-edit-cancel', 'pdx-batch-commit']) {
        el.addEventListener(type, (e) => events.push({ type, detail: (e as CustomEvent).detail }));
    }
    return { el, source, events };
}

const cell = (el: HTMLElement, id: number, field: string) =>
    el.querySelector<HTMLElement>(`.pdx-dg-row[data-row-id="${id}"] .pdx-dg-td[data-field="${field}"]`)!;

/** Double-click a cell and wait for its editor to take the value. */
async function openEditor(el: HTMLElement, id: number, field: string): Promise<HTMLInputElement> {
    cell(el, id, field).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await tick(30);
    const field$ = el.querySelector<HTMLInputElement>('.pdx-dg-cell-editing input');
    expect(field$, `no editor opened on ${id}.${field}: ${cell(el, id, field)?.outerHTML.slice(0, 300)}`).toBeTruthy();
    return field$!;
}

function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(target: Element, key: string): void {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(cleanup);

describe('cell editing by typing', () => {
    it('Enter saves the typed text', async () => {
        const { el, source, events } = await mountGrid('cell');
        const input = await openEditor(el, 1, 'name');
        type(input, 'Zed Edited');
        press(input, 'Enter');
        await tick(30);

        expect(events.map(e => e.type)).toContain('pdx-cell-edit-end');
        expect(events.map(e => e.type)).not.toContain('pdx-cell-edit-cancel');
        expect(events.find(e => e.type === 'pdx-cell-edit-end')!.detail.newValue).toBe('Zed Edited');
        expect((source.getById(1) as Row).name).toBe('Zed Edited');
        expect(cell(el, 1, 'name').textContent).toContain('Zed Edited');
    });

    it('Tab saves the typed text and moves on to the next cell', async () => {
        const { el, source } = await mountGrid('cell');
        const input = await openEditor(el, 1, 'name');
        type(input, 'Tabbed');
        press(input, 'Tab');
        await tick(30);

        expect((source.getById(1) as Row).name).toBe('Tabbed');
        expect(cell(el, 1, 'city').classList.contains('pdx-dg-cell-editing')).toBe(true);
    });

    it('a click outside saves the typed text', async () => {
        const { el, source } = await mountGrid('cell');
        const input = await openEditor(el, 1, 'name');
        type(input, 'Clicked away');
        await tick(30); // the outside listener is installed a frame after the editor opens
        document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        await tick(30);

        expect((source.getById(1) as Row).name).toBe('Clicked away');
    });

    it('a number column saves the typed number, as a number', async () => {
        const { el, source } = await mountGrid('cell');
        const input = await openEditor(el, 2, 'age');
        type(input, '42');
        press(input, 'Enter');
        await tick(30);

        expect((source.getById(2) as Row).age).toBe(42);
    });

    it('Escape still throws the typed text away — the control', async () => {
        const { el, source, events } = await mountGrid('cell');
        const input = await openEditor(el, 1, 'name');
        type(input, 'Never saved');
        press(input, 'Escape');
        await tick(30);

        expect(events.map(e => e.type)).toContain('pdx-cell-edit-cancel');
        expect((source.getById(1) as Row).name).toBe('Alice Johnson');
    });
});

describe('batch editing by typing', () => {
    it('the typed change waits for Save All, which applies it and says how many rows it saved', async () => {
        const { el, source, events } = await mountGrid('batch');
        const input = await openEditor(el, 1, 'name');
        type(input, 'Batched');
        press(input, 'Enter');
        await tick(30);

        expect((source.getById(1) as Row).name, 'batch mode wrote to the source before Save All').toBe('Alice Johnson');
        el.commitBatch();
        await tick(30);

        expect((source.getById(1) as Row).name).toBe('Batched');
        // Emitted before the changes are cleared: after, it would always say 0.
        expect(events.find(e => e.type === 'pdx-batch-commit')!.detail.count).toBe(1);
    });
});
