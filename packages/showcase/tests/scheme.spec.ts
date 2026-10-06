/**
 * Light and dark, switched from the profile menu's Settings and measured in both.
 *
 * The showcase keeps `pragmatic` as its identity and offers dark as a switch, not a thirteen-theme
 * picker. `index.html` sets `pdx-scheme="light"`, so without this file the reference application
 * would never be seen in dark at all.
 *
 * The switch writes no store of its own. `toggleDarkMode()` persists the choice and applies the
 * precedence: what the user chose, then what the document says, then the OS. So a
 * first visit opens LIGHT even on a machine set to dark, and that is a row below, not an assumption.
 *
 * Dark is measured, not looked at. The contrast is `measureTextContrast`, the same computation the
 * certification manifests' `contrast` rule runs, so the showcase and the components are held to one
 * number by one function.
 */
import { test, expect, type Page } from '@playwright/test';
import { measureTextContrast } from '../../responsive/tests/integration/ui-components/contracts/measure';

const scheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('pdx-scheme'));

/**
 * The switch lives in the profile menu's Settings, so reaching it takes a session.
 * Signs in and lands where the sign-in sends, the account page.
 */
async function signIn(page: Page): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill('admin');
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

/** Settings → the scheme's radio, then Escape twice: the submenu, then the menu. */
async function pick(page: Page, name: 'Light' | 'Dark'): Promise<void> {
    await page.locator('[data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('[data-submenu-key="settings"]').getByRole('menuitemradio', { name }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.pdx-dropdown-menu-panel')).toBeHidden();
}

/**
 * Switch to dark and wait until the page has FINISHED changing colour.
 *
 * Surfaces transition their background (`.pdx-file-dropzone` does), so a scan started right after
 * the click measures a colour half-way between the two schemes: the dropzone's hint at 3.81:1 on
 * #383d3f, a ground neither scheme paints, and only under the load of the whole suite, where the
 * scan reaches that element sooner. Measured: ten transitions running right after the click, the
 * hint at 2.57:1 on the still-light ground, and 6.00:1 once they finish.
 *
 * The condition is what the measurement needs: no CSS TRANSITION still running. Not «no animation»:
 * the dashboard runs an infinite one, and that condition never comes true.
 */
async function goDark(page: Page): Promise<void> {
    await pick(page, 'Dark');
    expect(await scheme(page)).toBe('dark');
    await page.waitForFunction(() => document.getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .every((a) => a.playState !== 'running'));
}

async function openDashboard(page: Page): Promise<void> {
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
}

test('the switch turns the application dark, and back', async ({ page }) => {
    await signIn(page);
    await openDashboard(page);
    expect(await scheme(page)).toBe('light');

    await pick(page, 'Dark');
    expect(await scheme(page), 'the switch did not change the scheme').toBe('dark');

    await pick(page, 'Light');
    expect(await scheme(page)).toBe('light');
});

test('the choice survives a reload', async ({ page }) => {
    await signIn(page);
    await openDashboard(page);
    await pick(page, 'Dark');

    await page.reload();
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    expect(await scheme(page), 'a reload forgot what the visitor chose').toBe('dark');
});

test('the menu says which scheme is on', async ({ page }) => {
    // A radio pair, not a button whose label names the action: a radio says its
    // state with `aria-checked` — one checked, and it moves with the choice.
    await signIn(page);
    await openDashboard(page);
    await pick(page, 'Dark');

    await page.locator('[data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Settings' }).focus();
    await page.keyboard.press('ArrowRight');
    const settings = page.locator('[data-submenu-key="settings"]');
    await expect(settings.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
});

test.describe('control — a machine set to dark, on a first visit', () => {
    test.use({ colorScheme: 'dark' });

    test('opens light, because the document says light and nobody chose otherwise', async ({ page }) => {
        await openDashboard(page);
        expect(await scheme(page), 'the OS preference overrode what the document declares').toBe('light');
    });
});

/**
 * Every visible element that carries text of its own, marked so `measureTextContrast` can find it
 * by selector. Text of its OWN: a wrapper whose words all live in children is measured through them.
 */
async function markText(page: Page): Promise<number> {
    return page.evaluate(() => {
        let n = 0;
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
            const own = [...el.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim() !== '');
            if (!own) continue;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
            // WCAG 1.4.3 exempts text in an inactive control: it is meant to read as unavailable.
            if (el.closest('[disabled], [aria-disabled="true"]')) continue;
            el.setAttribute('data-cprobe', String(n++));
        }
        return n;
    });
}

async function lowContrast(page: Page): Promise<string[]> {
    const count = await markText(page);
    expect(count, 'nothing was measured: every row below would pass on an empty page').toBeGreaterThan(10);
    const failures: string[] = [];
    for (let i = 0; i < count; i++) {
        const sel = `[data-cprobe="${i}"]`;
        const m = await measureTextContrast(page, sel);
        if (!m || m.image) continue; // text over an image is not a ratio two colours can answer
        if (m.ratio < 4.5) {
            const label = await page.locator(sel).evaluate((el) =>
                `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} «${el.textContent!.trim().slice(0, 30)}»`);
            failures.push(`${label}: ${m.ratio.toFixed(2)} (${m.text} on ${m.ground})`);
        }
    }
    return failures;
}

test('control — the scan finds a text that cannot be read', async ({ page }) => {
    // Three screens reporting nothing proves nothing unless the scan can report something. A line
    // painted in the page's own background colour is the unreadable case by construction.
    await signIn(page);
    await openDashboard(page);
    await goDark(page);
    await page.evaluate(() => {
        const p = document.createElement('p');
        p.textContent = 'written in the background colour';
        p.style.color = 'var(--pdx-color-bg)';
        document.querySelector('[data-test="dashboard"]')!.appendChild(p);
    });
    const found = await lowContrast(page);
    expect(found.some((f) => f.includes('written in the background')), 'the scan missed a line nobody can read').toBe(true);
});

for (const [path, ready] of [['/', 'dashboard'], ['/tickets', 'tickets'], ['/tickets/1', 'ticket']] as const) {
    test(`in dark, no text on ${path} sits below 4.5:1`, async ({ page }) => {
        await signIn(page);
        await page.goto(path);
        await expect(page.locator(`[data-test="${ready}"]`)).toBeVisible();
        await goDark(page);

        expect(await lowContrast(page), 'text that is not readable in dark').toEqual([]);
    });
}
