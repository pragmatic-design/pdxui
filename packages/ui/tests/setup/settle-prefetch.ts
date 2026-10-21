// A component's idle prefetch (shared/lazy-tags.ts) loads modules nobody awaits. A test file that
// mounts such a component and ends at once tore its environment down under those loads, and Vitest
// failed the run with an EnvironmentTeardownError (#603). Each file waits for them before it ends.

import { afterAll } from 'vitest';
import { settlePrefetches } from '../../src/shared/lazy-tags';

// A grid prefetches six editors, and under the gate's load cold module loads take seconds each:
// the default hook timeout (10 s) is not a bound on them.
afterAll(settlePrefetches, 30_000);
