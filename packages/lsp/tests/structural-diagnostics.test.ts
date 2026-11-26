// The editor shows the errors the parser finds in a .pdx's blocks (#1249).
//
// `compile()` stops at a structural error — markup outside the blocks, a second <script> — and the
// editor's analysis caught the throw and drew nothing: a file the build refuses showed no squiggle.
// analyzeDocument now reports each coded parse error at the line its message names.

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';

describe('analyzeDocument and the parser\'s errors', () => {
    it('reports markup outside the blocks as PDX_MARKUP_OUTSIDE_TEMPLATE, an error at its line', () => {
        const source = '<script>\nlet count = $signal(0);\n</script>\n\n<button @click="count++">x</button>';
        const found = analyzeDocument(source, 'hello.pdx').warnings.filter((w) => w.code === 'PDX_MARKUP_OUTSIDE_TEMPLATE');
        expect(found).toHaveLength(1);
        expect(found[0].severity).toBe('error');
        expect(found[0].line).toBe(5);
    });

    it('reports a second <script> the same way', () => {
        const source = '<template><p>{{ a }}</p></template>\n<script>let a = $signal(1);</script>\n<script>let b = 2;</script>';
        const found = analyzeDocument(source, 'two.pdx').warnings.filter((w) => w.code === 'PDX_DUPLICATE_SCRIPT');
        expect(found.map((w) => w.line)).toEqual([3]);
    });

    it('control — a well-formed file reports no parse error', () => {
        const source = '<template><p>{{ a }}</p></template>\n<script>let a = $signal(1);</script>';
        const codes = analyzeDocument(source, 'ok.pdx').warnings.map((w) => w.code);
        expect(codes).not.toContain('PDX_MARKUP_OUTSIDE_TEMPLATE');
        expect(codes).not.toContain('PDX_DUPLICATE_SCRIPT');
    });
});
