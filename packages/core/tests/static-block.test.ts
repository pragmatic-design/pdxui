// core's staticBlock: a compiled block's static markup, built once and copied per render (#109).

import { describe, it, expect } from 'vitest';
import { staticBlock } from '../src/renderer/dom';

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

    it('a component in the markup is the defined component in the copy', () => {
        class StaticBlockProbe extends HTMLElement {}
        customElements.define('static-block-probe', StaticBlockProbe);
        const block = staticBlock((frag, d) => { frag.appendChild(d.createElement('static-block-probe')); });
        expect(block().firstChild).toBeInstanceOf(StaticBlockProbe);
    });
});
