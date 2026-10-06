// An object literal bound to a prop compiles to a module that parses.
//
// Wrapped as is, `:item-default="{ activity: '', hours: 1 }"` becomes
// `${() => { activity: '', hours: 1 }}` — an arrow with a BLOCK body, not an object.
// `activity: ''` reads as a label followed by a string expression, and the comma before `hours: 1`
// makes it a syntax error. The build dies on a Rollup parse error pointing at the GENERATED line,
// on a `.pdx` whose own line number cannot be recovered: the author's mistake is invisible in it,
// and the author has not made one — `:prop="{ … }"` is how every other value is bound.
//
// An array literal does not have the problem (an arrow returning `[` is unambiguous), which is
// why arrays alone do not show it.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

/** Compile a template, in both binding modes: the template path and the inline-bindings one. */
function both(template: string): { template: string; inline: string } {
    const source = `<template>\n${template}\n</template>\n<script setup>\n  let on = $signal(1);\n</script>`;
    return {
        template: compile(source, 'obj.pdx').code,
        inline: compile(source, 'obj.pdx', [], undefined, { inlineBindings: true }).code,
    };
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

    it('parses, on the template path', () => {
        expect(parses(both(TEMPLATE).template), 'the generated module is a syntax error').toBe(true);
    });

    it('parses, on the inline-bindings path', () => {
        // Both paths emit the arrow, and the issue names both. A fix to one is half a fix.
        expect(parses(both(TEMPLATE).inline), 'the generated module is a syntax error').toBe(true);
    });

    it('returns the object, not a block', () => {
        const { template } = both(TEMPLATE);
        expect(template).toContain('({ activity');
    });

    it('and an expression that merely STARTS inside a string is untouched', () => {
        // The control for the parenthesising rule: it keys on the expression beginning with `{`,
        // so a value that only contains a brace must not be wrapped and must still parse.
        const { template } = both(`<pdx-x :label="'{ not an object }'"></pdx-x>`);
        expect(parses(template)).toBe(true);
        expect(template).not.toContain("(('{ not");
    });

    it('and an array literal still compiles as it always did', () => {
        // The other control: arrays never had the defect, and the fix must not change them.
        const { template, inline } = both(`<pdx-x :rows="[1, 2]"></pdx-x>`);
        expect(parses(template)).toBe(true);
        expect(parses(inline)).toBe(true);
        expect(template).toContain('[1, 2]');
    });

    it('and a nested object literal parses too', () => {
        const { template, inline } = both(`<pdx-x :cfg="{ a: { b: 1 }, c: [2] }"></pdx-x>`);
        expect(parses(template), 'the template path broke on a nested literal').toBe(true);
        expect(parses(inline), 'the inline path broke on a nested literal').toBe(true);
    });
});
