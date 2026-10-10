// PDX's context speaks the Web Components context protocol (#103), checked against a provider and a
// consumer written by hand from the proposal, with plain event listeners and no library:
// https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md
//
// The protocol's `context-request` event carries the context key itself, compared by identity, a
// `callback`, and `subscribe`. PDX used to send `{ name: key }` and to read `.name` of what it
// received, so neither side could find a provider from another library.

import { describe, it, expect, beforeEach } from 'vitest';
import { provide, requestContext, clearProviders } from '../src/component/context';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { html } from '../src/renderer/template';

type Callback = (value: unknown, unsubscribe?: () => void) => void;

/** A `context-request` as the protocol defines it, built by hand. */
function protocolRequest(context: unknown, callback: Callback, subscribe = false): Event {
    const event = new Event('context-request', { bubbles: true, composed: true });
    Object.assign(event, { context, contextTarget: null, callback, subscribe });
    return event;
}

/** A provider written from the proposal: answers a request whose `context` IS its key. */
function protocolProvider(host: HTMLElement, key: unknown, value: unknown): void {
    host.addEventListener('context-request', (e) => {
        const req = e as Event & { context: unknown; callback: Callback };
        if (req.context !== key) return;
        e.stopPropagation();
        req.callback(value);
    });
}

function tree(): { parent: HTMLElement; child: HTMLElement } {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);
    return { parent, child };
}

beforeEach(() => {
    clearProviders();
    document.body.innerHTML = '';
});

describe('the Web Components context protocol', () => {
    it('a protocol provider answers PDX requestContext, for an object key', () => {
        const { parent, child } = tree();
        const KEY = { description: 'theme' };
        protocolProvider(parent, KEY, 'dark');
        expect(requestContext(child, KEY as unknown as symbol)).toBe('dark');
    });

    it('a protocol provider answers PDX requestContext, for a string key', () => {
        const { parent, child } = tree();
        protocolProvider(parent, 'locale', 'it');
        expect(requestContext(child, 'locale')).toBe('it');
    });

    it('PDX provide answers a protocol request', () => {
        const { parent, child } = tree();
        const KEY = Symbol('user');
        provide(KEY, { name: 'Ada' }, parent);
        let got: unknown;
        child.dispatchEvent(protocolRequest(KEY, (v) => { got = v; }));
        expect(got).toEqual({ name: 'Ada' });
    });

    it('PDX provide stops the request it answers, and ignores one for another key', () => {
        const { parent, child } = tree();
        provide('a', 1, parent);
        let reachedDocument = 0;
        const count = () => { reachedDocument++; };
        document.addEventListener('context-request', count);
        try {
            child.dispatchEvent(protocolRequest('a', () => {}));
            child.dispatchEvent(protocolRequest('b', () => {}));
        } finally {
            document.removeEventListener('context-request', count);
        }
        expect(reachedDocument, 'only the unanswered request reaches the document').toBe(1);
    });

    it('a subscribing request to a provided signal is called again on each change, until unsubscribe', () => {
        const { parent, child } = tree();
        const theme = signal('light');
        provide('theme', theme, parent);
        const seen: unknown[] = [];
        let unsubscribe: (() => void) | undefined;
        child.dispatchEvent(protocolRequest('theme', (v, u) => { seen.push(v); unsubscribe = u; }, true));
        expect(seen).toEqual(['light']);
        expect(typeof unsubscribe).toBe('function');
        theme.set('dark');
        expect(seen).toEqual(['light', 'dark']);
        unsubscribe!();
        theme.set('blue');
        expect(seen, 'called after unsubscribe').toEqual(['light', 'dark']);
    });

    it('a consumer may unsubscribe inside the first answer', () => {
        const { parent, child } = tree();
        const theme = signal('light');
        provide('theme', theme, parent);
        const seen: unknown[] = [];
        child.dispatchEvent(protocolRequest('theme', (v, u) => { seen.push(v); u?.(); }, true));
        theme.set('dark');
        expect(seen).toEqual(['light']);
    });

    it('the subscription ends when the providing component is destroyed', async () => {
        const theme = signal('light');
        const seen: unknown[] = [];
        component('pdx-ctx-protocol-host', {
            setup(ctx) { provide('theme', theme, ctx.el); return {}; },
            render: () => html`<span></span>`,
        });
        const host = document.createElement('pdx-ctx-protocol-host');
        document.body.appendChild(host);
        await Promise.resolve();
        host.querySelector('span')!.dispatchEvent(protocolRequest('theme', (v) => { seen.push(v); }, true));
        theme.set('dark');
        host.remove();
        theme.set('blue');
        expect(seen).toEqual(['light', 'dark']);
    });

    it('a subscribing request to a plain value is answered once', () => {
        const { parent, child } = tree();
        provide('size', 'md', parent);
        const seen: unknown[] = [];
        child.dispatchEvent(protocolRequest('size', (v) => { seen.push(v); }, true));
        expect(seen).toEqual(['md']);
    });
});
