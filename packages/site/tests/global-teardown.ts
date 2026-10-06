// After every run of the site suite: a failed test's trace is copied to `test-results-kept/`, which
// no run empties, and the path is printed so the gate log says where to read it.

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { keepFailures } from './keep-failures';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default function globalTeardown(): void {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const kept = keepFailures(resolve(packageDir, 'test-results'), resolve(packageDir, 'test-results-kept'), stamp);
    if (kept) console.log(`[site] the failed tests' traces are kept in ${kept}`);
}
