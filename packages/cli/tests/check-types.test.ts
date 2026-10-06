// `pdx check --types`: the editor's type-check, headless, for agents and CI.
//
// A .pdx script calls the emitter `@event saved: number` declares with a string. The editor
// underlines it; `pdx check` alone runs the compiler's validators and no TypeScript, and lets it
// through. With `--types` it is a PDX_TS error at that line, and without it the check is unchanged.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, relative } from 'path';
import { tmpdir } from 'os';
import checkCmd from '../src/commands/check';

const WIDGET = [
    '<template><button @click="fire()">{{ label }}</button></template>',
    '<script setup>',
    "@prop label: string = 'Save';",
    '@event saved: number;',
    "function fire() { saved('no'); }",
    '</script>',
    '',
].join('\n');

interface Finding { code: string; severity: string; message: string; line?: number; tsCode?: number }

describe('pdx check --types', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-types-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(join(root, 'src'), { recursive: true });
        writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app' }));
        writeFileSync(join(root, 'src', 'widget.pdx'), WIDGET);
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.chdir(root);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
        rmSync(root, { recursive: true, force: true });
    });

    async function check(types: boolean): Promise<{ findings: Finding[]; errors: number }> {
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, design: false, types } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        const report = JSON.parse(printed!) as { files: { warnings: Finding[] }[]; summary: { errors: number } };
        return { findings: report.files.flatMap(f => f.warnings), errors: report.summary.errors };
    }

    it('reports the type error the editor shows, as a PDX_TS error at its line', async () => {
        const { findings, errors } = await check(true);
        const ts = findings.filter(f => f.code === 'PDX_TS');

        expect(ts).toHaveLength(1);
        expect(ts[0]).toMatchObject({ severity: 'error', line: 5, tsCode: 2345 });
        expect(ts[0].message).toContain("'string' is not assignable to parameter of type 'number'");
        expect(errors).toBeGreaterThanOrEqual(1);
        expect(exitSpy, 'a type error must fail the check').toHaveBeenCalledWith(1);
    }, 60_000);

    it('without --types, the check is unchanged', async () => {
        const { findings } = await check(false);
        expect(findings.filter(f => f.code === 'PDX_TS')).toEqual([]);
        expect(exitSpy).not.toHaveBeenCalledWith(1);
    });

    it('on the showcase, reports what the editor reports: nothing', async () => {
        // The editor opens every showcase .pdx and finds no type error (packages/lsp/tests/
        // showcase-sweep). The check and the editor must not disagree:
        // same projection, same declarations, same mapping.
        const showcase = join(__dirname, '..', '..', 'showcase');
        process.chdir(showcase);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'error', i18n: false, design: false, types: true } });
        const printed = logSpy.mock.calls.map(c => String(c[0])).find(s => s.trimStart().startsWith('{'));
        const report = JSON.parse(printed!) as { files: { file: string; warnings: Finding[] }[] };
        const found = report.files.flatMap(f => f.warnings.filter(w => w.code === 'PDX_TS')
            .map(w => `${relative(showcase, f.file).split('\\').join('/')} ts(${w.tsCode}) ${w.message.split('\n')[0]}`));
        expect(found).toEqual([]);
    }, 120_000);

    it('a pdx-ignore exemption covers a PDX_TS finding too', async () => {
        writeFileSync(join(root, 'src', 'widget.pdx'), WIDGET.replace("function fire() { saved('no'); }",
            "// pdx-ignore PDX_TS: the payload is checked on the server\nfunction fire() { saved('no'); }"));
        const { findings } = await check(true);
        expect(findings.filter(f => f.code === 'PDX_TS')).toEqual([]);
    }, 60_000);
});
