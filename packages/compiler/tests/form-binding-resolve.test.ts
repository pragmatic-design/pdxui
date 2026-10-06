// Two passes that had almost no tests: the form auto-wire and the AST tag walk.
//
// `applyFormBindings` rewrites raw HTML before any binding codegen runs: inside `<pdx-form :form="f">`
// every control with a `name` gets its value, change and blur wiring written for it. The rules it
// follows — only inside a form, only with a name, never over an explicit binding — are the whole
// feature, and they existed only as code.
//
// `findComponentTags` walks the template AST for custom elements. Its interesting part is the list
// of child collections it recurses into: a tag used only inside `@placeholder` or `@error` and not
// found there is a component that silently never registers in that branch.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';
import { findComponentTags, generateComponentImports } from '../src/compiler/resolve';
import { FormControlRegistry } from '../src/compiler/codegen-form-binding';

const SETUP = "<script setup>\n  let f = $form({ email: '' });\n</script>";

function tpl(inner: string): string {
    const { code } = compile(`<template>\n${inner}\n</template>\n${SETUP}`, 'form.pdx');
    return code;
}

describe('the form auto-wire', () => {
    it('wires a named control inside the form', () => {
        const code = tpl('<pdx-form :form="f"><pdx-input name="email" /></pdx-form>');
        expect(code).toContain('email');
        // The three things the author would otherwise write by hand.
        expect(code).toMatch(/value/i);
        expect(code).toMatch(/pdx-input|input/i);
    });

    it('leaves a control with no name alone', () => {
        // A control with no name has nothing to bind TO — wiring it would invent a field.
        const withName = tpl('<pdx-form :form="f"><pdx-input name="email" /></pdx-form>');
        const without = tpl('<pdx-form :form="f"><pdx-input /></pdx-form>');
        expect(without.length).toBeLessThan(withName.length);
    });

    it('leaves a named control that is not inside a form alone', () => {
        const inside = tpl('<pdx-form :form="f"><pdx-input name="email" /></pdx-form>');
        const outside = tpl('<div><pdx-input name="email" /></div>');
        expect(outside.length).toBeLessThan(inside.length);
    });

    it('never overwrites a binding the author wrote', () => {
        // Rule 3. If the author bound :value themselves, theirs is the one that must survive.
        const code = tpl('<pdx-form :form="f"><pdx-input name="email" :value="mine" /></pdx-form>');
        expect(code).toContain('mine');
    });

    it('binds a checkbox by its checked state, not by a value string', () => {
        const code = tpl('<pdx-form :form="f"><pdx-checkbox name="agree" /></pdx-form>');
        expect(code).toContain('agree');
        expect(code).toMatch(/checked/i);
    });

    it('wires a pdx-form-field wrapper to the field it names', () => {
        const code = tpl('<pdx-form :form="f"><pdx-form-field name="email"><pdx-input name="email" /></pdx-form-field></pdx-form>');
        expect(code).toMatch(/error/i);
        expect(code).toMatch(/touched/i);
    });

    it('reaches a control nested several elements deep', () => {
        const code = tpl('<pdx-form :form="f"><div><fieldset><pdx-input name="email" /></fieldset></div></pdx-form>');
        expect(code).toContain('email');
    });
});

describe('the form control registry', () => {
    it('knows the shipped controls, and which of them are checkboxes', () => {
        const r = new FormControlRegistry();
        expect(r.tags.has('pdx-input')).toBe(true);
        expect(r.checked.has('pdx-checkbox')).toBe(true);
        expect(r.checked.has('pdx-input')).toBe(false);
        expect(r.textInput.has('pdx-textarea')).toBe(true);
    });

    it('accepts a custom control, with the event and value expression it reports', () => {
        const r = new FormControlRegistry();
        r.register('My-Gauge', { valueEvent: 'gauge-change', valueExpr: 'e.detail?.n', checked: true, textInput: true });

        expect(r.tags.has('my-gauge'), 'the tag is lower-cased on registration').toBe(true);
        expect(r.eventName['my-gauge']).toBe('gauge-change');
        expect(r.valueExpr['my-gauge']).toBe('e.detail?.n');
        expect(r.checked.has('my-gauge')).toBe(true);
        expect(r.textInput.has('my-gauge')).toBe(true);
    });

    it('registers a plain control with no configuration at all', () => {
        const r = new FormControlRegistry();
        r.register('my-plain');
        expect(r.tags.has('my-plain')).toBe(true);
        expect(r.eventName['my-plain']).toBeUndefined();
        expect(r.checked.has('my-plain')).toBe(false);
    });

    it('does not leak a registration into another instance', () => {
        // The class exists because the old API mutated a module singleton across plugin instances.
        const a = new FormControlRegistry();
        a.register('only-in-a');
        expect(new FormControlRegistry().tags.has('only-in-a')).toBe(false);
    });
});

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
