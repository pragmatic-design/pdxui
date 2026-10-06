// Tests for Sprint E: minification, component resolution, signal spread fix

import { describe, it, expect } from 'vitest';
import { minifyHTML } from '../src/compiler/minify';
import { findComponentTags, generateComponentImports } from '../src/compiler/resolve';
import { parseTemplate } from '../src/parser/template';
import { compile } from '../src/plugin';

// ─── HTML Minification ─────────────────────────────────────────────

describe('minifyHTML', () => {
    // Between tags a run of whitespace becomes one space, not none: dev keeps it, and dropping it runs
    // two inline siblings together in a build.
    it('collapses whitespace between tags to one space', () => {
        expect(minifyHTML('<div>  <span>  text  </span>  </div>'))
            .toBe('<div> <span> text </span> </div>');
    });

    it('collapses newlines between tags to one space', () => {
        expect(minifyHTML('<ul>\n  <li>A</li>\n  <li>B</li>\n</ul>'))
            .toBe('<ul> <li>A</li> <li>B</li> </ul>');
    });

    it('preserves content inside <pre>', () => {
        const input = '<div>\n  <pre>  code\n    indented  </pre>\n</div>';
        const result = minifyHTML(input);
        expect(result).toContain('  code\n    indented  ');
    });

    it('preserves content inside <code>', () => {
        const input = '<p><code>  spaces  matter  </code></p>';
        const result = minifyHTML(input);
        expect(result).toContain('  spaces  matter  ');
    });

    it('trims result', () => {
        expect(minifyHTML('  <div>test</div>  ')).toBe('<div>test</div>');
    });

    it('handles template expressions', () => {
        const result = minifyHTML('<div>  ${ count }  </div>');
        expect(result).toContain('${ count }');
    });
});

// ─── Component Resolution ──────────────────────────────────────────

describe('findComponentTags', () => {
    it('finds custom element tags in HTML', () => {
        const ast = parseTemplate('<div><pdx-header/><pdx-footer></pdx-footer></div>');
        const tags = findComponentTags(ast);
        expect(tags).toContain('pdx-header');
        expect(tags).toContain('pdx-footer');
    });

    it('ignores standard HTML tags', () => {
        const ast = parseTemplate('<div><span>text</span><input></div>');
        const tags = findComponentTags(ast);
        expect(tags.length).toBe(0);
    });

    it('finds tags inside @if blocks', () => {
        const ast = parseTemplate('@if (show) { <pdx-modal/> }');
        const tags = findComponentTags(ast);
        expect(tags).toContain('pdx-modal');
    });

    it('excludes known tags', () => {
        const ast = parseTemplate('<pdx-header/><pdx-footer/>');
        const tags = findComponentTags(ast, new Set(['pdx-header']));
        expect(tags).not.toContain('pdx-header');
        expect(tags).toContain('pdx-footer');
    });

    it('deduplicates tags', () => {
        const ast = parseTemplate('<pdx-btn/><pdx-btn/><pdx-btn/>');
        const tags = findComponentTags(ast);
        expect(tags.filter(t => t === 'pdx-btn').length).toBe(1);
    });
});

describe('generateComponentImports', () => {
    it('generates import statements', () => {
        const imports = generateComponentImports(['pdx-header', 'pdx-footer']);
        expect(imports).toEqual([
            "import './header.pdx';",
            "import './footer.pdx';",
        ]);
    });

    it('uses custom component directory', () => {
        const imports = generateComponentImports(['pdx-button'], ['./components']);
        expect(imports).toEqual(["import './components/button.pdx';"]);
    });

    it('strips pdx- prefix from filename', () => {
        const imports = generateComponentImports(['pdx-user-card']);
        expect(imports).toEqual(["import './user-card.pdx';"]);
    });
});

// ─── Signal Spread Fix ─────────────────────────────────────────────

describe('signal spread rewrite', () => {
    it('rewrites object spread with signal', () => {
        const { code } = compile(`
<template><div>{{ state }}</div></template>
<script setup>
  @prop x: number = 0;
  let state = $signal({ a: 1, b: 2 });
  function update() {
    state = { ...state, a: 5 };
  }
</script>`, 'test.pdx');

        // Self-reference with spread → updater form, the object WRAPPED so the arrow returns it.
        // Substring checks would pass on `set(prev => { ...prev, a: 5 })`, which is a SyntaxError
        // on load; the exact form is the assertion.
        expect(code).toContain('__state.set(prev => ({ ...prev, a: 5 }))');
    });

    it('rewrites array spread with signal', () => {
        const { code } = compile(`
<template><div>{{ items }}</div></template>
<script setup>
  @prop x: number = 0;
  let items = $signal([1, 2, 3]);
  function add() {
    items = [...items, 4];
  }
</script>`, 'test.pdx');

        expect(code).toContain('__items.set(prev');
        expect(code).toContain('...prev');
    });
});
