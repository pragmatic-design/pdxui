// html`` rendered to a string is what the client builds from the same template (#160, part 2).
//
// Static generation writes a route's HTML with `renderToString`, and hydration will adopt it (part 4),
// so the markup must be the client's: the same elements, attributes, classes, styles and text. Each
// case here renders one template twice — through the client's html`` into the DOM, and to a string
// parsed back — and compares the two canonically: attributes sorted, classes sorted, styles as the
// browser reads them, adjacent text merged, and the string's `<!--pdx-->` part markers set aside.

import { describe, it, expect } from 'vitest';
import { html } from '../src/renderer/template';
import { renderToString, PART_OPEN, PART_CLOSE } from '../src/server/render-string';
import { signal } from '../src/reactivity/signal';

/** A node as a canonical string: what both renders must agree on. */
function canonical(node: Node): string {
    if (node.nodeType === 3) return (node as Text).data;
    if (node.nodeType === 8) {
        const data = (node as Comment).data;
        return data === 'pdx' || data === '/pdx' ? '' : `<!--${data}-->`;
    }
    if (node.nodeType !== 1) return '';
    const el = node as HTMLElement;
    const attrs = Array.from(el.attributes).map((a) => {
        if (a.name === 'class') return `class="${a.value.split(/\s+/).filter(Boolean).sort().join(' ')}"`;
        if (a.name === 'style') return `style="${el.style.cssText}"`;
        return `${a.name}="${a.value}"`;
    }).sort();
    return `<${el.localName}${attrs.length ? ' ' + attrs.join(' ') : ''}>${children(el)}</${el.localName}>`;
}

function children(parent: Node): string {
    const box = parent.cloneNode(true);
    // Merge adjacent text after the markers are gone: the parser merged it in the string's DOM.
    box.childNodes.forEach(() => {});
    const strip = (n: Node): void => {
        for (const c of Array.from(n.childNodes)) {
            if (c.nodeType === 8 && ((c as Comment).data === 'pdx' || (c as Comment).data === '/pdx')) n.removeChild(c);
            else strip(c);
        }
    };
    strip(box);
    box.normalize();
    return Array.from(box.childNodes).map(canonical).join('');
}

/** The client's DOM and the string's, canonically. */
function both(render: () => DocumentFragment): { client: string; server: string; markup: string } {
    const built = document.createElement('div');
    built.appendChild(render());
    // Read back through its own serialisation: happy-dom keeps getAttribute('class') and classList at
    // the pre-binding value on an element whose `:class` attribute was removed by name (it parses the
    // colon as a namespace prefix), while outerHTML holds what the DOM has — template-more.test.ts.
    const a = document.createElement('div');
    a.innerHTML = built.innerHTML;
    const markup = renderToString(render);
    const b = document.createElement('div');
    b.innerHTML = markup;
    return { client: children(a), server: children(b), markup };
}

function parity(render: () => DocumentFragment): string {
    const { client, server, markup } = both(render);
    expect(server, `markup: ${markup}`).toBe(client);
    return markup;
}

