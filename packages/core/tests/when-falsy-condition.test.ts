// `when()` memoizes with `prevShow: boolean | undefined`, where `undefined` means "nothing
// rendered yet". A condition returning `undefined` therefore compared EQUAL to the initial
// sentinel on the very first run, the effect returned early, and NEITHER branch was ever
// rendered — silently, with the markers in place and nothing between them.
//
// Templates produce truthy/falsy values, not strict booleans: `@if (obj.maybeMissing)` is
// ordinary PDX. It hit the builder's verdict panel, where `@if (report.error)` is undefined
// in the normal case and killed the whole @else-if chain below it.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { when } from '../src/renderer/helpers';

describe('when() with a non-boolean falsy condition', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders the else branch when the condition is undefined', () => {
        const obj = signal<{ error?: string }>({});
        document.body.appendChild(
            when(() => obj().error as unknown as boolean,
                () => html`<i class="then"></i>`,
                () => html`<i class="else"></i>`),
        );
        expect(document.querySelector('.else'), 'undefined must render the else branch').not.toBeNull();
        expect(document.querySelector('.then')).toBeNull();
    });

    it('renders the then branch when the condition is a truthy non-boolean', () => {
        const obj = signal<{ error?: string }>({ error: 'boom' });
        document.body.appendChild(
            when(() => obj().error as unknown as boolean,
                () => html`<i class="then"></i>`,
                () => html`<i class="else"></i>`),
        );
        expect(document.querySelector('.then')).not.toBeNull();
    });

    it('still swaps when the value changes between undefined and set', () => {
        const obj = signal<{ error?: string }>({});
        document.body.appendChild(
            when(() => obj().error as unknown as boolean,
                () => html`<i class="then"></i>`,
                () => html`<i class="else"></i>`),
        );
        obj.set({ error: 'boom' });
        expect(document.querySelector('.then')).not.toBeNull();
        obj.set({});
        expect(document.querySelector('.else')).not.toBeNull();
    });

    it('an @else-if chain whose middle condition is undefined still reaches the last branch', () => {
        // The builder's verdict shape, as the compiler emits it.
        const measuring = signal(true);
        const report = signal<{ error?: string; pass?: boolean } | null>(null);

        document.body.appendChild(
            when(() => measuring(), () => html`<i class="measuring"></i>`,
                () => html`${when(() => !report(), () => html`<i class="idle"></i>`,
                    () => html`${when(() => report()!.error as unknown as boolean, () => html`<i class="err"></i>`,
                        () => html`${when(() => report()!.pass as unknown as boolean, () => html`<i class="ok"></i>`,
                            () => html`<i class="fail"></i>`)}`)}`)}`),
        );

        measuring.set(false);
        report.set({ pass: true });

        expect(document.querySelector('.ok'), 'the pass branch must render').not.toBeNull();
    });
});
