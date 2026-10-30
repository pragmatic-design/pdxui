// The probe's run, a tenth of the site suite's budgets: a test timeout of 3 s here stands for its 30 s,
// and the caller sets PDX_SITE_PAGE_TIMEOUT to 6 s for the page's 60 s.

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'probe.pw.ts',
    timeout: 3_000,
    workers: 1,
    outputDir: process.env.PDX_PROBE_OUT,
    reporter: [['../slow-fixtures-reporter.ts'], ['json', { outputFile: process.env.PDX_PROBE_JSON }]],
});
