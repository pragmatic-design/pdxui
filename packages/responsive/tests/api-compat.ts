// Drop-in guard: exercises exactly the r$ API the PDX contract tests use,
// typechecked against the standalone @responsivejs/design (npm). If this
// compiles, the swap @pdxui/responsive → @responsivejs/design is sound.
// Type-only — never executed.

import { r$ } from '@responsivejs/design';
import type { Page } from '@playwright/test';

export async function _apiCompat(page: Page): Promise<void> {
    const r = r$(page);
    await r.sweep({ url: 'http://x', widths: [320, 768, 1280], selectors: ['.a', '.b'] });

    r.assert
        .noOverflow()
        .sameHeight('.a', '.b')
        .sameLine('.a', '.b')
        .minSize('.a', { height: 44 })
        .monotonic('.a', 'fontSize', 'up')
        .proportion('.a', '.b', { min: 0.15, max: 0.35 });

    const report = r.report();
    void report.pass;
    void report.violations;

    const score = r.score('.a');
    void score.average.overall;
}
