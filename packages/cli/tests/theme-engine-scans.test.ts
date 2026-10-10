// The theme engine reads var() references and selector lists with scans, not regexes.
//
// resolveColorToken's var() regex and the nested-theme guard's trailing-whitespace regex ran in
// polynomial time on long whitespace (#67, code scanning alerts #26–#29); their time is measured in
// core's tests/perf/runtime-scans.test.ts. These cases pin what the scans read.

import { describe, it, expect } from 'vitest';
import { resolveColorToken } from '../../design/src/engine/color';
import { guardThemeRules } from '../../design/src/engine/nested-theme-guard';

describe('resolveColorToken', () => {
    it('a fallback with two levels of parentheses resolves', () => {
        // The regex read at most one level, so this token was no colour at all.
        const tokens = { '--a': 'var(--missing, light-dark(oklch(0.5 0.1 200), oklch(0.7 0.1 200)))' };
        expect(resolveColorToken(tokens, '--a', 'light')).not.toBeNull();
        expect(resolveColorToken(tokens, '--a', 'dark')).not.toBeNull();
    });

    it('a fallback padded with whitespace still resolves', () => {
        const tokens = { '--a': `var(--missing,${'\t'.repeat(50)}oklch(0.5 0.1 200)${'\t'.repeat(50)})` };
        expect(resolveColorToken(tokens, '--a', 'light')).toMatchObject({ l: 0.5 });
    });

    it('a chain of references resolves, and a missing one with no fallback is null', () => {
        const tokens = { '--a': 'var(--b)', '--b': 'var( --c )', '--c': 'oklch(0.4 0.05 100)' };
        expect(resolveColorToken(tokens, '--a', 'light')).toMatchObject({ l: 0.4 });
        expect(resolveColorToken({ '--a': 'var(--nowhere)' }, '--a', 'light')).toBeNull();
    });
});

describe('guardThemeRules', () => {
    it('keeps the whitespace around a selector list', () => {
        const out = guardThemeRules('\n  .a,\n  .b   {\n  color: red;\n}\n', 'x');
        expect(out.startsWith('\n  ')).toBe(true);
        expect(out).toMatch(/\s{3}\{/);
    });
});
