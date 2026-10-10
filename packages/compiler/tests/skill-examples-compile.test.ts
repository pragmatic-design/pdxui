// Every .pdx example in the skills compiles.
//
// The skills are what an agent reads BEFORE it writes a .pdx, so a wrong example is copied, not
// read — `@for (job of jobs(); …)`, which the parser rejects, reaches an app that way. Checking that
// names are exported does not show that the examples run.
//
// This extracts every fenced ```html / ```pdx block that contains a .pdx construct from
// marketplace/plugins/*/skills/**/*.md, compiles it with the real compiler, and parses the output.
// A block that is deliberately partial says so in its fence (```html partial) and is skipped — and
// counted, so the skip list cannot grow in silence. The number compiled is asserted exactly: an
// extractor that finds nothing cannot pass, and a new example has to be counted in on purpose.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compile } from '../src/plugin';

const PLUGINS = join(__dirname, '..', '..', '..', 'marketplace', 'plugins');

/** A .pdx construct: a block directive, or an SFC block. */
const PDX_CONSTRUCT = /@for\b|@if\b|@try\b|@await\b|@switch\b|@defer\b|<script setup>|<template[\s>]/;

interface Example { where: string; lang: string; partial: boolean; code: string }

function skillFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) skillFiles(p, out);
        else if (p.endsWith('.md') && /[\\/]skills[\\/]/.test(p)) out.push(p);
    }
    return out;
}

function examples(): Example[] {
    const found: Example[] = [];
    // Match: a fence at column 0, its info string, the body, the closing fence.
    // Groups: [1]=info string (lang + meta) [2]=body
    const FENCE = /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm;
    for (const file of skillFiles(PLUGINS)) {
        const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        // A topic skill's copy of a site docs page: its fences are compiled at the
        // source, by docs-examples-compile.test.ts, which knows how a docs fragment is assembled.
        if (text.startsWith('<!-- Copied from packages/site/content/docs/')) continue;
        for (const m of text.matchAll(FENCE)) {
            const [lang = '', ...meta] = m[1].trim().split(/\s+/);
            if (lang !== 'html' && lang !== 'pdx') continue;
            if (!PDX_CONSTRUCT.test(m[2])) continue;
            const line = text.slice(0, m.index).split('\n').length;
            found.push({ where: `${relative(PLUGINS, file).replace(/\\/g, '/')}:${line}`, lang, partial: meta.includes('partial'), code: m[2] });
        }
    }
    return found;
}

/**
 * The `src=` example names files that do not exist: stand in for them by extension, so what is
 * compiled is the example's own shape (three self-closing blocks) with minimal real contents.
 */
const resolveFile = (src: string): string =>
    src.endsWith('.html') ? '<p class="n">{{ n }}</p>'
        : src.endsWith('.css') ? 'p { margin: 0; }'
            : 'let n = $signal(0);';

/** A full SFC compiles as is; a template fragment is wrapped in one. */
function asSfc(code: string): string {
    if (/<template[\s>]/i.test(code) || /<script[\s>]/i.test(code)) return code;
    return `<template>\n${code}\n</template>`;
}

const ALL = examples();
const COMPILED = ALL.filter(e => !e.partial);
const SKIPPED = ALL.filter(e => e.partial);

describe('the .pdx examples in the skills', () => {
    it('are found — the number is asserted, so a broken extractor cannot pass', () => {
        // 6 + the long-form recipe + the timed @await
        // + the cell/format columns, counted twice: once in tools/notes/pdx-data-grid.md,
        // the source, and once in the pdxui-data page the generator writes from it
        // + the "do not leave with unsaved work" page
        // + the @await retry by a new promise in the signal
        // + a route reading its params, and a form with its own validator
        // + the page with a «simulate failure» switch over a hand-written transport
        // + the day agenda per resource
        // + an error decided by code, with show-error, counted twice: in
        // tools/notes/pdx-form-field.md and in the pdxui-forms page written from it.
        // + a form section in its own .pdx injecting the form with useForm(): the framework does
        // not pass `form` down as a prop — `<pdx-form>` provides it and the child injects.
        // + the component pages' examples from the demos that use a block directive:
        // pdx-checkbox and pdx-chip (@for/@if), and pdx-error-boundary's two @try blocks.
        expect(COMPILED.map(e => e.where)).toHaveLength(23);
    });

    it('skips only what says it is partial — and nothing does today', () => {
        expect(SKIPPED.map(e => e.where)).toEqual([]);
    });

    for (const [i, ex] of COMPILED.entries()) {
        it(`compiles and produces valid JS — ${ex.where}`, () => {
            let code = '';
            expect(() => { code = compile(asSfc(ex.code), `skill-example-${i}.pdx`, [], resolveFile).code; }, `${ex.where} does not compile`).not.toThrow();
            const body = code.replace(/^import .*$/gm, '');
            expect(() => new Function(body), `${ex.where} compiles to invalid JS:\n${body}`).not.toThrow();
        });
    }
});
