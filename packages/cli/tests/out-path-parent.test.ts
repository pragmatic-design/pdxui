// A command told where to write creates the folder it was told to write into.
//
// In a new project the folder usually does not exist yet, which is the normal case the first time:
// without creating it, `pdx theme x --brand=… --out src/styles/theme.css` fails with
// `ENOENT: no such file or directory, open '…\src\styles\theme.css'` and a writeFileSync stack.
// `theme --out`, `analyze --out` and `new component --dir` create it, as `build`, `extract` and
// `i18n` do.
//
// Each case points the command at `<sandbox>/a/b/…` with `a` absent, so the write needs two
// levels created.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import themeCmd from '../src/commands/theme';
import analyzeCmd from '../src/commands/analyze';
import newCmd from '../src/commands/new';

type Runnable = { run: (c: { args: Record<string, unknown> }) => Promise<void> };

let sandbox: string;

beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'pdx-out-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // A command that gives up calls process.exit; inside vitest that would end the run instead of
    // failing the case, so it throws and the case reports the exit code.
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code})`);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sandbox, { recursive: true, force: true });
});

describe('pdx theme --out', () => {
    it('writes the theme into a folder that does not exist yet', async () => {
        const out = join(sandbox, 'a', 'b', 'theme.css');
        await (themeCmd as unknown as Runnable).run({
            args: { name: 'x', brand: '#2E7D5B', language: 'neutral', density: 'normal', out, strict: true, quiet: true },
        });
        expect(existsSync(out), `${out} was not written`).toBe(true);
        expect(readFileSync(out, 'utf-8')).toContain('[pdx-theme="x"]');
    });

    it('still overwrites a file in a folder that exists', async () => {
        // Control: creating the folder must not change the ordinary case.
        mkdirSync(join(sandbox, 'styles'));
        const out = join(sandbox, 'styles', 'theme.css');
        writeFileSync(out, 'old');
        await (themeCmd as unknown as Runnable).run({
            args: { name: 'y', brand: '#2E7D5B', language: 'neutral', density: 'normal', out, strict: true, quiet: true },
        });
        expect(readFileSync(out, 'utf-8')).toContain('[pdx-theme="y"]');
    });
});

describe('pdx analyze --out', () => {
    it('writes the manifest into a folder that does not exist yet', async () => {
        mkdirSync(join(sandbox, 'src'));
        writeFileSync(join(sandbox, 'src', 'hello.pdx'), '<template><p>Hello</p></template>\n');
        vi.spyOn(process, 'cwd').mockReturnValue(sandbox);
        const out = join(sandbox, 'a', 'b', 'pdx-manifest.json');
        await (analyzeCmd as unknown as Runnable).run({ args: { out } });
        expect(existsSync(out), `${out} was not written`).toBe(true);
        const manifest = JSON.parse(readFileSync(out, 'utf-8')) as { components: unknown[] };
        expect(manifest.components).toHaveLength(1);
    });
});

describe('pdx new component --dir', () => {
    it('writes the component into a folder that does not exist yet', async () => {
        const dir = join(sandbox, 'a', 'b');
        await (newCmd as unknown as Runnable).run({ args: { type: 'component', name: 'user-card', dir } });
        expect(existsSync(join(dir, 'user-card.pdx')), 'user-card.pdx was not written').toBe(true);
    });
});
