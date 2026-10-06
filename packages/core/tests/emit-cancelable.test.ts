// `emit` can ask whether a listener cancelled it.
//
// A component that offers its listener the chance to take over a default — pdx-nav-menu's link,
// which an app under the router navigates itself — would otherwise build a `CustomEvent` by hand
// and dispatch it, and the manifest reads an event's detail only from an `emit` call. So `emit` takes
// `cancelable` and answers what `dispatchEvent` answers: false when a listener prevented it.

import { describe, it, expect, afterEach } from 'vitest';
import { component, html } from '../src/index';

let handle: { emit(name: string, detail?: unknown, options?: { bubbles?: boolean; cancelable?: boolean }): boolean } | null = null;

component('emit-cancel-probe', {
    setup(ctx) {
        handle = ctx as never;
        return {};
    },
    render: () => html`<span></span>`,
});

afterEach(() => { document.body.innerHTML = ''; handle = null; });

function mount(): HTMLElement {
    const el = document.createElement('emit-cancel-probe');
    document.body.appendChild(el);
    return el;
}

describe('emit({ cancelable })', () => {
    it('answers false when a listener prevents a cancelable event', () => {
        const el = mount();
        el.addEventListener('pdx-go', (e) => e.preventDefault());
        expect(handle!.emit('pdx-go', { to: '/x' }, { cancelable: true })).toBe(false);
    });

    it('answers true when nobody prevents it', () => {
        mount();
        expect(handle!.emit('pdx-go', { to: '/x' }, { cancelable: true })).toBe(true);
    });

    it('control — an event that is not cancelable cannot be prevented, as the DOM says', () => {
        const el = mount();
        el.addEventListener('pdx-go', (e) => e.preventDefault());
        expect(handle!.emit('pdx-go', { to: '/x' })).toBe(true);
    });
});
