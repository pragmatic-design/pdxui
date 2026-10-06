// `<pdx-error-boundary>` catches what its children throw after the screen is up.
//
// The recipe promises it: "It catches errors from the children's render and their effects". The
// children are projected through a slot, so they render when they connect — after the boundary has
// built its content and taken its handler off the stack — and without a handler of their own, an
// error on a later signal change goes to the console while the child keeps its old DOM.
import { describe, it, expect, afterEach } from 'vitest';
import { component, html, signal, computed, onGlobalError, clearGlobalErrorHandlers } from '@pdxui/core';
import '../../src/error-boundary/pdx-error-boundary';
import { uniqueTag, tick, cleanup } from './helpers';

afterEach(() => { cleanup(); clearGlobalErrorHandlers(); });

describe('pdx-error-boundary', () => {
    it('shows its fallback when a child effect throws after the first render', async () => {
        const failed = signal(false);
        const status = computed(() => {
            if (failed()) throw new Error('wire service down');
            return 'feed ok';
        });
        const child = uniqueTag('wire-feed');
        component(child, { render: () => html`<span class="feed">${() => status()}</span>` });
        const leaked: Error[] = [];
        onGlobalError((err) => { leaked.push(err); return true; });

        const host = document.createElement('div');
        host.innerHTML = `<pdx-error-boundary><${child}></${child}></pdx-error-boundary>`;
        document.body.appendChild(host);
        await tick();
        expect(host.querySelector('.feed')?.textContent, 'the child did not render inside the boundary').toBe('feed ok');

        failed.set(true);
        await tick();

        expect(host.querySelector('[role="alert"]'), 'no fallback — the error went past the boundary').not.toBeNull();
        expect(host.querySelector('.pdx-error-boundary-detail')?.textContent).toBe('wire service down');
        expect(host.querySelector('.feed'), 'the child kept its old DOM').toBeNull();
        expect(leaked, 'the error also reached the global handler').toEqual([]);
    });
});
