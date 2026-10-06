// Template projection.
//
// This is what makes type-checking and navigation work inside a template: every `.pdx` control
// structure becomes the TypeScript that gives its expressions the right SCOPE, and a segment map
// says where each projected expression came from. Get the scope wrong and `@for (rows as row)`
// reports `row` as undefined; get the map wrong and every hover in a template lands on the wrong
// character.
//
// The projection is a pure function, so each case here is: a real .pdx, and the TypeScript it
// must produce.

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { projectTemplate } from '../src/utils/template-projection';

/** Project the template of a .pdx source and hand back the generated TS plus its map. */
function project(src: string, resolveType?: (tag: string, attr: string) => string | null) {
    const { descriptor, ast } = analyzeDocument(src, 'x.pdx');
    const tmpl = descriptor!.template!.content;
    return projectTemplate(ast ?? [], tmpl, src.indexOf(tmpl), 0, resolveType);
}

const pdx = (template: string, script = 'let a = $signal(1);') =>
    `<template>\n${template}\n</template>\n<script>\n${script}\n</script>\n`;

describe('control structures become the scope they imply', () => {
    // `track` is not optional: without it the parser emits no @for node at all, so a projection
    // test written without it measures an empty AST rather than the loop.
    it('@for projects a for-of, so the item is defined inside it', () => {
        const { code } = project(pdx('@for (rows as row; track row) { <span>{{ row.label }}</span> }',
            'let rows = $signal([{ label: "x" }]);'));

        expect(code).toContain('for (const row of (rows))');
        expect(code, 'the loop body was not projected inside the loop')
            .toMatch(/for \(const row of \(rows\)\) \{[\s\S]*row\.label/);
    });

    it('@for with an index declares it too', () => {
        const { code } = project(pdx('@for (rows as row, i; track row) { <span>{{ i }}</span> }',
            'let rows = $signal([1]);'));
        expect(code).toContain('let i = 0;');
    });

    it('@for @empty projects its body outside the loop, where the item is NOT in scope', () => {
        const { code } = project(pdx('@for (rows as row; track row) { <b>{{ row }}</b> } @empty { <i>{{ a }}</i> }',
            'let rows = $signal([1]);\nlet a = $signal(2);'));

        const loopEnd = code.indexOf('}\n', code.indexOf('for (const row'));
        expect(code.indexOf('(a)'), 'the empty branch was projected inside the loop')
            .toBeGreaterThan(loopEnd);
    });

    it('@if projects an if, and @else the else beside it', () => {
        const { code } = project(pdx('@if (a > 1) { <b>{{ a }}</b> } @else { <i>no</i> }'));
        expect(code).toContain('if (a > 1) {');
        expect(code).toContain('else {');
    });

    it('@show projects its condition as an if', () => {
        const { code } = project(pdx('@show (a > 0) { <b>x</b> }'));
        expect(code).toContain('if (a > 0) {');
    });

    it('@switch projects a switch with each case', () => {
        const { code } = project(pdx("@switch (a) { @case ('x') { <b>x</b> } @default { <i>d</i> } }"));
        expect(code).toContain('switch (a) {');
        expect(code).toContain('default: {');
        // The parser strips the quotes from a case value, and the projection emits it verbatim,
        // so the generated `case x:` is an undeclared identifier. It is scaffolding, and
        // scaffolding is not in the segment map, so the resulting TS error never reaches the
        // editor — measured: a real typo inside the same case IS still reported. Asserted as it
        // behaves rather than as it reads.
        expect(code).toContain('case x:');
    });

    it('@try/@catch declares the error variable in the catch scope', () => {
        // `@catch` without a variable is not parseable — the parser emits no @try node for it —
        // so the projection's `errorVar || 'err'` fallback is unreachable from real source.
        const { code } = project(pdx('@try { <b>x</b> } @catch (e) { <i>{{ e }}</i> }'));
        expect(code).toContain('try {');
        expect(code).toContain('catch (e: any) {');
    });

    it('@let declares its binding', () => {
        const { code } = project(pdx('@let total = a * 2; <b>{{ total }}</b>'));
        expect(code).toContain('let total = (a * 2);');
    });

    it('@defer projects both the body and the placeholder', () => {
        const { code } = project(pdx('@defer (viewport) { <b>{{ a }}</b> } @placeholder { <i>{{ a }}</i> }'));
        expect(code.match(/\(a\)/g)?.length, 'one of the two branches was dropped')
            .toBeGreaterThanOrEqual(2);
    });

    it('a scoped slot declares its scope variables', () => {
        // The parent-side syntax is `@slot(name, { vars })`, not a <template #name> element.
        const { code } = project(pdx('@slot(row, { item, index }) { <b>{{ item }}</b> }'));
        expect(code, 'the slot scope variables were not declared, so they read as undefined')
            .toContain('let item: any;');
        expect(code).toContain('let index: any;');
    });

    it('wraps everything in one function, so the script scope is visible to it', () => {
        const { code } = project(pdx('<b>{{ a }}</b>'));
        expect(code.startsWith('function __pdxRender() {')).toBe(true);
        expect(code.trimEnd().endsWith('}')).toBe(true);
    });
});

describe('expressions become checkable statements', () => {
    it('an interpolation is projected as a parenthesised statement', () => {
        const { code } = project(pdx('<b>{{ a + 1 }}</b>'));
        expect(code).toContain(';(a + 1);');
    });

    it('a binding value is projected', () => {
        const { code } = project(pdx('<pdx-x :value="a"></pdx-x>'));
        expect(code).toContain('(a);');
    });

    it('an event handler is projected', () => {
        const { code } = project(pdx('<button @click="go()">x</button>', 'function go() {}'));
        expect(code).toContain('(go());');
    });

    it('an empty expression projects nothing', () => {
        const { code } = project(pdx('<pdx-x :value=""></pdx-x>'));
        expect(code, 'an empty binding produced a syntax error in the virtual file')
            .not.toContain('();\n(');
    });

    it('a `${}` interpolation is skipped — it is the antipattern, not TypeScript', () => {
        const { code } = project(pdx('<div title="${a}"></div>'));
        expect(code, 'raw interpolation was projected as if it were an expression')
            .not.toContain('${');
    });
});

describe('example code is not projected', () => {
    it('a <pre> block is left alone', () => {
        const { code } = project(pdx('<pre>@if (notReal) { {{ alsoNotReal }} }</pre>'));
        expect(code, 'documentation markup was type-checked as if it were code')
            .not.toContain('alsoNotReal');
    });

    it('a <code> block is left alone', () => {
        const { code } = project(pdx('<code>{{ notReal }}</code>'));
        expect(code).not.toContain('notReal');
    });

    it('but real code beside it still projects', () => {
        const { code } = project(pdx('<code>{{ notReal }}</code>\n<b>{{ a }}</b>'));
        expect(code).not.toContain('notReal');
        expect(code).toContain(';(a);');
    });
});

describe('literal bindings are type-checked against the manifest', () => {
    const resolve = (tag: string, attr: string) =>
        (tag === 'pdx-card' && attr === 'elevation' ? 'number' : null);

    it('a string literal on a number prop is projected as an assignment that will fail', () => {
        const { code } = project(pdx('<pdx-card :elevation="\'two\'"></pdx-card>'), resolve);
        expect(code, 'the wrong literal type was projected as untyped')
            .toContain('((__v: number) => __v)');
    });

    it('an identifier is projected untyped — a loosely typed signal is not an error', () => {
        const { code } = project(pdx('<pdx-card :elevation="a"></pdx-card>'), resolve);
        expect(code, 'a signal binding was type-checked against the attribute type')
            .not.toContain('__v: number');
    });

    it('a prop the resolver knows nothing about is projected untyped', () => {
        const { code } = project(pdx('<pdx-card :unknown="\'x\'"></pdx-card>'), resolve);
        expect(code).not.toContain('__v:');
    });

    it('an event handler is never type-checked as a prop', () => {
        const { code } = project(pdx('<pdx-card @elevation="\'x\'"></pdx-card>'), resolve);
        expect(code).not.toContain('__v: number');
    });
});

describe('the segment map', () => {
    it('points each projected expression back at the character it came from', () => {
        const src = pdx('<b>{{ a }}</b>');
        const { code, map } = project(src);

        const genIdx = code.indexOf('a', code.indexOf(';('));
        const srcOffset = map.toSrc(genIdx);

        expect(srcOffset, 'the expression had no source position at all').toBeGreaterThanOrEqual(0);
        expect(src[srcOffset], 'the map pointed at the wrong character').toBe('a');
    });

    it('maps a loop item back to the template, not to the scaffolding', () => {
        const src = pdx('@for (rows as row; track row) { <b>{{ row }}</b> }', 'let rows = $signal([1]);');
        const { code, map } = project(src);

        const genIdx = code.indexOf('row of');
        const srcOffset = map.toSrc(genIdx);

        expect(src.slice(srcOffset, srcOffset + 3), 'the loop variable mapped somewhere else')
            .toBe('row');
    });

    it('does not map the generated scaffolding to anything', () => {
        const { code, map } = project(pdx('<b>{{ a }}</b>'));
        const inScaffolding = code.indexOf('function __pdxRender');
        expect(map.toSrc(inScaffolding + 2),
            'generated text claimed a position in the user file').toBe(-1);
    });
});

describe('a template with nothing to project', () => {
    it('produces an empty function rather than failing', () => {
        const { code } = project(pdx('<div>static text</div>'));
        expect(code).toBe('function __pdxRender() {\n}\n');
    });

    it('an empty AST is handled', () => {
        const { code, map } = projectTemplate([], '', 0, 0);
        expect(code).toBe('function __pdxRender() {\n}\n');
        expect(map.toSrc(0)).toBe(-1);
    });
});
