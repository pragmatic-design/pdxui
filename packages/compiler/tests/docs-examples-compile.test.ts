// Every `pdx` example the site publishes compiles.
//
// A declaration the analyzer does not accept fails the way this compiler fails such a line: in
// silence. `@form user {` needs a colon — `@form user: {` — and `@fetch users: '/api/users'` needs
// the method — `'GET /api/users'`. Without them nothing is emitted, nothing is said, and a page goes
// on building on identifiers that are never created.
//
// A reader copies these. So they are compiled here, as a reader would use them.
//
// A fence is a FRAGMENT: sometimes a script block, sometimes markup, sometimes both. It is assembled
// into the smallest file that carries it, and a failure names the page and the fence. What this
// cannot check is whether the RESULT is right — `user.values` compiles and does not exist (the
// members are asserted separately). This is the floor: it does not compile, nobody can use it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';

const DOCS = join(__dirname, '..', '..', 'site', 'content', 'docs');

interface Fence { page: string; index: number; body: string }

/** Every ```pdx fence of every page, in order, with where it came from. */
function fences(): Fence[] {
    const out: Fence[] = [];
    for (const file of readdirSync(DOCS).filter(f => f.endsWith('.md') && f !== 'api.md')) {
        const text = readFileSync(join(DOCS, file), 'utf-8').replace(/\r\n/g, '\n');
        const re = /```pdx\n([\s\S]*?)```/g;
        let m: RegExpExecArray | null;
        let index = 0;
        while ((m = re.exec(text)) !== null) out.push({ page: file, index: ++index, body: m[1] });
    }
    return out;
}

/**
 * The smallest .pdx that carries a fragment. A fence with a `<script` is a file already, give or
 * take a template; a bare block of declarations is a script; anything else is markup.
 */
function asFile(body: string): string {
    const hasScript = /<script/.test(body);
    const hasTemplate = /<template/.test(body);
    if (hasScript && hasTemplate) return body;
    if (hasScript) {
        const markup = body.slice(0, body.indexOf('<script')).trim();
        const script = body.slice(body.indexOf('<script'));
        return `<template>\n${markup || '<div></div>'}\n</template>\n${script}`;
    }
    const isDeclarations = /^\s*@(form|fetch|store|page|guard|prop|event|title|meta|scroll|slot|loader)\b/m.test(body)
        && !/^\s*</m.test(body.trim());
    if (isDeclarations) return `<template><div></div></template>\n<script setup>\n${body}\n</script>`;
    return `<template>\n${body}\n</template>`;
}

/**
 * `src="./x.ts"` on a block is resolved by the Vite plugin against the file system. The pages teach
 * it, so their fences have to compile — with a stand-in, since the file a doc names does not exist.
 * What the fence is proving is the syntax, not the contents of a file nobody ships.
 */
const resolveStub = (srcPath: string): string =>
    srcPath.endsWith('.css') ? '.stub { color: red; }' : 'let __stub = $signal(0);';

describe('the pdx examples the site publishes', () => {
    const all = fences();

    it('found them', () => {
        expect(all.length, 'no pdx fence found in the docs at all').toBeGreaterThan(30);
    });

    it('every one compiles', () => {
        const broken: string[] = [];
        for (const f of all) {
            try {
                compile(asFile(f.body), `C:/docs/${f.page.replace('.md', '')}-${f.index}.pdx`, [], resolveStub);
            } catch (e) {
                broken.push(`${f.page} fence ${f.index}: ${String(e).split('\n')[0].slice(0, 90)}`);
            }
        }
        expect(broken, 'these published examples do not compile').toEqual([]);
    });

    // Compiling is a weaker claim than it sounds: `compile()` never parses what it emits. A
    // declaration the analyzer does not recognise is passed through as TEXT, so `@meta name 'x' 'y'`
    // ends up verbatim inside `setup(ctx) { … }`. The compile
    // is green and the module does not parse: an app that imports the page dies on a syntax error
    // pointing into generated code. So the emitted module is parsed here too.
    it('every one emits a module that parses', () => {
        const broken: string[] = [];
        for (const f of all) {
            let code: string;
            try {
                code = compile(asFile(f.body), `C:/docs/${f.page.replace('.md', '')}-${f.index}.pdx`, [], resolveStub).code;
            } catch {
                continue; // the compile failure is reported by the test above
            }
            // Strip the module syntax `new Function` cannot take. The compiler emits one import per
            // line, so this is exact, not a guess.
            const body = code.split('\n').filter(l => !/^\s*(import|export)\s/.test(l)).join('\n');
            try {
                new Function(body);
            } catch (e) {
                broken.push(`${f.page} fence ${f.index}: ${(e as Error).message}`);
            }
        }
        expect(broken, 'these published examples compile to a module that does not parse').toEqual([]);
    });

    it('a declaration the analyzer cannot read is not left as a silent no-op', () => {
        // The failure mode: the line compiles fine and wires nothing.
        // Compiling is therefore not enough — for these two declarations, the page's
        // example has to actually produce the call it promises.
        // A DECLARATION starts its line: `@fetch` inside a comment is a mention, not a promise.
        const forms = all.filter(f => f.page === 'forms.md' && /^\s*@form\s/m.test(f.body));
        expect(forms.length, 'forms.md declares no form any more').toBeGreaterThan(0);
        for (const f of forms) {
            const code = compile(asFile(f.body), `C:/docs/forms-${f.index}.pdx`, [], resolveStub).code;
            expect(code, `forms.md fence ${f.index} declares a form that emits no createForm`)
                .toMatch(/createForm\(/);
        }
        const fetches = all.filter(f => f.page === 'data.md' && /^\s*@fetch\s/m.test(f.body));
        expect(fetches.length, 'data.md declares no fetch any more').toBeGreaterThan(0);
        for (const f of fetches) {
            const code = compile(asFile(f.body), `C:/docs/data-${f.index}.pdx`, [], resolveStub).code;
            expect(code, `data.md fence ${f.index} declares a fetch that emits no resource`)
                .toMatch(/resource\(/);
        }
    });
});

// ─── compiler.md shows real output, and keeps showing it ─────────────────────────
//
// The page whose whole subject is the declaration→code transform carries a component and the module
// the compiler emits for it. A hand-pasted block is true the day it is pasted: when a rewrite such as
// `$derived` changes, nothing would notice the page going stale.
//
// So the page is held against `compile()`. The published block carries teaching comments the real
// output does not have; everything else must match, token for token.
describe('the output compiler.md publishes', () => {
    const page = readFileSync(join(DOCS, 'compiler.md'), 'utf-8').replace(/\r\n/g, '\n');

    /** Strip the annotations and the whitespace, keep the code. */
    const code = (text: string): string => text
        .split('\n')
        .map(l => l.replace(/^\s*\/\/.*$/, '').replace(/\s{2,}\/\/.*$/, ''))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();

    it('is what the compiler emits for the component shown above it', () => {
        const source = /```pdx\n([\s\S]*?)```/.exec(page);
        const published = /```js\n([\s\S]*?)```/.exec(page);
        expect(source, 'compiler.md no longer opens with a pdx example').not.toBeNull();
        expect(published, 'compiler.md no longer shows the generated module').not.toBeNull();

        const emitted = compile(source![1], 'C:/docs/counter.pdx').code;
        expect(code(published![1]), 'compiler.md shows output the compiler no longer produces')
            .toBe(code(emitted));
    });
});
