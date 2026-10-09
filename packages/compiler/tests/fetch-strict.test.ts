// `@fetch` says what it does, or says why it cannot (#40).
//
// It accepted three forms and then ignored them in silence: a type written after `:` (dropped, and
// the `{ options }` after it with it), an option `resource()` does not know (pasted in unread), and
// any HTTP method (compiled to a GET whatever was written). `@fetch` is for reads; a write is a
// `mutation()`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { compile } from '../src/plugin';
import { FETCH_OPTION_KEYS } from '../src/compiler/script-analyzer-helpers';

const codes = (script: string): string[] => analyzeScript(script, 'test.pdx').warnings.map((w) => w.code);
const finding = (script: string, code: string) => analyzeScript(script, 'test.pdx').warnings.find((w) => w.code === code);

describe('@fetch reads, and says so when asked to write', () => {
    it('a method other than GET is an error, not a GET', () => {
        const w = finding(`@fetch result: 'POST /api/search' as Hit[];`, 'PDX_FETCH_METHOD');
        expect(w, 'POST compiled to a GET with no word').toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.message).toContain("'result'");
        expect(w!.hint).toContain('mutation()');
    });

    it('so does a method nobody has heard of', () => {
        expect(codes(`@fetch x: 'FROB /api/x';`)).toContain('PDX_FETCH_METHOD');
    });

    it('control — GET, in any case, is what @fetch is for', () => {
        expect(codes(`@fetch x: 'GET /api/x';`)).not.toContain('PDX_FETCH_METHOD');
        expect(codes(`@fetch x: 'get /api/x';`)).not.toContain('PDX_FETCH_METHOD');
    });
});

describe('a type written after a colon', () => {
    it('is an error that names the fix, instead of a type dropped in silence', () => {
        const w = finding(`@fetch user: 'GET /api/user' : User;`, 'PDX_FETCH_TYPE_COLON');
        expect(w, 'the `: User` was dropped with no word').toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.hint).toContain('as User');
    });

    it('and the options after it are still read, not lost with the type', () => {
        const a = analyzeScript(`@fetch user: 'GET /api/user' : User { staleTime: 1000 };`, 'test.pdx');
        expect(a.fetches[0].options).toBe('{ staleTime: 1000 }');
        expect(a.fetches[0].type).toBe('User');
    });

    it('carries a fix that rewrites it to `as`', () => {
        const source = `<template>\n  <p>{{ user }}</p>\n</template>\n<script setup>\n@fetch user: 'GET /api/user' : User;\n</script>\n`;
        const w = compile(source, 'user.pdx').warnings.find((x) => x.code === 'PDX_FETCH_TYPE_COLON');
        expect(w?.fix, 'no fix proposal').toBeDefined();
        let fixed = source;
        for (const e of [...w!.fix!.edits].sort((p, q) => q.start - p.start)) {
            fixed = fixed.slice(0, e.start) + e.newText + fixed.slice(e.end);
        }
        expect(fixed).toContain(`@fetch user: 'GET /api/user' as User;`);
    });

    it('control — `as Type` is not reported', () => {
        expect(codes(`@fetch user: 'GET /api/user' as User;`)).not.toContain('PDX_FETCH_TYPE_COLON');
    });
});

describe('an option resource() does not know', () => {
    it('is an error that names it and the ones it takes', () => {
        const w = finding(`@fetch x: 'GET /api/x' { stalTime: 1 };`, 'PDX_FETCH_UNKNOWN_OPTION');
        expect(w, 'a misspelled option compiled and did nothing').toBeDefined();
        expect(w!.severity).toBe('error');
        expect(w!.message).toContain('stalTime');
        expect(w!.hint).toContain('staleTime');
    });

    it('reads only the top-level keys: a nested object is a value, not an option', () => {
        expect(codes(`@fetch x: 'GET /api/x' as X { cache: { ttl: 5000 }, tags: ['a'] };`))
            .not.toContain('PDX_FETCH_UNKNOWN_OPTION');
    });

    it('accepts the shorthand and a function value', () => {
        expect(codes(`@fetch x: 'GET /api/x' { staleTime, onError: (e) => { log(e, { a: 1 }) } };`))
            .not.toContain('PDX_FETCH_UNKNOWN_OPTION');
    });

    it('control — every option resource() declares is accepted', () => {
        const all = FETCH_OPTION_KEYS.map((k) => `${k}: 1`).join(', ');
        expect(codes(`@fetch x: 'GET /api/x' { ${all} };`)).not.toContain('PDX_FETCH_UNKNOWN_OPTION');
    });

    it('the list is ResourceOptions, read from core — the two cannot drift apart', () => {
        const source = readFileSync(join(__dirname, '..', '..', 'core', 'src', 'reactivity', 'resource.ts'), 'utf8');
        const body = /export interface ResourceOptions<[^>]*>\s*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
        // Match: `    key?: …` — a member at the interface's own indentation.
        const declared = [...body.matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).sort();
        expect(declared.length, 'ResourceOptions was not found in core').toBeGreaterThan(3);
        expect([...FETCH_OPTION_KEYS].sort()).toEqual(declared);
    });
});
