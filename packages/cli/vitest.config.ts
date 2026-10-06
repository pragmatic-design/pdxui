// Without a config, vitest runs a worker per core, beside three other packages doing the same
// under `test:unit`. This file exists to take the CLI's share instead; everything else is
// vitest's default.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';

export default defineConfig({
    test: {
        maxWorkers: unitTestWorkers(),
    },
});
