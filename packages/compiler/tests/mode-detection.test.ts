// C3 — compilation-mode detection must ignore non-code (comments/strings).
// A @prop or $signal( appearing only inside a comment or string literal must NOT
// flip an otherwise-legacy component into new mode (which auto-exposes top-level
// declarations and changes codegen, breaking the component).

import { describe, it, expect } from 'vitest';
import { analyzeScript } from '../src/compiler/script-analyzer';
import { compile } from '../src/plugin';

const legacyBody = `const props = defineProps({ label: { type: String } });
const count = signal(0);
return { count };`;

describe('C3 — mode detection ignores non-code', () => {
    it('baseline: a plain legacy file auto-exposes nothing', () => {
        const base = analyzeScript(legacyBody, 'a.pdx');
        expect(base.exports.length).toBe(0);
    });

    it('$signal() inside a line comment does not flip to new mode', () => {
        const withComment = analyzeScript('// example: let n = $signal(0)\n' + legacyBody, 'b.pdx');
        expect(withComment.exports.length).toBe(0);
    });

    it('@prop inside a string literal does not flip to new mode', () => {
        const withString = analyzeScript('const hint = "use @prop name: T";\n' + legacyBody, 'c.pdx');
        expect(withString.exports.length).toBe(0);
    });

    it('$signal() inside a block comment does not flip to new mode', () => {
        const withBlock = analyzeScript('/* docs: let n = $signal(0) */\n' + legacyBody, 'd.pdx');
        expect(withBlock.exports.length).toBe(0);
    });

    it('still detects genuine new mode', () => {
        const a = analyzeScript(`@prop label: string = 'x';\nlet count = $signal(0);`, 'e.pdx');
        expect(a.signals.length).toBeGreaterThan(0);
    });
});

// `<script setup>` IS the new mode, whatever it contains.
//
// Decided by content alone, a setup block with no rune — imports, consts, functions, an onMount —
// would compile in the legacy mode, silently: no auto-return (every const the template binds
// arrives undefined) and onMount not imported (ReferenceError at setup). Content detection stays
// for a plain `<script>`.
describe('<script setup> compiles in the new mode', () => {
    const noRune = `<template><p>{{ label }}</p></template>
<script setup>
import { makeSource } from './mock';
const label = 'from setup';
const rows = makeSource();
function reload() { rows.refresh(); }
onMount(() => reload());
</script>`;

    it('a setup block with no rune returns its top-level declarations and imports onMount', () => {
        const code = compile(noRune, 'no-rune.pdx').code;
        expect(code, 'onMount is used but not imported').toMatch(/import \{[^}]*\bonMount\b[^}]*\} from '@pdxui\/core'/);
        expect(code, 'the setup returns nothing — the template reads undefined').toMatch(/return \{[^}]*\blabel\b/);
        expect(code).toMatch(/return \{[^}]*\brows\b/);
        expect(code).toMatch(/return \{[^}]*\breload\b/);
    });

    it('an empty setup block still registers the component', () => {
        const code = compile(`<template><p>hi</p></template>\n<script setup>\n\n</script>`, 'empty-setup.pdx').code;
        expect(code).toContain("component('pdx-empty-setup'");
    });

    it('control — a plain <script> with defineProps still compiles in the legacy mode', () => {
        const code = compile(`<template><p>{{ label }}</p></template>
<script>
const props = defineProps({ label: { type: String } });
</script>`, 'plain-legacy.pdx').code;
        expect(code).toContain('props: { label: { type: String } }');
        expect(code, 'the legacy mode has no auto-return').not.toMatch(/return \{/);
    });

    it('control — a <script setup> carrying the legacy mode\'s own markers stays legacy', () => {
        // defineProps / defineEmits / a top-level `return {` are the legacy syntax; the backward-
        // compatibility tests write them inside <script setup>, and they must keep compiling as before.
        expect(analyzeScript(`const props = defineProps({ a: { type: String } });`, 'a.pdx', { setup: true }).mode).toBe('legacy');
        expect(analyzeScript(`const emit = defineEmits<{ save: void }>();`, 'b.pdx', { setup: true }).mode).toBe('legacy');
        expect(analyzeScript(`let count = 0;\nreturn { count };`, 'c.pdx', { setup: true }).mode).toBe('legacy');
        // …but a `return {` inside a function is not that marker.
        expect(analyzeScript(`function pick() {\n  return { a: 1 };\n}`, 'd.pdx', { setup: true }).mode).toBe('new');
    });

    it('control — analyzeScript without the setup flag keeps detecting by content', () => {
        expect(analyzeScript(`const label = 'x';`, 'plain.pdx').mode).toBe('legacy');
        expect(analyzeScript(`const label = 'x';`, 'setup.pdx', { setup: true }).mode).toBe('new');
    });
});
