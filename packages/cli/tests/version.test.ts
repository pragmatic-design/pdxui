// The version a user reports is the version the CLI prints.
//
// The number is read from package.json, never restated in `defineCommand` meta: a restated number
// drifts from the package's, and that makes every bug report unattributable: reports months apart carry the same number, and the only place holding the real
// version is never read.
//
// This runs the BUILT CLI and compares its output to the `version` field read from the file. The
// expected value is never written here — restating it would make the test a third place that has to
// agree, which is the defect with one more copy of itself.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLI = join(__dirname, '..');
const ENTRY = join(CLI, 'dist', 'index.mjs');

const pkg = JSON.parse(readFileSync(join(CLI, 'package.json'), 'utf-8')) as {
    version: string;
    bin: Record<string, string>;
};

/**
 * The CLI as a USER runs it.
 *
 * citty prints through consola, and consola silences itself COMPLETELY when the environment says
 * "test": the child produced an empty stdout and exit 0 while the identical command in a plain shell
 * printed the version. Measured one variable at a time against the built entry:
 *
 *     (nothing)                   -> "1.0.0-alpha.0.1334"
 *     NODE_ENV=test               -> ""
 *     TEST=true                   -> ""            (independent of NODE_ENV)
 *     TEST=true NODE_ENV=production -> ""
 *     VITEST=true VITEST_MODE=RUN -> "1.0.0-alpha.0.1334"
 *     CI=true                     -> "[log] 1.0.0-alpha.0.1334"
 *
 * vitest sets both NODE_ENV=test and TEST=true, so inheriting the runner's environment would make
 * this test measure vitest rather than pdx. Both are removed. The CI row is not this test's problem
 * but it is not nothing either: a version flag that prefixes its output is one a script cannot parse.
 */
function runCli(...args: string[]) {
    const env = { ...process.env };
    delete env.NODE_ENV;
    delete env.TEST;
    return spawnSync(process.execPath, [ENTRY, ...args], { encoding: 'utf-8', env });
}

describe('pdx --version', () => {
    it('has a built entry to run — the one `bin` points at', () => {
        // Reading src would prove nothing about what a user runs; `bin` names the artefact.
        expect(pkg.bin.pdx).toBe('./dist/index.mjs');
        expect(existsSync(ENTRY), `${ENTRY} — run \`pnpm --filter @pdxui/cli build\``).toBe(true);
    });

    it('prints the version the package declares, and exits 0', () => {
        const r = runCli('--version');
        expect(r.status, r.stderr).toBe(0);
        expect(
            r.stdout.trim(),
            'if src reads package.json and this still shows an old number, dist is stale — ' +
            'run `pnpm --filter @pdxui/cli build`',
        ).toBe(pkg.version);
    });

    it('does not print it twice, or print anything else', () => {
        // A version flag that also dumps help, or prints to stderr, is a version flag a script
        // cannot parse.
        const r = spawnSync(process.execPath, [ENTRY, '--version'], { encoding: 'utf-8' });
        expect(r.stdout.trim().split(/\r?\n/)).toHaveLength(1);
        expect(r.stderr).toBe('');
    });
});

// The environment must not decide whether a version flag answers.
//
// `--version` exists so a script can read it, and a script runs in exactly the environments where
// citty's default output breaks. Through that default, one variable at a time against the built entry:
//
//     (nothing)                      -> "1.0.0-alpha.0.1334"
//     NODE_ENV=test                  -> ""                        silent, exit 0
//     TEST=true                      -> ""                        independent of NODE_ENV
//     TEST=true NODE_ENV=production  -> ""                        TEST alone is enough
//     VITEST=true VITEST_MODE=RUN    -> "1.0.0-alpha.0.1334"
//     CI=true                        -> "[log] 1.0.0-alpha.0.1334"
//
// Four of the six wrong. The cause is one thing: citty prints its meta through the DEFAULT consola
// instance, whose level and reporter are chosen by the ambient environment. Nobody sets TEST=true
// meaning to mute an unrelated tool.
describe('the environment does not decide whether --version answers', () => {
    const MATRIX: [string, Record<string, string | undefined>][] = [
        ['a plain shell', {}],
        ['NODE_ENV=test', { NODE_ENV: 'test' }],
        ['TEST=true', { TEST: 'true' }],
        ['TEST=true with NODE_ENV=production', { TEST: 'true', NODE_ENV: 'production' }],
        ['inside a vitest run', { VITEST: 'true', VITEST_MODE: 'RUN' }],
        ['CI=true', { CI: 'true' }],
    ];

    for (const [label, overrides] of MATRIX) {
        it(`prints exactly the version in ${label}`, () => {
            // Start from a clean environment for the four variables under test: vitest sets
            // NODE_ENV and TEST itself, so inheriting them would make every row measure the runner.
            const env = { ...process.env };
            delete env.NODE_ENV;
            delete env.TEST;
            delete env.CI;
            delete env.VITEST;
            delete env.VITEST_MODE;
            Object.assign(env, overrides);

            const r = spawnSync(process.execPath, [ENTRY, '--version'], { encoding: 'utf-8', env });
            expect(r.status, r.stderr).toBe(0);
            expect(
                r.stdout.trim(),
                `\`pdx --version\` under ${label} must be readable by \`$(pdx --version)\` — `
                + 'no prefix, no silence',
            ).toBe(pkg.version);
        });
    }
});

// The dist assertion above measures what a user runs, which is the point — but `pnpm test` does not
// build, so a stale dist could keep it green while src regressed. This is the complementary half:
// the source must not restate the number at all, whatever dist currently holds.
describe('the source does not hold a second copy of the version', () => {
    it('reads it instead of restating it', () => {
        const src = readFileSync(join(CLI, 'src', 'index.ts'), 'utf-8');
        const literal = src.match(/version:\s*['"`]([^'"`]+)['"`]/);
        expect(literal?.[1], 'a version literal in the CLI meta is the defect, whatever its value').toBeUndefined();
        expect(src).toContain('package.json');
    });
});
