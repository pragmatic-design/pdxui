// A context lookup that finds nothing is remembered until the next microtask (#1287, item D).
//
// A miss walks every ancestor and then sends the context protocol's request, an event of its own, for
// a provider of another library. `pdx-form-actions` outside a form asks for its form five times at
// mount — its bindings each read it — and every miss paid the whole of it: 4 µs per instance, about a
// quarter of its body. Within one synchronous mount the ancestors do not change, so a miss is kept for
// the element and the token until the microtask after it, and forgotten at once when a `provide`
// registers a provider: a child that mounts before its form finds the form as soon as it is there.

import { describe, it, expect, afterEach } from 'vitest';
import { context, inject, provide } from '../src/component/context';

const Theme = context<string>('theme');

/** The context requests that reach the document: one per lookup that asks the protocol. */
let requests: Array<{ token: unknown; from: EventTarget | null }> = [];
const count = (e: Event) => { requests.push({ token: (e as Event & { context: unknown }).context, from: e.composedPath()[0] ?? null }); };
document.addEventListener('context-request', count, true);
afterEach(() => { document.body.innerHTML = ''; requests = []; });

function child(): { parent: HTMLElement; el: HTMLElement } {
    const parent = document.createElement('div');
    const el = document.createElement('span');
    parent.appendChild(el);
    document.body.appendChild(parent);
    return { parent, el };
}

describe('a context lookup that finds nothing', () => {
    it('asks once in a task: the second lookup sends no request', () => {
        const { el } = child();
        expect(inject(Theme, el, undefined)).toBeUndefined();
        expect(inject(Theme, el, undefined)).toBeUndefined();
        expect(requests).toHaveLength(1);
    });

    it('a provide forgets it at once: the provider is found in the same task', () => {
        const { parent, el } = child();
        expect(inject(Theme, el, undefined)).toBeUndefined();
        provide(Theme, 'dark', parent);
        expect(inject(Theme, el, undefined)).toBe('dark');
    });

    it('after a microtask it asks again: a provider of another library answers then', async () => {
        const { parent, el } = child();
        expect(inject(Theme, el, undefined)).toBeUndefined();
        await Promise.resolve();
        // A provider that speaks the protocol and is not PDX's: it answers the request itself.
        parent.addEventListener('context-request', (e) => {
            const req = e as Event & { context: unknown; callback: (v: unknown) => void };
            if (req.context === Theme) { e.stopPropagation(); req.callback('light'); }
        });
        expect(inject(Theme, el, undefined)).toBe('light');
    });

    it('the control: another token, or another element, is looked up as before', () => {
        const Other = context<string>('other');
        const { parent, el } = child();
        const sibling = document.createElement('i');
        parent.appendChild(sibling);
        inject(Theme, el, undefined);
        inject(Other, el, undefined);
        inject(Theme, sibling, undefined);
        expect(requests.map((r) => [r.token, r.from])).toEqual([[Theme, el], [Other, el], [Theme, sibling]]);
    });
});
