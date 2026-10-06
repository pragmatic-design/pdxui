// Tests for HTML/CSS minification and CSS scoping.

import { describe, it, expect } from 'vitest';
import { minifyHTML } from '../src/compiler/minify';
import { minifyCSS, hash, extractCSSBindings, styleModuleId, parseStyleModuleId, styleCssFor } from '../src/compiler/codegen-styles';
import { compile } from '../src/plugin';
import { parseSFC } from '../src/parser/sfc';

// ─── HTML Minification ──────────────────────────────────────────

describe('minifyHTML', () => {
    it('collapses whitespace between tags to one space (to none, it runs inline siblings together)', () => {
        expect(minifyHTML('<div>  <span>hi</span>  </div>')).toBe('<div> <span>hi</span> </div>');
    });

    it('collapses multiple whitespace to single space', () => {
        expect(minifyHTML('hello    world')).toBe('hello world');
    });

    // The input is `{{ … }}`, not `${count}`: `minifyHTML` is applied at `plugin.ts:447` to
    // `descriptor.template.content`, where interpolations are still `{{ … }}` — the `${…}` form never
    // reaches it. A case that fed the function an input the pipeline does not produce would pass
    // while the behaviour is broken, and measure nothing.
    it('keeps the spaces around an interpolation — they are text the author typed', () => {
        expect(minifyHTML('clicked {{ count }} times')).toBe('clicked {{ count }} times');
        expect(minifyHTML('a {{ x }} b')).toBe('a {{ x }} b');
    });

    it('keeps the space after any other closing brace too', () => {
        // `/\}\s*/g` matches EVERY `}`, not only an interpolation's. It has to be a brace followed
        // by a real space: in `:style="{color:red}"` the next character is a quote, so `\s*` matches
        // nothing and the string comes back unchanged whether the rule is there or not — such a case
        // proves nothing.
        expect(minifyHTML('the set {1, 2} and the rest')).toBe('the set {1, 2} and the rest');
        expect(minifyHTML('<b>{literal} text</b>')).toBe('<b>{literal} text</b>');
    });

    it('still collapses a run of whitespace around one', () => {
        // The collapsing rule stays: what is removed is redundancy, not the single space that
        // separates two words.
        expect(minifyHTML('a   {{ x }}   b')).toBe('a {{ x }} b');
    });

    it('preserves <pre> content', () => {
        const input = '<pre>  multiple   spaces  </pre>';
        expect(minifyHTML(input)).toBe(input);
    });

    it('preserves <code> content', () => {
        const input = '<code>  let x = 1;  </code>';
        expect(minifyHTML(input)).toBe(input);
    });

    it('handles mixed content with pre blocks', () => {
        const input = '<div>  <pre>  keep  </pre>  <span>  collapse  </span>  </div>';
        const result = minifyHTML(input);
        expect(result).toContain('<pre>  keep  </pre>');
        expect(result).not.toContain('  collapse  ');
    });
});

// The same defect, one level up: what the compiler emits for a production build.
//
// Dropping the space would make `vite dev` render "clicked 0 times" and `vite build` render
// "clicked 0times". The text a user reads would differ between the two, which is the dev/prod seam
// again — the same shape as the generated router.
describe('a production compile keeps the text the author wrote', () => {
    const SOURCE = '<template>\n  <button>clicked {{ count }} times</button>\n</template>\n'
        + '\n<script setup>\nlet count = $signal(0);\n</script>\n';

    // The whole emitted module, not the `html``` line: WITHOUT minification the template spans several
    // lines, so that line is only its opening and the text sits below it. Comparing lines would compare
    // one file's first line against the other's whole template.
    function render(minify: boolean): string {
        const out = compile(SOURCE, 'C:/tmp/probe.pdx', undefined, undefined, { minify });
        if (!out.code.includes('html`')) throw new Error('no html`` template in the emitted module');
        return out.code;
    }

    it('emits both spaces with minification on', () => {
        expect(render(true)).toContain('clicked ${ctx.count} times');
    });

    it('and the two modes agree', () => {
        // The claim is about the TEXT, not the emitted line: without minification the template spans
        // several lines, so comparing the `html\`` line compares its first line against the whole of
        // the other. Minification collapsing whitespace BETWEEN TAGS is correct and expected; what
        // must not differ is what a reader sees.
        const visible = 'clicked ${ctx.count} times';
        expect(render(false), 'dev').toContain(visible);
        expect(render(true), 'prod').toContain(visible);
    });
});

// ─── CSS Minification ───────────────────────────────────────────

describe('minifyCSS', () => {
    it('strips comments', () => {
        expect(minifyCSS('/* comment */ .btn { color: red; }')).toBe('.btn{color:red}');
    });

    it('collapses whitespace', () => {
        expect(minifyCSS('.btn  {  color:  red;  }')).toBe('.btn{color:red}');
    });

    it('removes trailing semicolons before }', () => {
        expect(minifyCSS('.btn { color: red; }')).toBe('.btn{color:red}');
    });

    it('preserves shorthand values', () => {
        expect(minifyCSS('.x { margin: 10px 20px; }')).toBe('.x{margin:10px 20px}');
    });
});

// ─── CSS Scoping ────────────────────────────────────────────────

