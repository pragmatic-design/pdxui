// isSelfContainedType answers what the regex it replaced answered, without its backtracking.
//
// The regex had `\d+` inside a repeated alternation, exponential on a run of digits (#67, alert
// #31). The time on that input is measured in core's tests/perf/runtime-scans.test.ts.

import { describe, it, expect } from 'vitest';
import { isSelfContainedType } from '../src/utils/payload-type';

const OLD = /^(?:[\s{}[\]:;,|?'"]|string|number|boolean|null|undefined|'[^']*'|"[^"]*"|\d+|[a-z_$][\w$]*(?=\??\s*:))*$/;

describe('isSelfContainedType', () => {
    for (const type of ['number', '{ id: number }', "'a' | 'b'", '{ id?: string; tags: string[] }', '42', 'null', '{ "x": 1 }', '[number, string]']) {
        it(`accepts ${type}`, () => expect(isSelfContainedType(type)).toBe(true));
    }
    for (const type of ['Ticket', '{ t: Ticket }', 'Array<string>', 'Record<string, number>', '() => void', 'ticket']) {
        it(`refuses ${type}`, () => expect(isSelfContainedType(type)).toBe(false));
    }

    it('agrees with the regex it replaced, on its accepted and refused shapes', () => {
        const shapes = ['{ a: 1, b: "x" }', '{ a: b }', '{a:{b:{c:number}}}', "'x'|'y'|null", 'string[]', '{ id : number }', 'x', 'undefined | string', '1234567890'];
        for (const s of shapes) expect(isSelfContainedType(s), s).toBe(OLD.test(s));
    });

    it('control — an unterminated quote is refused, where the regex let a lone quote through', () => {
        // The one place the two differ, on purpose: `'` alone matched the regex's character class.
        expect(OLD.test("'")).toBe(true);
        expect(isSelfContainedType("'")).toBe(false);
    });
});
