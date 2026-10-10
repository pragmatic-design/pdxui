// isSelfContainedType answers what the regex it replaced answered, without its backtracking.
//
// The regex had `\d+` inside a repeated alternation, exponential on a run of digits (#67, alert
// #31). The time on that input is measured in core's tests/perf/runtime-scans.test.ts.

import { describe, it, expect } from 'vitest';
import { isSelfContainedType } from '../src/utils/payload-type';

/**
 * What the replaced regex answered on these shapes, computed once from it. Its answers, not a copy
 * of it: a copy kept here is the same exponential regex, and CodeQL reports it here too (#150).
 */
const OLD_ANSWERS: [string, boolean][] = [
    ['{ a: 1, b: "x" }', true], ['{ a: b }', false], ['{a:{b:{c:number}}}', true], ["'x'|'y'|null", true],
    ['string[]', true], ['{ id : number }', true], ['x', false], ['undefined | string', true], ['1234567890', true],
];

describe('isSelfContainedType', () => {
    for (const type of ['number', '{ id: number }', "'a' | 'b'", '{ id?: string; tags: string[] }', '42', 'null', '{ "x": 1 }', '[number, string]']) {
        it(`accepts ${type}`, () => expect(isSelfContainedType(type)).toBe(true));
    }
    for (const type of ['Ticket', '{ t: Ticket }', 'Array<string>', 'Record<string, number>', '() => void', 'ticket']) {
        it(`refuses ${type}`, () => expect(isSelfContainedType(type)).toBe(false));
    }

    it('agrees with the regex it replaced, on its accepted and refused shapes', () => {
        for (const [s, old] of OLD_ANSWERS) expect(isSelfContainedType(s), s).toBe(old);
    });

    it('control — an unterminated quote is refused, where the regex let a lone quote through', () => {
        // The one place the two differ, on purpose: `'` alone matched the regex's character class.
        expect(isSelfContainedType("'")).toBe(false);
    });
});
