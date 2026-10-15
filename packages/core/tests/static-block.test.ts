// core's staticBlock: a compiled block's static markup, built once and copied per render (#109).

import { describe, it, expect } from 'vitest';
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

    it('every call is a separate copy of the same markup, owned by the page', () => {
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
        expect(one.ownerDocument).toBe(document);
        // A copy changed by its render does not reach the next one.
        (one.firstChild as Element).setAttribute('class', 'changed');
        expect((block().firstChild as Element).getAttribute('class')).toBe('a');
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
