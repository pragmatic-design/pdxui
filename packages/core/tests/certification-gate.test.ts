// What `pnpm certify:visual` actually runs.
//
// The command is documented as Dimension 5, and it must be: with no filter, `run.mjs` would hand
// Playwright a config that matches all five runners plus the font guard, and run them at
// `workers: 1` inside the container — 5962 tests, 96 min — of which 4371 (manifest-contract, axe,
// isolation, keyboard) are exactly what `pnpm certify` already runs in parallel on the host.
// CI does not run the five either: `certify.yml` runs Dim 1-4 outside Docker and filters its visual
// job. So an unfiltered local command would be slower than CI *and* a reproduction of nothing.
//
// This lives in core/tests for the same reason as docs-language and site-headers: it is a check on
// the repository rather than on a package, and core's suite is the one that runs in `pnpm test`.
// `buildArgs` is pure so the default can be asserted without starting Docker.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArgs, DEFAULT_FILTERS } from '../../responsive/tests/docker/run.mjs';

/** The positionals Playwright would treat as file filters, i.e. everything after the config. */
function filtersOf(args: string[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--config') { i++; continue; }
        if (args[i] === 'test') continue;
        if (args[i].startsWith('-')) break;   // the default filters are emitted before any flag
        out.push(args[i]);
    }
    return out;
}

describe('the default container run is Dimension 5, not the whole certification', () => {
    it('filters to the visual runner when nothing was asked for', () => {
        const args = buildArgs([]);
        expect(filtersOf(args)).toContain('visual-runner');
    });

    it('carries the font guard with it', () => {
        // Not the same assertion as above, and the difference is the point. `visual-runner` alone
        // is a regex over the file path, so it selects visual-runner.spec.ts and excludes
        // fonts.spec.ts — the guard against every heading of every baseline rendering in a CJK
        // font with the whole suite green. A default that dropped `fonts` would
        // satisfy the previous test and quietly remove the only guard on the image.
        expect(filtersOf(buildArgs([]))).toContain('fonts');
        expect(DEFAULT_FILTERS).toEqual(['visual-runner', 'fonts']);
    });

    it('still names the deterministic config', () => {
        // The control: filtersOf() reads a list, and a list is easy to satisfy by accident. If the
        // config were dropped, Playwright would run the host config and write -win32 baselines.
        const args = buildArgs([]);
        expect(args).toContain('--config');
        expect(args[args.indexOf('--config') + 1]).toBe('tests/playwright-docker.config.ts');
    });
});

describe('the default steps aside when the caller chose', () => {
    it('leaves an explicit runner filter alone', () => {
        expect(filtersOf(buildArgs(['axe-runner']))).toEqual(['axe-runner']);
    });

    it('runs everything under --all, and does not pass --all to Playwright', () => {
        // --all is what keeps the pinned image worth having: it is how you check that Dim 1-4 agree
        // inside the container as well. Playwright has no such flag, so it must not be forwarded.
        const args = buildArgs(['--all']);
        expect(filtersOf(args)).toEqual([]);
        expect(args).not.toContain('--all');
    });

    it('keeps flags that are not filters, and keeps the default with them', () => {
        // --update-snapshots is a flag, not a choice of scope: regenerating baselines should still
        // regenerate the visual ones only.
        const args = buildArgs(['--update-snapshots']);
        expect(filtersOf(args)).toEqual(['visual-runner', 'fonts']);
        expect(args).toContain('--update-snapshots');
    });

    it('does not mistake an option value for a filter', () => {
        // `--grep "visual: x"` is two arguments and the second does not start with `-`. Read as a
        // positional it would look like the caller had chosen a scope, and the default would vanish
        // — which is how a run silently becomes the whole suite again.
        const args = buildArgs(['--grep', 'visual: popover-open']);
        expect(filtersOf(args)).toEqual(['visual-runner', 'fonts']);
        expect(args).toContain('visual: popover-open');
    });
});

// ─── How many workers the certification is allowed to use ───────────────────────────────────────
//
// `fullyParallel` left unset in a Playwright config defaults to FALSE — and with that default the
// unit of parallelism is the FILE, not the test. Every runner here is a single file holding
// hundreds or thousands of tests (manifest-contract 2444, axe 1742, visual 1586), so `pnpm certify`
// — four files — would never use more than four workers on a 32-core machine, and the container's
// visual dimension never more than one whatever `workers:` said.
//
// Measured, same machine, --retries=0: 117 axe tests 1.0 min -> 20.2s; certify 4371 tests
// 19.1 min -> 8.2 min.
//
// Asserted as EXPLICITLY SET rather than as a value, because the defect is a default nobody chose.
// A config that says nothing reads the same as a config that was decided, and that is what lets it
// sit unnoticed.
describe('the certification configs choose their own parallelism', () => {
    const CONFIGS = [
        'playwright-ui.config.ts',
        'playwright-docker.config.ts',
    ];

    it('reads the configs it claims to read', () => {
        // The control: a missing file read as '' would satisfy every `toContain` below by being
        // absent from the check rather than by being correct.
        for (const name of CONFIGS) {
            const src = readFileSync(join(__dirname, '../../responsive/tests', name), 'utf-8');
            expect(src.length, `${name} is empty or missing`).toBeGreaterThan(200);
            expect(src, `${name} is not a Playwright config`).toContain('defineConfig');
        }
    });

    for (const name of CONFIGS) {
        it(`${name} states fullyParallel instead of inheriting the default`, () => {
            const src = readFileSync(join(__dirname, '../../responsive/tests', name), 'utf-8');
            const stated = src.split('\n').some(
                (line) => /^\s*fullyParallel\s*:/.test(line) && !/^\s*(\/\/|\*)/.test(line),
            );
            expect(stated,
                'left unset it defaults to false, and the unit of parallelism becomes the file — '
                + 'which caps this suite at one worker per runner. Set it deliberately, either way.',
            ).toBe(true);
        });
    }
});
