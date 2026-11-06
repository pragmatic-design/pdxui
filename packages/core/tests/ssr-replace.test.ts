// A pre-rendered host is replaced by its client render, not projected into it (#160, part 1).
//
// Static generation writes a route's HTML at build time and marks each pre-rendered host with
// `data-pdx-ssr`. At mount, a host takes its children as content to project into its slots and
// removes them (`connectedCallback`). For a pre-rendered host those children ARE its render: projected,
// the page would draw the component twice, the build's copy inside the client's slot. So a host marked
// `data-pdx-ssr` drops its children and renders as if it had none, and the mark goes with them.

import { describe, it, expect, beforeEach } from 'vitest';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';

let tagId = 0;

function defineCard(): string {
    const tag = `test-ssr-card-${tagId++}`;
    component(tag, { render: () => html`<div class="card"><slot></slot></div>` });
    return tag;
}

/** Parse `markup` in a detached box, then put the box in the page: the way a parsed page connects. */
function mountMarkup(markup: string): HTMLElement {
    const box = document.createElement('div');
    box.innerHTML = markup;
    document.body.appendChild(box);
    return box.firstElementChild as HTMLElement;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a host marked data-pdx-ssr', () => {
    it('replaces its pre-rendered content with its client render', () => {
        const tag = defineCard();
        // What the build wrote: the component's own markup, with the slot content already in it.
        const host = mountMarkup(`<${tag} data-pdx-ssr><div class="card"><p class="pre">Hello</p></div></${tag}>`);
        expect(host.querySelectorAll('.card').length, 'one card: the client render, not the build copy inside its slot').toBe(1);
        expect(host.querySelector('.pre'), 'the pre-rendered children are not slot content').toBeNull();
        expect(host.hasAttribute('data-pdx-ssr'), 'the mark goes with the content it described').toBe(false);
    });

    it('still projects children when it is not marked', () => {
        const tag = defineCard();
        const host = mountMarkup(`<${tag}><p class="child">Hello</p></${tag}>`);
        expect(host.querySelector('.card .child'), 'an unmarked host projects its children as before').not.toBeNull();
    });

    it('drops a pre-rendered child component, and renders the client one once', () => {
        const inner = defineCard();
        const outer = `test-ssr-outer-${tagId++}`;
        // Built by hand: `html` takes no interpolated tag name.
        component(outer, {
            render: () => {
                const section = document.createElement('section');
                section.className = 'outer';
                section.appendChild(document.createElement(inner));
                return section;
            },
        });
        // The build's copy holds the inner component pre-rendered too, marked as well.
        const host = mountMarkup(`<${outer} data-pdx-ssr><section class="outer"><${inner} data-pdx-ssr><div class="card"></div></${inner}></section></${outer}>`);
        expect(host.querySelectorAll('.outer').length).toBe(1);
        expect(host.querySelectorAll(inner).length).toBe(1);
        expect(host.querySelectorAll('.card').length).toBe(1);
        expect(host.querySelector('[data-pdx-ssr]'), 'no pre-rendered host is left').toBeNull();
    });

    it('renders once when it is moved after the replace', () => {
        const tag = defineCard();
        const host = mountMarkup(`<${tag} data-pdx-ssr><div class="card"></div></${tag}>`);
        document.body.appendChild(document.createElement('section')).appendChild(host);
        expect(host.querySelectorAll('.card').length).toBe(1);
    });
});
