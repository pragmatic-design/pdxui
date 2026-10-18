// `@await (x as name)` in the compiler (#145): where the binding ends, PDX_AWAIT_TIMING, the code
// both render paths emit, and the registry entries `pdx migrate` applies. The runtime is
// packages/core/tests/await-block.test.ts; compiled and run, await-compiled.test.ts and case 4 of
// async-contract.test.ts.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { parseTemplate } from '../src/parser/template';
import { splitAwaitBinding } from '../src/parser/await-binding';
import { awaitAsAssertion, awaitPlainValue, awaitMaxMs } from '../src/language/await-forms';

const fix = (c: { fix: unknown }, text: string) => (c.fix as (t: string) => string)(text);

describe('the binding is the last top-level `as` followed by a name', () => {
    const cases: [string, { expr: string; as?: string }][] = [
        ['users as list', { expr: 'users', as: 'list' }],
        ['users', { expr: 'users' }],
        ['(x as Resource<User[]>) as list', { expr: '(x as Resource<User[]>)', as: 'list' }],
        ['(x as Resource<User[]>)', { expr: '(x as Resource<User[]>)' }],
        ['load(a as B)', { expr: 'load(a as B)' }],
        ["pick('a as b')", { expr: "pick('a as b')" }],
        ['x as T[]', { expr: 'x as T[]' }],
        ['flag ? a : b as v', { expr: 'flag ? a : b', as: 'v' }],
    ];
    for (const [text, expected] of cases) {
        it(text, () => expect(splitAwaitBinding(text)).toEqual(expected));
    }

    it('the parser puts it on the node', () => {
        const [node] = parseTemplate('@await ((x as Resource<User[]>) as list) { <p>{{ list }}</p> }');
        expect(node).toMatchObject({ type: 'await', condition: '(x as Resource<User[]>)', as: 'list' });
    });
});

describe('the emitted code', () => {
    const src = (template: string) => `<template>${template}</template>\n<script setup>\n@fetch users: 'GET /api/u' as string[];\n</script>\n`;

    it('calls awaitBlock with the bound name as the body\'s parameter, read as a getter', () => {
        const { code } = compile(src('@await (users as list) { <p>{{ list.length }}</p> } @loading { <i>…</i> }'), 'a.pdx', [], undefined, {});
        expect(code).toMatch(/awaitBlock\(\(\)=>ctx\.users,\(list\)=>\{/);
        expect(code).toContain('list().length');
        expect(code, 'the alpha switch is still emitted').not.toMatch(/awaitReady|awaitTimed|errorBoundary/);
    });

    it('passes the error branch and the timing', () => {
        const { code } = compile(src('@await (users) { minMs: 200, maxMs: 4000 } { <p>ok</p> } @error (e, again) { <b>{{ e.message }}</b> }'), 'b.pdx', [], undefined, {});
        expect(code).toMatch(/,\(e,again\)=>\{[^]*\},\{minMs:200,maxMs:4000\}\);/);
    });
});

describe('PDX_AWAIT_TIMING', () => {
    const timing = (opts: string) => compile(
        `<template>@await (users) { ${opts} } { <p>ok</p> } @loading { <i>…</i> }</template>\n<script setup>\n@fetch users: 'GET /api/u' as string[];\n</script>\n`,
        't.pdx', [], undefined, {},
    ).warnings.filter((w) => w.code === 'PDX_AWAIT_TIMING');

    it('is an error when maxMs is not greater than minMs', () => {
        expect(timing('minMs: 500, maxMs: 300').map((w) => w.severity)).toEqual(['error']);
        expect(timing('minMs: 300, maxMs: 300')).toHaveLength(1);
    });

    it('control — a timeout later than the delay, or either one alone, is fine', () => {
        expect(timing('minMs: 300, maxMs: 5000')).toEqual([]);
        expect(timing('maxMs: 300')).toEqual([]);
        expect(timing('minMs: 300')).toEqual([]);
    });

    it('is found inside another block', () => {
        const r = compile("<template>@if (on) { @await (users) { minMs: 9, maxMs: 1 } { <p>ok</p> } @loading { <i>…</i> } }</template>\n<script setup>\nlet on = $signal(true);\n@fetch users: 'GET /api/u' as string[];\n</script>\n", 'n.pdx', [], undefined, {});
        expect(r.warnings.filter((w) => w.code === 'PDX_AWAIT_TIMING')).toHaveLength(1);
    });
});

describe('pdx migrate: @await (x as T)', () => {
    const pdx = (template: string, script = '') => `<template>${template}</template>\n<script setup lang="ts">\n${script}\n</script>\n`;

    it('parenthesises an alpha assertion to a type, and leaves the beta binding alone', () => {
        const text = pdx(
            '@await (p as Promise<User[]>) { <a/> }\n@await (data as User) { <b/> }\n@await (users as list) { <c/> }',
            "interface User { id: number }\nlet p = $signal(load());\nlet data = $signal(null);\n@fetch users: 'GET /api/u' as User[];",
        );
        expect(awaitAsAssertion.detect(text).map((f) => f.found)).toEqual(['@await (data as User)']);
        const fixed = fix(awaitAsAssertion, text);
        expect(fixed).toContain('@await ((data as User)) { <b/> }');
        expect(fixed, 'a binding was rewritten into an assertion').toContain('@await (users as list) { <c/> }');
        expect(awaitAsAssertion.detect(fixed), 'a second run would change it again').toEqual([]);
    });

    it('knows a primitive and an imported type', () => {
        const text = pdx('@await (v as string) { <a/> }\n@await (r as Row) { <b/> }', "import type { Row } from './rows';");
        expect(awaitAsAssertion.detect(text)).toHaveLength(2);
    });

    it('flags every @await with maxMs', () => {
        const text = pdx("@await (users) { maxMs: 3000 } { <a/> }\n@await (users) { minMs: 100 } { <b/> }", "@fetch users: 'GET /api/u' as string[];");
        expect(awaitMaxMs.detect(text).map((f) => f.line)).toEqual([1]);
        expect(awaitMaxMs.fix).toBe('flag');
    });

    it('flags an operand that is neither a declared source nor promise-typed', () => {
        const text = pdx(
            '@await (users) { <a/> }\n@await (p) { <b/> }\n@await (ready) { <c/> }\n@await (count > 0) { <d/> }',
            "@fetch users: 'GET /api/u' as string[];\nconst p: Promise<number> = load();\nlet ready = $signal(false);\nlet count = $signal(0);",
        );
        expect(awaitPlainValue.detect(text).map((f) => f.found)).toEqual(['@await (ready)', '@await (count > 0)']);
        expect(awaitPlainValue.fix).toBe('flag');
    });
});
