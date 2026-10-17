// Tests for compiler fixes: scoped styles, prefixCtx, rewriteHtmlBindings, defineEmits

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { generateNodes } from '../src/compiler/codegen-template';
import { createCompileContext } from '../src/compiler/compile-context';
import { parseTemplate } from '../src/parser/template';
import { markup, builds } from './static-markup-of';

describe('scoped styles fix', () => {
    it('scopes selectors as descendant: [scope] .btn:hover', () => {
        const { code } = compile(`
<template><button>Click</button></template>
<style scoped>
  .btn:hover { color: red; }
  .link:focus { outline: 2px solid; }
  .item::before { content: "•"; }
</style>`, 'test.pdx');

        // Descendant scoping: [data-pdx-HASH] .selector
        expect(code).toMatch(/\[data-pdx-\w+\] \.btn:hover/);
        expect(code).toMatch(/\[data-pdx-\w+\] \.link:focus/);
        expect(code).toMatch(/\[data-pdx-\w+\] \.item::before/);
    });

    it('handles @media blocks — scopes inner selectors', () => {
        const { code } = compile(`
<template><div>Responsive</div></template>
<style scoped>
  @media (min-width: 768px) {
    .card { padding: 2rem; }
  }
</style>`, 'test.pdx');

        expect(code).toContain('@media (min-width: 768px)');
        expect(code).toMatch(/\[data-pdx-\w+\] \.card/);
    });

    it('does NOT scope @keyframes rule names', () => {
        const { code } = compile(`
<template><div>Anim</div></template>
<style scoped>
  @keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s; }
</style>`, 'test.pdx');

        expect(code).toContain('@keyframes spin');
        // The @keyframes block itself should not have scope attributes on from/to
        expect(code).not.toMatch(/from\[data-pdx/);
        expect(code).not.toMatch(/to\[data-pdx/);
    });

    it('strips CSS comments', () => {
        const { code } = compile(`
<template><div>Test</div></template>
<style scoped>
  /* This is a comment with } braces */
  .test { color: red; }
</style>`, 'test.pdx');

        expect(code).not.toContain('comment');
        expect(code).toMatch(/\[data-pdx-\w+\] \.test/);
    });
});

describe('prefixCtx fix', () => {
    it('does not prefix inside string literals', () => {
        const { code } = compile(`
<template>{{ "hello world" }}</template>`, 'test.pdx');

        // String content should NOT have ctx. prefix
        expect(code).not.toContain('ctx.hello');
        expect(code).not.toContain('ctx.world');
    });

    it('handles arrow function params correctly', () => {
        const { code } = compile(`
<template>
  @for (items as item; track item.id) {
    <span>{{ item.name }}</span>
  }
</template>`, 'test.pdx');

        // item should NOT be prefixed with ctx. (but ctx.items is OK). It is read through its
        // row getter.
        expect(code).toContain('item().name');
        expect(code).not.toMatch(/ctx\.item\b(?!s)/);  // ctx.item but NOT ctx.items
    });

    it('prefixes free variables but not property access after dot', () => {
        const { code } = compile(`
<template>{{ user.name }}</template>`, 'test.pdx');

        expect(code).toContain('ctx.user');
        // .name should NOT be prefixed
        expect(code).not.toContain('ctx.name');
        expect(code).not.toContain('ctx.user.ctx.name');
    });
});

describe('rewriteHtmlBindings fix', () => {
    it('handles single-quoted attribute values', () => {
        const { code } = compile(`
<template>
  <button @click='close'>Close</button>
</template>`, 'test.pdx');

        expect(code).toContain('ctx.close');
    });

    it('handles function call with args', () => {
        const { code } = compile(`
<template>
  <button @click="remove(item.id)">×</button>
</template>`, 'test.pdx');

        expect(code).toContain('ctx.remove(item.id)');
    });

    it('rewrites :ref="name" to :ref=${ctx.name}', () => {
        const { code } = compile(`
<template>
  <canvas :ref="canvasEl"></canvas>
</template>`, 'test.pdx');

        expect(code).toContain(':ref=${ctx.canvasEl}');
    });

    it('handles ::value with modifiers', () => {
        const { code } = compile(`
<template>
  <input ::value.trim="name">
</template>`, 'test.pdx');

        expect(code).toContain('::value.trim=${ctx.name}');
    });
});

describe('kebab-case normalization', () => {
    it('converts camelCase :prop to kebab-case in output', () => {
        const { code } = compile(`
<template>
  <pdx-select :itemTemplate="renderFn"></pdx-select>
</template>`, 'test.pdx');

        expect(code).toContain(':item-template=');
        expect(code).not.toContain(':itemTemplate=');
    });

    it('converts camelCase ::prop to kebab-case in output', () => {
        const { code } = compile(`
<template>
  <pdx-field ::formValue="val"></pdx-field>
</template>`, 'test.pdx');

        expect(code).toContain('::form-value=');
        expect(code).not.toContain('::formValue=');
    });

    it('preserves single-word props unchanged', () => {
        const { code } = compile(`
<template>
  <pdx-select :options="items" :disabled="off"></pdx-select>
</template>`, 'test.pdx');

        expect(code).toContain(':options=');
        expect(code).toContain(':disabled=');
    });

    it('preserves class and style bindings', () => {
        const { code } = compile(`
<template>
  <div :class="cls" :style="stl"></div>
</template>`, 'test.pdx');

        expect(code).toContain(':class=');
        expect(code).toContain(':style=');
    });

    it('handles multi-word camelCase', () => {
        const { code } = compile(`
<template>
  <pdx-grid :selectedRowKeys="keys"></pdx-grid>
</template>`, 'test.pdx');

        expect(code).toContain(':selected-row-keys=');
    });
});

describe('defineEmits', () => {
    it('transforms defineEmits to ctx.emit wrapper', () => {
        const { code } = compile(`
<template><button @click="save">Save</button></template>
<script setup>
  const emit = defineEmits();
  function save() { emit('save', { data: 'test' }); }
</script>`, 'test.pdx');

        expect(code).toContain("const emit = (event, detail) => ctx.emit(event, detail)");
        expect(code).toContain("emit('save'");
    });

    it('transforms typed defineEmits', () => {
        const { code } = compile(`
<template><button @click="save">Save</button></template>
<script setup>
  const emit = defineEmits<{ 'save': FormData; 'cancel': void }>();
  function save() { emit('save', data); }
</script>`, 'test.pdx');

        expect(code).toContain("const emit = (event, detail) => ctx.emit(event, detail)");
    });
});

describe('Parser: apostrophe in HTML text (regression)', () => {
    it('does not break @if block with apostrophe in text', () => {
        const { code } = compile(`
<template>
  @if (show) {
    <p>You'd think this would work.</p>
  }
</template>
<script setup>
  let show = $signal(true);
</script>`, 'test.pdx');

        // The block's HTML (#369) holds the text, read back from its literal.
        expect(markup(code).join('')).toContain("You'd think this would work.");
    });

    it('does not break @try block with apostrophe', () => {
        const { code } = compile(`
<template>
  @try {
    <p>It's working fine.</p>
  } @catch (err) {
    <p>Error occurred</p>
  }
</template>
<script setup>
  let x = $signal(0);
</script>`, 'test.pdx');

        expect(markup(code).join('')).toContain("It's working fine.");
        expect(markup(code).join('')).toContain("Error occurred");
    });

    it('does not break @for block with quotes in text', () => {
        const { code } = compile(`
<template>
  @for (items as item; track item.id) {
    <p>The "best" items aren't always obvious.</p>
  }
</template>
<script setup>
  let items = $signal([{id: 1}]);
</script>`, 'test.pdx');

        expect(markup(code).join('')).toContain(`The "best" items aren't always obvious.`);
    });

    it('still handles attribute quotes correctly', () => {
        const { code } = compile(`
<template>
  @if (show) {
    <div class="test" title="it's fine">Content</div>
  }
</template>
<script setup>
  let show = $signal(true);
</script>`, 'test.pdx');

        expect(markup(code).join('')).toContain(`<div class="test" title="it's fine">Content</div>`);
    });
});

describe('scoped styles — line-ending independence', () => {
    // A CRLF checkout (git core.autocrlf=true on Windows) must not embed literal \r\n in
    // the emitted style string, or the same source compiles differently per machine and
    // the golden snapshots flip-flop. CSS is line-ending agnostic; the output must be too.
    const src = (eol: string) => [
        '<template><div class="a">x</div></template>',
        '<script setup>',
        '  let n = $signal(1);',
        '</script>',
        '<style scoped>',
        '.a { color: red; }',
        '.b { color: blue; }',
        '</style>',
    ].join(eol);

    it('emits no carriage return for a CRLF source', () => {
        const { code } = compile(src('\r\n'), 'eol.pdx');
        expect(code).not.toContain('\r');
    });

    it('compiles CRLF and LF sources to identical output', () => {
        const crlf = compile(src('\r\n'), 'eol.pdx').code;
        const lf = compile(src('\n'), 'eol.pdx').code;
        expect(crlf).toBe(lf);
    });
});

describe('interpolation of a member access on a signal', () => {
    // `${ctx.x}` is correct for a BARE signal: the template engine calls the read function.
    // For `x.prop` it is not — it reads a property of that FUNCTION. `{{ user.name }}`
    // would render the literal "read" (the getter's own name) and `{{ list.length }}` the
    // function's ARITY (always 0), silently.
    it('calls the signal before reading the property', () => {
        const out = compile(`
<template><span>{{ items.length }}</span></template>
<script setup>
let items = $signal([1, 2, 3]);
</script>`, 'x.pdx').code;

        expect(out).toContain('ctx.items().length');
        expect(out).not.toMatch(/\$\{ctx\.items\.length\}/);
    });

    it('reads a bare signal by calling it', () => {
        const out = compile(`
<template><span>{{ count }}</span></template>
<script setup>
let count = $signal(0);
</script>`, 'x.pdx').code;

        expect(out).toMatch(/bindInterpolation\(__t\d+,\(\)=>ctx\.count\(\)\)/);
    });

    it('reads a @for item through its row getter, then the property — never calls the property', () => {
        // The row's item is a getter, `r()`, so a row reused for the same key reads its current
        // object. The PROPERTY is never called.
        const out = compile(`
<template>@for (rows as r; track r.id) {<span>{{ r.label }}</span>}</template>
<script setup>
let rows = $signal([]);
</script>`, 'x.pdx').code;

        expect(out).toContain('()=>r().label)');
        expect(out).not.toContain('r.label()');
        expect(out).not.toContain('r().label()');
    });

    it('applies to attribute bindings too', () => {
        const out = compile(`
<template><input :value="draft.name" /></template>
<script setup>
let draft = $signal({ name: 'a' });
</script>`, 'x.pdx').code;

        expect(out).toContain('ctx.draft().name');
        expect(out).not.toMatch(/:value=\$\{ctx\.draft\.name\}/);
    });
});

/**
 * An HTML comment is prose, not markup. The rewriter walked into it and treated whatever
 * looked like a directive as one — found on the site, where a comment explaining WHY an
 * anchor has no `@click="go"` compiled to a `${safeHandler(...)}` placeholder inside the
 * comment. The DOM parser then broke the comment open and the sentence appeared in the
 * navigation bar, in production, as visible text.
 */
describe('HTML comments are never rewritten — the inline render, every .pdx\'s (#107)', () => {
    // The inline path builds the DOM from the parsed template and emits no comment node: a comment
    // is the author's prose. What the regression was about holds: nothing in it becomes a binding.
    const SRC = `
<template>
  <!-- no @click="go" here; :value="draft.name" and {{ count }} are examples; a -> b, and 1 > 0; use \`html\` with \${x} -->
  <span>{{ count }}</span>
</template>
<script setup>
let count = $signal(0);
let draft = $signal({ name: 'a' });
function go() {}
</script>`;

    it('nothing inside a comment is compiled, and the rest still is', () => {
        const out = compile(SRC, 'x.pdx').code;
        const render = out.slice(out.indexOf('render:'));
        expect(render).not.toContain('safeHandler');
        expect(render).not.toContain('draft');
        expect(render).not.toContain('html');
        expect(render.match(/bindInterpolation\(/g) ?? []).toHaveLength(1);
        // The static markup is built by the block's module-level builder (#109): the comment is not there either.
        const builder = out.slice(0, out.indexOf("component('"));
        expect(builds(builder, 'span')).toBe(true);
        expect(builder).not.toContain('draft');
        expect(builder).not.toContain('go');
    });
});

describe('HTML comments are copied verbatim, never rewritten — the template generator', () => {
    // The template generator keeps the comment in its html`` markup. A .pdx in the new mode no longer
    // reaches it — a scoped slot's body was the last part it wrote, until #364 — so each case calls it
    // directly, with the names the script declared; the legacy mode still renders through it.
    const compileTemplatePath = (source: string, _name: string) => {
        const template = /<template>([\s\S]*)<\/template>/.exec(source)![1];
        const ctx = createCompileContext();
        ctx.declaredNames = new Set([...source.matchAll(/(?:let|function)\s+(\w+)/g)].map((m) => m[1]));
        return { code: generateNodes(parseTemplate(template), new Set(), ctx) };
    };

    it('does not rewrite a directive mentioned inside a comment', () => {
        const out = compileTemplatePath(`
<template>
  <!-- no @click="go" here -->
  <a href="/x">x</a>
</template>
<script setup>
let count = $signal(0);
function go() {}
</script>`, 'x.pdx').code;

        expect(out).toContain('<!-- no @click="go" here -->');
        expect(out).not.toContain('safeHandler');
    });

    it('leaves bindings and interpolation inside a comment alone', () => {
        const out = compileTemplatePath(`
<template>
  <!-- :value="draft.name" and {{ count }} are examples, not bindings -->
  <span>{{ count }}</span>
</template>
<script setup>
let count = $signal(0);
let draft = $signal({ name: 'a' });
</script>`, 'x.pdx').code;

        expect(out).toContain('<!-- :value="draft.name" and {{ count }} are examples, not bindings -->');
        // The real interpolation outside the comment still compiles.
        expect(out).toContain('${ctx.count}');
    });

    it('a > inside a comment does not end it early', () => {
        const out = compileTemplatePath(`
<template>
  <!-- a -> b, and 1 > 0 -->
  <span>ok</span>
</template>
<script setup>
let count = $signal(0);
</script>`, 'x.pdx').code;

        expect(out).toContain('<!-- a -> b, and 1 > 0 -->');
        expect(out).toContain('<span>ok</span>');
    });

    it('escapes a backtick or ${ in a comment so the html`` literal survives', () => {
        const out = compileTemplatePath(`
<template>
  <!-- use \`html\` with \${x} carefully -->
  <span>ok</span>
</template>
<script setup>
let count = $signal(0);
</script>`, 'x.pdx').code;

        // Escaped in the emitted source, so the html`` literal is not closed by the prose.
        expect(out).toContain('\\`html\\`');
        expect(out).toContain('\\${x}');
    });
});
