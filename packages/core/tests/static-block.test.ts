// core's staticBlock: a compiled block's static markup, built once and copied per render (#109).

import { describe, it, expect, vi } from 'vitest';
import { staticBlock, staticMarkup } from '../src/renderer/dom';

describe('staticBlock', () => {
    it('builds nothing until the first copy is asked for (#93), then builds once', () => {
        let builds = 0;
        const block = staticBlock((frag, d) => {
            builds++;
            const p = d.createElement('p');
            p.setAttribute('class', 'a');
            p.appendChild(d.createTextNode('hi'));
            frag.appendChild(p);
        });
        expect(builds, 'the markup was built at declaration').toBe(0);
        block();
        block();
        block();
        expect(builds).toBe(1);
    });

    it('every call is a separate copy of the same markup, the page\'s once inserted', () => {
        const block = staticBlock((frag, d) => {
            const p = d.createElement('p');
            p.setAttribute('class', 'a');
            p.appendChild(d.createTextNode('hi'));
            frag.appendChild(p);
        });
        const one = block();
        const two = block();
        expect(one).not.toBe(two);
        expect(one.firstChild).not.toBe(two.firstChild);
        expect((one.firstChild as Element).outerHTML).toBe('<p class="a">hi</p>');
        expect((two.firstChild as Element).outerHTML).toBe('<p class="a">hi</p>');
        // A copy changed by its render does not reach the next one.
        (one.firstChild as Element).setAttribute('class', 'changed');
        expect((block().firstChild as Element).getAttribute('class')).toBe('a');
        // Adopted when it is inserted, as html``'s copies are.
        const p = one.firstChild as Element;
        document.body.appendChild(one);
        expect(p.ownerDocument).toBe(document);
        p.remove();
    });

    it('a block with no custom element is copied with cloneNode, not importNode (#1282)', () => {
        // importNode of a block made every DOM call on the copy slower in a component's render: a
        // `<slot>` block mounted pdx-wizard 1.43x its TypeScript version, a `<form>` block pdx-form 1.66x.
        const block = staticBlock(staticMarkup('<form class="f"><slot></slot></form><!---->'));
        const importNode = vi.spyOn(document, 'importNode');
        try {
            const frag = block();
            expect(importNode).not.toHaveBeenCalled();
            expect((frag.firstChild as Element).outerHTML).toBe('<form class="f"><slot></slot></form>');
        } finally {
            importNode.mockRestore();
        }
    });

    it('the control: a block with a custom element is imported, which upgrades it before the bindings', () => {
        class StaticBlockNested extends HTMLElement {}
        customElements.define('static-block-nested', StaticBlockNested);
        const block = staticBlock(staticMarkup('<div><static-block-nested></static-block-nested></div>'));
        const importNode = vi.spyOn(document, 'importNode');
        try {
            const frag = block();
            expect(importNode).toHaveBeenCalledTimes(1);
            expect(frag.firstChild!.firstChild).toBeInstanceOf(StaticBlockNested);
        } finally {
            importNode.mockRestore();
        }
    });

    it('staticMarkup builds the same block from HTML, an empty comment standing for an empty text node (#369)', () => {
        const block = staticBlock(staticMarkup('<p class="a">hi<!----><b>x</b><!----></p><!---->'));
        const frag = block();
        const p = frag.firstChild as Element;
        expect(p.outerHTML).toBe('<p class="a">hi<b>x</b></p>');
        // The anchors the render reaches: empty TEXT nodes, where the comments were.
        expect(Array.from(p.childNodes).map((n) => [n.nodeType, n.nodeValue])).toEqual([
            [3, 'hi'], [3, ''], [1, null], [3, ''],
        ]);
        expect(frag.childNodes).toHaveLength(2);
        expect([frag.lastChild!.nodeType, frag.lastChild!.nodeValue]).toEqual([3, '']);
        expect(frag.ownerDocument).toBe(document);
    });

    it('the control: a comment with text is kept as a comment', () => {
        const frag = staticBlock(staticMarkup('<i></i><!-- note -->'))();
        expect([frag.lastChild!.nodeType, frag.lastChild!.nodeValue]).toEqual([8, ' note ']);
    });

    it('a component in the markup is the defined component in the copy', () => {
        class StaticBlockProbe extends HTMLElement {}
        customElements.define('static-block-probe', StaticBlockProbe);
        const block = staticBlock((frag, d) => { frag.appendChild(d.createElement('static-block-probe')); });
        expect(block().firstChild).toBeInstanceOf(StaticBlockProbe);
    });
});
