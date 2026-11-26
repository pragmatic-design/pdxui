// `pdx check` reports the parser's errors in a .pdx's blocks, by their code (#1249).
//
// The check read the blocks the parser found before the errors it found: markup beside the <script>
// of a file with no <template> came back as "Missing <template> block", which says nothing of the
// markup. A second <script> beside a template reached it through compile()'s throw, and still does.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveConfig } from '../src/config/loader';
import { runCheck } from '../src/commands/check-run';

const COMMAND = { timeout: 60_000 };

describe('pdx check and the parser\'s errors', COMMAND, () => {
    let root: string;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-structural-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(join(root, 'src'), { recursive: true });
    });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    async function check(name: string, source: string) {
        writeFileSync(join(root, 'src', name), source);
        const result = await runCheck(root, resolveConfig({}, root), { severity: 'warn' });
        return { result, report: result.reports.find((r) => r.file.endsWith(name))! };
    }

    it('markup outside the blocks is PDX_MARKUP_OUTSIDE_TEMPLATE, an error naming its line', async () => {
        const { result, report } = await check('hello.pdx',
            '<script setup>\nlet count = $signal(0);\n</script>\n\n<button @click="count++">Clicked {count} times</button>\n');
        expect(report.errors).toEqual([expect.stringMatching(/PDX_MARKUP_OUTSIDE_TEMPLATE.*line 5/s)]);
        expect(result.totalErrors).toBe(1);
    });

    it('a second <script> beside a template is PDX_DUPLICATE_SCRIPT', async () => {
        const { report } = await check('two.pdx',
            '<template><p>{{ a }}</p></template>\n<script>let a = $signal(1);</script>\n<script>let b = 2;</script>\n');
        expect(report.errors).toEqual([expect.stringMatching(/PDX_DUPLICATE_SCRIPT/)]);
    });

    it('control — a well-formed file reports no error', async () => {
        const { report } = await check('ok.pdx', '<template><p>{{ a }}</p></template>\n<script>let a = $signal(1);</script>\n');
        expect(report.errors).toEqual([]);
    });
});
