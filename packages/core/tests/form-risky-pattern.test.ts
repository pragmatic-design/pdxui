// isRiskyPattern recognises the nested-quantifier shapes, and reads nothing else as one.
//
// It was a regex, which CodeQL found slow on the very input it inspects (#67, alert #24); it is a
// scan now, and these cases pin that the scan answers what the regex answered. Its time on the
// pathological input is measured in tests/perf/runtime-scans.test.ts.

import { describe, it, expect } from 'vitest';
import { isRiskyPattern } from '../src/form/form-schema';

describe('isRiskyPattern', () => {
    for (const source of ['(a+)+$', '(a*)*', '(x+)*y', '^(ab*)+$', '(?:a|b+)*']) {
        it(`flags ${source}`, () => expect(isRiskyPattern(source)).toBe(true));
    }

    it('a known blind spot it shares with the regex it replaced: a quantifier one group further out', () => {
        // `((a+))+` is risky, and neither the regex nor the scan sees it: the `+` follows a `)` that
        // closes a group with no quantifier of its own. The input cap still bounds the run.
        expect(isRiskyPattern('((a+))+')).toBe(false);
    });
    for (const source of ['^[a-z]+$', '(ab)+', 'a+b*', '(a)+(b+)', '(a+)b+', '\\d{3}-\\d{4}', '']) {
        it(`does not flag ${JSON.stringify(source)}`, () => expect(isRiskyPattern(source)).toBe(false));
    }

    it('agrees with the regex it replaced on a spread of shapes', () => {
        const old = (s: string) => /\([^)]*[+*][^)]*\)[+*]/.test(s);
        const shapes = ['(a+)+', '(a)(b+)+', '((a+)b)+', '(a+)(b)+', 'x(y*)*z', '(*)+', '(+)', 'a)+', '((+)', '(a+))+'];
        for (const s of shapes) expect(isRiskyPattern(s), s).toBe(old(s));
    });
});
