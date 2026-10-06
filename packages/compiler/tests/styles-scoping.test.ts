// CSS scoping is the part of the compiler a developer never reads and always relies on.
//
// Its rules are few — the scope attribute goes BEFORE a
// pseudo-selector, @keyframes names are not selectors and must not be scoped, @media and @supports
// are recursed into, comments are stripped first — and they were tested only through whole-file
// compilation, where a wrong rule shows up as a style that quietly does not apply.
//
// `responsive()` and `bind()` are compile-time transforms with zero runtime cost, which is exactly
// why nothing at runtime can catch them being wrong.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { minifyCSS, extractCSSBindings, hash } from '../src/compiler/codegen-styles';

/** Compile a scoped style block and return the generated module. */
function css(style: string, production = false): string {
    const source = `<template><div class="a">x</div></template>\n<style scoped>\n${style}\n</style>\n<script setup>\n  let n = $signal(1);\n</script>`;
    return compile(source, 'styled.pdx', [], undefined, { production }).code;
}

describe('scoping a selector', () => {
    // MEASURED, and it contradicts the older description of the rule (".btn:hover ->
    // .btn[scope]:hover"). What the compiler emits today is the ANCESTOR form: the scope attribute
    // goes on the host element (ctx.el.setAttribute in setup) and every selector is prefixed with
    // it. Both are valid strategies; the older description names the one that is no longer true.
    const SCOPE = /\[data-pdx-[a-z0-9]+\]/;

    it('prefixes the selector with the host scope attribute', () => {
        const out = css('.btn:hover { color: red; }');
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.btn:hover/);
    });

    it('puts the scope attribute on the host element itself', () => {
        // Without this the prefix above matches nothing: the ancestor has to carry the attribute.
        expect(css('.a { color: red; }')).toMatch(/ctx\.el\.setAttribute\('data-pdx-[a-z0-9]+'/);
    });

    it('scopes each selector in a comma-separated list, not just the first', () => {
        const out = css('.a, .b { color: red; }');
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.a/);
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.b/);
    });

    it('recurses into @media instead of scoping the at-rule itself', () => {
        const out = css('@media (min-width: 600px) { .a { color: red; } }');
        expect(out).toContain('@media');
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.a/);
        // Scoping the at-rule would produce `@media (…)[data-pdx-…]`, which is not CSS.
        expect(out).not.toMatch(/@media[^{]*\[data-pdx-/);
    });

    it('recurses into @supports the same way', () => {
        const out = css('@supports (display: grid) { .a { display: grid; } }');
        expect(out).toContain('@supports');
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.a/);
        expect(out).not.toMatch(/@supports[^{]*\[data-pdx-/);
    });

    it('leaves @keyframes alone — a keyframe name is not a selector', () => {
        // Scoping `from`/`to` would break the animation with no error anywhere.
        const out = css('@keyframes spin { from { opacity: 0; } to { opacity: 1; } }');
        expect(out).toContain('@keyframes');
        expect(out).not.toMatch(SCOPE.source + ' from');
        expect(out).not.toMatch(SCOPE.source + ' to');
    });

    it('drops a comment before it can be mistaken for a selector', () => {
        const out = css(['/* .ghost { color: red; } */', '.real { color: blue; }'].join('\n'));
        expect(out).not.toContain('ghost');
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.real/);
    });
});

