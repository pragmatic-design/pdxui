// Times one handler call per case and flush strategy (#48): `pnpm --filter @pdxui/core run bench`.
//
// The cases and what each counts are `signal-flush-cases.ts`; the counts are asserted in the gate by
// `tests/signal-flush-counts.test.ts`. Times are printed by vitest's bench reporter and asserted
// nowhere: they measure the machine as much as the code. Read them side by side, sync against
// batched, on one machine and one run.

import { bench, describe } from 'vitest';
import { CASES, STRATEGIES } from './signal-flush-cases';

for (const c of CASES) {
    describe(c.name, () => {
        for (const strategy of STRATEGIES) {
            const built = c.build(strategy);
            bench(strategy, () => { built.run(); });
        }
    });
}
