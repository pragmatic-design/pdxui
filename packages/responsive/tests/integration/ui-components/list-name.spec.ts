// A pdx-list's list can be named (#1053). Its role="list" is an inner element, so a name written on
// the host named nothing, and two lists on one page — comments and attachments on a ticket — were
// both announced as an unnamed «list». The host's aria-label and aria-labelledby are its ariaLabel and
// ariaLabelledby props, as for pdx-input and pdx-button, written on the role="list" element.
//
// Read off the browser's accessibility tree with getByRole, which is the measurement: happy-dom
// computes no accessible names, and axe checks that an attribute is allowed, not what it names.

import { test, expect } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const SCENARIO = 'list-named';
const THEME = THEMES[0];

test.describe('a pdx-list names its list', () => {
    test.beforeEach(async ({ page }) => {
        await goToScenario(page, SCENARIO, THEME, { page: scenarioPage[SCENARIO], scheme: schemeFor(THEME) });
    });

    test('by an aria-label written on the host', async ({ page }) => {
        const host = page.locator('section:not([hidden]) [data-test="by-label"]');
        await expect(host.getByRole('listitem'), 'the list did not render').toHaveCount(1);
        await expect(host.getByRole('list', { name: 'Comments', exact: true })).toHaveCount(1);
    });

    test('by an aria-labelledby written on the host, the id of an element on the page', async ({ page }) => {
        const host = page.locator('section:not([hidden]) [data-test="by-labelledby"]');
        await expect(host.getByRole('list', { name: 'Tasks', exact: true })).toHaveCount(1);
    });

    test('a name changed after mount is the name read', async ({ page }) => {
        const host = page.locator('section:not([hidden]) [data-test="by-label"]');
        await host.evaluate((el) => el.setAttribute('aria-label', 'Replies'));
        await expect(host.getByRole('list', { name: 'Replies', exact: true })).toHaveCount(1);
        await host.evaluate((el) => el.removeAttribute('aria-label'));
        await expect(host.getByRole('list'), 'the name outlived the attribute').not.toHaveAttribute('aria-label');
    });
});
