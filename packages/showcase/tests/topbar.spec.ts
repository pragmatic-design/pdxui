/**
 * The header, measured — in both languages.
 *
 * It is the first thing anyone sees of PDX. A `<select class="lang pdx-input">` with **no `.lang`
 * rule** keeps `.pdx-input { width: 100% }`. Inside a flex row a `width: 100%` item takes a
 * flex-basis of the whole row; shrinking is distributed in proportion to basis, so the select keeps
 * the space and everything else is compressed to its min-content — which, with the reset's word
 * breaking, is narrower than the word. In Italian «Cruscotto» then renders in a 66px box, 48px
 * tall — the word **broken across two lines mid-word** — the bar grows from 73px to 110px, and at
 * 390 the page scrolls sideways.
 *
 * BOTH LOCALES, because English hides it: the defect only shows when the labels are short enough
 * for the select to take the difference. In English it looks almost fine and is the same bug.
 *
 * ⚠️ The entries live in the rail and the bar is a SERVICE bar — which is what the reference's
 * topbar symbol contains and nothing else. So the guard follows the labels: the height and the
 * overflow are measured on the bar, because that is where a select lives and a select is what
 * causes all of it; the labels are measured in the rail, which is where a long word has to fit.
 */
import { test, expect, type Page } from '@playwright/test';
import { pickLocale } from './locale';

const WIDTHS = [1440, 1024, 768, 390] as const;

interface Header {
    bar: number;
    select: number;
    overflow: number;
    tallestLink: number;
    lineHeight: number;
    labels: string[];
}

async function measure(page: Page): Promise<Header> {
    return page.evaluate(() => {
        const bar = document.querySelector('.app-bar') as HTMLElement;
        // The language switcher's own button, where there is one: a menu of radios.
        // The bar has none (every route is behind the login, and a signed-in person
        // picks the language in the profile menu); the sign-in has one, measured below.
        const sel = document.querySelector('[data-test="locale"] button, [data-test="login-locale"] button') as HTMLElement | null;
        const links = [...document.querySelectorAll('[data-test="nav"] .pdx-nav-item, .rail-item')] as HTMLElement[];
        const lh = links.length
            ? parseFloat(getComputedStyle(links[0]).lineHeight) || parseFloat(getComputedStyle(links[0]).fontSize) * 1.4
            : 0;
        return {
            bar: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
            select: sel ? Math.round(sel.getBoundingClientRect().width) : 0,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            tallestLink: Math.max(...links.map((a) => {
                const label = a.querySelector('.rail-label') as HTMLElement | null;
                return Math.round((label ?? a).getBoundingClientRect().height);
            })),
            lineHeight: Math.round(lh),
            // The label's own box, not the entry's: an entry has the navigation's rhythm,
            // so its height says nothing about whether the WORD wrapped.
            labels: links.map((a) => (a.querySelector('.rail-label') as HTMLElement | null)?.innerText.trim() ?? ''),
        };
    });
}

/** Load the app in a language and wait for the header to be real. */
async function open(page: Page, locale: 'en' | 'it'): Promise<void> {
    await page.goto('/');
    await expect(page.locator('[data-test="nav"] .pdx-nav-item').first()).toBeVisible();
    if (locale === 'it') {
        await pickLocale(page, 'it');
        await expect(page.locator('[data-test="to-dashboard"] .rail-label')).toHaveText('Cruscotto');
    }
}

for (const locale of ['en', 'it'] as const) {
    test.describe(`the header in ${locale}`, () => {
        test('fits the viewport at every width', async ({ page }) => {
            await open(page, locale);
            for (const width of WIDTHS) {
                await page.setViewportSize({ width, height: 800 });
                await page.waitForTimeout(80);
                const h = await measure(page);
                expect(h.overflow, `${width}px: the page scrolls sideways by ${h.overflow}px`).toBe(0);
            }
        });

        test('never breaks a navigation label onto a second line', async ({ page }) => {
            await open(page, locale);
            for (const width of WIDTHS) {
                await page.setViewportSize({ width, height: 800 });
                await page.waitForTimeout(80);
                const h = await measure(page);
                // The control: the measurement has to have found a line height to compare against.
                expect(h.lineHeight, 'no line height could be read from a nav link').toBeGreaterThan(8);
                expect(h.tallestLink,
                    `${width}px: a label is ${h.tallestLink}px tall against a ${h.lineHeight}px line — `
                    + `it wrapped. Labels: ${h.labels.join(', ')}`)
                    .toBeLessThan(h.lineHeight * 1.5);
            }
        });

        test('keeps the language switcher a switcher, not a panel', async ({ page }) => {
            // On the sign-in: the one screen a switcher is drawn on, a `<pdx-dropdown-menu>`.
            await page.goto('/login');
            await expect(page.locator('[data-test="login-locale"] button')).toBeVisible();
            if (locale === 'it') {
                await pickLocale(page, 'it', '[data-test="login-locale"]');
                await expect(page.locator('html')).toHaveAttribute('lang', 'it');
            }
            await page.setViewportSize({ width: 1440, height: 800 });
            await page.waitForTimeout(80);
            const wide = await measure(page);
            // Two options do not need 830 pixels. 200 is generous for the longest label plus the
            // native arrow, and it is the number that says the element is sized by its content.
            expect(wide.select, `the switcher is ${wide.select}px wide for two options`).toBeLessThan(200);

            await page.setViewportSize({ width: 390, height: 800 });
            await page.waitForTimeout(80);
            const narrow = await measure(page);
            // And it must not be squeezed out of existence at the other end: 54px is narrower than
            // its own arrow plus a letter.
            expect(narrow.select, `at 390px the switcher is ${narrow.select}px — unusable`)
                .toBeGreaterThanOrEqual(64);
        });
    });
}

