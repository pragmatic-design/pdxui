// A browser suite's server is started from what the lockfile installed, never fetched from the registry.
//
// `npx <bin>` runs the local binary when the package depends on it, and DOWNLOADS it when it does not.
// The design suite started `npx http-server`, which nothing depended on: every CI run fetched it, and
// one day the fetch and start took longer than the webServer's 60 s and the job failed before any test
// ran (#615). The download is invisible locally, where npx's cache is warm.
//
// This reads every Playwright config under packages/*/tests and asserts that each `npx <bin>` in a
// `command:` names a binary installed for that package (its own node_modules/.bin, or the root's).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..');
const PACKAGES = join(REPO, 'packages');

interface Use { config: string; bin: string; installed: boolean }

/** The binaries a config's `command:` lines run through npx, with flags before the name skipped. */
function npxBins(source: string): string[] {
    const bins: string[] = [];
    for (const line of source.split('\n')) {
        if (!/^\s*command\s*:/.test(line)) continue;
        for (const m of line.matchAll(/\bnpx\s+(?:-\S+\s+)*([^\s'"`&|]+)/g)) bins.push(m[1]);
    }
    return bins;
}

function uses(): Use[] {
    const out: Use[] = [];
    for (const dir of readdirSync(PACKAGES)) {
        const tests = join(PACKAGES, dir, 'tests');
        if (!existsSync(tests)) continue;
        for (const file of readdirSync(tests).filter((f) => /^playwright.*\.config\.ts$/.test(f))) {
            for (const bin of npxBins(readFileSync(join(tests, file), 'utf-8'))) {
                const installed = [join(PACKAGES, dir, 'node_modules', '.bin', bin), join(REPO, 'node_modules', '.bin', bin)].some(existsSync);
                out.push({ config: `${dir}/tests/${file}`, bin, installed });
            }
        }
    }
    return out;
}

describe('every browser suite starts its server without the registry (#615)', () => {
    it('reads the configs: npx is used, and vite is among the binaries', () => {
        const all = uses();
        expect(all.length).toBeGreaterThan(0);
        expect(all.map((u) => u.bin)).toContain('vite');
    });

    it('each `npx <bin>` in a webServer command is a binary the package has installed', () => {
        const fetched = uses().filter((u) => !u.installed).map((u) => `${u.config}: npx ${u.bin}`);
        expect(fetched, 'npx would download these on every run').toEqual([]);
    });
});
