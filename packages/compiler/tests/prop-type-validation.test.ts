// C4 — conservative validation of @prop TS type annotations.
// A malformed type (unbalanced delimiters, empty, dangling separator) produces an
// invalid .d.ts silently. We flag it with PDX_PROP_INVALID_TYPE — WITHOUT false
// positives on valid complex types (generics, unions, function types).

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';

function typeWarnings(src: string) {
    return analyzeScript(src, 'test.pdx').warnings.filter(w => w.code === 'PDX_PROP_INVALID_TYPE');
}

describe('C4 — @prop malformed type', () => {
    it('flags an unbalanced generic', () => {
        const w = typeWarnings(`@prop x: Foo<string;`);
        expect(w.length).toBe(1);
        expect(w[0].message).toContain('x');
    });

    it('flags a dangling union', () => {
        expect(typeWarnings(`@prop x: string | ;`).length).toBe(1);
    });

    it('flags unbalanced brackets', () => {
        expect(typeWarnings(`@prop x: string[;`).length).toBe(1);
    });

    it('does NOT flag valid generics', () => {
        expect(typeWarnings(`@prop x: Map<string, number> = new Map();`).length).toBe(0);
    });

    it('does NOT flag valid unions', () => {
        expect(typeWarnings(`@prop x: 'a' | 'b' | 'c' = 'a';`).length).toBe(0);
    });

    it('does NOT flag valid function types', () => {
        expect(typeWarnings(`@prop onPick: (item: number) => string;`).length).toBe(0);
    });

    it('does NOT flag valid array/nested generics', () => {
        expect(typeWarnings(`@prop rows: Array<{ id: number; cb: () => void }>;`).length).toBe(0);
    });
});
