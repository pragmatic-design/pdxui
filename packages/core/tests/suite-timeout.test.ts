// Every Playwright suite the gate runs ends at a global timeout instead of waiting forever (#1040).
//
// On 2026-11-12 the showcase's dev suite stopped after its last test: 57 passed, then 31 minutes
// with no output, the runner and its Vite server alive, until it was ended by hand. #1025 had bounded
// the same hang for design's config alone, and every other suite of the gate could still block the
// pre-push without limit.
//
// Each config the gate runs sets `globalTimeout: suiteTimeout(<slowest measured run, in seconds>)`,
// from `scripts/lib/suite-timeout.mjs`: one rule for the margin, in one place. An expiry reaches the
// reporter `keep-failed-runs.mjs` as an error outside any test, which prints `[known-failure] #1025`
// with the tests still running and keeps their traces.
//
// "The configs the gate runs" are read from the packages' own `test` scripts, following `npm run` /
// `pnpm run` into the scripts they call: a suite added to the gate is checked by arriving.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { suiteTimeout } from '../../../scripts/lib/suite-timeout.mjs';

const REPO = join(__dirname, '..', '..', '..');

/** The `--config` of every `playwright test` reachable from a package's `test` script. */
function gateConfigs(): string[] {
    const found: string[] = [];
    const packages = join(REPO, 'packages');
    for (const name of readdirSync(packages)) {
        const manifest = join(packages, name, 'package.json');
        if (!existsSync(manifest)) continue;
        const scripts: Record<string, string> = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {};
        const seen = new Set<string>();
        const visit = (script: string) => {
            if (seen.has(script) || scripts[script] === undefined) return;
            seen.add(script);
            const command = scripts[script];
            // Match: `npm run x`, `pnpm run x`. Groups: [1]=the script it calls
            for (const m of command.matchAll(/\b(?:npm|pnpm) run ([\w:-]+)/g)) visit(m[1]);
            // Match: `playwright test … --config path`. Groups: [1]=the config path
            for (const m of command.matchAll(/playwright test[^&|;]*?--config[ =](\S+)/g)) found.push(relative(REPO, join(packages, name, m[1])).replace(/\\/g, '/'));
        };
        visit('test');
    }
    return [...new Set(found)].sort();
}

describe('every Playwright suite of the gate has a global timeout (#1040)', () => {
    const configs = gateConfigs();

    it('found the gate\'s configs, so the assertion below is not vacuous', () => {
        // design, builder ×2, site, the showcase's build, timing, dev, hmr and scenarios suites.
        expect(configs).toEqual(expect.arrayContaining([
            'packages/design/tests/playwright.config.ts',
            'packages/showcase/tests/playwright.dev.config.ts',
            'packages/site/tests/playwright.config.ts',
        ]));
        expect(configs.length).toBeGreaterThanOrEqual(9);
    });

    it('each sets globalTimeout from the shared rule', () => {
        const missing = configs.filter((rel) => !/^\s*globalTimeout:\s*suiteTimeout\(\d+\),/m.test(readFileSync(join(REPO, rel), 'utf8')));
        expect(missing, 'these suites can hang the pre-push without limit').toEqual([]);
    });
});

describe('suiteTimeout: three times the slowest measured run, never under five minutes', () => {
    it('a short suite gets the floor', () => {
        expect(suiteTimeout(6)).toBe(5 * 60_000);
        expect(suiteTimeout(100)).toBe(5 * 60_000);
    });

    it('a long one gets three times its run, rounded up to the minute', () => {
        expect(suiteTimeout(120)).toBe(6 * 60_000);
        expect(suiteTimeout(324)).toBe(17 * 60_000);
    });
});