describe('the compile-time CSS functions', () => {
    it('responsive(min, max) becomes a clamp with the default viewport range', () => {
        const out = css('.a { font-size: responsive(16px, 64px); }');
        expect(out).toContain('clamp(');
        expect(out).toContain('16px');
        expect(out).toContain('64px');
        expect(out).not.toContain('responsive(');
    });

    it('responsive(min, max, vMin, vMax) uses the viewport range it is given', () => {
        const out = css('.a { font-size: responsive(14px, 18px, 480, 1200); }');
        expect(out).toContain('clamp(');
        expect(out).toContain('480px');
    });

    it('bind(signal) becomes a custom property namespaced by the scope hash', () => {
        const out = css('.a { color: bind(n); }');
        expect(out).toMatch(/var\(--pdx-[a-z0-9]+-n\)/);
        expect(out).not.toContain('bind(');
    });

    it('extractCSSBindings names each bound signal once', () => {
        expect(extractCSSBindings('.a { color: bind(fg); background: bind(bg); border-color: bind(fg); }', 'data-pdx-x'))
            .toEqual(['fg', 'bg']);
    });

    it('extractCSSBindings finds nothing in CSS that binds nothing', () => {
        expect(extractCSSBindings('.a { color: red; }', 'data-pdx-x')).toEqual([]);
    });

    it('tolerates whitespace inside the call', () => {
        expect(extractCSSBindings('.a { color: bind( spaced ); }', 'data-pdx-x')).toEqual(['spaced']);
    });
});

describe('minifying', () => {
    it('strips comments, collapses whitespace and tightens syntax characters', () => {
        expect(minifyCSS('/* note */\n.a {\n  color : red ;\n}\n')).toBe('.a{color:red}');
    });

    it('tightens around combinators too', () => {
        expect(minifyCSS('.a > .b + .c ~ .d { color: red; }')).toBe('.a>.b+.c~.d{color:red}');
    });

    // The whitespace a VALUE needs. `calc(a+b)` is invalid CSS — the operator needs its
    // spaces — and the browser drops the declaration, in production only.
    it('keeps the spaces around an operator inside a value', () => {
        expect(minifyCSS('.a { height: calc(2 * var(--x) + 1px - 2px); }'))
            .toBe('.a{height:calc(2 * var(--x) + 1px - 2px)}');
    });

    // The space before a colon in a SELECTOR is the descendant combinator. Tightened,
    // `.list :hover` (a hovered descendant) becomes `.list:hover` (the list itself).
    it('keeps the descendant space before a pseudo-class in a selector', () => {
        expect(minifyCSS('.list :hover { color: red; }')).toBe('.list :hover{color:red}');
    });

    it('still tightens a declaration whose value holds a colon, and a nested block', () => {
        expect(minifyCSS('@media (min-width: 600px) { .a > .b { background : url(data:x) ; } }'))
            .toBe('@media (min-width:600px){.a>.b{background:url(data:x)}}');
    });

    it('leaves already-minified CSS unchanged', () => {
        const min = '.a{color:red}';
        expect(minifyCSS(min)).toBe(min);
    });

    it('is applied in a production build and not in a dev one', () => {
        const dev = css('.a {\n    color: red;\n}');
        const prod = css('.a {\n    color: red;\n}', true);
        expect(prod.length).toBeLessThan(dev.length);
    });
});

describe('the scope hash', () => {
    it('is stable for the same input', () => {
        expect(hash('a/b/c.pdx')).toBe(hash('a/b/c.pdx'));
    });

    it('differs for different input', () => {
        expect(hash('a.pdx')).not.toBe(hash('b.pdx'));
    });

    it('is safe to put in an attribute name', () => {
        expect(hash('some/file.pdx')).toMatch(/^[a-z0-9]+$/);
    });
});

