// A prop bound on a known component reaches the prop, whatever case it was written in.
//
// The compiler emits bound names in kebab-case for the HTML parser, and core camelCases them back —
// so `:withBorder` and `:with-border` both become `withBorder`, but the lowercase attribute form has
// no hyphen to turn back into a capital: on its own, `:withborder="false"` on pdx-app-layout would
// assign `el.withborder`, an expando, and the layout would keep its border. No warning.
//
// The compiler knows a component's declared props from the UI manifest: a bound name that matches
// one case-insensitively is emitted as that prop (and flagged, so the source gets fixed), and a name
// that matches none is PDX_UNKNOWN_PROP, with the closest declared name.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { ComponentResolver } from '../src/component-resolver';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { parseTemplate } from '../src/parser/template';
// The inline module imports it from core; the harness hands it the real one.
import { assignBoundProperty } from '../../core/src/renderer/template';

const resolver = new ComponentResolver();
resolver.registerUiManifest();
const propsOf = (tag: string) => resolver.propsOf(tag);

function compileTemplate(template: string, withProps = true) {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let on = $signal(false);\n</script>`;
    return compile(source, 'bound-names.pdx', [], undefined, withProps ? { propsOf } : undefined);
}

const codes = (r: ReturnType<typeof compile>) => r.warnings.map((w) => w.code);

describe('the manifest gives the compiler each component\'s props', () => {
    it('pdx-app-layout declares withBorder and headerHeight; a readonly getter is not a settable prop', () => {
        const props = propsOf('pdx-app-layout');
        expect(props?.has('withBorder')).toBe(true);
        expect(props?.has('headerHeight')).toBe(true);
        expect(propsOf('pdx-auto-form')?.has('form'), 'form is read-only on pdx-auto-form').toBe(false);
        expect(propsOf('pdx-not-a-component')).toBeNull();
    });
});

describe('a bound name on a known component', () => {
    it('the lowercase attribute form is emitted as the declared prop', () => {
        const r = compileTemplate('<pdx-app-layout :withborder="on"></pdx-app-layout>');
        expect(r.code).toContain(':with-border=');
        expect(r.code).not.toContain(':withborder=');
        // ...and said, so the source is fixed rather than relied on.
        expect(codes(r)).toContain('PDX_PROP_NAME_CASE');
    });

    it('camelCase and kebab-case are the prop already: unchanged, nothing to say', () => {
        for (const t of ['<pdx-app-layout :withBorder="on"></pdx-app-layout>', '<pdx-app-layout :with-border="on"></pdx-app-layout>']) {
            const r = compileTemplate(t);
            expect(r.code).toContain(':with-border=');
            expect(codes(r).filter((c) => c.startsWith('PDX_PROP') || c === 'PDX_UNKNOWN_PROP')).toEqual([]);
        }
    });

    it(':nosuchprop warns PDX_UNKNOWN_PROP', () => {
        const r = compileTemplate('<pdx-app-layout :nosuchprop="on"></pdx-app-layout>');
        expect(codes(r)).toContain('PDX_UNKNOWN_PROP');
    });

    it('a name that matches no prop warns PDX_UNKNOWN_PROP, naming the closest', () => {
        const r = compileTemplate('<pdx-app-layout :withBordr="on"></pdx-app-layout>');
        const w = r.warnings.find((x) => x.code === 'PDX_UNKNOWN_PROP');
        expect(w, 'no PDX_UNKNOWN_PROP').toBeTruthy();
        expect(`${w!.message} ${w!.hint ?? ''}`).toContain('withBorder');
    });

    it('an element attribute every element has is not a component prop to check', () => {
        const r = compileTemplate('<pdx-app-layout :class="on" :hidden="on" :title="on" :aria-label="on" :data-x="on"></pdx-app-layout>');
        expect(codes(r)).not.toContain('PDX_UNKNOWN_PROP');
    });

    it('two-way `::` bindings resolve the same way', () => {
        const r = compileTemplate('<pdx-app-layout ::withborder="on"></pdx-app-layout>');
        expect(r.code).toContain('::with-border=');
    });
});

describe('the inline build binds a component prop the same way', () => {
    it('resolves the lowercase name, and assigns through core\'s assignBoundProperty', () => {
        const source = '<template>\n<pdx-app-layout :withborder="on"></pdx-app-layout>\n</template>\n<script setup>\n  let on = $signal(false);\n</script>';
        const r = compile(source, 'bound-names.pdx', [], undefined, { production: true, inlineBindings: true, propsOf });
        expect(r.code).toMatch(/assignBoundProperty\(__el\d+, "withBorder", /);
        expect(r.code).toMatch(/import \{[^}]*\bassignBoundProperty\b[^}]*\} from '@pdxui\/core'/);
        expect(codes(r)).toContain('PDX_PROP_NAME_CASE');
    });

    it('a prop named like a read-only DOM getter binds before the component connects', () => {
        // What a component is before its setup installs the prop accessors: an element whose
        // `offsetTop` is the DOM's getter, with no setter. A plain assignment throws on it.
        class NativeElement { get offsetTop(): number { return 0; } }
        class Unconnected extends NativeElement {
            children: Unconnected[] = [];
            constructor(public tagName: string) { super(); }
            appendChild(c: Unconnected) { this.children.push(c); }
            setAttribute() { /* not reached: a component's bound name is a property */ }
        }
        expect(() => { (new Unconnected('PROBE-X') as unknown as Record<string, unknown>).offsetTop = 1; }, 'the premise').toThrow();

        const iife = generateInlineNodes(parseTemplate('<probe-x :offset-top="top"></probe-x>'), new Set());
        const document = { createDocumentFragment: () => new Unconnected('#fragment'), createElement: (t: string) => new Unconnected(t.toUpperCase()) };
        const effect = (fn: () => void) => fn();
        const ctx = { top: () => 5 };
        const frag = new Function('document', 'effect', 'ctx', 'assignBoundProperty', `return ${iife};`)(document, effect, ctx, assignBoundProperty) as Unconnected;
        expect((frag.children[0] as unknown as { offsetTop: number }).offsetTop).toBe(5);
    });
});

// Found while generating, so validate()'s positions do not cover them, and `pdx check` and the
// editor would have nowhere to point. compile() locates the bound attribute in the file.
describe('a bound-name warning says where the attribute is', () => {
    const source = [
        '<template>',                                            // line 1
        '  <div>',                                               // line 2
        '    <pdx-app-layout :withBordr="on"></pdx-app-layout>', // line 3, `:withBordr` at column 21
        '    <pdx-app-layout :withborder="on"></pdx-app-layout>',// line 4
        '  </div>',
        '</template>',
        '<script setup>',
        '  let on = $signal(false);',
        '</script>',
    ].join('\n');

    it('PDX_UNKNOWN_PROP and PDX_PROP_NAME_CASE carry the 1-based line and column of the attribute', () => {
        const r = compile(source, 'located.pdx', [], undefined, { propsOf });
        const unknown = r.warnings.find((w) => w.code === 'PDX_UNKNOWN_PROP');
        const nameCase = r.warnings.find((w) => w.code === 'PDX_PROP_NAME_CASE');
        expect({ line: unknown?.line, column: unknown?.column }).toEqual({ line: 3, column: 21 });
        expect({ line: nameCase?.line, column: nameCase?.column }).toEqual({ line: 4, column: 21 });
    });
});

describe('without the component\'s props, nothing is guessed', () => {
    it('an unknown element keeps its name and draws no warning', () => {
        const r = compileTemplate('<my-widget :someprop="on"></my-widget>');
        expect(r.code).toContain(':someprop=');
        expect(codes(r)).not.toContain('PDX_UNKNOWN_PROP');
    });

    it('a compile with no props lookup behaves as before', () => {
        const r = compileTemplate('<pdx-app-layout :withborder="on"></pdx-app-layout>', false);
        expect(r.code).toContain(':withborder=');
        expect(codes(r)).not.toContain('PDX_PROP_NAME_CASE');
    });
});