describe('CSS scoping', () => {
    it('scopes selectors with data attribute', () => {
        const { code } = compile(`
<template><div class="btn">Click</div></template>
<script setup>let x = $signal(0);</script>
<style scoped>.btn { color: red; }</style>`, 'test.pdx');
        // The generated style should contain the scope attribute
        expect(code).toContain('data-pdx-');
        expect(code).toContain('.btn');
    });

    it('scopes @media inner selectors', () => {
        const { code } = compile(`
<template><div>Test</div></template>
<script setup>let x = $signal(0);</script>
<style scoped>
@media (max-width: 768px) {
    .mobile { display: block; }
}
</style>`, 'test.pdx');
        expect(code).toContain('@media');
        expect(code).toContain('.mobile');
    });

    it('does NOT scope @keyframes', () => {
        const { code } = compile(`
<template><div>Test</div></template>
<script setup>let x = $signal(0);</script>
<style scoped>
@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
.loader { animation: spin 1s; }
</style>`, 'test.pdx');
        expect(code).toContain('@keyframes spin');
        // @keyframes body should NOT have scope selectors (from/to aren't selectors)
        expect(code).toContain('from');
        expect(code).toContain('rotate');
        // The loader class should be scoped
        expect(code).toMatch(/\[data-pdx-\w+\]\s*.loader/);
    });

    // A production build does not put the CSS in the JS at all.
    //
    // Minifying the injected string is not enough: the stylesheet would still travel inside the JS
    // bundle and be written to the head at module-evaluation time, against the Dual Mode table's
    // "extracted CSS, zero JS overhead". An assertion like `not.toContain('/* comment */')` passes
    // for the wrong reason on a module containing no CSS whatsoever.
    describe('production', () => {
        const SOURCE = `
<template><div>Test</div></template>
<script setup>let x = $signal(0);</script>
<style scoped>.btn { color: red; /* comment */ }</style>`;

        const prod = (): string =>
            compile(SOURCE, 'test.pdx', undefined, undefined, { production: true }).code;

        it('imports the stylesheet instead of carrying it', () => {
            expect(prod(), 'the component does not import its stylesheet')
                .toContain(`import '${styleModuleId('test.pdx', 0)}'`);
        });

        it('and the CSS is not in the emitted module', () => {
            const code = prod();
            expect(code, 'the declaration is still in the JS').not.toContain('color:red');
            expect(code, 'the component still injects its CSS from JavaScript').not.toContain('pdx-s-');
        });

        it('while dev still injects it, which is what makes HMR of a style block instant', () => {
            const code = compile(SOURCE, 'test.pdx').code;
            expect(code, 'dev lost the injection').toContain('pdx-s-');
            expect(code).toContain('color: red');
        });

        it('the stylesheet the bundler asks for is scoped and minified', () => {
            const css = styleCssFor(parseSFC(SOURCE), 'test.pdx', 0, true);
            expect(css, 'the comment survived').not.toContain('/* comment */');
            expect(css, 'the block is not scoped').toContain(`[data-pdx-${hash('test.pdx')}] .btn`);
            expect(css).toContain('color:red');
        });

        it('and a block index nobody wrote yields nothing, not a crash', () => {
            expect(styleCssFor(parseSFC(SOURCE), 'test.pdx', 7, true)).toBe('');
        });

        // The id is the only channel between the module that imports the stylesheet and the plugin
        // that serves it, and the scope attribute is `hash(filename)` of the path the compiler was
        // called with. So the path has to survive the round trip BYTE FOR BYTE: an id that tidied a
        // Windows path's separators on the way in would be served a stylesheet scoped to a hash no
        // element on the page carries — styles silently not applying, on Windows only.
        it('carries a Windows path back unchanged, separators and all', () => {
            const file = 'C:\\work\\app\\src\\user card.pdx';
            expect(parseStyleModuleId(styleModuleId(file, 2))).toEqual({ file, index: 2 });
        });

        it('so the served stylesheet is scoped to the hash the module used', () => {
            const file = 'C:\\work\\app\\src\\user card.pdx';
            const target = parseStyleModuleId(styleModuleId(file, 0))!;
            const css = styleCssFor(parseSFC(SOURCE), target.file, target.index, true);

            expect(css, 'the stylesheet carries a scope no element has')
                .toContain(`[data-pdx-${hash(file)}]`);
        });

        it('and an id that is not one of ours is not answered', () => {
            expect(parseStyleModuleId('virtual:pdx-router')).toBeNull();
            expect(parseStyleModuleId(`${styleModuleId('a.pdx', 0)}x`), 'a trailing byte was ignored')
                .toBeNull();
        });
    });
});

// ─── responsive() CSS transform ─────────────────────────────────

describe('responsive() CSS', () => {
    it('transforms responsive(min, max) to clamp()', () => {
        const { code } = compile(`
<template><h1>Title</h1></template>
<script setup>let x = $signal(0);</script>
<style scoped>h1 { font-size: responsive(16px, 64px); }</style>`, 'test.pdx');
        expect(code).toContain('clamp(');
        expect(code).not.toContain('responsive(');
    });
});

// ─── bind() CSS transform ───────────────────────────────────────

describe('bind() CSS', () => {
    it('extracts CSS bindings', () => {
        const bindings = extractCSSBindings('.box { color: bind(color); background: bind(bg); }', 'data-pdx-abc');
        expect(bindings).toEqual(['color', 'bg']);
    });
});

// ─── Hash function ──────────────────────────────────────────────

describe('hash', () => {
    it('produces consistent 6-char string', () => {
        const h = hash('test.pdx');
        expect(h.length).toBeLessThanOrEqual(6);
        expect(hash('test.pdx')).toBe(h);
    });

    it('different inputs produce different hashes', () => {
        expect(hash('a.pdx')).not.toBe(hash('b.pdx'));
    });
});
