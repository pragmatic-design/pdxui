// One reader for a grid cell's editor, whatever the editor is.
//
// The keyboard commit and the click-outside commit share it. `checked` is defined on EVERY <input>,
// false on a text one, so a reader like `editor.checked !== undefined ? editor.checked : editor.value`
// reads a native text input — what a `col-edit:{field}` slot editor is most likely to be — as `false`,
// and saves `false`.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import { readCellEditorValue } from '../../src/data-grid/grid-edit';
import '../../src/input/pdx-input';

function td(html: string): HTMLElement {
    const cell = document.createElement('div');
    cell.className = 'pdx-dg-td pdx-dg-cell-editing';
    cell.innerHTML = html;
    document.body.appendChild(cell);
    return cell;
}

beforeEach(cleanup);

describe('readCellEditorValue', () => {
    it('reads a native text input by its value, not its `checked`', () => {
        expect(readCellEditorValue(td('<input type="text" value="Zed">'))).toBe('Zed');
    });

    it('reads a native checkbox by checked', () => {
        const cell = td('<input type="checkbox">');
        (cell.querySelector('input') as HTMLInputElement).checked = true;
        expect(readCellEditorValue(cell)).toBe(true);
    });

    it('reads a native number input as a number, and an empty one as null', () => {
        expect(readCellEditorValue(td('<input type="number" value="42">'))).toBe(42);
        expect(readCellEditorValue(td('<input type="number" value="">'))).toBeNull();
    });

    it('reads a native select and textarea by value', () => {
        expect(readCellEditorValue(td('<select><option value="a">A</option><option value="b" selected>B</option></select>'))).toBe('b');
        expect(readCellEditorValue(td('<textarea>two lines</textarea>'))).toBe('two lines');
    });

    it('reads a pdx-* editor by its host value — the live value', async () => {
        const cell = td('<pdx-input></pdx-input>');
        await tick(30);
        const inner = cell.querySelector('pdx-input input') as HTMLInputElement;
        inner.value = 'typed';
        inner.dispatchEvent(new Event('input', { bubbles: true }));
        expect(readCellEditorValue(cell)).toBe('typed');
    });

    it('a cell with no editor reads as undefined', () => {
        expect(readCellEditorValue(td('<span>plain</span>'))).toBeUndefined();
    });
});
