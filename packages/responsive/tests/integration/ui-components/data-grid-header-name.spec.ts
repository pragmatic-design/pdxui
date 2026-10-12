// A data-grid column header is called by its label, and only by it (#263; beta spec, agents.md,
// «Accessibility the framework guarantees», A5).
//
// The header cell had no name of its own, so its accessible name was computed from everything inside
// it: the sort button's text AND the filter button's aria-label. A screen reader announced «Name» as
// «Name Filter Name», and every cell of the column inherits that header when it is read.
//
// Read off the browser's accessibility tree with getByRole, which is the measurement: happy-dom
// computes no accessible names, and axe checks that a header HAS a name, not what it is.

import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const SCENARIO = 'data-grid-header-names';
const THEME = THEMES[0];

test.describe('a data-grid column header is named by its label alone', () => {
    test.beforeEach(async ({ page }) => {
        await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
    });

    test('a sortable, filterable column', async ({ page }) => {
        const grid = page.locator('section:not([hidden]) [data-test="dg"]');
        // The control: the filter button is there, so its label could leak into the header's name.
        await expect(grid.getByRole('button', { name: 'Filter Name' }), 'no filter button: the case measures nothing')
            .toHaveCount(1);
        await expect(grid.getByRole('columnheader', { name: 'Name', exact: true }),
            'the header is not named «Name» alone — its buttons are in its name').toHaveCount(1);
    });

    test('a column whose header is a slot', async ({ page }) => {
        const grid = page.locator('section:not([hidden]) [data-test="dg"]');
        await expect(grid.locator('[role="columnheader"][data-field="city"] em'), 'the slot did not render').toHaveText('Town');
        await expect(grid.getByRole('columnheader', { name: 'Town', exact: true }),
            'the slotted header is not named by its slot text alone').toHaveCount(1);
    });

    test('a plain filterable column', async ({ page }) => {
        const grid = page.locator('section:not([hidden]) [data-test="dg"]');
        await expect(grid.getByRole('columnheader', { name: 'Category', exact: true })).toHaveCount(1);
    });

    test('the sort and filter buttons keep their own names', async ({ page }) => {
        const grid = page.locator('section:not([hidden]) [data-test="dg"]');
        const nameHeader = grid.locator('[role="columnheader"][data-field="name"]');
        await expect(nameHeader.getByRole('button', { name: 'Name', exact: true })).toHaveCount(1);
        await expect(nameHeader.getByRole('button', { name: 'Filter Name', exact: true })).toHaveCount(1);
        await expect(nameHeader).toHaveAttribute('aria-sort', /.+/);
    });
});
