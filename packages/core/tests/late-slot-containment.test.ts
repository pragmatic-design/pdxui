// A late child must never be relocated INTO a slot that it contains.
//
// `_watchLateSlots` exists for hosts whose children arrive after connectedCallback (Angular
// bootstraps that way). It looks for an empty slot with `this.querySelectorAll('slot')` — which
// does not stop at component boundaries. A nested component's own empty slot therefore arms the
// observer on the OUTER host, and when the outer component reorganises its light DOM into a
// wrapper, that wrapper now contains the nested slot. Inserting the wrapper before it is
// `insertBefore(ancestor, descendant)`:
//
//     HierarchyRequestError: Failed to execute 'insertBefore' on 'Node':
//     The new child element contains the parent.
//
// Which is what /components/navbar threw on the built site — an uncaught page error, on a page
// that otherwise looked fine. Found by sweeping the site, not by a test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { PdxElement } from '../src/component/element';
import { define } from '../src/component/define';

let tagCounter = 0;
const uniqueTag = () => `late-slot-${tagCounter++}`;

function defineEl(body: () => DocumentFragment | Node | null): string {
    const tag = uniqueTag();
    class El extends PdxElement { body() { return body(); } }
    define(tag, El as unknown as new () => PdxElement);
    return tag;
}

/**
 * An exception thrown inside a MutationObserver callback reaches no caller and no `window.onerror`
 * under happy-dom — it surfaces as an uncaught exception on the microtask queue. Without capturing
 * it here the test would pass while the page is broken, which is the failure this file is about.
 */
let caught: string[] = [];
const onUncaught = (e: unknown): void => { caught.push(String(e)); };

beforeEach(() => {
    document.body.innerHTML = '';
    caught = [];
    process.on('uncaughtException', onUncaught);
});
afterEach(() => { process.off('uncaughtException', onUncaught); });

describe('late-slot relocation', () => {
    it('leaves a wrapper alone when it contains the slot it would move to', async () => {
        const inner = defineEl(() => html`<div class="inner"><slot></slot></div>`);
        const outer = defineEl(() => html`<slot></slot>`);

        const host = document.createElement(outer);
        host.innerHTML = `<${inner}></${inner}>`;
        document.body.appendChild(host);

        // The outer component reorganises its own light DOM after connect: everything moves into a
        // bar, and the bar is appended back. This is the shape of pdx-navbar.
        const bar = document.createElement('div');
        bar.className = 'bar';
        while (host.firstChild) bar.appendChild(host.firstChild);
        let threw: string | null = null;
        try { host.appendChild(bar); } catch (e) { threw = String(e); }

        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));

        expect(threw, 'appending the wrapper threw').toBeNull();
        expect(caught, 'the relocation threw inside the MutationObserver').toEqual([]);
        expect(bar.parentNode, 'the wrapper was moved out of its host').toBe(host);
        expect(bar.querySelector(inner), 'the wrapper lost the component it contained').not.toBeNull();
    });
});
