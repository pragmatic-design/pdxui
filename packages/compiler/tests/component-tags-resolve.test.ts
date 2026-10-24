// A pass that had almost no tests: the AST tag walk.
//
// `findComponentTags` walks the template AST for custom elements. Its interesting part is the list
// of child collections it recurses into: a tag used only inside `@placeholder` or `@error` and not
// found there is a component that silently never registers in that branch.
//
// The form auto-wire this file also held is gone: a control binds through its model, inside
// `<pdx-form :form>` (#128) and in a form section (#613) — `form-name-binding.test.ts`.

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parser/template';
import { findComponentTags, generateComponentImports } from '../src/compiler/resolve';

describe('walking the AST for custom element tags', () => {
    it('finds a tag in plain markup and lower-cases it', () => {
        expect(findComponentTags(parseTemplate('<div><My-Widget/></div>'))).toEqual(['my-widget']);
    });

    it('ignores a plain HTML element, which has no hyphen', () => {
        expect(findComponentTags(parseTemplate('<div><span>x</span></div>'))).toEqual([]);
    });

    it('skips a tag the caller already knows about', () => {
        expect(findComponentTags(parseTemplate('<pdx-known/>'), new Set(['pdx-known']))).toEqual([]);
    });

    it('reports a tag once however many times it appears', () => {
        expect(findComponentTags(parseTemplate('<pdx-a/><pdx-a/><pdx-a/>'))).toEqual(['pdx-a']);
    });

    it('descends into @if and its @else', () => {
        const ast = parseTemplate('@if (x) { <pdx-yes/> } @else { <pdx-no/> }');
        expect(findComponentTags(ast).sort()).toEqual(['pdx-no', 'pdx-yes']);
    });

    it('descends into every @switch case and its @default', () => {
        const ast = parseTemplate("@switch (s) { @case ('a') { <pdx-a/> } @default { <pdx-d/> } }");
        expect(findComponentTags(ast).sort()).toEqual(['pdx-a', 'pdx-d']);
    });

    it('descends into a @defer placeholder', () => {
        // A component used only in the placeholder is the easiest one to miss: it renders first.
        const ast = parseTemplate('@defer (viewport) { <pdx-heavy/> } @placeholder { <pdx-skeleton/> }');
        expect(findComponentTags(ast).sort()).toEqual(['pdx-heavy', 'pdx-skeleton']);
    });

    it('descends into @await loading and error branches', () => {
        const ast = parseTemplate('@await (r) { <pdx-ok/> } @loading { <pdx-wait/> } @error (e) { <pdx-bad/> }');
        expect(findComponentTags(ast).sort()).toEqual(['pdx-bad', 'pdx-ok', 'pdx-wait']);
    });

    it('descends into a @try @catch branch', () => {
        // TryNode calls it catchBody, AwaitNode calls it errorBody, DeferNode calls it error.
        // Only the last was walked, so these two branches auto-imported nothing.
        const ast = parseTemplate('@try { <pdx-ok/> } @catch (e) { <pdx-fallback/> }');
        expect(findComponentTags(ast).sort()).toEqual(['pdx-fallback', 'pdx-ok']);
    });

    it('descends into a @defer error branch, which uses yet another name', () => {
        const ast = parseTemplate('@defer (viewport) { <pdx-heavy/> } @error { <pdx-broken/> }');
        expect(findComponentTags(ast)).toContain('pdx-broken');
    });

    it('descends into @for', () => {
        const ast = parseTemplate('@for (items as i; track i.id) { <pdx-row/> }');
        expect(findComponentTags(ast)).toEqual(['pdx-row']);
    });
});

describe('generating imports for discovered tags', () => {
    it('maps a tag to a sibling .pdx file', () => {
        expect(generateComponentImports(['pdx-header'])).toEqual(["import './header.pdx';"]);
    });

    it('uses the directory it is given, adding the separator when it is missing', () => {
        expect(generateComponentImports(['pdx-header'], ['./components'])).toEqual(["import './components/header.pdx';"]);
        expect(generateComponentImports(['pdx-header'], ['./components/'])).toEqual(["import './components/header.pdx';"]);
    });

    it('keeps a multi-word name intact', () => {
        expect(generateComponentImports(['pdx-user-card'])).toEqual(["import './user-card.pdx';"]);
    });

    it('produces nothing for no tags', () => {
        expect(generateComponentImports([])).toEqual([]);
    });
});
