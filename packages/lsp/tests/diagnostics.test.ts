// LSP L1 — diagnostics must point at the script declaration, not the first
// textual occurrence (which is often in the template).

import { describe, it, expect } from 'vitest';
import { analyzeDocument } from '../src/utils/compiler-bridge';
import { toDiagnostics } from '../src/capabilities/diagnostics';
import { positionWarnings, validate } from '@pdxui/compiler';

const source = [
    '<template>',
    '  <span>{{ count }}</span>',   // line 1 — 'count' appears here first
    '</template>',
    '<script setup>',               // line 3
    "@prop title: string = 'x';",   // line 4
    'let count = 5;',               // line 5 — the declaration (not $signal)
    '</script>',
].join('\n');

// A template written on the `<template>` line: columns count from the start of the line, not of the
// content — counted from the content, the finding lands ten characters early and misses its `${`.
describe('a finding on the <template> line', () => {
    it('PDX_RAW_INTERPOLATION_IN_BINDING points at the ${ in the file', () => {
        const src = '<template><div :title="${tone}">x</div></template>\n<script setup>\nlet tone = $signal(\'a\');\n</script>\n';
        const w = analyzeDocument(src, 'one-line.pdx').warnings.find(x => x.code === 'PDX_RAW_INTERPOLATION_IN_BINDING');
        expect(w, 'no PDX_RAW_INTERPOLATION_IN_BINDING').toBeDefined();
        expect(w!.line).toBe(1);
        expect(src.split('\n')[0].slice(w!.column! - 1, w!.column! + 1)).toBe('${');
    });
});

describe('diagnostics positioning', () => {
    it('points PDX_NON_REACTIVE at the script declaration, not the template', () => {
        const { warnings, descriptor } = analyzeDocument(source, 'x.pdx');
        const nonReactive = warnings.find(w => w.code === 'PDX_NON_REACTIVE');
        expect(nonReactive, 'expected a PDX_NON_REACTIVE warning for count').toBeTruthy();

        const diags = toDiagnostics(warnings, source, descriptor?.script ?? null);
        const diag = diags.find(d => d.code === 'PDX_NON_REACTIVE')!;
        // Must land on the `let count` line (5), NOT the template line (1).
        expect(diag.range.start.line).toBe(5);
    });

    it('falls back to the script block start (not 0,0) when no name resolves', () => {
        const { descriptor } = analyzeDocument(source, 'x.pdx');
        const diags = toDiagnostics(
            [{ code: 'PDX_X', severity: 'warn', message: 'no name here' }],
            source,
            descriptor?.script ?? null,
        );
        // Script content starts on line 4 (after `<script setup>` on line 3).
        expect(diags[0].range.start.line).toBeGreaterThanOrEqual(3);
    });

    it('uses word boundaries (no substring false match)', () => {
        const src = [
            '<script setup>',
            'let username = 1;',   // contains "name" as a substring
            'let count = 2;',
            '</script>',
        ].join('\n');
        const { descriptor } = analyzeDocument(src, 'y.pdx');
        // The compiler places the finding; the editor draws it where it was placed.
        const placed = positionWarnings(src, [{ code: 'PDX_NON_REACTIVE', severity: 'warn', message: "Variable 'count' is not a signal" }]);
        const diags = toDiagnostics(placed, src, descriptor?.script ?? null);
        // 'count' is on line 2 — must not match inside 'username' on line 1.
        expect(diags[0].range.start.line).toBe(2);
        // ...and the squiggle covers the name: `let count`, characters 4 to 9.
        expect([diags[0].range.start.character, diags[0].range.end.character]).toEqual([4, 9]);
    });

    // An exemption the file declares holds in the editor as in `pdx check`.
    it('does not publish a finding the file exempts with pdx-ignore', () => {
        const withIgnore = [
            '<template>',
            '  <!-- pdx-ignore PDX_RAW_INTERPOLATION: shown as written -->',
            '  <p title="${a}">x</p>',
            '</template>',
            '<script setup>',
            'let a = $signal(1);',
            '</script>',
        ].join('\n');
        const published = (src: string) => {
            const { warnings, descriptor } = analyzeDocument(src, 'i.pdx');
            return toDiagnostics(warnings, src, descriptor?.script ?? null).map((d) => d.code);
        };
        expect(published(withIgnore)).not.toContain('PDX_RAW_INTERPOLATION');
        // The control: the same file without the comment.
        expect(published(withIgnore.replace(/ {2}<!--.*-->\n/, ''))).toContain('PDX_RAW_INTERPOLATION');
    });

    it('draws PDX_UNRESOLVED_COMPONENT on the template line of the tag, not at the script', () => {
        // The audit's probe: tags on template lines 2 and 7 were drawn at the script start.
        const src = [
            '<template>',
            '  <pdx-first></pdx-first>',
            '  <div>',
            '    <p>a</p>',
            '    <p>b</p>',
            '  </div>',
            '  <pdx-second></pdx-second>',
            '</template>',
            '<script setup>',
            'let a = $signal(1);',
            '</script>',
        ].join('\n');
        const { analysis, ast, descriptor } = analyzeDocument(src, 'z.pdx');
        const unresolved = positionWarnings(src, validate(analysis!, ast, 'z.pdx', { isKnownTag: () => false }));
        const lines = toDiagnostics(unresolved, src, descriptor?.script ?? null)
            .filter(d => d.code === 'PDX_UNRESOLVED_COMPONENT')
            .map(d => d.range.start.line + 1);
        expect(lines).toEqual([2, 7]);
    });
});
