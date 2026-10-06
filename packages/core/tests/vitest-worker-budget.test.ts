// The vitest half of the gate shares one machine too, and its configs say so.
//
// `test:unit` runs the packages through `pnpm -r`, several at a time, and vitest's default is a
// worker per core minus one. On a 32-core machine that is ~31 workers EACH, four packages at once:
// ~120 workers for 32 cores. Nothing is slow on its own; a test that does real work inside its body
// pays for everybody else's. Measured in the gate, without the cap:
//
//   router-runes      «[id=number].pdx → :id(number)»          17 ms alone   > 5000 ms in the gate
//   component-resolver «knows every one of them…»              252 ms alone  > 5000 ms in the gate
//
// The same diagnosis as `playwright-worker-budget.test.ts` — a timeout, never a wrong
// value — and the same fix: bound the workers, never lengthen the timeouts. The cap is ONE function,
// `build/unit-test-workers.ts`, so the divisor and the number of packages pnpm runs together cannot
// drift apart. This file asserts both halves.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { UNIT_TEST_CONCURRENCY } from '../../../build/unit-test-workers';

const ROOT = join(__dirname, '..', '..', '..');
const PACKAGES = join(ROOT, 'packages');

/** Every workspace package whose `test` script is vitest, with the text of its vitest config. */
function vitestPackages(): { pkg: string; config: string | null; text: string }[] {
    const out: { pkg: string; config: string | null; text: string }[] = [];
    for (const pkg of readdirSync(PACKAGES)) {
        const manifest = join(PACKAGES, pkg, 'package.json');
        if (!existsSync(manifest)) continue;
        const test = (JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> })
            .scripts?.test ?? '';
        if (!/\bvitest\b/.test(test)) continue;
        // `vitest.config.*` wins over `vite.config.*` when both exist, as vitest itself decides.
        const config = ['vitest.config.ts', 'vite.config.ts'].find(f => existsSync(join(PACKAGES, pkg, f))) ?? null;
        out.push({ pkg, config, text: config ? readFileSync(join(PACKAGES, pkg, config), 'utf8') : '' });
    }
    return out;
}

describe('every vitest package decides how much of the machine it takes', () => {
    const packages = vitestPackages();

    it('finds the packages', () => {
        // An empty walk would pass every assertion below.
        expect(packages.map(p => p.pkg).sort()).toEqual(
            expect.arrayContaining(['cli', 'compiler', 'core', 'lsp', 'router', 'ui']));
    });

    it('has a config of its own — no config is vitest\'s default of a worker per core', () => {
        expect(packages.filter(p => p.config === null).map(p => p.pkg)).toEqual([]);
    });

    it('takes its worker cap from the shared helper', () => {
        const unbounded = packages
            .filter(p => !/maxWorkers\s*:\s*unitTestWorkers\(\)/.test(p.text)
                || !/from\s+'\.\.\/\.\.\/build\/unit-test-workers'/.test(p.text))
            .map(p => `${p.pkg}/${p.config}`);
        expect(unbounded, 'these run a worker per core, beside the others doing the same').toEqual([]);
    });
});

describe('the divisor is the number of packages pnpm runs together', () => {
    it('`test:unit` states its concurrency, and it is the helper\'s', () => {
        // pnpm's default is 4 and would match today; stated, so a change to either side is one
        // this test sees rather than one the machine absorbs.
        const scripts = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>;
        }).scripts;
        const m = /--workspace-concurrency[= ](\d+)/.exec(scripts['test:unit'] ?? '');
        expect(m, '`test:unit` leaves its concurrency to pnpm\'s default').not.toBeNull();
        expect(Number(m![1])).toBe(UNIT_TEST_CONCURRENCY);
    });
});
