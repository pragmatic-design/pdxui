// What a compiled setup returns (#1289). Core copies the returned object onto the component's context
// at every mount (`Object.assign(ctx, result)`), and the render, the host's bindings and the snippets
// read the names they need off it. In a build the setup returns only those: pdx-wizard returned all 30
// of its names to a `<slot>` that reads none, and mounted 1.20x its TypeScript version for it. In
// development it returns every name, which HMR's save and restore and the devtools read (#298).

import { describe, it, expect } from 'vitest';
import { compileSFC } from '../src/compiler/codegen';
import { parseSFC } from '../src/parser/sfc';
import { parseTemplate } from '../src/parser/template';

function setupReturn(source: string, production: boolean): string[] {
    const descriptor = parseSFC(source);
    const code = compileSFC(descriptor, parseTemplate(descriptor.template!.content), 'test.pdx', null, { production });
    // Match: the setup's `return { a: __a, f };` — the last return of the setup, before `},` and render.
    // Groups: [1]=the entries
    const m = /return \{ ([^}]*) \};\s*\n\s*\},?\s*\n?\s*render/.exec(code);
    if (!m) return [];
    return m[1].split(',').map((e) => e.trim().split(':')[0]).filter(Boolean);
}

const pdx = (template: string, script: string) => `<template>${template}</template>\n<script>\n${script}\n</script>`;

describe('a setup returns what the code outside it reads (#1289)', () => {
    const script = 'let shown = $signal(0);\nlet count = $signal(0);\nfunction bump() { count++; }\nonMount(bump);';

    it('in a build, only the names the render reads', () => {
        expect(setupReturn(pdx('<p>{{ shown }}</p>', script), true)).toEqual(['shown']);
    });

    it('in development, every name: HMR and the devtools read them', () => {
        expect(setupReturn(pdx('<p>{{ shown }}</p>', script), false)).toEqual(['shown', 'count', 'bump']);
    });

    it('a name only a handler of the template reads is kept', () => {
        expect(setupReturn(pdx('<button @click="bump">{{ shown }}</button>', script), true)).toEqual(['shown', 'bump']);
    });

    it('a name only @host reads is kept', () => {
        const host = `${script}\n@host { :data-count="count" }`;
        expect(setupReturn(pdx('<p>{{ shown }}</p>', host), true)).toEqual(['shown', 'count']);
    });

    it('a name only a script @snippet reads is kept', () => {
        const snippet = `${script}\n@snippet total() { <b>{{ count }}</b> }`;
        expect(setupReturn(pdx('<p>{{ shown }}</p>@render total()', snippet), true)).toContain('count');
    });

    it('a template that reads nothing returns nothing', () => {
        expect(setupReturn(pdx('<slot></slot>', script), true)).toEqual([]);
    });
});
