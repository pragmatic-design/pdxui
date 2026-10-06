// `pdx check --fix`, the fixes in `--json`, and `--max-warnings`.
//
// A fix is a set of edits at positions, not a find-and-replace on the first occurrence of a string,
// which with two `let count = 0` in different scopes would rewrite whichever came first. `--json`
// shows the fix, not only `fixable: true`, and after `--fix` the report lists what is left.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import checkCmd from '../src/commands/check';
import { applyFixes } from '../src/commands/check-fix';

interface JsonReport {
    files: {
        file: string;
        fixed: { code: string; title: string }[];
        warnings: {
            code: string;
            fixable: boolean;
            fix?: { title: string; edits: { start: number; end: number; newText: string; line: number; column: number; endLine: number; endColumn: number }[] };
        }[];
    }[];
    summary: { fixed: number; warnings: number };
}

// `count` is read by the template and declared twice: inside reset() — another variable — and at
// the top, the component's own. The fix is for the top one.
const TWO_COUNTS = [
    '<template><p>{{ count }}</p></template>',
    '<script setup>',
    'function reset() {',
    '  let count = 0;',
    '  return count;',
    '}',
    'let count = 0;',
    '</script>',
    '',
].join('\n');

describe('pdx check --fix and --json', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-fix-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    async function check(extra: Record<string, unknown> = {}): Promise<JsonReport> {
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, ...extra } });
        const printed = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'));
        expect(printed, 'check printed no JSON report').toBeTruthy();
        return JSON.parse(printed!);
    }

    it('--fix rewrites the declaration the finding is about, not the first one that looks like it', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        await check({ fix: true });
        const after = readFileSync(join(root, 'counter.pdx'), 'utf-8').split('\n');
        expect(after[3], 'the variable inside reset() was rewritten').toBe('  let count = 0;');
        expect(after[6]).toBe('let count = $signal(0);');
    });

    it('--json shows the fix itself: its title and its edits, with offsets and positions', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        const report = await check();
        const w = report.files.flatMap((f) => f.warnings).find((x) => x.code === 'PDX_NON_REACTIVE');
        expect(w?.fixable).toBe(true);
        expect(w?.fix?.title).toBe("Declare 'count' with $signal");
        // `let count = 0;` on line 7: `$signal(` before the `0` (column 13), `)` after it (column 14).
        expect(w?.fix?.edits.map((e) => [e.newText, e.line, e.column])).toEqual([['$signal(', 7, 13], [')', 7, 14]]);
        const start = TWO_COUNTS.lastIndexOf('= 0;') + 2;
        expect(w?.fix?.edits[0]).toMatchObject({ start, end: start });
    });

    // A template written on the `<template>` line: the finding's column is the file's, so the fix
    // that reads the text at it applies. Counted from the template's start, it would be ten
    // characters early, and the fix absent.
    it('--json carries the fix for a finding on the <template> line', async () => {
        writeFileSync(join(root, 'badge.pdx'), '<template><div class="${tone}">x</div></template>\n<script setup>\nlet tone = $signal(\'info\');\n</script>\n');
        const report = await check();
        const w = report.files.flatMap((f) => f.warnings).find((x) => x.code === 'PDX_RAW_INTERPOLATION');
        expect(w?.fix?.edits.map((e) => e.newText).join(''), 'no fix for the one-line template').toContain(':class="tone"');
    });

    it('--json --fix reports the file after fixing: the fix under fixed, not under warnings', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        const report = await check({ fix: true });
        const file = report.files.find((f) => f.file.endsWith('counter.pdx'))!;
        expect(file.fixed).toEqual([{ code: 'PDX_NON_REACTIVE', title: "Declare 'count' with $signal" }]);
        expect(file.warnings.map((w) => w.code), 'the report still lists the warning it fixed').not.toContain('PDX_NON_REACTIVE');
        expect(report.summary.fixed).toBe(1);
    });

    it('--max-warnings 0 exits 1 on a file with only warnings', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        const report = await check({ 'max-warnings': '0' });
        expect(report.summary.warnings).toBeGreaterThan(0);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('without --max-warnings, warnings alone do not fail', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        await check();
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('--max-warnings above the count does not fail', async () => {
        writeFileSync(join(root, 'counter.pdx'), TWO_COUNTS);
        await check({ 'max-warnings': '50' });
        expect(exitSpy).not.toHaveBeenCalled();
    });
});

