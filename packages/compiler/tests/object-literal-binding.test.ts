// An object literal bound to a prop compiles to a module that parses.
//
// Wrapped as is, `:item-default="{ activity: '', hours: 1 }"` becomes
// `() => { activity: '', hours: 1 }` — an arrow with a BLOCK body, not an object.
// `activity: ''` reads as a label followed by a string expression, and the comma before `hours: 1`
// makes it a syntax error. The build dies on a Rollup parse error pointing at the GENERATED line,
// on a `.pdx` whose own line number cannot be recovered: the author's mistake is invisible in it,
// and the author has not made one — `:prop="{ … }"` is how every other value is bound.
//
// An array literal does not have the problem (an arrow returning `[` is unambiguous), which is
// why arrays alone do not show it.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** The render of a template, as every .pdx is compiled (#107). */
function inline(template: string): string {
    return compile(`<template>\n${template}\n</template>\n<script>\n  let on = $signal(1);\n</script>`, 'obj.pdx').code;
}

/** Does the emitted module parse at all? The failure this issue is about is a syntax error. */
function parses(code: string): boolean {
    try {
        // Imports cannot be evaluated here and are not what is being checked.
        new Function(code.replace(/^\s*import .*$/gm, ''));
        return true;
    } catch {
        return false;
    }
}

describe('an object literal bound to a prop', () => {
    const TEMPLATE = `<pdx-field-list :item-default="{ activity: '', hours: 1 }"></pdx-field-list>`;

    it('parses', () => {
        expect(parses(inline(TEMPLATE)), 'the generated module is a syntax error').toBe(true);
    });

    it('assigns the object, not a block', () => {
        // In expression position, where `{` opens an object: the value of a const, then the prop.
        const code = inline(TEMPLATE);
        expect(code).toContain("const __b = { activity: '', hours: 1 };");
        expect(code).toMatch(/assignBoundProperty\(__el\d+, "itemDefault", __b\)/);
    });

    it('and an expression that merely STARTS inside a string is untouched', () => {
        // The control for the parenthesising rule: it keys on the expression beginning with `{`,
        // so a value that only contains a brace must not be wrapped and must still parse.
        const code = inline(`<pdx-x :label="'{ not an object }'"></pdx-x>`);
        expect(parses(code)).toBe(true);
        expect(code).toContain("'{ not an object }'");
        expect(code).not.toContain("('{ not");
    });

    it('and an array literal still compiles as it always did', () => {
        // The other control: arrays never had the defect, and the fix must not change them.
        const code = inline(`<pdx-x :rows="[1, 2]"></pdx-x>`);
        expect(parses(code)).toBe(true);
        expect(code).toContain('[1, 2]');
    });

    it('and a nested object literal parses too', () => {
        expect(parses(inline(`<pdx-x :cfg="{ a: { b: 1 }, c: [2] }"></pdx-x>`)), 'a nested literal broke the module').toBe(true);
    });
});
