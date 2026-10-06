// errorBoundary({ resetOn }) — the fallback gives way when what the content depends on changes.
//
// `@await (p) … @error` compiles to an errorBoundary around a `when(() => awaitReady(p))`. Without
// `resetOn`, once the promise rejects the boundary sits in its fallback for good: only its own
// retry brings the content back, so the documented retry — put a new promise in the signal — does
// nothing.
import { describe, it, expect } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { errorBoundary } from '../src/renderer/error-boundary';
import { when, awaitReady } from '../src/renderer/helpers';

const settle = () => new Promise((r) => setTimeout(r, 0));

function mount(frag: DocumentFragment): HTMLElement {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
}

describe('errorBoundary — resetOn', () => {
    it('the content throws, the fallback shows; the key changes and the content no longer throws: the content shows', () => {
        const key = signal(1);
        const host = mount(errorBoundary(
            () => {
                if (key.peek() === 1) throw new Error('down');
                return html`<p class="ok">ready ${key.peek()}</p>`;
            },
            (e) => html`<p class="err">${e.message}</p>`,
            { resetOn: () => key() },
        ));
        expect(host.querySelector('.err')?.textContent).toBe('down');

        key.set(2);
        expect(host.querySelector('.err'), 'the fallback stayed after the key changed').toBeNull();
        expect(host.querySelector('.ok')?.textContent).toBe('ready 2');
    });

    it('control — without a change to the key the fallback stays, and the content is not retried', () => {
        const key = signal(1);
        const other = signal(0);
        let attempts = 0;
        const host = mount(errorBoundary(
            () => { attempts++; void other(); throw new Error('down'); },
            (e) => html`<p class="err">${e.message}</p>`,
            { resetOn: () => key() },
        ));
        other.set(1);
        other.set(2);
        expect(attempts, 'the content was retried with nothing changed').toBe(1);
        expect(host.querySelector('.err')).not.toBeNull();
    });

    it('the key changes to another failing value: the fallback shows again, with the new error', () => {
        const key = signal(1);
        const host = mount(errorBoundary(
            () => { throw new Error(`down ${key.peek()}`); },
            (e) => html`<p class="err">${e.message}</p>`,
            { resetOn: () => key() },
        ));
        key.set(2);
        expect(host.querySelector('.err')?.textContent).toBe('down 2');
    });

    // The shape `@await (p) { … } @loading { … } @error (e) { … }` compiles to (codegen-template.ts).
    it('@await: p rejects, @error shows; a resolving promise put in p shows the body', async () => {
        const p = signal<Promise<string>>(Promise.reject(new Error('registry down')));
        const host = mount(errorBoundary(
            () => html`${when(() => awaitReady(p()), () => html`<b class="body">done</b>`, () => html`<i class="wait">…</i>`)}`,
            (e) => html`<u class="err">${e.message}</u>`,
            { resetOn: () => p() },
        ));
        await settle();
        expect(host.querySelector('.err')?.textContent).toBe('registry down');

        p.set(Promise.resolve('ok'));
        expect(host.querySelector('.err'), 'still on @error after the new promise').toBeNull();
        await settle();
        expect(host.querySelector('.body')?.textContent).toBe('done');
    });

    it('control — without resetOn nothing changes: the fallback stays until retry', () => {
        const key = signal(1);
        const host = mount(errorBoundary(
            () => { if (key() === 1) throw new Error('down'); return html`<p class="ok">ok</p>`; },
            (e) => html`<p class="err">${e.message}</p>`,
        ));
        key.set(2);
        expect(host.querySelector('.err')).not.toBeNull();
    });
});