// The loop an agent runs — check, fix, check — on one instance of each common mistake.
describe('the agent loop: check --json --fix, then check --json', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-loop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(root, { recursive: true });
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    const MISTAKES = ['PDX_RAW_INTERPOLATION', 'PDX_RAW_INTERPOLATION_IN_BINDING', 'PDX_UNKNOWN_PROP', 'PDX_PROP_NAME_CASE', 'PDX_EVENT_NAME_CASE', 'PDX_UNRESOLVED_COMPONENT', 'PDX_NON_REACTIVE'];

    async function codes(fix: boolean): Promise<string[]> {
        logSpy.mockClear();
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix, severity: 'info', i18n: false } });
        const printed = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'));
        const report: JsonReport = JSON.parse(printed!);
        return report.files.flatMap((f) => f.warnings.map((w) => w.code));
    }

    // Three mistakes the editor and the dev server report, and `pdx check` must report too.
    it('reports an undeclared name, a misspelt handler and an invalid enum value', async () => {
        writeFileSync(join(root, 'fresh.pdx'), [
            '<template>',
            '  <p>{{ missingThing }}</p>',
            '  <button @click="incremnt">+</button>',
            `  <pdx-button :size="'huge'">b</pdx-button>`,
            '</template>',
            '<script setup>',
            'let count = $signal(0);',
            'function increment() { count++; }',
            '</script>',
            '',
        ].join('\n'));
        logSpy.mockClear();
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false } });
        const report: { files: { warnings: { code: string; message: string; line?: number; fix?: unknown }[] }[] } =
            JSON.parse(logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'))!);
        const found = report.files.flatMap((f) => f.warnings).map((w) => `${w.code} ${w.line} ${w.message.split('.')[0]}`);
        expect(found).toEqual(expect.arrayContaining([
            "PDX_UNDECLARED_REF 2 'missingThing' is used in the template but is not declared in <script setup>",
            "PDX_UNDECLARED_REF 3 'incremnt' is used in the template but is not declared in <script setup>",
            'PDX_INVALID_ENUM_VALUE 4 <pdx-button> size="huge" is not a declared value for "size"',
        ]));
        expect(exitSpy, 'an undeclared name is an error: check fails').toHaveBeenCalledWith(1);
    });

    it('one of each mistake: the first check reports them all, after --fix none is left', async () => {
        writeFileSync(join(root, 'scaffold.pdx'), [
            '<template>',
            '  <p title="${a}">x</p>',
            '  <p>${b}</p>',
            '  <p :title="${c}">y</p>',
            '  <pdx-button :variantt="a">go</pdx-button>',
            '  <pdx-app-layout :withborder="on"></pdx-app-layout>',
            '  <pdx-buton>z</pdx-buton>',
            '  <button @click="save">{{ total }}</button>',
            '</template>',
            '<script setup>',
            "let a = $signal('primary');",
            'let b = $signal(1);',
            'let c = $signal(2);',
            'let on = $signal(true);',
            'let total = 0;',
            '@event savedItem: number;',
            'function save() { total = total + 1; savedItem(total); }',
            '</script>',
            '',
        ].join('\n'));

        // The two found while generating code are not there yet: the `${c}` in a bound value stops the
        // compile, and they appear once it is fixed. --fix goes round until nothing is left to apply.
        const generated = ['PDX_UNKNOWN_PROP', 'PDX_PROP_NAME_CASE'];
        const before = await codes(false);
        expect(MISTAKES.filter((c) => !generated.includes(c) && !before.includes(c)), `the scaffold does not produce these: ${before.join(', ')}`).toEqual([]);

        await codes(true);
        const after = await codes(false);
        expect(MISTAKES.filter((c) => after.includes(c)), `left after --fix: ${after.join(', ')}`).toEqual([]);
    });
});

describe('applyFixes', () => {
    const fix = (code: string, edits: { start: number; end: number; newText: string }[]) => ({ code, fix: { title: code, edits } });

    it('applies edits from the end backwards, so earlier offsets still hold', () => {
        const r = applyFixes('abcdef', [fix('A', [{ start: 1, end: 2, newText: 'XX' }]), fix('B', [{ start: 4, end: 5, newText: 'Y' }])]);
        expect(r.source).toBe('aXXcdYf');
        expect(r.applied.map((f) => f.code)).toEqual(['A', 'B']);
    });

    it('refuses a fix that overlaps one already accepted, whole', () => {
        const r = applyFixes('abcdef', [fix('A', [{ start: 1, end: 3, newText: 'X' }]), fix('B', [{ start: 2, end: 4, newText: 'Y' }, { start: 5, end: 6, newText: 'Z' }])]);
        expect(r.source).toBe('aXdef');
        expect(r.refused.map((f) => f.code)).toEqual(['B']);
    });

    it('refuses a fix whose own edits overlap, or fall outside the text', () => {
        const r = applyFixes('abc', [
            fix('SELF', [{ start: 0, end: 2, newText: 'x' }, { start: 1, end: 3, newText: 'y' }]),
            fix('OUT', [{ start: 2, end: 9, newText: 'z' }]),
        ]);
        expect(r.source).toBe('abc');
        expect(r.refused.map((f) => f.code)).toEqual(['SELF', 'OUT']);
    });
});
