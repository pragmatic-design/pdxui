// Every certify spec takes its `test` from the shared fixture, which keeps one browser context per
// worker.
//
// On Windows a fresh context per test churns the loopback to the scenario server until a connect
// fails: client TIME_WAIT to :5220 peaks at 11,467, `page.goto` gets ERR_CONNECTION_REFUSED in about
// one run in five, and `failOnFlakyTests` blocks the pre-push. `contracts/fixture.ts`
// reuses a context per worker and per set of context options, and resets it between tests. A spec that
// imports `test` from '@playwright/test' quietly goes back to a context per test: this fails on it.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPECS = join(__dirname, '..', '..', 'responsive', 'tests', 'integration', 'ui-components');

/** Whether `source` takes a value `test` from '@playwright/test' (a type-only import does not count). */
function importsPlaywrightTest(source: string): boolean {
    for (const m of source.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@playwright\/test'/gm)) {
        if (m[1]) continue;
        const names = m[2].split(',').map((s) => s.trim()).filter((s) => !s.startsWith('type '));
        if (names.some((n) => n === 'test' || n.startsWith('test as '))) return true;
    }
    return false;
}

/** Whether `source` takes `test` from the fixture. */
function importsFixtureTest(source: string): boolean {
    return /^import\s+\{[^}]*\btest\b[^}]*\}\s+from\s+'\.\/contracts\/fixture'/m.test(source);
}

describe('the reader can fail', () => {
    it('sees a value import of test, and not a type-only one', () => {
        expect(importsPlaywrightTest("import { test, expect } from '@playwright/test';")).toBe(true);
        expect(importsPlaywrightTest("import { expect, test as base } from '@playwright/test';")).toBe(true);
        expect(importsPlaywrightTest("import type { Page } from '@playwright/test';")).toBe(false);
        expect(importsPlaywrightTest("import { type Page, expect } from '@playwright/test';")).toBe(false);
        expect(importsFixtureTest("import { test, expect, type Page } from './contracts/fixture';")).toBe(true);
    });
});

describe('every certify spec reuses the worker context', () => {
    const specs = readdirSync(SPECS).filter((f) => f.endsWith('.spec.ts'));

    it('found the specs', () => {
        expect(specs.length).toBeGreaterThan(40);
    });

    it('none takes test from @playwright/test; each takes it from contracts/fixture', () => {
        const wrong = specs.filter((f) => {
            const src = readFileSync(join(SPECS, f), 'utf8');
            return importsPlaywrightTest(src) || !importsFixtureTest(src);
        });
        expect(wrong, "import { test } from './contracts/fixture'").toEqual([]);
    });
});
