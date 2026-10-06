// Blocking blocks the keyboard too.
//
// The overlay stops the mouse, but not Tab: without `inert`, Tab reaches "Action A" under it and
// Enter activates it. While `blocked`, the wrapped content is `inert`; the overlay itself, with its
// status message, is not.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/block-ui/pdx-block-ui';

async function mount(html: string): Promise<HTMLElement> {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    await tick(40);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-block-ui inert', () => {
    it('makes the wrapped content inert while blocked, and the overlay not', async () => {
        const host = await mount('<pdx-block-ui blocked message="Loading"><button id="a">Action A</button><p id="p">Text</p></pdx-block-ui>');
        expect(host.querySelector('#a')!.hasAttribute('inert') || host.querySelector('#a')!.closest('[inert]') !== null).toBe(true);
        expect(host.querySelector('#p')!.closest('[inert]')).not.toBeNull();
        expect(host.querySelector('.pdx-block-ui-overlay')!.closest('[inert]')).toBeNull();
    });

    it('gives the content back when unblocked', async () => {
        const host = await mount('<pdx-block-ui blocked><button id="a">Action A</button></pdx-block-ui>');
        host.querySelector('pdx-block-ui')!.removeAttribute('blocked');
        await tick(40);
        expect(host.querySelector('#a')!.closest('[inert]')).toBeNull();
    });

    it('leaves unblocked content alone', async () => {
        const host = await mount('<pdx-block-ui><button id="a">Action A</button></pdx-block-ui>');
        expect(host.querySelector('#a')!.closest('[inert]')).toBeNull();
    });
});
