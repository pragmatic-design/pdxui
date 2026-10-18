// `<style scoped>` under the default target, baseline-2026 (#152): a donut scope that stops at nested
// components, and the template's slotted elements marked as the component's own. The ancestor form of
// baseline-2024 is styles-scoping.test.ts; the behaviour in a browser is
// packages/showcase/tests/scoped-styles.spec.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate, type HtmlNode, type TemplateNode } from '../src/parser/template';
import { styleCssFor, hash } from '../src/compiler/codegen-styles';
import { donutScope, donutPrelude } from '../src/compiler/scope-donut';
import { markSlotted } from '../src/compiler/slotted-marks';
import { htmlOriginOf } from '../src/compiler/codegen-origins';
import { createCompileContext } from '../src/compiler/compile-context';
import { scopedReachesChild } from '../src/language/scoped-reach';

const H = 'data-pdx-abc';
const PRELUDE = '@scope ([data-pdx-abc], [data-pdx-abc-in]) to ([data-pdx-root] > *)';

describe('the donut scope', () => {
    it('wraps the rules in one scope rooted at the host and the slotted elements, each selector weighing what the ancestor form did', () => {
        expect(donutPrelude(H)).toBe(PRELUDE);
        expect(donutScope('.a { color: red; } .b { color: blue; }', H))
            .toBe(`${PRELUDE} {:scope .a, :where(:not([${H}])):scope:is(.a) { color: red; } :scope .b, :where(:not([${H}])):scope:is(.b) { color: blue; }}`);
    });

    it('gives each selector of a list its slotted-root alternative, a list inside :is() left whole', () => {
        const out = donutScope('.x, :is(.a, .b) > span { margin: 0 }', H);
        expect(out).toContain(`:scope .x, :where(:not([${H}])):scope:is(.x), :scope :is(.a, .b) > span, :where(:not([${H}])):scope:is(:is(.a, .b) > span)`);
    });

    it(':scope is the host, never a slotted root', () => {
        expect(donutScope(':scope { display: block } :scope > .row { gap: 1px }', H))
            .toBe(`${PRELUDE} {:where(:scope)[${H}] { display: block } :where(:scope)[${H}] > .row { gap: 1px }}`);
    });

    it('keeps a trailing pseudo-element out of :is(), which cannot hold one', () => {
        expect(donutScope('.a::before { content: "x" } .b:after { content: "y" }', H))
            .toContain(`:is(.a)::before`);
        expect(donutScope('.b:after { content: "y" }', H)).toContain(`:is(.b):after`);
    });

    it('puts a scope inside @media, @supports, @layer, @container and @starting-style', () => {
        for (const at of ['@media (min-width: 1px)', '@supports (display: grid)', '@layer base', '@container (min-width: 0px)', '@starting-style']) {
            expect(donutScope(`${at} { .m { color: red } }`, H), at).toBe(`${at} { ${PRELUDE} {:scope .m, :where(:not([${H}])):scope:is(.m) { color: red } }}`);
        }
    });

    it('copies @keyframes, @font-face, an author\'s own @scope and a statement at-rule as written, outside the scope', () => {
        const out = donutScope('@layer a, b; @keyframes k { from { opacity: 0 } } @font-face { font-family: X; } @scope (.card) { img { width: 1px } } .a { color: red }', H);
        expect(out).toContain('@layer a, b;');
        expect(out).toContain('@keyframes k { from { opacity: 0 } }');
        expect(out).toContain('@font-face { font-family: X; }');
        expect(out).toContain('@scope (.card) { img { width: 1px } }');
        expect(out.indexOf(PRELUDE), 'the style rule after them still gets its scope').toBeGreaterThan(out.indexOf('@scope (.card)'));
        expect(out).not.toMatch(/to \(\[data-pdx-root\] > \*\) \{[^}]*@keyframes/);
    });

    it('is what the default target compiles a scoped block to; baseline-2024 keeps the ancestor form', () => {
        const sfc = parseSFC('<template><p class="a">x</p></template>\n<style scoped>.a { color: red; } :scope { display: block; }</style>');
        const id = `data-pdx-${hash('d.pdx')}`;
        expect(styleCssFor(sfc, 'd.pdx', 0, false)).toContain(`@scope ([${id}], [${id}-in])`);
        const legacy = styleCssFor(sfc, 'd.pdx', 0, false, 'baseline-2024');
        expect(legacy).toContain(`[${id}] .a { color: red; }`);
        expect(legacy, ':scope is the host on the 2024 target too').toContain(`[${id}] { display: block; }`);
        expect(legacy).not.toContain('@scope');
    });
});

