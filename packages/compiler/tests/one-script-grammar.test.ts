// One script grammar (#158): a `<script>` is read for declarations and runes whatever it contains, so
// the same code under `<script>` and `<script setup>` compiles to the same module. Before, a plain
// `<script>` without a rune fell into the legacy mode: no auto-return, the template reading undefined.
import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { scriptSetup } from '../src/language/script-setup';

const BODY = `
import { makeSource } from './mock';
const label = 'from the script';
const rows = makeSource();
function reload() { rows.refresh(); }
onMount(() => reload());
`;

const file = (open: string) => `<template><p>{{ label }}</p></template>\n${open}${BODY}</script>`;

describe('one script grammar', () => {
    it('compiles the same script under <script> and <script setup> to the same module', () => {
        const plain = compile(file('<script>'), 'same.pdx').code;
        const setup = compile(file('<script setup>'), 'same.pdx').code;
        expect(plain).toBe(setup);
    });

    it('a plain <script> with no rune returns its declarations and imports onMount', () => {
        const code = compile(file('<script>'), 'plain.pdx').code;
        expect(code).toMatch(/import \{[^}]*\bonMount\b[^}]*\} from '@pdxui\/core'/);
        expect(code).toMatch(/return \{[^}]*\blabel\b/);
    });

    it('reads any script declaratively: a top-level const reaches the template', () => {
        expect(analyzeScript(`const label = 'x';`, 'plain.pdx').exports.map((e) => e.name)).toContain('label');
    });
});

describe('pdx migrate: <script setup> → <script>', () => {
    it('drops setup from the script tag, keeping its other attributes', () => {
        expect(scriptSetup.fix === 'flag').toBe(false);
        const fix = scriptSetup.fix as (t: string) => string;
        expect(fix(file('<script setup>'))).toBe(file('<script>'));
        expect(fix('<template><p/></template>\n<script setup lang="js">\nlet a = 1;\n</script>'))
            .toBe('<template><p/></template>\n<script lang="js">\nlet a = 1;\n</script>');
        expect(fix('<script lang="ts" setup src="./x.ts" />')).toBe('<script lang="ts" src="./x.ts" />');
    });

    it('finds the tag at its line, and the rewritten file compiles to the same module', () => {
        const before = file('<script setup>');
        expect(scriptSetup.detect(before)).toEqual([{ line: 2, found: '<script setup>' }]);
        const after = (scriptSetup.fix as (t: string) => string)(before);
        expect(scriptSetup.detect(after), 'not idempotent').toEqual([]);
        expect(compile(after, 'm.pdx').code).toBe(compile(before, 'm.pdx').code);
    });

    it('control — the word setup elsewhere is not the attribute', () => {
        const text = '<template><p>setup</p></template>\n<script>\nconst setup = 1;\n</script>';
        expect(scriptSetup.detect(text)).toEqual([]);
        expect((scriptSetup.fix as (t: string) => string)(text)).toBe(text);
    });
});
