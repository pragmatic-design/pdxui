// An error boundary around a <slot> keeps the host's children across a retry (#1365).
//
// The projection places a host's children in its slots once, when the host connects. A boundary
// clears everything between its markers to show its fallback or to render its content again, and the
// content it renders again brings a new <slot> that nothing fills: the children were gone after a
// Retry. The boundary keeps the projected children it clears and puts them in its next content's
// slots. The browser case, with the compiled `@try`, is the showcase's `try-slot.spec.ts`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signal, computed } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { errorBoundary } from '../src/renderer/error-boundary';
import { component } from '../src/component/component';
import { onGlobalError, clearGlobalErrorHandlers } from '../src/component/global-error';
import { waitUntil } from './wait-until';

let tagId = 0;
const uniqueTag = (base: string) => `${base}-${tagId++}`;

/** A child whose text reads a derived value that throws while `fail` is set. */
function failingChild(fail: ReturnType<typeof signal<boolean>>): string {
    const tag = uniqueTag('projected-child');
    const label = computed(() => {
        if (fail()) throw new Error('child-boom');
        return 'child ok';
    });
    component(tag, { render: () => html`<span class="child">${() => label()}</span>` });
    return tag;
}

/** A host whose template is a boundary around its slots; `retry` is the fallback's retry, once shown. */
function boundaryHost(template: () => Node, options?: { autoRetry?: boolean; retryDelay?: number; maxRetries?: number }): { tag: string; retry: () => (() => void) | null } {
    const tag = uniqueTag('projected-host');
    let retryFn: (() => void) | null = null;
    component(tag, {
        render: () => errorBoundary(template, (err, retry) => {
            retryFn = retry;
            return html`<p class="fallback">${err.message}</p>`;
        }, options),
    });
    return { tag, retry: () => retryFn };
}

/**
 * `tag` with `children`, built before it is connected: the children are there when it connects, as a
 * page the parser writes gives them. (happy-dom's `innerHTML` appends them after the host connects.)
 */
function mount(tag: string, ...children: Node[]): Element {
    const host = document.createElement(tag);
    for (const c of children) host.appendChild(c);
    document.body.appendChild(host);
    return host;
}

/** An element `tag` with `attrs`. */
function el(tag: string, attrs: Record<string, string> = {}, text = ''): Element {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
}

beforeEach(() => {
    document.body.innerHTML = '';
    clearGlobalErrorHandlers();
    onGlobalError(() => true);
});
afterEach(() => clearGlobalErrorHandlers());

describe('errorBoundary — the projected children across a retry', () => {
    it('a Retry puts the same children back in the new slot', () => {
        const fail = signal(false);
        const child = failingChild(fail);
        const { tag, retry } = boundaryHost(() => html`<slot></slot>`);
        const host = mount(tag, el(child, { id: 'kept' }));
        const before = host.querySelector('#kept');
        expect(before?.querySelector('.child')?.textContent, 'the child was not projected').toBe('child ok');

        fail.set(true);
        expect(host.querySelector('.fallback')?.textContent).toBe('child-boom');
        expect(host.querySelector('#kept'), 'the fallback left the child in place').toBeNull();

        fail.set(false);
        retry()!();
        expect(host.querySelector('.fallback')).toBeNull();
        expect(host.querySelector('#kept'), 'the Retry came back without the child').toBe(before);
        expect(host.querySelector('#kept .child')?.textContent).toBe('child ok');
        expect(host.querySelector('slot'), 'the new slot was left unfilled beside the child').toBeNull();
    });

    it('each child goes back to the slot it names', () => {
        const fail = signal(false);
        const child = failingChild(fail);
        const { tag, retry } = boundaryHost(() => html`<header><slot name="head"></slot></header><main><slot></slot></main>`);
        const host = mount(tag, el('b', { slot: 'head' }, 'Title'), el(child, { id: 'body' }));

        fail.set(true);
        fail.set(false);
        retry()!();
        expect(host.querySelector('header > b')?.textContent).toBe('Title');
        expect(host.querySelector('main > #body .child')?.textContent).toBe('child ok');
    });

    it('an automatic retry keeps them too', async () => {
        const fail = signal(false);
        const child = failingChild(fail);
        const { tag } = boundaryHost(() => html`<slot></slot>`, { autoRetry: true, retryDelay: 0, maxRetries: 3 });
        const host = mount(tag, el(child, { id: 'kept' }));
        const before = host.querySelector('#kept');

        fail.set(true);
        fail.set(false);
        await waitUntil(() => host.querySelector('.child')?.textContent === 'child ok', 'the automatic retry rendered the content');
        expect(host.querySelector('#kept'), 'the automatic retry came back without the child').toBe(before);
    });

    it('content that is not projected is rendered again, not kept', () => {
        const fail = signal(false);
        const child = failingChild(fail);
        let renders = 0;
        const { tag, retry } = boundaryHost(() => { renders++; return html`<i class="own">${renders}</i><slot></slot>`; });
        const host = mount(tag, el(child));

        fail.set(true);
        fail.set(false);
        retry()!();
        expect(host.querySelectorAll('.own').length, 'the content\'s own node was kept as a child').toBe(1);
        expect(host.querySelector('.own')?.textContent).toBe('2');
    });
});
