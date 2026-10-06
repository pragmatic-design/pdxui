// `<pdx-button type="submit">` submits. `<pdx-button>` does not.
//
// `type` is declared with an enum and a default of `'button'`, and the inner `<button>` carries it:
// HTML's default for a button inside a form is `submit`, so without the attribute every
// `<pdx-button>` in a form would be a submit button, including one wired to `@click="saveDraft()"`.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/button/pdx-button';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(20);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

const inner = (host: HTMLElement): HTMLButtonElement => host.querySelector('button')!;

describe('pdx-button type', () => {
    it('defaults to button, which is the opposite of what HTML defaults to', async () => {
        const host = await mount('<pdx-button>Save draft</pdx-button>');
        expect(inner(host), 'no inner button rendered').not.toBeNull();
        expect(inner(host).getAttribute('type')).toBe('button');
    });

    it('carries submit through', async () => {
        const host = await mount('<pdx-button type="submit">Send</pdx-button>');
        expect(inner(host).getAttribute('type')).toBe('submit');
    });

    it('carries reset through', async () => {
        const host = await mount('<pdx-button type="reset">Clear</pdx-button>');
        expect(inner(host).getAttribute('type')).toBe('reset');
    });

    it('does not submit the form it sits in', async () => {
        // The failure this prop prevents, written as the user meets it: a toolbar
        // button inside a form, clicked, reloading the page.
        const host = await mount('<form><pdx-button>Add row</pdx-button></form>');
        let submitted = false;
        host.querySelector('form')!.addEventListener('submit', (e) => { submitted = true; e.preventDefault(); });
        inner(host).click();
        await tick(20);
        expect(submitted, 'the button submitted the form').toBe(false);
    });
});
