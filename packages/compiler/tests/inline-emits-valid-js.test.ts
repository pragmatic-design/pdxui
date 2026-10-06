// What the inline render path emits has to PARSE.
//
// `inlineBindings` builds the DOM imperatively, and to do it the generator re-reads the template
// TEXT: it finds the end of a tag by scanning for `>`, skipping over quoted values. That is enough
// for a template an author writes, and not enough for the one the compiler hands it: the form
// binding pass injects `:error=${() => ctx.f?.error()}` on every `<pdx-form-field>`, and `=>`
// contains a `>`.
//
// A tag that ends in the middle of the arrow turns everything after it into a TEXT NODE, the
// binding into `assignBoundProperty(el, "error", (() )())`, and the module does not parse:
//
//     SyntaxError: Unexpected token ')'
//
// `vite build` then fails outright — "Parenthesized expression cannot be empty" — on every
// component using `@form`, which is most of a real application.
//
// The assertion is on the whole emitted module rather than on a fragment of it, because such a
// defect is not in the binding it corrupts: it is in where the generator thinks the tag ends, and
// that can corrupt anything downstream of it.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';

const FORM = `<template>
  <pdx-form :form="orderForm">
    <pdx-form-field name="reference" label="Order reference" required>
      <pdx-input name="reference"></pdx-input>
    </pdx-form-field>
  </pdx-form>
</template>

<script setup>
@form orderForm: { reference: string { required } };
</script>`;

/**
 * Does the emitted module parse?
 *
 * `new Function` is a parser that is already here — no dependency to add for a syntax check. The
 * import lines are stripped because an import statement is illegal in a function body and says
 * nothing about the rest; the body is never CALLED, only compiled.
 */
function parses(code: string): true {
    // Line-wise: the compiler emits each import on one line, and a `[\s\S]*?;` here swallowed the
    // first statement after them instead — which made even the template path look broken.
    const body = code.replace(/^\s*import\b.*$/gm, '');
    new Function(body);
    return true;
}

describe('the inline path emits a module a bundler can read', () => {
    it('a @form component, where the compiler injects `${() => …}` into the markup', () => {
        const { code } = compile(FORM, 'order.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(parses(code)).toBe(true);
    });

    it('control — the same component through the template path', () => {
        // Without this, a change that made BOTH paths emit nothing would pass the test above.
        const { code } = compile(FORM, 'order.pdx', [], undefined, { production: true });
        expect(parses(code)).toBe(true);
    });

    it('and the injected binding reaches the element instead of becoming text', () => {
        // The precise symptom: the tail of the arrow was appended as a text node. `?.error()` is
        // part of the expression the compiler injected and belongs in code, never in the document.
        const { code } = compile(FORM, 'order.pdx', [], undefined, { production: true, inlineBindings: true });
        expect(code, 'part of an injected expression was emitted as text')
            .not.toMatch(/createTextNode\("[^"]*\?\.error\(\)/);
    });
});