// ─── At 390 the rail is an overlay ───────────────────────────────────────────
//
// A collapsed rail in the flow at 390 still takes 80 of the 390: the title breaks one letter per
// line and the cluster is squeezed. Nothing OVERFLOWS, which is why the rows above stay green: the
// space is there, and it is unusable.

/** The hit area of every visible control in the bar: the menu button, and the cluster's own. */
const barTargets = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('.app-bar button, .app-bar a, .app-bar select, .app-bar pdx-link')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .map(({ el, r }) => ({ name: el.getAttribute('data-test') ?? el.tagName, w: Math.round(r.width), h: Math.round(r.height) })));

test.describe('at 390', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 800 });
        await page.goto('/');
        await expect(page.locator('[data-test="bar-title"]')).toBeVisible();
    });

    test('the title is one line, not one letter per line', async ({ page }) => {
        const box = await page.locator('[data-test="bar-title"]').evaluate((el) => ({
            height: el.getBoundingClientRect().height,
            line: parseFloat(getComputedStyle(el).lineHeight),
        }));
        expect(box.height, `the title is ${box.height}px tall on a ${box.line}px line`).toBeLessThan(box.line * 1.5);
    });

    test('the page gets the width: the rail takes no column', async ({ page }) => {
        const main = await page.locator('main').evaluate((el) => el.getBoundingClientRect().width);
        expect(main, `main is ${main}px of 390`).toBeGreaterThanOrEqual(358);
    });

    test('every control in the bar is at least 44 by 44', async ({ page }) => {
        const targets = await barTargets(page);
        // The control: the measurement found the menu button and the profile trigger at least. The
        // bar is only ever drawn for someone signed in, so it holds no guest scheme or language
        // switch.
        expect(targets.map((t) => t.name)).toEqual(expect.arrayContaining(['menu', 'profile']));
        const small = targets.filter((t) => t.w < 44 || t.h < 44);
        expect(small, `too small to tap: ${JSON.stringify(small)}`).toEqual([]);
    });

    test('the menu button opens the rail over the page, and Escape gives the focus back', async ({ page }) => {
        const menu = page.locator('[data-test="menu"]');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('[data-test="to-tickets"]'), 'the rail is on screen before it was asked for').toBeHidden();

        await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('[data-test="to-tickets"] .rail-label'), 'the opened rail shows no labels').toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator('[data-test="to-tickets"]'), 'Escape left the rail open').toBeHidden();
        await expect(menu, 'the focus did not come back to the menu button').toBeFocused();
    });

    // A MODAL drawer, as Material 3 draws one: the page behind it is dimmed and does not
    // answer, and a tap on it closes the drawer.
    test('a tap beside the open drawer closes it, and gives the focus back', async ({ page }) => {
        const menu = page.locator('[data-test="menu"]');
        await menu.click();
        await expect(page.locator('[data-test="to-tickets"]')).toBeVisible();
        // The page behind is dimmed: something covers it.
        const covered = await page.evaluate(() => {
            const el = document.elementFromPoint(370, 400);
            return !el?.closest('main');
        });
        expect(covered, 'the page beside the open drawer is still live under the finger').toBe(true);

        await page.mouse.click(370, 400);
        await expect(page.locator('[data-test="to-tickets"]'), 'a tap beside the drawer did nothing').toBeHidden();
        await expect(menu, 'the focus did not come back to the menu button').toBeFocused();
    });

    test('Tab does not walk out of the open drawer into the page', async ({ page }) => {
        await page.locator('[data-test="menu"]').click();
        await expect(page.locator('[data-test="to-tickets"]')).toBeVisible();
        // From the drawer's last control, forward.
        await page.locator('[data-test="side-all"]').focus();
        await page.keyboard.press('Tab');
        const inPage = await page.evaluate(() => !!document.activeElement?.closest('.frame'));
        expect(inPage, 'Tab left the drawer for the page underneath').toBe(false);
    });

    test('a navigation from the open rail closes it', async ({ page }) => {
        await page.locator('[data-test="menu"]').click();
        await page.locator('[data-test="to-tickets"]').click();
        await expect(page).toHaveURL(/\/tickets$/);
        await expect(page.locator('[data-test="to-tickets"]'), 'the rail stayed over the page it opened').toBeHidden();
    });
});

// Material 3's window size classes: a modal drawer only in a COMPACT window (< 600). A MEDIUM
// window keeps the rail as icons in the flow, an EXPANDED one as the visitor left it.
for (const width of [1440, 700]) {
    test(`control — at ${width} the rail is in the flow and there is no menu button`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await expect(page.locator('[data-test="to-tickets"]')).toBeVisible();
        await expect(page.locator('[data-test="menu"]'), 'the drawer button shows outside a compact window').toBeHidden();
        const mainLeft = await page.locator('main').evaluate((el) => el.getBoundingClientRect().left);
        expect(mainLeft, 'the page starts under the rail').toBeGreaterThanOrEqual(80);
    });
}

test('the bar is the same height in both languages', async ({ page }) => {
    // Labels that wrap grow the Italian header by 37px. A header whose height depends on the
    // language is a header that wraps.
    await page.setViewportSize({ width: 1440, height: 800 });
    await open(page, 'en');
    const en = await measure(page);
    await pickLocale(page, 'it');
    await expect(page.locator('[data-test="to-dashboard"] .rail-label')).toHaveText('Cruscotto');
    const it = await measure(page);

    expect(en.bar, `the bar is ${en.bar}px in English and ${it.bar}px in Italian`).toBe(it.bar);
    expect(en.bar, `the header is ${en.bar}px tall`).toBeLessThan(80);
});
