// The showcase's timed specs run with nothing else running (#606).
//
// `first-paint.spec.ts` and `first-paint-http2.spec.ts` hold budgets in milliseconds, and
// `first-paint-waves.spec.ts` groups requests into round-trips by when they start. All three measured
// the machine's load as well as the page: in the showcase's own suite, beside its heavier specs, a
// median LCP of 1928 ms against 1100 (runs 1048, 3068, 1928) and three waves where the page builds two,
// on a tree that measured 1044 ms and two waves alone, and the same as `main`.
//
// So they leave the build suite for a config of their own, run after it: the same build, the same
// cap, and nothing else on the machine. This holds that arrangement, in the configs and in what runs
// them, the package's `test` script and CI.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const TESTS = join(ROOT, 'packages', 'showcase', 'tests');
const TIMED = ['first-paint.spec.ts', 'first-paint-http2.spec.ts', 'first-paint-waves.spec.ts'];

const read = (path: string): string => readFileSync(path, 'utf8');
/** The quoted file names inside `<key>: [ … ]` of a config. */
function listOf(config: string, key: string): string[] {
    const m = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(config);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}

describe('the showcase\'s timed specs run alone', () => {
    const build = read(join(TESTS, 'playwright.config.ts'));
    const timing = read(join(TESTS, 'playwright.timing.config.ts'));

    it('the build suite leaves them out', () => {
        expect(listOf(build, 'testIgnore')).toEqual(expect.arrayContaining(TIMED));
    });

    it('the timing config runs exactly them', () => {
        expect(listOf(timing, 'testMatch').sort()).toEqual([...TIMED].sort());
    });

    it('the package\'s test script runs it, after the build suite', () => {
        const scripts = JSON.parse(read(join(ROOT, 'packages', 'showcase', 'package.json'))).scripts as Record<string, string>;
        expect(scripts['test:timing']).toBe('playwright test --config tests/playwright.timing.config.ts');
        expect(scripts.test).toMatch(/npm run test:build && npm run test:timing\b/);
    });

    it('CI runs it', () => {
        expect(read(join(ROOT, '.github', 'workflows', 'quality.yml'))).toContain('pnpm --filter @pdxui/showcase run test:timing');
    });
});
