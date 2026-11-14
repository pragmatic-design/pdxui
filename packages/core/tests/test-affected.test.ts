// What the pre-push's suites are (#1074): the vitest suites of the packages a push changes and their
// dependents, plus core and cli, and never a browser suite, which CI runs. A change outside
// packages/ runs every vitest suite.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selection, pnpmArgs, BROWSER } from '../../../scripts/test-affected.mjs';

const REPO = join(__dirname, '..', '..', '..');

describe('selection', () => {
    it('the folders of the packages changed', () => {
        expect(selection(['packages/compiler/demo/showcase-new/pages/comp-x.pdx', 'packages/compiler/src/a.ts', 'packages/ui/src/b.ts']))
            .toEqual({ all: false, reason: null, folders: ['compiler', 'ui'] });
    });

    it('a file outside packages/ runs everything, and says which', () => {
        expect(selection(['packages/ui/src/b.ts', '.github/workflows/quality.yml'])).toEqual({ all: true, reason: '.github/workflows/quality.yml', folders: [] });
        expect(selection(['pnpm-lock.yaml']).all).toBe(true);
        expect(selection(['docs/language/template.md']).all).toBe(true);
    });

    it('nothing changed: no folder, and core and cli still run', () => {
        expect(selection([])).toEqual({ all: false, reason: null, folders: [] });
        expect(pnpmArgs(selection([]))).toEqual(expect.arrayContaining(['--filter=@pdxui/core', '--filter=@pdxui/cli']));
    });
});

describe('the browser suites', () => {
    // The same four `test:unit` leaves out and `test:browser` runs: a fifth added to one and not to
    // the other would run in the pre-push, or in no local run at all.
    it('are the ones test:unit excludes and test:browser runs', () => {
        const scripts = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
        const excluded = [...scripts['test:unit'].matchAll(/--filter=!(\S+)/g)].map((m) => m[1]).sort();
        const browser = [...scripts['test:browser'].matchAll(/--filter (\S+)/g)].map((m) => m[1]).sort();
        expect([...BROWSER].sort()).toEqual(excluded);
        expect([...BROWSER].sort()).toEqual(browser);
    });
});

describe('pnpmArgs', () => {
    it('the changed folders with their dependents, core and cli, and no browser suite', () => {
        const args = pnpmArgs(selection(['packages/compiler/src/a.ts']));
        expect(args).toEqual(expect.arrayContaining(['--filter=...{./packages/compiler}', '--filter=@pdxui/core', '--filter=@pdxui/cli', 'run', 'test']));
        for (const p of BROWSER) expect(args).toContain(`--filter=!${p}`);
    });

    it('everything is every package but the browser ones', () => {
        const args = pnpmArgs(selection(['package.json']));
        expect(args.filter((a) => a.startsWith('--filter=') && !a.startsWith('--filter=!'))).toEqual([]);
        for (const p of BROWSER) expect(args).toContain(`--filter=!${p}`);
    });

    // The selection pnpm makes of these arguments, read from pnpm itself. A change to ui reaches what
    // is built on it (framework) and core and cli, not what ui is built on, and no browser suite. (A
    // change to the compiler reaches almost every package: router, lsp, ui and cli all depend on it.)
    it('pnpm selects what the arguments say', () => {
        const args = pnpmArgs(selection(['packages/ui/src/a.ts'])).filter((a) => a.startsWith('--filter'));
        const listed = execFileSync('pnpm', [...args, 'list', '--depth=-1', '--json'], { cwd: REPO, encoding: 'utf8', shell: process.platform === 'win32' });
        const names = (JSON.parse(listed) as { name: string }[]).map((p) => p.name).sort();
        expect(names).toEqual(['@pdxui/cli', '@pdxui/core', '@pdxui/framework', '@pdxui/ui']);
        for (const p of BROWSER) expect(names).not.toContain(p);
    }, 30_000);
});
