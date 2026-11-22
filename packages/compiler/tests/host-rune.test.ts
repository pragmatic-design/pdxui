// `@host { … }` (#133): attributes, bindings and listeners on the component's own element, compiled
// into the descriptor's `host`, which core's bindHost applies. The mounted half is
// packages/ui/tests/unit/host-rune-runtime.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { validate } from '../src/compiler/validate';
import { parseTemplate } from '../src/parser/template';

const pdx = (script: string) => `<template><span>x</span></template>\n<script>\n${script}\n</script>`;

function codes(script: string, code: string) {
    const analysis = analyzeScript(script, 'test.pdx');
    const found = [...analysis.warnings, ...validate(analysis, parseTemplate('<div></div>'), 'test.pdx')];
    return found.filter(w => w.code === code);
}

describe('@host compiles into the descriptor', () => {
    it('a static attribute, a binding read like the template\'s, and a listener built like the template\'s', () => {
        const { code } = compile(pdx([
            'let open = $signal(false);',
            '@host { role="combobox" :aria-expanded="open" @keydown.enter="open = !open" }',
        ].join('\n')), 'test.pdx');
        expect(code).toContain(`'role': "combobox"`);
        expect(code).toContain(`':aria-expanded': (ctx) => ctx.open()`);
        expect(code).toContain(`'@keydown.enter': (ctx, e) => (eventHandler(() => ctx.open.setRaw(!ctx.open()), ctx.el, 'keydown'))(e)`);
    });

    it('a block spread over several lines is read whole', () => {
        const { code } = compile(pdx([
            'let open = $signal(false);',
            '@host {',
            '  role="combobox"',
            '  :aria-expanded="open"',
            '}',
        ].join('\n')), 'test.pdx');
        expect(code).toContain(`host: { 'role': "combobox", ':aria-expanded': (ctx) => ctx.open() },`);
    });

    it(':class and :style in the object form compile to an arrow that returns the object (#1242)', () => {
        const { code } = compile(pdx([
            'let x = $signal(false);',
            "let w = $signal('1px');",
            '@host { :class="{ a: x, \'b-c\': !x }" :style="{ width: w }" }',
        ].join('\n')), 'test.pdx');
        expect(code).toContain(`':class': hostClass((ctx) => ({ a: ctx.x(), 'b-c': !ctx.x() }))`);
        expect(code).toContain(`':style': hostStyle((ctx) => ({ width: ctx.w() }))`);
        expect(code).toMatch(/import \{[^}]*\bhostClass\b[^}]*\bhostStyle\b[^}]*\} from '@pdxui\/core'/);
    });

    it('control: a host that binds neither :class nor :style imports neither binder (#1242)', () => {
        const { code } = compile(pdx('let open = $signal(false);\n@host { :aria-expanded="open" }'), 'test.pdx');
        expect(code).not.toMatch(/hostClass|hostStyle/);
    });

    it('a signal only @host reads is kept in a production build, as in dev (#1242)', () => {
        for (const production of [false, true]) {
            const { code } = compile(pdx('let open = $signal(false);\n@host { :aria-expanded="open" }'), 'test.pdx', [], undefined, { production });
            expect(code, `production: ${production}`).toMatch(/const __open = signal\(false[,)]/);
            expect(code, `production: ${production}`).toMatch(/return \{[^}]*\bopen: __open/);
        }
    });

    // The same hole for @state (#1306): on the server the template's handlers are not compiled, so a
    // signal only they write and only a @state reads looked unread, and the state named a variable gone.
    it('a signal only @state reads is kept in a production server build (#1306)', () => {
        const source = '<template><button @click="on = !on">x</button></template>\n<script>\nlet on = $signal(false);\n@state lit = on;\n</script>';
        for (const options of [{ production: true, ssr: true }, { production: true }, { production: false, ssr: true }]) {
            const { code } = compile(source, 'test.pdx', [], undefined, options);
            const name = JSON.stringify(options);
            expect(code, name).toMatch(/const __on = signal\(false[,)]/);
            expect(code, name).toContain('lit: ()=>__on()');
        }
    });

    it('the control: a component with no @host declares no host', () => {
        expect(compile(pdx('let open = $signal(false);'), 'test.pdx').code).not.toContain('host:');
    });

    it('a signal only @host reads is not PDX_UNUSED_REACTIVE', () => {
        expect(codes('let open = $signal(false);\n@host { :aria-expanded="open" }', 'PDX_UNUSED_REACTIVE')).toHaveLength(0);
    });
});

describe('@host with a name (#750)', () => {
    it('is read alone or with attributes', () => {
        expect(analyzeScript('@host el;', 'x.pdx').hostName).toBe('el');
        const both = analyzeScript('@host el { role="group" }', 'x.pdx');
        expect(both.hostName).toBe('el');
        expect(both.host).toEqual([{ name: 'role', value: 'group' }]);
        expect(both.warnings.map((w) => w.code)).toEqual([]);
        expect(analyzeScript('@host { role="group" }', 'x.pdx').hostName, 'the control: no name').toBeUndefined();
    });

    it('is the host element, declared before the body and handed to the template as a constant', () => {
        const { code } = compile('<template><label :for="el.id">x</label></template>\n<script>\n@host el;\nconst id = el.id;\n</script>', 'test.pdx');
        expect(code).toContain('const el = ctx.el;');
        expect(code.indexOf('const el = ctx.el;'), 'declared after the body that reads it').toBeLessThan(code.indexOf('const id = el.id;'));
        // A constant, not a signal: the template reads ctx.el.id, not ctx.el().id.
        expect(code).toContain('ctx.el.id');
        expect(code).not.toContain('ctx.el().id');
    });

    it('a script name of the same name is PDX_DUP_DECLARATION', () => {
        const r = compile(pdx('@host el;\nlet el = 1;'), 'test.pdx');
        expect(r.warnings.map((w) => w.code)).toContain('PDX_DUP_DECLARATION');
    });

    it('the control: a host name alone is no diagnostic', () => {
        const r = compile('<template><b>{{ el.id }}</b></template>\n<script>\n@host el;\n</script>', 'test.pdx');
        expect(r.warnings.filter((w) => w.severity === 'error')).toEqual([]);
    });

    it('a name the element already has is PDX_NAME_RESERVED', () => {
        expect(codes('@host style;', 'PDX_NAME_RESERVED')).toHaveLength(1);
    });
});

describe('PDX_HOST_INVALID_ATTRIBUTE — each form says why', () => {
    it('a two-way binding: a host has none, a model is declared', () => {
        const found = codes('@host { ::value="v" }', 'PDX_HOST_INVALID_ATTRIBUTE');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('a host has no two-way binding — declare @model value');
    });

    it('data-part: the host is not a part of itself', () => {
        const found = codes('@host { data-part="trigger" }', 'PDX_HOST_INVALID_ATTRIBUTE');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('the host is not a part of itself');
    });

    it('a generic argument: generics are declared with @generic', () => {
        const found = codes('@host { T="User" }', 'PDX_HOST_INVALID_ATTRIBUTE');
        expect(found).toHaveLength(1);
        expect(found[0].message).toContain('generics are declared with @generic');
    });

    it('the control: role, a binding and a listener are valid', () => {
        expect(codes('@host { role="combobox" :aria-label="l" @click="go" }', 'PDX_HOST_INVALID_ATTRIBUTE')).toHaveLength(0);
    });

    it('an invalid form is not compiled into the host', () => {
        const { code } = compile(pdx('@host { role="button" data-part="x" }'), 'test.pdx');
        expect(code).toContain(`host: { 'role': "button" },`);
    });
});
