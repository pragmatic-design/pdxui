// With inlineBindings, a bound name with `-` or `:` compiles to JavaScript that runs, and SVG is
// created in the SVG namespace.
//
// An attribute regex without `-` or `:` in its bound-name alternatives matches `:aria` in
// `<div :aria-label="label">` with an empty value and `-label="label"` as a static attribute:
// `__el0["aria"] = ;` — a module that does not parse. `:data-id`, `:xlink:href` and `@pdx-change`
// break the same way. And an <svg> built with `document.createElement` is an HTML element that
// draws nothing.
//
// A name is routed the way core's `bindProperty` routes it: aria-*, data-*, and a name with `-` or
// `:` on a plain element are attributes; a hyphenated prop on a component is its camelCase property;
// on SVG, where the DOM properties are read-only views, a bound name is an attribute.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const SVG_NS = 'http://www.w3.org/2000/svg';

function inline(template: string, script = "let label = $signal('x');\nlet id = $signal(1);\nlet url = $signal('#t');\nfunction go() {}"): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;
    return compile(source, 'inline-names.pdx', [], undefined, { production: true, inlineBindings: true }).code;
}

/** The emitted module must parse: a generator that writes broken JS is the defect itself. */
function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

describe('inlineBindings: bound names with - or :', () => {
    it(':aria-label and :data-id compile to setAttribute, in a module that parses', () => {
        const code = inline('<div :aria-label="label" :data-id="id"></div>');
        parses(code);
        expect(code).toMatch(/setAttribute\("aria-label", /);
        expect(code).toMatch(/setAttribute\("data-id", /);
        expect(code).toMatch(/removeAttribute\("aria-label"\)/);
        expect(code, 'the name was cut at the hyphen').not.toMatch(/\["aria"\]|\["data"\]|"-label"|"-id"/);
    });

    it(':xlink:href on an SVG link is sanitised and set as the attribute', () => {
        const code = inline('<svg><a :xlink:href="url"><text>t</text></a></svg>');
        parses(code);
        expect(code).toMatch(/const __v = ctx\.url\(\);/);
        expect(code).toMatch(/sanitizeBoundUrl\(\w+, "xlink:href", __v\)/);
        expect(code).toMatch(/setAttribute\("xlink:href", __safeUrl\)/);
        expect(code, 'the name was cut at the colon').not.toMatch(/\["xlink"\]/);
    });

    it('a static namespaced attribute stays one attribute', () => {
        const code = inline('<svg><use xlink:href="#icon"></use></svg>');
        parses(code);
        expect(code).toMatch(/setAttribute\("xlink:href", "#icon"\)/);
    });

    it('an event name with a hyphen is one event: @pdx-change', () => {
        const code = inline('<pdx-select @pdx-change="go"></pdx-select>');
        parses(code);
        expect(code).toMatch(/addEventListener\('pdx-change', /);
        expect(code).not.toMatch(/addEventListener\('pdx', /);
    });

    it('a hyphenated prop on a component is its camelCase property, as core does', () => {
        const code = inline('<pdx-list :item-height="id"></pdx-list>');
        parses(code);
        // Assigned through core's assignBoundProperty, which a component's props go through.
        expect(code).toMatch(/assignBoundProperty\(__el\d+, "itemHeight", ctx\.id\(\)\)/);
    });
});

describe('inlineBindings: SVG is created in the SVG namespace', () => {
    it('<svg> and every element inside it use createElementNS', () => {
        const code = inline('<svg viewBox="0 0 10 10"><g><circle cx="5" cy="5" r="2"></circle></g></svg><p>after</p>');
        parses(code);
        for (const tag of ['svg', 'g', 'circle']) {
            expect(code, tag).toContain(`document.createElementNS(${JSON.stringify(SVG_NS)}, '${tag}')`);
        }
        expect(code, 'an HTML sibling after the svg stays HTML').toContain("document.createElement('p')");
    });

    it('an element inside a block inside the svg is SVG too: @for', () => {
        const code = inline('<svg>@for (items as it; track it) {<circle :r="it"></circle>}</svg>', 'let items = $signal([1, 2]);');
        parses(code);
        expect(code).toContain(`document.createElementNS(${JSON.stringify(SVG_NS)}, 'circle')`);
    });

    it('a bound attribute on an SVG element is set as the attribute, and a static class too', () => {
        const code = inline('<svg><rect :width="id" class="bar"></rect></svg>');
        parses(code);
        expect(code).toMatch(/setAttribute\("width", /);
        expect(code, 'className is read-only on SVG').not.toMatch(/\.className = /);
        expect(code).toMatch(/setAttribute\("class", "bar"\)/);
    });

    it('the children of foreignObject are HTML again', () => {
        const code = inline('<svg><foreignObject><div>html</div></foreignObject></svg>');
        parses(code);
        expect(code).toContain("document.createElement('div')");
    });
});

describe('the controls', () => {
    // A plain element is asked at run time, as core asks it: the property when the element has it,
    // the attribute otherwise. The assertion is that the property is the branch taken when the name
    // is the element's; that an <input> takes it is pinned on a stub element in
    // inline-attr-to-prop.test.ts. That branch hands null to core's clearBoundProperty, as core's
    // does, and assigns anything else.
    it(':disabled and :value still assign the property', () => {
        const code = inline('<input :disabled="id" :value="label" />');
        parses(code);
        expect(code).toMatch(/if \("disabled" in (\w+)\) \{ const __v = ctx\.id\(\); if \(__v == null\) clearBoundProperty\(\1, "disabled", "disabled"\); else \1\["disabled"\] = __v; \}/);
        expect(code).toMatch(/if \("value" in (\w+)\) \{ const __v = ctx\.label\(\); if \(__v == null\) clearBoundProperty\(\1, "value", "value"\); else \1\["value"\] = __v; \}/);
    });

    it('a camelCase DOM property keeps the property path, on HTML and on SVG: :textContent', () => {
        const code = inline('<p :textContent="label"></p><svg><text :textContent="label"></text></svg>');
        parses(code);
        expect(code.match(/if \("textContent" in (\w+)\) \{ const __v = ctx\.label\(\); if \(__v == null\) clearBoundProperty\(\1, "textContent", "textContent"\); else \1\["textContent"\] = __v; \}/g)).toHaveLength(2);
    });

    it('an HTML element is still created with createElement', () => {
        const code = inline('<div><span>x</span></div>');
        expect(code).toContain("document.createElement('div')");
        expect(code).not.toContain('createElementNS');
    });
});
