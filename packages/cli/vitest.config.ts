// Without a config, vitest runs a worker per core, beside three other packages doing the same
// under `test:unit`. This file takes the CLI's share instead, and evaluates esbuild from this
// package before any test (`tests/setup-esbuild.ts`); everything else is vitest's default.
import { defineConfig } from 'vitest/config';
import { unitTestWorkers } from '../../build/unit-test-workers';

export default defineConfig({
    test: {
        maxWorkers: unitTestWorkers(),
        setupFiles: ['./tests/setup-esbuild.ts'],
    },
});
