// Tests for @provide/@inject declarative context runes, by token (#496): `@provide Token = expr;` and
// `@inject name from Token;` / `@inject name from Token = fallback;`, where `Token` is a
// `context<T>()` the script imports. The alpha's string keys — `@provide key = …`, `@inject key;`,
// `@inject key as alias;` — are PDX_UNKNOWN_DECLARATION, and `pdx migrate` lists them until #497
// rewrites them.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { LANGUAGE_CHANGES } from '../src/language/changes';

function compileCtx(source: string) {
    return compile(source, 'ctx-test.pdx');
}

const IMPORTS = "import { Theme, Locale, CurrentUser } from './contexts';";

const unknown = (source: string) => compileCtx(source).warnings.filter((w) => w.code === 'PDX_UNKNOWN_DECLARATION');

describe('@provide Token = expr — declarative context provider', () => {
    it('generates provide(Token, value, host) with a signal', () => {
        const { code, warnings } = compileCtx(`
<template><div>Provider</div></template>
<script>
${IMPORTS}
let theme = $signal({ mode: 'dark', accent: 'blue' });
@provide Theme = theme;
</script>
        `);
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        expect(code).toMatch(/provide\(Theme, __theme(?:\(\))?, ctx\.el\)/);
        expect(code).toMatch(/import\s*\{[^}]*provide[^}]*\}/);
    });

    it('supports multiple @provide declarations', () => {
        const { code } = compileCtx(`
<template><div>Multi</div></template>
<script>
${IMPORTS}
@provide Theme = 'dark';
@provide Locale = 'en';
</script>
        `);
        expect(code).toContain('provide(Theme,');
        expect(code).toContain('provide(Locale,');
    });

    it('stays after the body, where the value it provides is defined', () => {
        const { code } = compileCtx(`
<template><div><slot /></div></template>
<script>
${IMPORTS}
const store = { name: 'dark' };
@provide Theme = store;
</script>
        `);
        expect(code.indexOf('provide(Theme, store, ctx.el)')).toBeGreaterThan(code.indexOf('const store ='));
    });

    it("with a key the script does not import — the alpha's string key — is PDX_UNKNOWN_DECLARATION at its line", () => {
        const [w, ...rest] = unknown(`<template><p>x</p></template>\n<script>\nlet a = $signal(1);\n@provide user = 1;\n</script>\n`);
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 4 });
        expect(w.hint).toContain("@provide Token = …;, with Token = context<T>('user') imported");
    });

    it('with a token declared in the script, not imported, is PDX_UNKNOWN_DECLARATION too: it would be a new token per component', () => {
        const [w] = unknown(`<template><p>x</p></template>\n<script>\nimport { context } from '@pdxui/core';\nconst Theme = context('theme');\n@provide Theme = 'dark';\n</script>\n`);
        expect(w, 'a script-declared token was accepted').toBeDefined();
        expect(w.message).toContain('Theme');
    });
});

describe('@inject name from Token — declarative context consumer', () => {
    it('generates const name = inject(Token, ctx.el)', () => {
        const { code, warnings } = compileCtx(`
<template><div>{{ user.name }}</div></template>
<script>
${IMPORTS}
@inject user from CurrentUser;
</script>
        `);
        expect(warnings.filter((w) => w.severity === 'error')).toEqual([]);
        expect(code).toContain('const user = inject(CurrentUser, ctx.el);');
        expect(code).toMatch(/import\s*\{[^}]*inject[^}]*\}/);
    });

    it('with `= fallback`, the three-argument form', () => {
        const { code } = compileCtx(`
<template><div>{{ theme }}</div></template>
<script>
${IMPORTS}
@inject theme from Theme = 'light';
</script>
        `);
        expect(code).toContain("const theme = inject(Theme, ctx.el, 'light');");
    });

    it('is declared before the script body, which can read it at setup', () => {
        // Emitted after the body, `const label = theme.name` ran inside `theme`'s temporal dead zone.
        const { code } = compileCtx(`
<template><p>{{ label }}</p></template>
<script>
${IMPORTS}
@inject theme from Theme;
const label = theme.name;
</script>
        `);
        const declared = code.indexOf('const theme = inject(Theme, ctx.el)');
        const read = code.indexOf('const label = theme.name');
        expect(declared, 'no inject() declaration').toBeGreaterThan(-1);
        expect(read, 'the read is not in the output').toBeGreaterThan(-1);
        expect(declared, 'the injected value is declared after the code that reads it').toBeLessThan(read);
    });

    it('`@inject user;` with no `from` is PDX_UNKNOWN_DECLARATION on its line, with the form as its hint', () => {
        const [w, ...rest] = unknown(`<template><p>x</p></template>\n<script>\nlet a = $signal(1);\n@inject user;\n</script>\n`);
        expect(rest).toEqual([]);
        expect(w).toMatchObject({ severity: 'error', line: 4 });
        expect(w.hint).toContain('@inject user from Token;');
    });

    it('`@inject user as me;` is PDX_UNKNOWN_DECLARATION too', () => {
        expect(unknown(`<template><p>x</p></template>\n<script>\n@inject user as me;\n</script>\n`)).toHaveLength(1);
    });

    it('with a token the script does not import is PDX_UNKNOWN_DECLARATION', () => {
        const [w] = unknown(`<template><p>x</p></template>\n<script>\n@inject user from CurrentUser;\n</script>\n`);
        expect(w, 'an unimported token was accepted').toBeDefined();
        expect(w.message).toContain('CurrentUser');
    });
});

describe('@provide + @inject combined', () => {
    it('compiles without errors or warnings', () => {
        const provider = compileCtx(`
<template><div><slot /></div></template>
<script>
${IMPORTS}
let theme = $signal({ mode: 'dark' });
@provide Theme = theme;
</script>
        `);
        expect(provider.warnings).toEqual([]);

        const consumer = compileCtx(`
<template><div>{{ theme }}</div></template>
<script>
${IMPORTS}
@inject theme from Theme;
</script>
        `);
        expect(consumer.warnings).toEqual([]);
    });
});

describe('pdx migrate', () => {
    const provideKey = LANGUAGE_CHANGES.find((c) => c.id === 'context-string-provide');
    const injectKey = LANGUAGE_CHANGES.find((c) => c.id === 'context-string-inject');

    it('lists the string forms, reported as PDX_UNKNOWN_DECLARATION, until #497 rewrites them', () => {
        expect(provideKey?.reportedAs).toBe('PDX_UNKNOWN_DECLARATION');
        expect(injectKey?.reportedAs).toBe('PDX_UNKNOWN_DECLARATION');
        const src = `<template><p>x</p></template>\n<script>\n${IMPORTS}\n@provide theme = 1;\n@inject user;\n@inject user as me;\n@inject u from CurrentUser;\n@provide Theme = 2;\n</script>\n`;
        expect(provideKey!.detect(src).map((f) => f.found)).toEqual(['@provide theme = 1;']);
        expect(injectKey!.detect(src).map((f) => f.found)).toEqual(['@inject user;', '@inject user as me;']);
    });
});
