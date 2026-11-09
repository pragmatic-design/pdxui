// freeNames (#977): the names a piece of code reads and does not declare, scopes followed.

import { describe, it, expect } from 'vitest';
import { freeNames } from '../src/compiler/free-names';

const free = (code: string) => [...(freeNames(code) ?? new Set(['<did not parse>']))].sort();

describe('freeNames', () => {
    it('a parameter, a destructured one and a local are declared; what else is read is free', () => {
        expect(free('async function load({ params, signal }, extra) { const res = await fetch(base + params.id, { signal }); return res.json(extra); }'))
            .toEqual(['base', 'fetch']);
    });

    it('a var is the function\'s wherever it is written; a let is its block\'s', () => {
        expect(free('function f() { if (a) { var v = 1; let w = 2; } return v + w; }')).toEqual(['a', 'w']);
    });

    it('a for head, a catch binding and a nested function\'s parameters are their own scopes', () => {
        expect(free('function f(list) { for (const x of list) g(x); try { h(); } catch (e) { log(e); } return list.map((y) => y + x); }'))
            .toEqual(['g', 'h', 'log', 'x']);
    });

    it('a key, a property after a dot and a label are not reads; a shorthand and a computed key are', () => {
        expect(free('function f() { out: for (;;) { break out; } return { a: 1, b, [k]: o.p, m() { return 1; } }; }'))
            .toEqual(['b', 'k', 'o']);
    });

    it('a function declared beside it, and its own name, are declared', () => {
        expect(free('function f() { return f() + g(); }\nfunction g() { return 1; }')).toEqual([]);
    });

    it('code that does not parse is null, not a guess', () => {
        expect(freeNames('function f( { return ')).toBeNull();
    });
});
