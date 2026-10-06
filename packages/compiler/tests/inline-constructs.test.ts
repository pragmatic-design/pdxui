// The production path has to know every construct the parser accepts.
//
// `inlineBindings` replaces the html`` runtime with imperative DOM construction — a second, separate
// implementation of the template language. A construct the parser accepts and the inline generator
// does not emit is a build that succeeds and produces a page missing that piece, and it fails ONLY
// in production, which is the worst place to find out.
//
// codegen-template-inline.ts sat at 55% branch coverage: @if, @for, @switch and interpolation were
// exercised, the other seven node types the walker handles were not. This is one case per construct,
// each asserting the same two things — the generated module parses as JavaScript, and it actually
// contains the machinery that construct needs.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const OPTS = { production: true, inlineBindings: true };

/** Compile in the production inline mode and return the module body without its imports. */
function inline(template: string, setup = 'let count = $signal(0);'): string {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  ${setup}\n</script>`;
    const { code } = compile(source, 'inline-construct.pdx', [], undefined, OPTS);
    return code;
}

/** Parsing the output is the assertion that matters: a generator that emits broken JS is a bug. */
function parses(code: string): void {
    const body = code.replace(/^import .*$/gm, '');
    expect(() => new Function(body), `generated module is not valid JS:\n${body}`).not.toThrow();
}

describe('every template construct survives the inline production path', () => {
    it('@show — kept in the DOM and toggled, not removed', () => {
        const code = inline('@show (count) { <div>here</div> }');
        parses(code);
        expect(code).toContain('show');
    });

    it('@portal — rendered into another host', () => {
        const code = inline("@portal ('body') { <div>modal</div> }");
        parses(code);
        expect(code).toContain('portal');
    });

    it('@defer — with a trigger', () => {
        const code = inline('@defer (viewport) { <div>heavy</div> }');
        parses(code);
        expect(code).toContain('defer');
    });

    it('@defer — with a placeholder, which is a second body to generate', () => {
        const code = inline('@defer (viewport) { <div>heavy</div> } @placeholder { <div>skeleton</div> }');
        parses(code);
        expect(code).toContain('skeleton');
    });

    it('@try / @catch — the error boundary', () => {
        const code = inline('@try { <div>ok</div> } @catch (e) { <div>failed</div> }');
        parses(code);
        expect(code).toContain('failed');
    });

    it('@await — with @loading and @error branches', () => {
        const code = inline(
            '@await (ready) { <div>done</div> } @loading { <div>wait</div> } @error (e) { <div>bad</div> }',
            'let ready = $signal(false);',
        );
        parses(code);
        expect(code).toContain('wait');
        expect(code).toContain('bad');
    });

    it('@let — a local the rest of the template can read', () => {
        const code = inline('@let doubled = count * 2;\n<p>{{ doubled }}</p>');
        parses(code);
        expect(code).toContain('doubled');
    });

    it('@require — permission-gated markup', () => {
        const code = inline("@require ('admin.panel') { <nav>admin</nav> }");
        parses(code);
        expect(code).toContain('admin');
    });

    it('@require with @else — both branches are generated', () => {
        const code = inline("@require ('admin') { <nav>yes</nav> } @else { <span>no</span> }");
        parses(code);
        expect(code).toContain('yes');
        expect(code).toContain('no');
    });

    it('@if / @else if / @else — every branch', () => {
        const code = inline('@if (count > 2) { <b>big</b> } @else if (count > 0) { <i>some</i> } @else { <s>none</s> }');
        parses(code);
        expect(code).toContain('big');
        expect(code).toContain('some');
        expect(code).toContain('none');
    });

    it('@for with @empty — the empty branch is a body too', () => {
        const code = inline(
            '@for (items as i; track i.id) { <li>{{ i.name }}</li> } @empty { <li>nothing</li> }',
            'let items = $signal([]);',
        );
        parses(code);
        expect(code).toContain('nothing');
    });

    it('@switch with a default case', () => {
        const code = inline(
            "@switch (state) { @case ('a') { <p>A</p> } @default { <p>D</p> } }",
            "let state = $signal('a');",
        );
        parses(code);
        expect(code).toContain('D');
    });
});

describe('the markup details the inline path has to get right on its own', () => {
    it('a void element is never given a closing tag', () => {
        // The runtime path gets this from the HTML parser; the inline path has its own list.
        const code = inline('<div><br><img src="x.png"><input></div>');
        parses(code);
        expect(code).toContain("createElement('br')");
        expect(code).toContain("createElement('img')");
        expect(code).toContain("createElement('input')");
    });

    it('an HTML comment produces no node', () => {
        const code = inline('<div><!-- a note --><span>x</span></div>');
        parses(code);
        expect(code).not.toContain('a note');
    });

    it('whitespace between elements becomes one space, as the parser keeps it in dev', () => {
        // Dropped altogether, it would run two inline siblings together in a build.
        // Four runs of whitespace here: around the <div> at the template's root, and inside it.
        const code = inline('<div>\n    <span>x</span>\n</div>');
        parses(code);
        expect(code.match(/createTextNode\(" "\)/g) ?? []).toHaveLength(4);
        expect(code.match(/createTextNode\("x"\)/g) ?? []).toHaveLength(1);
        expect(code, 'a run of whitespace is kept as one space, not as typed').not.toMatch(/createTextNode\("\\n/);
    });

    it('a named key modifier becomes the key the browser reports', () => {
        const code = inline('<input @keydown.enter="count++">');
        parses(code);
        expect(code).toContain('Enter');
    });

    it('a key modifier with two accepted keys keeps both', () => {
        // `delete` maps to Delete AND Backspace: dropping one silently breaks the other keyboard.
        const code = inline('<input @keydown.delete="count++">');
        parses(code);
        expect(code).toContain('Delete');
        expect(code).toContain('Backspace');
    });

    it('an arrow key modifier is mapped, not passed through as written', () => {
        const code = inline('<input @keydown.up="count++">');
        parses(code);
        expect(code).toContain('ArrowUp');
    });
});