// The other half of scoping, and the half nothing tested: the selector is written against an
// attribute that SOMEBODY has to set on the host. New mode sets it in its generated setup
// (codegen-setup.ts). Legacy mode never did — and "legacy mode" is not only the old
// defineProps syntax, it is also every .pdx that has no <script> block at all, which is the
// smallest component anyone writes: a template and its styles. The CSS was emitted, injected
// into the head, and matched nothing. No error, no warning, an unstyled component.
describe('the host carries the scope attribute', () => {
    const SET_ATTR = /ctx\.el\.setAttribute\('data-pdx-[a-z0-9]+', ''\)/;

    it('in new mode', () => {
        const out = compile(
            '<template><div class="a">x</div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n<style scoped>.a { color: red; }</style>',
            'scoped-new.pdx',
        ).code;
        expect(out).toMatch(SET_ATTR);
    });

    it('with no script block, where the selector would otherwise match nothing', () => {
        const out = compile(
            '<template><div class="a">x</div></template>\n<style scoped>.a { color: red; }</style>',
            'scoped-bare.pdx',
        ).code;
        expect(out).toMatch(SET_ATTR);
        // and the emitted selector is the one the attribute serves
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.a/);
    });

    it('in legacy mode, next to the legacy setup body', () => {
        const out = compile(
            '<template><div class="a">x</div></template>\n'
            + '<script>\nconst props = defineProps({ label: { type: String } });\nconst n = signal(1);\nreturn { n };\n</script>\n'
            + '<style scoped>.a { color: red; }</style>',
            'scoped-legacy.pdx',
        ).code;
        expect(out).toMatch(SET_ATTR);
        expect(out, 'the legacy body must survive the addition').toMatch(/return \{ n \}/);
    });

    it('is not set when the styles are not scoped', () => {
        const out = compile(
            '<template><div class="a">x</div></template>\n<style>.a { color: red; }</style>',
            'unscoped.pdx',
        ).code;
        expect(out).not.toMatch(SET_ATTR);
    });
});