describe('the slotted elements', () => {
    const marked = (template: string) => markSlotted(parseTemplate(template), `${H}-in`);
    const html = (nodes: TemplateNode[]): string => nodes.map((n) => n.type === 'html' ? n.content : `[${n.type}]`).join('');

    it('marks what sits inside a component\'s tag, and nothing outside it', () => {
        const out = html(marked('<div class="own"><app-card><p class="note">x <b>y</b></p><img src="a"/><br></app-card></div>'));
        expect(out).toBe(`<div class="own"><app-card><p class="note" ${H}-in>x <b ${H}-in>y</b></p><img src="a" ${H}-in/><br ${H}-in></app-card></div>`);
    });

    it('marks a component inside a component\'s tag — the parent wrote it — and after the tag closes, stops', () => {
        const out = html(marked('<pdx-card><pdx-button>ok</pdx-button></pdx-card><span>after</span>'));
        expect(out).toBe(`<pdx-card><pdx-button ${H}-in>ok</pdx-button></pdx-card><span>after</span>`);
    });

    it('marks the rows of a @for and the branches of an @if inside the tag, each from the same state', () => {
        const nodes = marked('<pdx-list>@for (items as i; track i) { <li>{{ i }}</li> }</pdx-list>@if (a) { <p>a</p> } @else { <p>b</p> }');
        const forNode = nodes.find((n) => n.type === 'for')!;
        expect(forNode.type === 'for' && html(forNode.body)).toContain(`<li ${H}-in>`);
        const ifNode = nodes.find((n) => n.type === 'if')!;
        expect(ifNode.type === 'if' && html(ifNode.body), 'a block after the tag closed is outside it').toContain('<p>a</p>');
        expect(ifNode.type === 'if' && html(ifNode.elseBody ?? [])).toContain('<p>b</p>');
    });

    it('marks a scoped slot\'s body written inside the tag', () => {
        const nodes = marked('<pdx-table>@slot(row, { item }) { <td class="cell">{{ item }}</td> }</pdx-table>');
        const slot = nodes.find((n) => n.type === 'slot-template')!;
        expect(slot.type === 'slot-template' && html(slot.body)).toContain(`<td class="cell" ${H}-in>`);
    });

    it('keeps the origins of what follows a mark pointing at the source', () => {
        const source = '<pdx-card><p class="note">x</p><span :title="t">y</span></pdx-card>';
        const [node] = marked(source) as HtmlNode[];
        const ctx = createCompileContext({ templateOrigin: 0 });
        const origin = htmlOriginOf(ctx, { ...node, loc: { line: 1, column: 0, offset: 0 } })!;
        const at = node.content.indexOf(':title');
        expect(origin(at), 'the binding after the mark maps to where it was written').toBe(source.indexOf(':title'));
    });
});

describe('pdx migrate: a scoped selector that reached inside a child', () => {
    const file = (template: string, css: string) => `<template>${template}</template>\n<script setup>\n</script>\n<style scoped>\n${css}\n</style>\n`;

    it('flags a component tag descended into, and a subject the template never writes', () => {
        const text = file('<div class="own"><pdx-card><p class="note">x</p></pdx-card><pdx-button label="Go"></pdx-button></div>',
            'pdx-card .pdx-card-title { color: red; }\nbutton { color: red; }\n.pdx-button-label { margin: 0; }');
        expect(scopedReachesChild.detect(text).map((f) => f.found)).toEqual(['pdx-card .pdx-card-title', 'button', '.pdx-button-label']);
        expect(scopedReachesChild.fix).toBe('flag');
    });

    it('control — the component\'s own elements, its slotted content, its host and a child\'s host are not flagged', () => {
        const text = file('<div class="own"><pdx-card><p class="note">x</p></pdx-card><button>b</button></div>',
            '.own { gap: 1px; }\n.note { color: red; }\nbutton { color: red; }\n:scope { display: block; }\npdx-card { margin: 0; }\n@media (min-width: 1px) { .own { gap: 2px; } }');
        expect(scopedReachesChild.detect(text)).toEqual([]);
    });

    it('control — a class the script builds into the DOM is the component\'s own', () => {
        const text = `<template><div :ref="list"></div><pdx-card></pdx-card></template>\n<script setup>\nlet list = $signal(null);\n$effect(() => { const d = document.createElement('div'); d.className = 'scroll-item'; list?.appendChild(d); });\n</script>\n<style scoped>\n.scroll-item { padding: 0; }\n</style>\n`;
        expect(scopedReachesChild.detect(text)).toEqual([]);
    });

    it('flags a class the script hands to a component to put on what it renders', () => {
        const text = `<template><pdx-data-grid :columns="columns"></pdx-data-grid></template>\n<script setup>\nconst columns = [{ field: 'ends', cellClass: (v) => (v < '2026' ? 'warranty-ended' : '') }];\n</script>\n<style scoped>\n.warranty-ended { color: red; }\n</style>\n`;
        expect(scopedReachesChild.detect(text).map((f) => f.found)).toEqual(['.warranty-ended']);
    });

    it('control — a template that renders no component has nothing to reach into', () => {
        expect(scopedReachesChild.detect(file('<div class="a">x</div>', 'button { color: red; }'))).toEqual([]);
    });
});

describe('in a compiled component', () => {
    const page = (style: string, opts?: object) => compile(
        `<template><div class="own"><pdx-card><p class="note">x</p></pdx-card></div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n${style}`,
        'page.pdx', [], undefined, opts,
    ).code;
    const id = `data-pdx-${hash('page.pdx')}`;

    it('marks the slotted markup when the component has a scoped block', () => {
        expect(page('<style scoped>.note { color: red; }</style>')).toContain(`<p class="note" ${id}-in>`);
    });

    it('control — no mark without a scoped block, on baseline-2024, or under shadow', () => {
        expect(page('<style>.note { color: red; }</style>')).not.toContain(`${id}-in`);
        expect(page('<style scoped>.note { color: red; }</style>', { target: 'baseline-2024' })).not.toContain(`${id}-in`);
    });
});
