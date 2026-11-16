// The ready flag and the icons (#1117). A named `pdx-icon` is a module loaded on demand: the page says it
// is ready when its components have mounted, and the icon is drawn after. The visual runner shot the
// navbar's logo empty once in CI, in the first theme of its page — the only one shot right after the
// load. `iconsDrawn` is the wait it now does before every screenshot; here the icon's module is held
// back to show the gap and that the wait covers it.

import { test, expect } from './contracts/fixture';
import { goToScenario, iconsDrawn } from './contracts/measure';
import { scenarioPage } from './contracts/generated/manifests';
import { THEMES, schemeFor } from '../../manifests/_themes';

const THEME = THEMES[0];
const logo = 'section:not([hidden]) [data-test="navbar"] pdx-icon';

test('the page is ready before an icon loaded on demand is drawn; iconsDrawn waits for it', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    await page.route('**/icon/pragmatic/box*', async (route) => { await held; await route.continue(); });
    await goToScenario(page, 'navbar-basic', THEME, { page: scenarioPage['navbar-basic'], scheme: schemeFor(THEME) });
    // Ready, and the logo not drawn: what a screenshot taken now would hold.
    expect(await page.locator(`${logo} svg`).count()).toBe(0);
    const waited = iconsDrawn(page);
    release();
    await waited;
    // Read at once, not polled: the wait is what has to have waited.
    expect(await page.locator(`${logo} svg`).count()).toBe(1);
});

test('an icon that never draws fails the wait, named', async ({ page }) => {
    await goToScenario(page, 'navbar-basic', THEME, { page: scenarioPage['navbar-basic'], scheme: schemeFor(THEME) });
    await page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement & { name: string }).name = 'no-such-icon'; }, logo);
    const error = await iconsDrawn(page, 1500).then(() => null, (e: Error) => e.message);
    expect(error).toContain('no-such-icon');
});
