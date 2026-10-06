// Tests for @provide/@inject declarative context runes.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

function compileCtx(source: string) {
    return compile(source, 'ctx-test.pdx');
}

describe('@provide — declarative context provider', () => {
    it('generates provide() call with signal expression', () => {
        const { code } = compileCtx(`
<template><div>Provider</div></template>
<script setup>
@provide theme = $signal({ mode: 'dark', accent: 'blue' });
</script>
        `);
        expect(code).toContain("provide('theme'");
        expect(code).toMatch(/import\s*\{[^}]*provide[^}]*\}/);
    });

    it('generates provide() with plain value', () => {
        const { code } = compileCtx(`
<template><div>Provider</div></template>
<script setup>
let x = $signal(0);
@provide apiUrl = 'https://api.example.com';
</script>
        `);
        expect(code).toContain("provide('apiUrl'");
        expect(code).toContain("'https://api.example.com'");
    });

    it('supports multiple @provide declarations', () => {
        const { code } = compileCtx(`
<template><div>Multi</div></template>
<script setup>
@provide theme = $signal('dark');
@provide locale = $signal('en');
</script>
        `);
        expect(code).toContain("provide('theme'");
        expect(code).toContain("provide('locale'");
    });
});

describe('@inject — declarative context consumer', () => {
    it('generates inject() call', () => {
        const { code } = compileCtx(`
<template><div>{{ theme() }}</div></template>
<script setup>
@inject theme;
</script>
        `);
        expect(code).toContain("inject('theme'");
        expect(code).toMatch(/import\s*\{[^}]*inject[^}]*\}/);
    });

    it('supports alias with "as"', () => {
        const { code } = compileCtx(`
<template><div>{{ appTheme }}</div></template>
<script setup>
@inject theme as appTheme;
</script>
        `);
        expect(code).toContain("const appTheme = inject('theme'");
    });

    it('auto-exports injected value', () => {
        const { code } = compileCtx(`
<template><div>{{ theme }}</div></template>
<script setup>
@inject theme;
</script>
        `);
        // Should be accessible as ctx.theme in render
        expect(code).toContain("inject('theme'");
    });

    it('is declared before the script body, which can read it at setup', () => {
        // Emitted after the body, `const label = theme.name` ran inside `theme`'s temporal dead zone:
        // ReferenceError at setup. Nothing caught it because the rune had only ever been read inside
        // something lazy — a `$derived`, a function.
        const { code } = compileCtx(`
<template><p>{{ label }}</p></template>
<script setup>
@inject theme;
const label = theme.name;
</script>
        `);
        const declared = code.indexOf("const theme = inject('theme', ctx.el)");
        const read = code.indexOf('const label = theme.name');
        expect(declared, 'no inject() declaration').toBeGreaterThan(-1);
        expect(read, 'the read is not in the output').toBeGreaterThan(-1);
        expect(declared, 'the injected value is declared after the code that reads it').toBeLessThan(read);
    });

    it('control — @provide stays after the body, where the value it provides is defined', () => {
        const { code } = compileCtx(`
<template><div><slot /></div></template>
<script setup>
const store = { name: 'dark' };
@provide theme = store;
</script>
        `);
        expect(code.indexOf("provide('theme', store, ctx.el)")).toBeGreaterThan(code.indexOf('const store ='));
    });

    it('supports multiple @inject declarations', () => {
        const { code } = compileCtx(`
<template><div>Multi</div></template>
<script setup>
@inject theme;
@inject locale;
let x = $signal(0);
</script>
        `);
        expect(code).toContain("inject('theme'");
        expect(code).toContain("inject('locale'");
    });
});

describe('@provide + @inject combined', () => {
    it('compiles without errors or warnings', () => {
        const provider = compileCtx(`
<template><div><slot /></div></template>
<script setup>
@provide theme = $signal({ mode: 'dark' });
</script>
        `);
        expect(provider.warnings).toEqual([]);

        const consumer = compileCtx(`
<template><div>{{ theme }}</div></template>
<script setup>
@inject theme;
</script>
        `);
        expect(consumer.warnings).toEqual([]);
    });
});
