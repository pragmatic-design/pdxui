// A name the component DECLARES is the component's, even when it is also a global.
//
// `GLOBALS` lists the names a template may use without the component declaring them, and among the
// JS built-ins it lists the form validators: `required`, `email`, `url`, `min`, `max`, `pattern`… A
// GLOBAL the component declares stays among the template's identifiers: deleted, a component variable
// with one of those names, rendered in its own template, would count as NOT used — a false «declared
// but not used» with a wrong fix, «prefix with _», and a `let email = 'x'` in the template never
// reported as non-reactive.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const src = (template: string, script: string) =>
    `<template>\n${template}\n</template>\n<script setup>\n${script}\n</script>`;

const codesOf = (source: string): string[] =>
    (compile(source, 'probe.pdx').warnings ?? []).map(w => `${w.code}: ${w.message}`);

describe('a declared variable named like a global validator', () => {
    for (const name of ['email', 'url', 'min', 'max', 'pattern', 'required']) {
        it(`a $derived '${name}' rendered in the template is not reported unused`, () => {
            const warnings = codesOf(src(`<p>{{ ${name} }}</p>`, `let x = $signal('a');\nconst ${name} = $derived(x + '!');`));
            expect(warnings.filter(w => w.startsWith('PDX_UNUSED_REACTIVE')),
                `'${name}' is read in the template and reported as dead`).toEqual([]);
        });
    }

    it('a plain let email rendered in the template is reported as non-reactive', () => {
        const warnings = codesOf(src('<p>{{ email }}</p>', `let email = 'a@b.c';`));
        expect(warnings.some(w => w.startsWith('PDX_NON_REACTIVE') && w.includes("'email'")),
            'the check that tells a let from a signal never saw the name').toBe(true);
    });

    it('control — a derived named like a global and read NOWHERE is still reported', () => {
        const warnings = codesOf(src('<p>hi</p>', `let x = $signal('a');\nconst email = $derived(x + '!');`));
        expect(warnings.some(w => w.startsWith('PDX_UNUSED_REACTIVE') && w.includes("'email'"))).toBe(true);
    });

    it('control — a global used in a template and not declared is still no identifier of the component', () => {
        // `Math` is a global; the component declares nothing called that, and nothing is reported.
        const warnings = codesOf(src('<p>{{ Math.max(a, 1) }}</p>', 'let a = $signal(1);'));
        expect(warnings).toEqual([]);
    });
});
