// pdx-block-ui: input blocked at once, the picture after `delay`, kept for `min-duration`, and a
// `fullscreen` block that makes the rest of the document inert.
//
// The overlay was drawn the moment `blocked` turned on and taken away the moment it turned off: a
// 40 ms save flashed a spinner over the form. The research's pair (spin-delay's, 500/200 there) is
// 300/200 here: nothing drawn for a block shorter than 300 ms, and once drawn, drawn for 200.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { tick } from './helpers';
import '../../src/block-ui/pdx-block-ui';

type BlockUi = HTMLElement & { blocked: boolean };

async function mount(html: string): Promise<{ block: BlockUi; events: string[] }> {
    document.body.innerHTML = html;
    await tick(40);
    const block = document.querySelector('pdx-block-ui') as BlockUi;
    const events: string[] = [];
    block.addEventListener('pdx-block', () => events.push('block'));
    block.addEventListener('pdx-unblock', () => events.push('unblock'));
    // Real timers until mounted (the build runs in a frame), fake ones for the timing itself.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    return { block, events };
}

const overlay = () => document.querySelector('.pdx-block-ui-overlay') as HTMLElement;
const visible = () => overlay().classList.contains('pdx-block-ui-visible');
const inert = (sel: string) => document.querySelector(sel)!.closest('[inert]') !== null;

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('pdx-block-ui — delay', () => {
    it('a block shorter than the delay is never drawn, but the input is blocked from its start', async () => {
        const { block, events } = await mount('<pdx-block-ui><button id="a">Save</button></pdx-block-ui>');
        block.blocked = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(inert('#a'), 'a click during the delay would reach the content').toBe(true);
        expect(block.getAttribute('aria-busy')).toBe('true');
        expect(visible(), 'drawn at once').toBe(false);

        await vi.advanceTimersByTimeAsync(250);
        expect(visible(), 'drawn before 300 ms').toBe(false);
        block.blocked = false;
        await vi.advanceTimersByTimeAsync(400);
        expect(visible()).toBe(false);
        expect(events, 'a block that was never drawn announced one').toEqual([]);
        expect(inert('#a')).toBe(false);
        expect(block.getAttribute('aria-busy')).toBe('false');
    });

    it('a block that ends right after the delay stays drawn for min-duration', async () => {
        const { block, events } = await mount('<pdx-block-ui><button id="a">Save</button></pdx-block-ui>');
        block.blocked = true;
        await vi.advanceTimersByTimeAsync(310);
        expect(visible(), 'not drawn after the delay').toBe(true);
        expect(events).toEqual(['block']);

        block.blocked = false;
        await vi.advanceTimersByTimeAsync(150);
        expect(visible(), 'taken away 20 ms after it was drawn: the flash min-duration exists for').toBe(true);
        await vi.advanceTimersByTimeAsync(60);
        expect(visible()).toBe(false);
        expect(events).toEqual(['block', 'unblock']);
        expect(inert('#a')).toBe(false);
    });

    it('delay and min-duration are the author\'s: 0 draws at once', async () => {
        const { block } = await mount('<pdx-block-ui delay="0" min-duration="0"><button id="a">Save</button></pdx-block-ui>');
        block.blocked = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(visible()).toBe(true);
        block.blocked = false;
        await vi.advanceTimersByTimeAsync(0);
        expect(visible()).toBe(false);
    });
});

describe('pdx-block-ui — fullscreen', () => {
    it('covers the viewport and makes the rest of the document inert, and gives it back', async () => {
        const { block } = await mount(`
            <header><button id="nav">Menu</button></header>
            <div id="already" inert><button id="b">Was inert</button></div>
            <main><pdx-block-ui fullscreen delay="0"><button id="a">Save</button></pdx-block-ui><p id="sibling">Beside</p></main>`);
        block.blocked = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(overlay().classList.contains('pdx-block-ui-fullscreen')).toBe(true);
        expect(inert('#nav'), 'the rest of the document stayed reachable').toBe(true);
        expect(inert('#sibling')).toBe(true);
        expect(inert('#a')).toBe(true);
        expect(overlay().closest('[inert]'), 'the overlay itself, with its message, went inert').toBeNull();

        block.blocked = false;
        await vi.advanceTimersByTimeAsync(300);
        expect(inert('#nav')).toBe(false);
        expect(inert('#sibling')).toBe(false);
        expect(inert('#b'), 'an element inert before the block was un-inerted by it').toBe(true);
    });

    it('control — without fullscreen, only the wrapped content is inert', async () => {
        const { block } = await mount(`
            <header><button id="nav">Menu</button></header>
            <main><pdx-block-ui delay="0"><button id="a">Save</button></pdx-block-ui></main>`);
        block.blocked = true;
        await vi.advanceTimersByTimeAsync(0);
        expect(inert('#a')).toBe(true);
        expect(inert('#nav')).toBe(false);
        expect(overlay().classList.contains('pdx-block-ui-fullscreen')).toBe(false);
    });
});
