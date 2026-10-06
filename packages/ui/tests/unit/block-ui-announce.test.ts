// pdx-block-ui announces its message, and shows a message set after mount.
//
// A live region announces changes to its content: a message written once, at build, inside an
// overlay that is aria-hidden while unblocked, is never announced when blocking only flips
// aria-hidden. The text is written when the block starts. And a message bound to a value that
// arrives later needs an element to go to, whether or not `message` was set at the first build.
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/block-ui/pdx-block-ui';

type BlockUi = HTMLElement & { blocked: boolean; message: string };

// `delay="0" min-duration="0"`: these rows are about WHAT is announced while the overlay is drawn.
// WHEN it is drawn and taken away — after 300 ms, for at least 200, by default — is
// `block-ui-timing.test.ts`'s.
async function mountBlock(attrs = ''): Promise<BlockUi> {
    document.body.innerHTML = `<pdx-block-ui delay="0" min-duration="0" ${attrs}><p>content</p></pdx-block-ui>`;
    await tick(30);
    return document.querySelector('pdx-block-ui') as BlockUi;
}

/**
 * The overlay's own live region: the MESSAGE.
 *
 * Not `[role="status"]`: the spinner carries a `role="status"` of its own, and block-ui registers
 * what it renders — so the first match is the spinner's, an empty span that is never written to.
 */
const region = (el: HTMLElement): HTMLElement | null => el.querySelector('.pdx-block-ui-message');

/**
 * Every text written to the region, in order, from now on, with whether the overlay was exposed at
 * that moment. Recorded synchronously on the node's own textContent setter — the component writes
 * the region through textContent. Not a MutationObserver: happy-dom holds an observer's delivery
 * callback in a WeakRef, so after a GC nothing is recorded and the test fails inside a full run. An
 * observer also reads the overlay's state at delivery, after the write: a message written while the
 * overlay was still aria-hidden would pass it. A write that bypassed
 * textContent would record nothing and fail the test, not pass it.
 */
function watchText(node: HTMLElement): { text: string; exposed: boolean }[] {
    const seen: { text: string; exposed: boolean }[] = [];
    const overlay = node.closest('.pdx-block-ui-overlay');
    // The nearest accessor on the node's prototype chain: happy-dom's Element overrides Node's.
    let proto: object | null = Object.getPrototypeOf(node);
    while (proto && !Object.getOwnPropertyDescriptor(proto, 'textContent')) proto = Object.getPrototypeOf(proto);
    const own = Object.getOwnPropertyDescriptor(proto!, 'textContent')!;
    Object.defineProperty(node, 'textContent', {
        configurable: true,
        get() { return own.get!.call(this); },
        set(value: string | null) {
            own.set!.call(this, value);
            seen.push({ text: String(value ?? ''), exposed: overlay?.getAttribute('aria-hidden') === 'false' });
        },
    });
    return seen;
}

beforeEach(cleanup);

describe('pdx-block-ui — the message is announced', () => {
    it('blocking takes the live region from empty to the message, written while exposed: a change a screen reader hears', async () => {
        const el = await mountBlock('message="Invio…"');
        const live = region(el);
        expect(live, 'no live region').toBeTruthy();
        // Re-assigning text a region already holds is a DOM mutation, not a content change a
        // screen reader is bound to announce: the region must hold nothing until the block.
        expect(live!.textContent, 'the message sat in the region before anything was blocked').toBe('');
        const seen = watchText(live!);
        el.blocked = true;
        await tick(50);
        expect(live!.textContent).toBe('Invio…');
        const written = seen.filter(s => s.text === 'Invio…');
        expect(written.length, 'the region never changed to the message').toBeGreaterThan(0);
        expect(written.at(-1)!.exposed, 'the message was written while the overlay was still aria-hidden').toBe(true);
    });

    it('unblocking empties the region', async () => {
        const el = await mountBlock('message="Invio…" blocked');
        await tick(50);
        el.blocked = false;
        await tick(50);
        expect(region(el)!.textContent).toBe('');
    });

    it('there is one live region, on the message', async () => {
        const el = await mountBlock('message="Invio…" blocked');
        await tick(50);
        // Live regions a screen reader is offered: an `aria-hidden` subtree is not one of
        // them, which is exactly what the decorative spinner is. Counting NODES would count it.
        const announcing = [...el.querySelectorAll('[role="status"], [aria-live]')]
            .filter((node) => !node.closest('[aria-hidden="true"]'));
        expect(announcing.length, 'the overlay announces from more than one place').toBe(1);
        expect(announcing[0], 'the live region is not the message').toBe(region(el));
    });
});

describe('pdx-block-ui — a message set after mount', () => {
    it('is written: the element exists even when message was empty at build', async () => {
        const el = await mountBlock('blocked');
        el.message = 'x';
        await tick(50);
        const msg = el.querySelector('.pdx-block-ui-message');
        expect(msg, 'no message element: it was only built when message was set at first').toBeTruthy();
        expect(msg!.textContent).toBe('x');
    });
});
