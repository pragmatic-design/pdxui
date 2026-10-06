// What a @for puts in scope, and how its `track` resolves names.
//
// The rendering is exercised end to end in ui (for-track-scope.test.ts). This file pins the names:
// every name a destructuring pattern binds is the loop's, and the track expression is prefixed like
// the rest of the template instead of being pasted into the key function as written.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { bindingNames } from '../src/compiler/codegen-prefix';

function tpl(template: string, script = 'let rows = $signal([]);'): string {
    return compile(`<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`, 'rows.pdx').code;
}

describe('bindingNames', () => {
    it('a plain identifier is itself', () => {
        expect(bindingNames('row')).toEqual(['row']);
    });

    it('every name of a destructuring pattern, nested, renamed, defaulted, rest and holes included', () => {
        expect(bindingNames('{ id, user: { name }, tags: [first, , third], label = "x", ...rest }'))
            .toEqual(['id', 'name', 'first', 'third', 'label', 'rest']);
    });
});

describe('@for with a destructured binding', () => {
    it('the body reads the loop\'s names, not the component\'s', () => {
        const code = tpl('@for (rows as { id, user: { name } }; track id) { <b>{{ name }}</b> }');
        expect(code).not.toMatch(/ctx\.name\b/);
        expect(code).toContain('${name}');
    });
});

describe('@for track', () => {
    const SETUP = 'let rows = $signal([]);\nlet sep = $signal(":");\nfunction keyOf(a, b) { return a + sep + b; }';

    it('a function of the component is called through ctx, on the raw item', () => {
        const code = tpl('@for (rows as r; track keyOf(r.id, r.kind)) { <b>{{ r.name }}</b> }', SETUP);
        expect(code).toContain('(r) => ctx.keyOf(r.id, r.kind)');
    });

    it('a signal of the component is read, the loop variable is not a getter inside the key', () => {
        const code = tpl('@for (rows as r; track r.id + sep) { <b>{{ r.name }}</b> }', SETUP);
        expect(code).toContain('(r) => r.id + ctx.sep()');
    });

    it('destructured names stay local, the component\'s function gets ctx', () => {
        const code = tpl('@for (rows as { id, kind }; track keyOf(id, kind)) { <b>{{ id }}</b> }', SETUP);
        expect(code).toContain('({ id, kind }) => ctx.keyOf(id, kind)');
    });

    it('the index is bound in the key function when the loop names it', () => {
        const code = tpl('@for (rows as r, i; track keyOf(r.id, i)) { <b>{{ r.name }}</b> }', SETUP);
        expect(code).toContain('(r, i) => ctx.keyOf(r.id, i)');
    });

    it('control — track item.field stays a field name', () => {
        const code = tpl('@for (rows as r; track r.id) { <b>{{ r.name }}</b> }');
        expect(code).toContain("eachRow(() => ctx.rows(), 'id',");
    });

    it('control — a destructured pattern is never read as a regex for the field shortcut', () => {
        // `[a, b]\.(\w+)` is a character class: `track a.id` would have become the key 'id' of the item.
        const code = tpl('@for (rows as [a, b]; track a.id) { <b>{{ b }}</b> }');
        expect(code).toContain('([a, b]) => a.id');
    });
});
