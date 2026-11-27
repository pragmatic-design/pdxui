// A conditional runs its transitions with the animation its options name, as a list does (#1259).
//
// helpers.ts imported insertWithTransition and removeWithTransition statically for when()'s
// @transition, and every compiled @if is a when(): every app with an @if carried transitions.ts,
// whether or not a block declared a transition. #1258 removed the same hub from lists. Now a block
// animates with `block: blockAnimation`, which the compiler names for an @if with @transition;
// `whenBlock()` is what it emits, and gives no animation; the hand-written `when()` gives
// blockAnimation itself when its options have transitions, as `repeat()` gives listAnimation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when, whenBlock } from '../src/renderer/helpers';
import { blockAnimation } from '../src/renderer/transitions';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

const mount = (frag: DocumentFragment) => { document.body.appendChild(frag); };

describe('whenBlock — what the compiler emits for @if', () => {
    it('with no options, shows and hides its branch', () => {
        const show = signal(false);
        mount(whenBlock(() => show(), () => html`<p class="b">x</p>`, () => html`<p class="e">y</p>`));
        expect(document.querySelector('.e')).not.toBeNull();
        show.set(true);
        expect(document.querySelector('.b')).not.toBeNull();
        expect(document.querySelector('.e')).toBeNull();
    });

    it('with transitions and no animation, renders without them and says so in development', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const show = signal(false);
        mount(whenBlock(() => show(), () => html`<p class="b">x</p>`, null, { enter: 'fade' }));
        show.set(true);
        const el = document.querySelector('.b')!;
        expect(el.classList.contains('pdx-enter-active')).toBe(false);
        expect(warn.mock.calls.flat().join(' ')).toMatch(/no animation.*blockAnimation/s);
    });

    it('with block: blockAnimation, animates', () => {
        const show = signal(false);
        mount(whenBlock(() => show(), () => html`<p class="b">x</p>`, null, { enter: 'fade', block: blockAnimation }));
        show.set(true);
        expect(document.querySelector('.b')!.classList.contains('pdx-enter-active')).toBe(true);
    });

    it('out-in with no animation removes the old branch before the new one is placed', async () => {
        const show = signal(true);
        mount(whenBlock(() => show(), () => html`<p class="b">x</p>`, () => html`<p class="e">y</p>`, { mode: 'out-in' }));
        show.set(false);
        await Promise.resolve();
        expect(document.querySelector('.b')).toBeNull();
        expect(document.querySelector('.e')).not.toBeNull();
    });
});

describe('when — the hand-written API keeps animating', () => {
    it('with { enter, exit } and no animation named, animates', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const show = signal(false);
        mount(when(() => show(), () => html`<p class="b">x</p>`, null, { enter: 'fade', exit: 'fade-out' }));
        show.set(true);
        expect(document.querySelector('.b')!.classList.contains('pdx-enter-active')).toBe(true);
        expect(warn).not.toHaveBeenCalled();
    });
});
