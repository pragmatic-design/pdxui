// A compiled `.pdx` is defined with `defineComponent`, given the features its declarations use and no
// other (#1246): the code that implements `@expose` and `@host` (with the variant axes it reflects) ships
// only with a component that declares it. `@state` is not a feature: measured, its code in the definition
// weighs less than the call that would carry it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/index';

/** The features object the module passes to `defineComponent` (null for none), and what it imports from core. */
function definition(source: string): { features: string | null; imports: string[] } {
    const { code } = compile(source, 'C:/app/src/app-probe.pdx');
    if (!code.includes("defineComponent('app-probe'")) throw new Error(`no defineComponent call in:\n${code}`);
    const features = /\n\}, (\{[^\n]*\})\);\n/.exec(code)?.[1] ?? null;
    const imports = /import \{ ([^}]*) \} from '@pdxui\/core';/.exec(code)![1].split(',').map(s => s.trim());
    return { features, imports };
}

describe('a compiled component names the features it uses (#1246)', () => {
    it('one that declares none is given none, and imports none', () => {
        const d = definition(`<template><p>{{ n }}</p></template>\n<script>\nlet n = $signal(0);\n</script>`);
        expect(d.features).toBeNull();
        expect(d.imports).toContain('defineComponent');
        expect(d.imports).not.toContain('component');
        for (const fn of ['exposeOnElement', 'bindHost']) expect(d.imports).not.toContain(fn);
    });

    it('@expose is given exposeOnElement', () => {
        const d = definition(`<template><p></p></template>\n<script>\n@expose open;\nfunction open() {}\n</script>`);
        expect(d.features).toBe('{ expose: exposeOnElement }');
        expect(d.imports).toContain('exposeOnElement');
    });

    it('@host is given bindHost', () => {
        const d = definition(`<template><p></p></template>\n<script>\n@host { role="button" }\n</script>`);
        expect(d.features).toBe('{ host: bindHost }');
        expect(d.imports).toContain('bindHost');
    });

    it('@variants is given bindHost, which reflects the axes on the host', () => {
        const d = definition(`<template><p></p></template>\n<script>\n@variants {\n  tone: { neutral: '.tone-neutral', danger: '.tone-danger' } = neutral;\n}\n</script>`);
        expect(d.features).toBe('{ host: bindHost }');
    });

    it('a model declared { form } is given FormPdxElement, the base of a form-associated component', () => {
        const d = definition(`<template><input /></template>\n<script>\n@model value: string = '' { form };\n</script>`);
        expect(d.features).toBe('{ form: FormPdxElement }');
        expect(d.imports).toEqual(expect.arrayContaining(['FormPdxElement', 'wireFormModel']));
    });

    it('a template that renders a <slot> is given slotProjection; one that renders none is not', () => {
        const slotted = definition(`<template><div class="box"><slot></slot><slot name="end"></slot></div></template>\n<script>\n</script>`);
        expect(slotted.features).toBe('{ projection: slotProjection }');
        expect(slotted.imports).toContain('slotProjection');
        const plain = definition(`<template><div class="box"></div></template>\n<script>\n</script>`);
        expect(plain.features).toBeNull();
        expect(plain.imports).not.toContain('slotProjection');
    });

    it('both, in one object', () => {
        const d = definition(`<template><p></p></template>\n<script>\n@host { role="button" }\n@expose open;\nfunction open() {}\n</script>`);
        expect(d.features).toBe('{ expose: exposeOnElement, host: bindHost }');
    });
});
