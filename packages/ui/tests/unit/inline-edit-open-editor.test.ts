// An open `<pdx-inline-edit>` editor is not rebuilt under the user's hands.
//
// An editor built inside a reactive update that reads `size`, `label`, `name`, `placeholder` and the
// component's strings is rebuilt whenever one of them changes while it is open: a new input from
// what had been typed, all of it selected, and the next key replaces it — "Jane Roe" saved as "Roe".
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, mount, tick } from './helpers';

import '../../src/inline-edit/pdx-inline-edit';

type InlineEdit = HTMLElement & { value: unknown };

const display = (el: Element) => el.querySelector('.pdx-inline-edit-display') as HTMLElement;
const input = (el: Element) => el.querySelector('input.pdx-inline-edit-input') as HTMLInputElement | null;

async function openAndType(text: string): Promise<{ el: InlineEdit; inp: HTMLInputElement }> {
    const el = await mount<InlineEdit>('pdx-inline-edit', {});
    el.value = 'John Doe';
    await tick(50);
    display(el).focus();
    display(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const inp = input(el)!;
    inp.value = text;
    inp.setSelectionRange(text.length, text.length);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return { el, inp };
}

describe('pdx-inline-edit, an open editor', () => {
    beforeEach(cleanup);

    for (const [attr, value] of [['label', 'Name'], ['size', 'sm'], ['placeholder', 'Your name']] as const) {
        it(`keeps its input, its text and its caret when ${attr} changes`, async () => {
            const { el, inp } = await openAndType('Jane ');
            el.setAttribute(attr, value);
            await tick(20);
            expect(input(el), 'the editor was rebuilt').toBe(inp);
            expect(inp.value).toBe('Jane ');
            expect(inp.selectionStart, 'the typed text is selected, and the next key replaces it').toBe(inp.selectionEnd);
            expect(document.activeElement).toBe(inp);
        });
    }

    it('the control: a new edit picks up the changed prop', async () => {
        const { el, inp } = await openAndType('Jane Roe');
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await tick(20);
        el.setAttribute('label', 'Name');
        await tick(20);
        display(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(input(el)?.getAttribute('aria-label')).toBe('Name');
    });
});
