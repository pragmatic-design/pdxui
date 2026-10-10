// The form path utilities never write through a prototype key.
//
// Dotted paths and nested values can come from a server-driven schema or from external data. The
// guard existed for setNestedValue, in a form CodeQL did not recognise (#66, code scanning alerts
// #144–#146); flattenValues had none: an own `__proto__` key — what JSON.parse makes — was assigned
// on the result, which re-pointed its prototype.

import { describe, it, expect, afterEach } from 'vitest';
import { setNestedValue, unflattenValues, flattenValues, getNestedValue } from '../src/form/form-path';

afterEach(() => {
    delete (Object.prototype as Record<string, unknown>).polluted;
});

const polluted = (): unknown => ({} as Record<string, unknown>).polluted;

describe('setNestedValue', () => {
    for (const path of ['__proto__.polluted', 'constructor.prototype.polluted', 'a.__proto__.polluted', 'a.b.constructor.prototype.polluted', '__proto__']) {
        it(`writes nothing through "${path}"`, () => {
            const target: Record<string, unknown> = {};
            setNestedValue(target, path, 1);
            expect(polluted(), 'Object.prototype was written').toBeUndefined();
            expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
        });
    }

    it('a refused path writes nothing at all, not its first segments', () => {
        const target: Record<string, unknown> = {};
        setNestedValue(target, 'a.__proto__.polluted', 1);
        expect(target).toEqual({});
    });

    it('control — an ordinary path is written', () => {
        const target: Record<string, unknown> = {};
        setNestedValue(target, 'customer.lines.0.qty', 2);
        expect(target).toEqual({ customer: { lines: [{ qty: 2 }] } });
    });
});

describe('unflattenValues', () => {
    it('drops a prototype key instead of following it', () => {
        const out = unflattenValues({ '__proto__.polluted': 1, 'name': 'Jane' });
        expect(polluted()).toBeUndefined();
        expect(out).toEqual({ name: 'Jane' });
    });
});

describe('flattenValues', () => {
    it('an own __proto__ key does not reach the result', () => {
        const input = JSON.parse('{"__proto__": {"polluted": 1}, "name": "Jane"}') as Record<string, unknown>;
        const out = flattenValues(input);
        expect(polluted()).toBeUndefined();
        expect(Object.getPrototypeOf(out), 'the result\'s prototype was re-pointed').toBe(Object.prototype);
        expect(Object.keys(out)).toEqual(['name']);
    });

    it('a top-level __proto__ value does not re-point the result', () => {
        const input = JSON.parse('{"__proto__": [1, 2], "name": "Jane"}') as Record<string, unknown>;
        const out = flattenValues(input);
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
        expect(Object.keys(out)).toEqual(['name']);
    });
});

describe('getNestedValue', () => {
    it('reads nothing across a prototype key', () => {
        expect(getNestedValue({}, 'constructor.name')).toBeUndefined();
    });
});
