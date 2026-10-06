// Every Playwright spec in the certification folder is run by `pnpm certify`, or says why it is not.
//
// `packages/responsive`'s `test` script echoes a message and exits 0, so a spec in
// `tests/integration/ui-components/` that `test:certify` does not reach is executed by no gate. A
// regression guard nothing runs passes, and nobody notices the day it stops; a spec nothing runs can
// sit red for an unknown time, precisely because nothing runs it.
//
// A test that is written is not a test that is run. This asks the question of the gate itself: for
// each spec file, does the certify command reach it?

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CERTIFY_EXCLUSIONS, type CertifyExclusion } from '../../responsive/tests/certify-exclusions';

const RESPONSIVE = join(__dirname, '..', '..', 'responsive');
const SPEC_DIR = join(RESPONSIVE, 'tests', 'integration', 'ui-components');

/**
 * The positional file filters of a `playwright test` invocation — Playwright matches them against the
 * spec path. None means the whole testDir runs.
 */
function fileFilters(script: string): string[] {
    const cmd = script.slice(script.indexOf('playwright test'));
    const tokens = cmd.split(/\s+/).slice(2);
    const filters: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t || t === '&&') break;
        if (t.startsWith('--')) {
            if (!t.includes('=') && ['--config', '--project', '--grep', '-g', '--workers', '--reporter'].includes(t)) i++;
            continue;
        }
        filters.push(t);
    }
    return filters;
}

/**
 * The `playwright test` invocation of `script` that uses `config` (a file name, e.g.
 * `playwright-behavior.config.ts`), or null. A script can run several suites, one per config.
 */
function invocation(script: string, config: string): string | null {
    return script.split('&&').map((s) => s.trim()).find((s) => s.includes('playwright test') && s.includes(config)) ?? null;
}

/** Specs certify does not reach and that no exclusion accounts for. */
function unreached(specs: string[], script: string, excluded: CertifyExclusion[]): string[] {
    const filters = fileFilters(script);
    const skip = new Set(excluded.map((e) => e.file));
    return specs.filter((f) => {
        if (skip.has(f)) return false;
        return filters.length > 0 && !filters.some((flt) => f.includes(flt));
    });
}

describe('the check can fail', () => {
    // Three planted cases: a check that always returns [] passes the real assertion perfectly.
    const SPECS = ['a-runner.spec.ts', 'b-guard.spec.ts', 'c-legacy.spec.ts'];

    it('sees a spec that a by-name filter leaves out', () => {
        expect(unreached(SPECS, 'playwright test --config x.ts a-runner', [])).toEqual(['b-guard.spec.ts', 'c-legacy.spec.ts']);
    });
    it('accepts an explicit exclusion', () => {
        const ex = [{ file: 'c-legacy.spec.ts', reason: 'r', issue: '#1' }];
        expect(unreached(SPECS, 'playwright test --config x.ts a-runner b-guard', ex)).toEqual([]);
    });
    it('reads a command with no file filter as the whole folder', () => {
        expect(unreached(SPECS, 'node gen.ts && npx playwright test --config tests/x.ts', [])).toEqual([]);
    });
    it('finds each suite\'s invocation by its config, and none for a config the script does not run', () => {
        const two = 'node gen.ts && npx playwright test --config tests/a.config.ts && npx playwright test --config tests/b.config.ts only-this';
        expect(invocation(two, 'b.config.ts')).toBe('npx playwright test --config tests/b.config.ts only-this');
        expect(unreached(SPECS, invocation(two, 'b.config.ts')!, [])).toEqual(['a-runner.spec.ts', 'b-guard.spec.ts', 'c-legacy.spec.ts']);
        expect(invocation(two, 'c.config.ts')).toBeNull();
    });
});

// The component-coherence behavior suite has its own folder and config. Run by no gate, its tests
// could go red with nobody noticing — the same way as above.
describe('pnpm certify reaches every spec in the behavior folder', () => {
    const dir = join(RESPONSIVE, 'tests', 'integration', 'behavior');
    const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
    const script: string = JSON.parse(readFileSync(join(RESPONSIVE, 'package.json'), 'utf-8')).scripts['test:certify'];
    const run = invocation(script, 'playwright-behavior.config.ts');

    it('found the folder, and test:certify runs its config', () => {
        expect(specs.length, 'no specs found — a wrong path would make the next assertion vacuous').toBeGreaterThan(3);
        expect(run, 'test:certify does not run tests/playwright-behavior.config.ts').not.toBeNull();
    });

    it('leaves no behavior spec unrun', () => {
        // No invocation is not "no filter": it would read as the whole folder, and pass.
        expect(run, 'test:certify does not run tests/playwright-behavior.config.ts').not.toBeNull();
        expect(unreached(specs, run!, []), 'run them from test:certify').toEqual([]);
    });
});

describe('pnpm certify reaches every spec in the certification folder', () => {
    const specs = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.spec.ts'));
    const script: string = JSON.parse(readFileSync(join(RESPONSIVE, 'package.json'), 'utf-8')).scripts['test:certify'];
    const run = invocation(script, 'playwright-ui.config.ts');

    it('found the folder and the command', () => {
        expect(specs.length, 'no specs found — a wrong path would make every other assertion vacuous').toBeGreaterThan(10);
        expect(run, 'test:certify does not run tests/playwright-ui.config.ts').not.toBeNull();
    });

    it('leaves no spec unrun and unexplained', () => {
        expect(run, 'test:certify does not run tests/playwright-ui.config.ts').not.toBeNull();
        expect(unreached(specs, run!, CERTIFY_EXCLUSIONS),
            'these specs are run by no gate — run them from test:certify, or list them in '
            + 'packages/responsive/tests/certify-exclusions.ts with a reason and an issue')
            .toEqual([]);
    });

    it('lists only files that exist, each with a reason and an issue', () => {
        for (const e of CERTIFY_EXCLUSIONS) {
            expect(specs, `${e.file} is excluded but does not exist`).toContain(e.file);
            expect(e.reason.length, `${e.file}: an exclusion with no reason`).toBeGreaterThan(30);
            expect(e.issue, `${e.file}: an exclusion with no issue of this repository (#123)`).toMatch(/^#\d+$/);
        }
    });

    it('keeps the exclusions few', () => {
        // A ratchet at zero: what the legacy contract specs checked lives in the manifests. It may
        // not rise without someone choosing to.
        expect(CERTIFY_EXCLUSIONS.length).toBeLessThanOrEqual(0);
    });
});
