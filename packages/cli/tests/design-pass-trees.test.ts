// `pdx check --design` reports nothing on the trees agents learn from.
//
// The showcase, the site and templates/ are what an agent copies: a design finding left in them is a
// pattern taught. So this runs the real command as a gate, per-file rules, cross-file rules
// and exemptions together, on each tree, and wants zero. A finding the code means stays, with
// `pdx-ignore <CODE>: <reason>` in the file, which this counts as ignored, not as a warning.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { join } from 'path';
import checkCmd from '../src/commands/check';

interface Report {
    files: { file: string; errors: string[]; warnings: { code: string; line?: number; message: string }[] }[];
    summary: { total: number; errors: number; warnings: number };
}

const REPO = join(__dirname, '..', '..', '..');
// Each tree with the least it holds (1055, 1041 and 8 .pdx on 2026-10-03). `pdx check` reads `<cwd>/src`
// alone when that directory exists: an `src/` added to the showcase once narrowed it to one file, and
// "more than zero" would have called that clean.
const TREES: [string, number][] = [['packages/compiler/demo/showcase-new', 1000], ['packages/site', 1000], ['templates', 8]];

describe('pdx check --design is clean on the reference trees', () => {
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        prevCwd = process.cwd();
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.chdir(prevCwd);
        exitSpy.mockRestore();
        logSpy.mockRestore();
    });

    for (const [tree, least] of TREES) {
        it(tree, async () => {
            process.chdir(join(REPO, tree));
            await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false, design: true } });
            const report: Report = JSON.parse(logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'))!);
            // Guard the premise: a tree that yielded fewer files than it holds would pass for nothing.
            expect(report.summary.total, `${tree}: fewer .pdx files were checked than the tree holds`).toBeGreaterThanOrEqual(least);
            const findings = report.files.flatMap((f) => [
                ...f.errors.map((e) => `${f.file.replace(/\\/g, '/').replace(/.*?(packages|templates)\//, '$1/')}: ${e}`),
                ...f.warnings.map((w) => `${f.file.replace(/\\/g, '/').replace(/.*?(packages|templates)\//, '$1/')}:${w.line ?? '?'} ${w.code}`),
            ]);
            expect(findings, `${tree}: fix each finding at the source, or exempt it with pdx-ignore and a reason`).toEqual([]);
        }, 120_000);
    }
});
