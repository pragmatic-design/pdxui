// core's delegate: one listener per event type on a component, calling the handlers stored on its
// elements in DOM order (#113).

import { describe, it, expect, afterEach } from 'vitest';
import { delegate } from '../src/renderer/delegate';

const hosts: HTMLElement[] = [];
function host(): HTMLElement {
    const h = document.createElement('div');
    document.body.appendChild(h);
    hosts.push(h);
    return h;
}
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); });

describe('delegate', () => {
    it('calls the handlers from the target up, inner first', () => {
        const h = host();
        const outer = document.createElement('section');
        const inner = document.createElement('button');
        outer.appendChild(inner);
        h.appendChild(outer);
        const calls: string[] = [];
        delegate(h, outer, 'click', () => calls.push('outer'));
        delegate(h, inner, 'click', () => calls.push('inner'));
        inner.click();
        expect(calls).toEqual(['inner', 'outer']);
    });

    it('a handler that stops propagation stops the ones above it', () => {
        const h = host();
        const outer = document.createElement('section');
        const inner = document.createElement('button');
        outer.appendChild(inner);
        h.appendChild(outer);
        const calls: string[] = [];
        let reachedHost = false;
        h.parentElement!.addEventListener('click', () => { reachedHost = true; }, { once: true });
        delegate(h, outer, 'click', () => calls.push('outer'));
        delegate(h, inner, 'click', (e) => { e.stopPropagation(); calls.push('inner'); });
        inner.click();
        expect(calls).toEqual(['inner']);
        expect(reachedHost, 'the event went on past the component').toBe(false);
    });

    it('currentTarget is the element the handler is on, while it runs', () => {
        const h = host();
        const row = document.createElement('li');
        const cell = document.createElement('span');
        row.appendChild(cell);
        h.appendChild(row);
        let seen: EventTarget | null = null;
        delegate(h, row, 'click', (e) => { seen = e.currentTarget; });
        cell.click();
        expect(seen).toBe(row);
    });

    it('one listener per type per component, however many elements', () => {
        const h = host();
        let added = 0;
        const original = h.addEventListener.bind(h);
        h.addEventListener = ((...args: Parameters<HTMLElement['addEventListener']>) => { added++; original(...args); }) as typeof h.addEventListener;
        for (let i = 0; i < 100; i++) {
            const li = document.createElement('li');
            h.appendChild(li);
            delegate(h, li, 'click', () => {});
        }
        expect(added).toBe(1);
    });

    it('a nested component\'s elements are called by its own listener only, once', () => {
        const parent = host();
        const child = document.createElement('x-child');
        const button = document.createElement('button');
        child.appendChild(button);
        parent.appendChild(child);
        let calls = 0;
        delegate(child, button, 'click', () => { calls++; });
        delegate(parent, child, 'click', () => {});
        button.click();
        expect(calls).toBe(1);
    });

    it('inside a shadow root it listens on the root: change does not cross it', () => {
        const h = host();
        const root = h.attachShadow({ mode: 'open' });
        const input = document.createElement('input');
        root.appendChild(input);
        let calls = 0;
        delegate(h, input, 'change', () => { calls++; });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        expect(calls).toBe(1);
    });
});
