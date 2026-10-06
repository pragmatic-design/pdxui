// `pdx check` and `pdx-ignore`: an exemption silences the finding it names and is
// counted in `summary.ignored`; one that silences nothing is PDX_IGNORE_UNUSED.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import checkCmd from '../src/commands/check';

interface Report {
    files: { file: string; warnings: { code: string; line?: number }[] }[];
    summary: { ignored: number; warnings: number };
}

describe('pdx check honours pdx-ignore', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-ignore-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
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

    async function check(): Promise<Report> {
        process.chdir(root);
        // `--design`: the swatch's colour literal is a design-review finding.
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'info', i18n: false, design: true } });
        return JSON.parse(logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'))!);
    }

    const swatch = (comment: string) => [
        '<template><div class="swatch">red</div></template>',
        '<script setup>',
        'let a = $signal(1);',
        '</script>',
        '<style scoped>',
        '.swatch {',
        comment,
        '  background: #e11d48;',
        '}',
        '</style>',
        '',
    ].join('\n');

    it('a colour literal exempted as a swatch: not reported, and counted in summary.ignored', async () => {
        writeFileSync(join(root, 'palette.pdx'), swatch('  /* pdx-ignore PDX_COLOUR_LITERAL: swatch */'));
        const report = await check();
        const codes = report.files.flatMap((f) => f.warnings.map((w) => w.code));
        expect(codes).not.toContain('PDX_COLOUR_LITERAL');
        expect(codes).not.toContain('PDX_IGNORE_UNUSED');
        expect(report.summary.ignored).toBe(1);
    });

    it('the control: without the comment, the literal is reported', async () => {
        writeFileSync(join(root, 'palette.pdx'), swatch('  /* a swatch */'));
        const report = await check();
        expect(report.files.flatMap((f) => f.warnings.map((w) => w.code))).toContain('PDX_COLOUR_LITERAL');
        expect(report.summary.ignored).toBe(0);
    });

    it('an exemption that silences nothing is PDX_IGNORE_UNUSED, at its line', async () => {
        writeFileSync(join(root, 'stale.pdx'), [
            '<template>',
            '  <!-- pdx-ignore PDX_RAW_INTERPOLATION: was needed once -->',
            '  <p>x</p>',
            '</template>',
            '<script setup>',
            'let a = $signal(1);',
            '</script>',
            '',
        ].join('\n'));
        const report = await check();
        const unused = report.files.flatMap((f) => f.warnings).filter((w) => w.code === 'PDX_IGNORE_UNUSED');
        expect(unused.map((w) => w.line)).toEqual([2]);
    });

    it('an exemption without a reason is an error, and check fails', async () => {
        writeFileSync(join(root, 'bare.pdx'), swatch('  /* pdx-ignore PDX_COLOUR_LITERAL */'));
        const report = await check();
        const codes = report.files.flatMap((f) => f.warnings.map((w) => w.code));
        expect(codes).toContain('PDX_IGNORE_WITHOUT_REASON');
        expect(codes, 'no reason, no exemption').toContain('PDX_COLOUR_LITERAL');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});