// A `.pdx` may carry more than one `<style>` block, and every one is emitted: a parser that kept the
// first match and counted nothing else would drop the rest in silence — no error, no warning, no
// diagnostic.
//
// The split is the one the framework itself makes useful, and that `components.md` documents as two
// distinct capabilities: a `scoped` block for the component, and a plain `<style>` block for the
// page-level CSS that component owns.
describe('more than one style block', () => {
    const two = (a: string, b: string): string =>
        `<template><div class="a">x</div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n${a}\n${b}`;

    /** The CSS of every emitted <style> injection, in order. */
    function emitted(code: string): string[] {
        return [...code.matchAll(/__pdx_style\.textContent = ("(?:[^"\\]|\\.)*")/g)]
            .map(m => JSON.parse(m[1]).trim());
    }

    it('emits both, the scoped one scoped and the plain one verbatim', () => {
        const out = compile(two('<style scoped>.a { color: red; }</style>', '<style>.b { color: blue; }</style>'),
            'two-blocks.pdx').code;
        const css = emitted(out);

        expect(css, 'the second block was dropped').toHaveLength(2);
        expect(css[0]).toMatch(/^\[data-pdx-[a-z0-9]+\] \.a \{ color: red; \}$/);
        expect(css[1], 'the unscoped block must reach the head as written').toBe('.b { color: blue; }');
    });

    it('gives each block its own id, or the second overwrites the first on every HMR pass', () => {
        const out = compile(two('<style scoped>.a { color: red; }</style>', '<style>.b { color: blue; }</style>'),
            'two-blocks.pdx').code;
        const ids = [...out.matchAll(/getElementById\("(pdx-s-[a-z0-9-]+)"\)/g)].map(m => m[1]);

        expect(ids).toHaveLength(2);
        expect(new Set(ids).size, 'both injections write to the same <style> element').toBe(2);
    });

    it('sets the host scope attribute when ANY block is scoped, not only the first', () => {
        const out = compile(two('<style>.b { color: blue; }</style>', '<style scoped>.a { color: red; }</style>'),
            'second-scoped.pdx').code;

        expect(out, 'the scoped block is the second one and its attribute was never set')
            .toMatch(/ctx\.el\.setAttribute\('data-pdx-[a-z0-9]+', ''\)/);
        expect(emitted(out)[1]).toMatch(/\[data-pdx-[a-z0-9]+\] \.a/);
    });

    it('reads bind() from a later block too', () => {
        const out = compile(
            `<template><div class="bar"></div></template>\n<script setup>\nlet pct = $signal(42);\n</script>\n`
            + `<style>.x { color: red; }</style>\n<style scoped>.bar { width: bind(pct); }</style>`,
            'bind-second.pdx').code;

        expect(out, 'the reactive custom property of the second block was not wired')
            .toMatch(/setProperty\('--pdx-[a-z0-9]+-pct'/);
    });

    it('leaves a single block exactly as it was', () => {
        const out = compile(
            '<template><div class="a">x</div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n<style scoped>.a { color: red; }</style>',
            'one-block.pdx').code;
        expect(emitted(out)).toHaveLength(1);
        expect(emitted(out)[0]).toMatch(/^\[data-pdx-[a-z0-9]+\] \.a/);
    });
});

// `<template shadow>` and `<style scoped>` are both supported, and together they must not produce a
// component with no styles at all: a stylesheet appended to `document.head` does not cross a shadow
// boundary, so each piece can be individually correct and the combination fail — silently.
//
// Under `shadow` the root IS the scope, so the CSS goes in unprefixed and `scoped` is redundant:
// there is nothing for a host attribute to do when no selector can escape the root anyway.
describe('a shadow component carries its own styles', () => {
    const shadowFile = (styleOpen: string): string =>
        `<template shadow><div class="inside">x</div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n${styleOpen}.inside { color: rgb(3, 3, 3); }</style>`;

    it('does not append the stylesheet to the document head', () => {
        const out = compile(shadowFile('<style scoped>'), 'shadow-styled.pdx').code;
        expect(out, 'the CSS went to document.head, which a shadow root cannot see')
            .not.toMatch(/document\.head\.appendChild/);
    });

    it('adopts it into the shadow root instead', () => {
        const out = compile(shadowFile('<style scoped>'), 'shadow-styled.pdx').code;
        expect(out).toMatch(/__adoptStyles\(/);
        expect(out, 'the CSS must reach the root that holds the markup').toMatch(/shadowRoot/);
        // And the helper has to be imported, or the module throws on its first mount.
        expect(out.split('\n')[0], 'the adopt helper is called and not imported')
            .toMatch(/import \{[^}]*\b__adoptStyles\b/);
    });

    it('does not prefix the selectors — the root is the scope', () => {
        const out = compile(shadowFile('<style scoped>'), 'shadow-styled.pdx').code;
        expect(out, 'a scope attribute inside a shadow root selects nothing extra')
            .not.toMatch(/\[data-pdx-[a-z0-9]+\] \.inside/);
        expect(out).toMatch(/\.inside \{ color: rgb\(3, 3, 3\); \}/);
    });

    it('treats an unscoped block the same way — under shadow there is no global option', () => {
        const out = compile(shadowFile('<style>'), 'shadow-plain.pdx').code;
        expect(out).toMatch(/__adoptStyles\(/);
        expect(out).not.toMatch(/document\.head\.appendChild/);
    });

    it('does the same with no <script> block, which is the legacy path', () => {
        // A template and its styles is the smallest component there is, and it compiles through
        // compileLegacyMode. That path never emitted `shadow: true` at all — so the root was never
        // attached — and would have lost the CSS entirely once the head injection stopped.
        const out = compile(
            '<template shadow><div class="inside">x</div></template>\n<style scoped>.inside { color: red; }</style>',
            'shadow-bare.pdx').code;

        expect(out, 'the shadow root is never attached, so `shadow` does nothing here')
            .toMatch(/shadow: true/);
        expect(out).toMatch(/__adoptStyles\(/);
        expect(out.split('\n')[0]).toMatch(/import \{[^}]*\b__adoptStyles\b/);
        expect(out, 'the CSS must not be lost between the two paths').toContain('.inside { color: red; }');
    });

    it('leaves a light-DOM component alone', () => {
        const out = compile(
            '<template><div class="inside">x</div></template>\n<script setup>\nlet n = $signal(1);\n</script>\n<style scoped>.inside { color: red; }</style>',
            'light.pdx').code;
        expect(out, 'the light-DOM path must keep injecting into the head').toMatch(/document\.head\.appendChild/);
        expect(out).not.toMatch(/__adoptStyles\(/);
        expect(out).toMatch(/\[data-pdx-[a-z0-9]+\] \.inside/);
    });
});
