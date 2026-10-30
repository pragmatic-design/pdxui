// Every site spec takes its `test` from the suite's fixture (#758).
//
// packages/site/tests/fixture.ts gives page creation a timeout of its own, so that a browser starved
// under the pre-push run fails as a fixture timeout naming `page` instead of eating the test's 30 s.
// A spec that imported `test` from Playwright would have page creation in its 30 s again, silently.
// What the fixture does is measured in the site suite itself (site-fixture.spec.ts), which has a
// browser; this only reads the files.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TESTS = resolve(__dirname, '..', '..', 'site', 'tests');
const specs = readdirSync(TESTS).filter((f) => f.endsWith('.spec.ts'));

describe('every site spec takes its test from the fixture', () => {
    it('reads the specs', () => { expect(specs.length).toBeGreaterThan(50); });

    it.each(specs)('%s', (spec) => {
        const src = readFileSync(join(TESTS, spec), 'utf8');
        expect(src).toMatch(/^import \{ test\b[^}]*\} from '\.\/fixture';$/m);
        expect(src).not.toMatch(/from '@playwright\/test'/);
    });
});
