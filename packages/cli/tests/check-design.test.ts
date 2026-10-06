// `pdx check` is the gate, `pdx check --design` the review.
//
// The design rules are questions for a review — their own header says so. Run on every check, they
// bury the defects: in showcase-new, 8 defects among 269 warnings, lost among the rest.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import checkCmd from '../src/commands/check';

interface Report {
    files: { warnings: { code: string; category: string }[] }[];
    summary: { ignored: number };
}

describe('pdx check reports defects; --design adds the review', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-design-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
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

    async function check(design: boolean): Promise<Report> {
        logSpy.mockClear();
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, design } });
        return JSON.parse(logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'))!);
    }

    // One colour literal (a design heuristic) and one raw interpolation (a defect).
    const FIXTURE = [
        '<template><p class="b" title="${n}">x</p></template>',
        '<script setup>',
        'let n = $signal(1);',
        '</script>',
        '<style scoped>',
        '.b { color: #ff0000; }',
        '</style>',
        '',
    ].join('\n');

    const found = (r: Report) => r.files.flatMap((f) => f.warnings.map((w) => `${w.code} ${w.category}`)).sort();

    it('without --design: only the defect', async () => {
        writeFileSync(join(root, 'page.pdx'), FIXTURE);
        expect(found(await check(false))).toEqual(['PDX_RAW_INTERPOLATION defect']);
    });

    it('with --design: both, each with its category', async () => {
        writeFileSync(join(root, 'page.pdx'), FIXTURE);
        expect(found(await check(true))).toEqual(['PDX_COLOUR_LITERAL design', 'PDX_RAW_INTERPOLATION defect']);
    });

    it('an exemption for a design code is not called unused when design is not shown', async () => {
        writeFileSync(join(root, 'page.pdx'), FIXTURE.replace('.b { color', '/* pdx-ignore PDX_COLOUR_LITERAL: a swatch */\n.b { color'));
        const report = await check(false);
        expect(found(report)).toEqual(['PDX_RAW_INTERPOLATION defect']);
        // Nothing shown was silenced.
        expect(report.summary.ignored).toBe(0);
    });
});
