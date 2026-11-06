// @vitest-environment node
// html`` renders to a string in Node, with no DOM at all (#160): where static generation runs.
// The same html`` the components call throws there outside renderToString, as it always has.

import { describe, it, expect } from 'vitest';
import { html } from '../src/renderer/template';
import { renderToString, PART_OPEN, PART_CLOSE } from '../src/server/render-string';
import { signal } from '../src/reactivity/signal';

describe('renderToString in Node', () => {
    it('renders a template with no DOM', () => {
        expect(typeof document).toBe('undefined');
        const count = signal(3);
        const markup = renderToString(() => html`<p class="n" :title=${() => `${count()} items`}>${count} ${html`<b>${'x'}</b>`}</p>`);
        expect(markup).toBe(`<p class="n" title="3 items">${PART_OPEN}3${PART_CLOSE} ${PART_OPEN}<b>${PART_OPEN}x${PART_CLOSE}</b>${PART_CLOSE}</p>`);
    });

    it('html`` outside renderToString still needs a DOM', () => {
        expect(() => html`<p></p>`).toThrow(/needs a DOM/);
    });
});
