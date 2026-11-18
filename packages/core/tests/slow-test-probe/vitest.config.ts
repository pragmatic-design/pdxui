// The planted failures of slow-test-record.test.ts (#1183), run through the real setup file. Only that
// test runs this config: the fixtures are not `*.test.ts`, so no package suite collects them.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        root: __dirname,
        environment: 'node',
        include: ['*.fixture.ts'],
        setupFiles: ['../setup/slow-test-record.ts'],
        maxWorkers: 1,
    },
});
