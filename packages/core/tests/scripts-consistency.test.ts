// The command the gate calls must return a verdict, not wait for one.
//
// `compiler`, `cli` and `router` ran `vitest` without `run`, so their `test` script started a watch
// session. Under `pnpm -r` and in CI stdout is not a TTY and vitest executes once, which is why the
// aggregate gate works and why nobody noticed. In an interactive terminal
// `pnpm --filter @pdxui/compiler test` hangs, and the caller has no way to tell "still running"
// from "waiting for a keystroke".
//
// It matters because /start-jira-loop tells whoever works a story that `pnpm test` is the signal
// that closes it. Reached per-package — which is what you do while iterating — it never answers.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = join(__dirname, '..', '..');

interface Scripts { name: string; test: string }

function packagesWithATestScript(): Scripts[] {
    return readdirSync(PACKAGES, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => join(PACKAGES, e.name, 'package.json'))
        .filter(existsSync)
        .map(p => JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>)
        .map(pkg => ({
            name: String(pkg.name),
            test: String(((pkg.scripts ?? {}) as Record<string, string>).test ?? ''),
        }))
        .filter(p => p.test !== '');
}

describe('test scripts return a verdict', () => {
    const all = packagesWithATestScript();

    it('finds packages with a test script', () => {
        // A zero here would make every case below pass by iterating nothing.
        expect(all.length).toBeGreaterThan(4);
    });

    // Only packages whose test script is vitest can get this wrong. `design` runs Playwright (which
    // is one-shot by default) and `responsive` is an echo pointing at `pnpm certify`.
    const vitestPackages = all.filter(p => /\bvitest\b/.test(p.test));

    it('finds packages whose test script is vitest', () => {
        expect(vitestPackages.length).toBeGreaterThan(3);
    });

    for (const p of vitestPackages) {
        it(`${p.name}: runs vitest once, not in watch mode`, () => {
            expect(
                p.test,
                `"${p.test}" starts a watch session; the gate needs \`vitest run\``,
            ).toMatch(/\bvitest\s+run\b/);
        });
    }
});
