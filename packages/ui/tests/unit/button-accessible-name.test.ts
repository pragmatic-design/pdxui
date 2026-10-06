// An icon-only `<pdx-button>` can be named.
//
// `aria-label` written on `<pdx-button>` must not stay on the host, which has no role: an icon-only
// button would be announced "button". The name is forwarded to the native `<button>` that carries
// the role, and follows the attribute; a button
// with nothing to be called by is reported, because it renders fine and nothing else would say so.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tick } from './helpers';
import '../../src/button/pdx-button';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(20);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const inner = (host: HTMLElement): HTMLButtonElement => host.querySelector('button')!;

describe('pdx-button accessible name', () => {
    it('forwards aria-label from the host to the inner button', async () => {
        const host = await mount('<pdx-button aria-label="Settings"><span aria-hidden="true">⚙</span></pdx-button>');
        expect(inner(host).getAttribute('aria-label')).toBe('Settings');
    });

    it('follows the attribute when it changes, and clears when it is removed', async () => {
        const host = await mount('<pdx-button aria-label="Settings"><span aria-hidden="true">⚙</span></pdx-button>');
        const el = host.querySelector('pdx-button')!;
        el.setAttribute('aria-label', 'Preferences');
        await tick(20);
        expect(inner(host).getAttribute('aria-label')).toBe('Preferences');
        el.removeAttribute('aria-label');
        await tick(20);
        expect(inner(host).hasAttribute('aria-label')).toBe(false);
    });

    it('forwards aria-labelledby, so a visible caption can name the button', async () => {
        const host = await mount('<span id="cap">Delete row</span><pdx-button aria-labelledby="cap">🗑</pdx-button>');
        expect(inner(host).getAttribute('aria-labelledby')).toBe('cap');
    });

    it('warns once when a button has no text and no name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount('<pdx-button><span aria-hidden="true">⚙</span></pdx-button>');
        await tick(40);
        const calls = warn.mock.calls.filter((c) => String(c[0]).includes('pdx-button'));
        expect(calls).toHaveLength(1);
        expect(String(calls[0][0])).toContain('aria-label');
    });

    it('does not warn for a button with text, or with a name', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await mount('<pdx-button>Save</pdx-button><pdx-button aria-label="Settings">⚙</pdx-button><pdx-button label="Next"></pdx-button>');
        await tick(40);
        expect(warn.mock.calls.filter((c) => String(c[0]).includes('pdx-button'))).toEqual([]);
    });
});
