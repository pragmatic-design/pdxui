// The flush benchmark, run alone: `pnpm --filter @pdxui/core run bench` (#48).
//
// Not part of `pnpm test`: it prints times, which measure the machine as much as the code. What it
// counts is asserted in the gate by `tests/signal-flush-counts.test.ts`. happy-dom, as the other
// configs: the list case builds DOM.

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        setupFiles: ['tests/setup/no-network.ts'],
        benchmark: {
            include: ['bench/**/*.bench.ts'],
        },
    },
});
