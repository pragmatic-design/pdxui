// The virtual router codegen must escape route segments structurally (JSON.stringify), so a path
// with a quote/backslash or a param that isn't a valid JS identifier can't break the generated code.
import { describe, it, expect } from 'vitest';
import { generateOptimizedRouter } from '../src/plugin-utils';

describe('generateOptimizedRouter — escaping', () => {
    it('produces valid JS for a static segment with a quote and a non-identifier param', () => {
        const code = generateOptimizedRouter([
            { path: "/it's/:a-b", file: 'x.pdx', tag: 'pdx-x' } as never,
        ]);
        // The static segment is double-quoted/escaped, not a broken single-quoted literal.
        expect(code).toContain('"it\'s"');
        expect(code).not.toContain("=== 'it's'");
        // The param name is a quoted object key (a-b is not a valid bare identifier),
        // and the value is decodeURIComponent-wrapped (fix #14b).
        expect(code).toContain('"a-b": decodeURIComponent(s[');
        // And the whole module parses (strip module syntax → parse the body).
        const body = code.replace(/^\s*import\s.*$/gm, '').replace(/^\s*export\s+/gm, '');
        expect(() => new Function(body)).not.toThrow();
    });

    it('escapes a backslash in a static segment', () => {
        const code = generateOptimizedRouter([
            { path: '/a\\b/:id', file: 'y.pdx', tag: 'pdx-y' } as never,
        ]);
        const body = code.replace(/^\s*import\s.*$/gm, '').replace(/^\s*export\s+/gm, '');
        expect(() => new Function(body)).not.toThrow();
    });
});
