// The suite's page fixture and its slow-fixture record (#758).
//
// Under the pre-push run a site test failed its 30 s after 26.6 s spent creating its page. The
// suite's `test` (fixture.ts) gives page creation a timeout of its own, and a failed test writes its
// fixtures over 5 s to `slow-fixtures.txt` (slow-fixtures-reporter.ts), which the global teardown keeps.
//
// The probe (fixture-probe/) runs the real fixture in a child Playwright run, at a tenth of the
// suite's budgets: a 3 s test timeout for 30 s, a 6 s page timeout for 60 s. The reporter's 5 s
// threshold is not scaled. Here and not in a vitest suite: it needs the browser this job installs.

import { test, expect } from './fixture';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepFailures } from './keep-failures';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = createRequire(join(SITE, 'package.json')).resolve('@playwright/test/cli');

interface Probe { out: string; status: string; message: string }

function probe(root: string, name: string, env: Record<string, string>): Promise<Probe> {
    const out = join(root, name);
    const jsonFile = join(root, `${name}.json`);
    return new Promise((done) => {
        execFile(process.execPath, [CLI, 'test', '--config', 'tests/fixture-probe/playwright.config.ts'], {
            cwd: SITE,
            env: { ...process.env, PDX_SITE_PAGE_TIMEOUT: '6000', PDX_PROBE_OUT: out, PDX_PROBE_JSON: jsonFile, ...env },
        }, () => {
            const json = JSON.parse(readFileSync(jsonFile, 'utf8'));
            const result = json.suites[0].specs[0].tests[0].results[0];
            done({ out, status: result.status, message: result.error?.message ?? '' });
        });
    });
}

test('page creation has its own timeout, and a failure records the fixtures over 5 s', async () => {
    // Three child runs, each its own browser: the slowest waits ~6.5 s for its page.
    test.setTimeout(60_000);
    const root = mkdtempSync(join(tmpdir(), 'pdx-site-fixture-'));
    try {
        const [slowButInBudget, tooSlow, failsByItself] = await Promise.all([
            probe(root, 'slow', { PDX_PROBE_DELAY: '3500' }),
            probe(root, 'too-slow', { PDX_PROBE_DELAY: '6500' }),
            probe(root, 'fails', { PDX_PROBE_FAIL: '1' }),
        ]);

        expect(slowButInBudget.status, `a page slower than the test timeout failed the test: ${slowButInBudget.message}`).toBe('passed');

        expect(tooSlow.status).toBe('timedOut');
        expect(tooSlow.message, 'a page slower than its own timeout fails as a fixture timeout naming it').toMatch(/Fixture "page" timeout of 6000ms exceeded during setup/);
        const kept = keepFailures(tooSlow.out, join(root, 'kept'), 'too-slow');
        expect(kept).not.toBeNull();
        expect(readFileSync(join(kept!, 'slow-fixtures.txt'), 'utf8')).toMatch(/probe\tFixture "page"\t\d+ ms/);

        // The control: a test that fails by itself, with no slow fixture, writes no record.
        expect(failsByItself.status).toBe('failed');
        expect(existsSync(join(failsByItself.out, 'slow-fixtures.txt'))).toBe(false);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
