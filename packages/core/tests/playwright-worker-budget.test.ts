// Four Playwright suites share one machine, and each of them has to say so.
//
// `pnpm test` runs the packages in PARALLEL. Four are Playwright suites — design, site, builder e2e,
// builder static — and Playwright's default is half the logical cores. On a 32-core machine that is
// 16 workers EACH: the shared run could ask for ~64 browsers on top of six vitest pools. The result
// is not a slow suite, it is assertions timing out while their browser waits for a core.
//
// Measured: the failure moves around, which is what makes it hard to read:
//
//   full `pnpm test`               design lost 8 of 263; builder passed
//   the three suites alone         design passed 263/263; builder lost 1 of 152
//   any suite on its own           all green, every time
//
// And the failure is always the same KIND — `expect(locator).toHaveCount() failed / Timeout: 5000ms`.
// A timeout, never a wrong number. That distinction is the whole diagnosis: contention, not a broken
// component, so the fix is to stop over-subscribing the machine rather than to wait longer.
//
// This asserts the shape, not the number: every Playwright config must DECIDE its worker count. The
// same argument holds for `fullyParallel` — a config that says nothing reads exactly like a
// config that was decided, and the cap that is missing is invisible in a green run.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

/** Every Playwright config in the workspace, with its text. */
function playwrightConfigs(): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = [];
    for (const pkg of readdirSync(PACKAGES)) {
        const dir = join(PACKAGES, pkg, 'tests');
        if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
        for (const name of readdirSync(dir)) {
            if (!/^playwright.*\.config\.ts$/.test(name)) continue;
            out.push({ file: `${pkg}/tests/${name}`, text: readFileSync(join(dir, name), 'utf8') });
        }
    }
    return out;
}

describe('every Playwright suite decides how much of the machine it takes', () => {
    const configs = playwrightConfigs();

    it('finds the configs', () => {
        // A broken walk would make the assertion below pass over an empty list — the exact shape of
        // failure this whole file is about.
        expect(configs.map(c => c.file).sort(), 'the workspace Playwright configs')
            .toEqual(expect.arrayContaining([
                'design/tests/playwright.config.ts',
                'site/tests/playwright.config.ts',
                'builder/tests/playwright.config.ts',
                'responsive/tests/playwright-ui.config.ts',
            ]));
    });

    // `responsive` is deliberately outside these three. It is NOT part of `pnpm test` — its `test`
    // script is a no-op that points at `pnpm certify` — so it never competes with the others and gets
    // the whole machine on purpose. Measured on that file: capping it takes certify from 8 minutes
    // back to 19.
    const shared = (): { file: string; text: string }[] =>
        configs.filter(c => !c.file.startsWith('responsive/'));

    it('has the shared suites to check', () => {
        expect(shared().map(c => c.file).sort()).toEqual([
            'builder/tests/playwright.config.ts',
            'builder/tests/playwright.static.config.ts',
            'design/tests/playwright.config.ts',
            'showcase/tests/playwright.config.ts',
            // The showcase runs its suite twice over: against the BUILD, and against the dev
            // server, which can fail on its own — `pdx dev` answering 404 on every route while the
            // build is fine.
            'showcase/tests/playwright.dev.config.ts',
            'site/tests/playwright.config.ts',
        ]);
    });

    it('states a worker count', () => {
        const silent = shared().filter(c => !/\bworkers\s*:/.test(c.text)).map(c => c.file);
        expect(silent, 'left to Playwright\'s default of half the cores, times four concurrent suites')
            .toEqual([]);
    });

    it('does not simply say `undefined`, which is the default wearing a name', () => {
        const fake = shared()
            .filter(c => /\bworkers\s*:\s*(process\.env\.CI\s*\?[^,]*:\s*)?undefined/.test(c.text))
            .map(c => c.file);
        expect(fake, 'a worker line that resolves to the default decides nothing').toEqual([]);
    });

    it('derives the cap from the machine rather than hardcoding one', () => {
        // A literal would be right on this machine and wrong on the next: 4 is a quarter of 32 cores
        // and four times an 8-core laptop's budget.
        for (const c of shared()) {
            expect(c.text, `${c.file} must derive its cap from the machine`).toMatch(/cpus\(\)/);
        }
    });

    it('does not paper over contention with retries', () => {
        // Retries on a geometry or console-error suite hide exactly the class of defect it exists to
        // catch, and erase the difference between "the machine was busy" and "the component broke".
        const retrying = configs
            .filter(c => /retries\s*:\s*(?!process\.env\.CI\s*\?)[1-9]/.test(c.text))
            .map(c => c.file);
        expect(retrying, 'a local retry budget hides the failure instead of fixing it').toEqual([]);
    });
});

// ─── a retry may absorb a cold start; it may not HIDE a flake ─────────────────────────────────
//
// A run that reports **1 flaky out of 6402** and exits 0 — the scenario server refusing a module
// request mid-run, `net::ERR_CONNECTION_REFUSED`, nothing listening — keeps the failure invisible
// unless somebody opens the log. A gate that goes green on a failure it saw is not reporting; it is
// averaging.
//
// Playwright has `failOnFlakyTests` for exactly this. Measured on 1.58.2 with a test that fails on
// the first attempt and passes on the second: **exit 0 without it, exit 1 with it.**
//
// The rule is about the pair, not about either half: a suite that CANNOT retry needs nothing here,
// and the four that do not retry (builder e2e, builder static, site, visual, docker) are left
// alone. What is forbidden is retrying AND swallowing the result.

describe('a retry does not hide the failure it retried', () => {
    const configs = playwrightConfigs();

    /**
     * Configs whose retry budget can be greater than zero.
     *
     * Two expressions and not one negative lookahead: `/retries\s*:\s*(?!0…)/` matches every
     * `retries: 0` there is, because `\s*` backtracks to zero characters and the lookahead then
     * reads a SPACE rather than the digit. It reported the two suites that set 0 — measured,
     * and the reason this asks the question the other way round.
     */
    const retrying = configs.filter((c) =>
        /\bretries\s*:/.test(c.text) && !/\bretries\s*:\s*0\s*[,;\n]/.test(c.text));

    it('finds the configs that retry, so the assertion below is not vacuous', () => {
        expect(retrying.map((c) => c.file).sort(), 'no suite retries any more: this rule has nothing to hold')
            .not.toEqual([]);
        expect(retrying.length).toBeGreaterThanOrEqual(4);
    });

    it('every one of them fails the run when a test only passed on a retry', () => {
        const silent = retrying
            .filter((c) => !/failOnFlakyTests\s*:\s*true/.test(c.text))
            .map((c) => c.file);
        expect(silent, 'these retry and exit 0 on a flake: the failure is in the log and nowhere else')
            .toEqual([]);
    });
});