describe('html`` to a string matches the client', () => {
    it('static markup, void elements, comments and a self-closed element', () => {
        parity(() => html`<section class="a"><h1>Title</h1><br><img alt="x"><!-- note --><x-y /></section>`);
    });

    it('SVG keeps the camelCase the parser puts back', () => {
        parity(() => html`<svg viewBox="0 0 10 10"><linearGradient id="g"></linearGradient><path d=${'M0 0L10 10'}/></svg>`);
    });

    it('text values: primitives, null and false as nothing, escaping', () => {
        const m = parity(() => html`<p>${'a < b & c'} ${0} ${null}${false}${undefined} ${42}</p>`);
        expect(m).toContain('a &lt; b &amp; c');
    });

    it('a function value is read once, a signal as its value', () => {
        const name = signal('Ada');
        parity(() => html`<p>Hello ${() => name()}, ${name}</p>`);
    });

    it('nested templates and lists', () => {
        const items = ['one', 'two', 'three'];
        parity(() => html`<ul>${items.map((i) => html`<li class="item">${i}</li>`)}</ul>`);
        parity(() => html`<div>${html`<b>${'x'}</b>`}${[]}</div>`);
    });

    it('plain attributes: whole, mixed, boolean, class, style object, URLs', () => {
        parity(() => html`<a id=${'link'} title="Go ${'home'} now" hidden=${false} href=${'/home'}>x</a>`);
        parity(() => html`<button disabled=${true} class=${'btn primary'}>b</button>`);
        parity(() => html`<div style=${{ color: 'red', marginTop: '4px' }}></div>`);
        const m = parity(() => html`<a href=${'javascript:alert(1)'}>x</a>`);
        expect(m).not.toContain('javascript');
    });

    it('an attribute value is escaped', () => {
        const m = parity(() => html`<div title=${'"><script>x</script>'}></div>`);
        expect(m).not.toContain('<script>');
    });

    it(':prop on a plain element: class merge, aria/data, style, textContent, value', () => {
        // One dynamic class: with two, happy-dom's client render drops the first, its classList stuck
        // at the pre-binding value (template-more.test.ts); Chromium holds two, class-toggle-binding.spec.ts.
        parity(() => html`<div class="static" :class=${'dyn'}></div>`);
        parity(() => html`<div :aria-label=${'Close'} :data-id=${7} :aria-hidden=${null}></div>`);
        parity(() => html`<div :style=${'color: blue'}></div>`);
        parity(() => html`<span :textContent=${'<b>t</b>'}></span>`);
        parity(() => html`<input :disabled=${true} :placeholder=${'Name'} :title=${() => 'T'}>`);
    });

    it('a field\'s state: the string writes what the client holds as a property', () => {
        // The client assigns `value` and `checked` as properties, which its serialisation does not show;
        // the string must write them, or a pre-rendered field reads empty until the script runs. So the
        // two agree on the state each element holds once parsed, not on their serialisation.
        const render = () => html`<textarea :value=${'note'}></textarea><input :value=${'Ada'}><input type="checkbox" :checked=${true}>`;
        const client = document.createElement('div');
        client.appendChild(render());
        const server = document.createElement('div');
        server.innerHTML = renderToString(render);
        const state = (box: Element) => [
            (box.querySelector('textarea') as HTMLTextAreaElement).value,
            (box.querySelector('input:not([type])') as HTMLInputElement).value,
            (box.querySelector('input[type=checkbox]') as HTMLInputElement).checked,
        ];
        expect(state(server)).toEqual(state(client));
        expect(state(server)).toEqual(['note', 'Ada', true]);
    });

    it(':class.x, :style.x and :show', () => {
        parity(() => html`<div class="a" :class.on=${true} :class.off=${false}></div>`);
        parity(() => html`<div :style.color=${'red'} :style.width=${() => '10px'}></div>`);
        parity(() => html`<div :show=${false}>hidden</div><div :show=${true}>shown</div>`);
    });

    it('events, refs and attachments write nothing', () => {
        const ref = signal<Element | null>(null);
        const m = parity(() => html`<button @click=${() => {}} :ref=${ref}>b</button>`);
        expect(m).not.toMatch(/@click|:ref/);
        // The parity check's client render set it; the server render alone must not.
        ref.set(null);
        renderToString(() => html`<button :ref=${ref}>b</button>`);
        expect(ref.peek(), 'the server render sets no ref').toBeNull();
    });

    it('a component prop writes no attribute, as the client assigns it as a property', () => {
        parity(() => html`<x-card :items=${[1, 2]} :label=${'L'}></x-card>`);
    });
});

describe('the part markers', () => {
    it('bracket every value put in content, so hydration finds text the parser merged', () => {
        const markup = renderToString(() => html`<p>a${'b'}c</p>`);
        expect(markup).toBe(`<p>a${PART_OPEN}b${PART_CLOSE}c</p>`);
    });
});
