// A directive the parser read and no handler generates leaves a comment in the render (#100). The
// inline path dropped it in silence.
//
// compile() cannot produce the case — `codegen.ts` reads exactly the directive names that have a
// handler — so it is built here from the generator, with a parse that knows the name and a context
// that has no handler for it.

import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parser/template';
import { generateInlineNodes } from '../src/compiler/codegen-template-inline';
import { createCompileContext } from '../src/compiler/compile-context';

describe('a directive with no handler', () => {
    const nodes = () => parseTemplate('<p>a</p>@tooltip (hint) { <span>b</span> }', 1, new Set(['tooltip']));

    it('is a comment in the render, not nothing', () => {
        // In the block's static markup, written as HTML (#369).
        expect(generateInlineNodes(nodes(), new Set(), createCompileContext()))
            .toContain('<!-- unknown directive @tooltip -->');
    });
});
