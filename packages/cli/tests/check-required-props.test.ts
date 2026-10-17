// `pdx check` reports a component used without a prop it requires (#130): the project resolver reads
// the child's `@prop`s, and the parent's use is checked against them, as the build does.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import checkCmd from '../src/commands/check';

interface JsonReport { files: { file: string; warnings: { code: string; message: string; line?: number }[] }[] }

describe('pdx check — PDX_PROP_REQUIRED', () => {
    let root: string;
    let prevCwd: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: Mock<typeof console.log>;

    beforeEach(() => {
        root = join(tmpdir(), `pdx-check-required-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
        mkdirSync(join(root, 'src'), { recursive: true });
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

    async function check(): Promise<JsonReport> {
        process.chdir(root);
        await (checkCmd as any).run({ args: { json: true, fix: false, severity: 'warn', i18n: false } });
        const printed = logSpy.mock.calls.map((c) => String(c[0])).find((s) => s.trimStart().startsWith('{'));
        expect(printed, 'check printed no JSON report').toBeTruthy();
        return JSON.parse(printed!);
    }

    const card = "<template><p>{{ user }}</p></template>\n<script setup>\n@prop user: string;\n@prop note?: string;\n</script>\n";

    it('a page that uses the card without :user is reported, at the tag', async () => {
        writeFileSync(join(root, 'src', 'user-card.pdx'), card);
        writeFileSync(join(root, 'src', 'page.pdx'), "<template>\n  <pdx-user-card></pdx-user-card>\n</template>\n<script setup>\n</script>\n");
        const found = (await check()).files.flatMap(f => f.warnings).filter(w => w.code === 'PDX_PROP_REQUIRED');
        expect(found.map(w => [w.message, w.line])).toEqual([["<pdx-user-card> is missing its required prop 'user'.", 2]]);
    });

    it('the control: a page that sets it raises nothing', async () => {
        writeFileSync(join(root, 'src', 'user-card.pdx'), card);
        writeFileSync(join(root, 'src', 'page.pdx'), "<template>\n  <pdx-user-card user=\"Ada\"></pdx-user-card>\n</template>\n<script setup>\n</script>\n");
        expect((await check()).files.flatMap(f => f.warnings).filter(w => w.code === 'PDX_PROP_REQUIRED')).toEqual([]);
    });
});
