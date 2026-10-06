// pdx-input and pdx-textarea reach their inner control when they need it, not at setup.
//
// A setup-time ctx.track that caches `inputEl = el.querySelector('input')` runs before the template
// renders, so it gets null, and re-runs only when a prop it reads changes: a field whose value never
// changes keeps `null` for its whole life. Clear then emits an empty value and leaves the text in the
// field, with focus on the clear button; `autofocus` on an input added after load does nothing; a
// click on the frame focuses nothing. It is the "touch the DOM in setup" trap
// docs/architecture/core.md describes.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/input/pdx-input';
import '../../src/textarea/pdx-textarea';

async function mountHtml(html: string): Promise<HTMLElement> {
    document.body.innerHTML = html;
    await tick(30);
    return document.body.firstElementChild as HTMLElement;
}

beforeEach(cleanup);

describe('pdx-input', () => {
    it('Clear empties the field the user sees and gives focus back to it', async () => {
        const el = await mountHtml('<pdx-input clearable></pdx-input>');
        const input = el.querySelector('input') as HTMLInputElement;
        input.value = 'abc';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();

        const clear = el.querySelector('.pdx-input-clear') as HTMLButtonElement;
        expect(clear, 'no clear button once there is text').toBeTruthy();
        clear.focus();
        clear.click();
        await tick();

        expect(input.value).toBe('');
        expect(document.activeElement, 'focus stayed on the clear button').toBe(input);
    });

    it('autofocus works on an input added after the page loaded', async () => {
        await mountHtml('<div id="host"></div>');
        const el = document.createElement('pdx-input');
        el.setAttribute('autofocus', '');
        document.getElementById('host')!.appendChild(el);
        await tick(30);

        expect(document.activeElement).toBe(el.querySelector('input'));
    });

    it('a click on the frame focuses the input', async () => {
        const el = await mountHtml('<pdx-input></pdx-input>');
        (el.querySelector('.pdx-input-wrap') as HTMLElement).click();
        expect(document.activeElement).toBe(el.querySelector('input'));
    });
});

describe('pdx-textarea', () => {
    it('a click on the frame focuses the textarea', async () => {
        const el = await mountHtml('<pdx-textarea></pdx-textarea>');
        const wrap = el.querySelector('textarea')!.parentElement as HTMLElement;
        wrap.click();
        expect(document.activeElement).toBe(el.querySelector('textarea'));
    });
});
