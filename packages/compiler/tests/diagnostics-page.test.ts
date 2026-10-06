// The site's diagnostics page is the catalog, rendered.
//
// `npx vitest run tests/diagnostics-page.test.ts -u` (in packages/compiler) rewrites the page after a
// catalog change; without -u a stale page fails here, naming the difference.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { renderDiagnosticsPage } from '../src/diagnostics/render-page';
import { DIAGNOSTICS } from '../src/diagnostics/catalog';

const PAGE = join(__dirname, '..', '..', 'site', 'content', 'docs', 'diagnostics.md');

describe('the diagnostics page', () => {
    it('is the catalog, rendered', async () => {
        await expect(renderDiagnosticsPage()).toMatchFileSnapshot(PAGE);
    });

    it('has one heading per code, which is the anchor diagnosticUrl() points at', () => {
        const page = renderDiagnosticsPage();
        for (const code of Object.keys(DIAGNOSTICS)) expect(page, code).toContain(`\n### ${code}\n`);
    });
});
