// A failed pre-push leaves no pool behind (#1181).
//
// pnpm stops at the first failing package (ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL) and exits, while the
// suites of the packages it had already started run on: on 2026-11-17 a `vitest run` of packages/ui
// with 17 workers was still alive after two failed pushes, loading the machine for the next one
// (#991). Killing that tree afterwards does not work on Windows: the processes between pnpm and the
// suite die with pnpm, and nothing links the survivor to the run any more (measured). So the gate's
// runs pass `--no-bail`: pnpm waits for every package before it exits, reports every red at once,
// and leaves nothing running.
//
// The fixture is a two-package workspace: one test fails after a moment, the other writes its PID and
// runs a few seconds longer. The control shows the orphan; `--no-bail` shows none.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pnpmArgs, selection } from '../../../scripts/test-affected.mjs';

const REPO = join(__dirname, '..', '..', '..');

// Writes its PID, leaves its folder (so the workspace can be removed), and outlives the failing one.
const LONGER = "require('fs').writeFileSync('pid', String(process.pid)); process.chdir(require('os').tmpdir()); setTimeout(() => {}, 8000);\n";
const FAILS = "setTimeout(() => process.exit(1), 3000);\n";

function workspace(): string {
    const root = mkdtempSync(join(tmpdir(), 'pdx-bail-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'bail-root', private: true }));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - a\n  - b\n');
    for (const [dir, script] of [['a', LONGER], ['b', FAILS]] as const) {
        mkdirSync(join(root, dir));
        writeFileSync(join(root, dir, 'run.js'), script);
        writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name: `bail-${dir}`, private: true, scripts: { test: 'node run.js' } }));
    }
    return root;
}

/** Whether a process with this PID is alive. */
function alive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') return false;
        throw e;
    }
}

const roots: string[] = [];
const started: number[] = [];

afterEach(() => {
    for (const pid of started.splice(0)) if (alive(pid)) process.kill(pid);
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Run pnpm in a fresh fixture; the exit status, and the PID of the package still running at the failure. */
function run(args: string[]): { status: number | null; longer: number } {
    const root = workspace();
    roots.push(root);
    const result = spawnSync('pnpm', args, { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
    const file = join(root, 'a', 'pid');
    expect(existsSync(file), 'the longer package never started').toBe(true);
    const longer = Number(readFileSync(file, 'utf8'));
    started.push(longer);
    return { status: result.status, longer };
}

describe('a failed recursive run leaves no process behind', () => {
    it('control: without --no-bail, pnpm exits while the other package still runs', () => {
        const { status, longer } = run(['-r', '--workspace-concurrency=2', 'run', 'test']);
        expect(status).not.toBe(0);
        expect(alive(longer), 'the fixture does not reproduce the orphan').toBe(true);
    }, 60_000);

    it('with --no-bail, pnpm waits for every package, and still fails', () => {
        const { status, longer } = run(['-r', '--workspace-concurrency=2', '--no-bail', 'run', 'test']);
        expect(status).not.toBe(0);
        expect(alive(longer), 'a package outlived the failed run').toBe(false);
    }, 60_000);
});

describe('the gate\'s runs pass --no-bail', () => {
    it('test:affected, for a selection and for everything', () => {
        expect(pnpmArgs(selection(['packages/ui/src/a.ts']))).toContain('--no-bail');
        expect(pnpmArgs({ all: true, reason: 'x', folders: [] })).toContain('--no-bail');
    });

    it('the root test:unit and test:browser, which `pnpm test` (PDX_TEST_ALL=1) runs', () => {
        const scripts = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;
        expect(scripts['test:unit']).toContain('--no-bail');
        expect(scripts['test:browser']).toContain('--no-bail');
    });
});
