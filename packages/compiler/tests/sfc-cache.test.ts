// parseSFC keeps the last source's blocks (#646): one compile parses the same .pdx about fifteen
// times, once in compile() and again in each check of a removed form. Each call still returns blocks
// of its own, because compile() writes into them — an external src='s content, a plugin's script —
// and what one caller writes must never reach the next.

import { describe, it, expect } from 'vitest';
import { parseSFC } from '../src/parser/sfc';
import { compile } from '../src/plugin';

const SOURCE = `<template><p>{{ msg }}</p></template>
<script>let msg = $signal('a');</script>
<style scoped>p { color: red; }</style>
<style>body { margin: 0; }</style>`;

describe('parseSFC returns blocks of its own on every call (#646)', () => {
    it('a write into one result does not reach the next parse of the same source', () => {
        const first = parseSFC(SOURCE);
        first.script!.content = 'written';
        first.template!.content = 'written';
        first.styles[0].content = 'written';
        first.styles.push({ ...first.styles[1] });
        first.template = null;

        const second = parseSFC(SOURCE);
        expect(second.script!.content).toBe("let msg = $signal('a');");
        expect(second.template!.content).toBe('<p>{{ msg }}</p>');
        expect(second.styles.map(s => s.content)).toEqual(['p { color: red; }', 'body { margin: 0; }']);
    });

    it('style is still the first of styles, in each result', () => {
        const d = parseSFC(SOURCE);
        expect(d.style).toBe(d.styles[0]);
    });

    it('errors are copied too', () => {
        const broken = '<template><p></p></template>\n<script>let x = 1;';
        const first = parseSFC(broken);
        expect(first.errors).toHaveLength(1);
        first.errors!.push('written');
        expect(parseSFC(broken).errors).toHaveLength(1);
    });

    it('another source is parsed anew, and the first again after it', () => {
        const other = '<template><b></b></template>';
        expect(parseSFC(SOURCE).template!.content).toBe('<p>{{ msg }}</p>');
        expect(parseSFC(other).template!.content).toBe('<b></b>');
        expect(parseSFC(other).script).toBeNull();
        expect(parseSFC(SOURCE).template!.content).toBe('<p>{{ msg }}</p>');
    });

    it('a plugin\'s script reaches its own compile, not the next one of the same .pdx', () => {
        // compile() writes a plugin's transformed script into the descriptor: shared blocks would
        // hand it to the next compile, which has no plugin.
        const pdx = "<template><p>{{ label }}</p></template>\n<script>let label = $signal('written');</script>";
        const plugin = { name: 'rename', transformScript: (s: string) => s.replace("'written'", "'transformed'") };
        const one = compile(pdx, 'plugged.pdx', [plugin]);
        const two = compile(pdx, 'plugged.pdx');
        expect(one.code).toContain("'transformed'");
        expect(two.code).toContain("'written'");
        expect(two.code).not.toContain("'transformed'");
    });

    it('compile() reads an external script anew each time, though the .pdx is the same', () => {
        const pdx = '<template><p>{{ label }}</p></template>\n<script src="./logic.ts" />';
        const one = compile(pdx, 'ext.pdx', undefined, () => "let label = $signal('first');");
        const two = compile(pdx, 'ext.pdx', undefined, () => "let label = $signal('second');");
        expect(one.code).toContain("'first'");
        expect(two.code).toContain("'second'");
    });
});
