// The shell: a three-state rail, a service bar.
//
// The design system has `pdx-sidebar`, `pdx-app-layout`, `pdx-navbar`, `pdx-nav-menu` and
// `pdx-breadcrumb` as first-class components, and the reference application's shell uses them
// rather than a horizontal `<nav>` of links and a language select.
//
// The widths are the reference's, read from the `.sketch` rather than chosen:
// 80 collapsed · 300 expanded · 360 for the entity list, which it draws over the content.
//
// What the rail carries is the reference's too: entries in groups over a rule, the counter ON the
// item rather than in a bell, the pin and the open-in-new an expanded entry offers, and the
// environment badge with the version at the foot.
import { test, expect, type Page } from '@playwright/test';
import { pickLocale } from './locale';

/** The two, and the width each one is. «All entities» is a panel beside the rail,
 *  not a third, wider state of it. */
const WIDTH = { collapsed: 80, expanded: 300 } as const;

const railWidth = (page: Page) =>
    page.locator('[data-test="sidebar"]').evaluate((el) => Math.round(el.getBoundingClientRect().width));

/**
 * Polled, because the width is written in a `requestAnimationFrame` and animated on the way.
 * Read once, right after a click, this measures 278 on a rail heading for 80.
 */
const expectWidth = (page: Page, width: number, why: string) =>
    expect.poll(() => railWidth(page), { message: why }).toBe(width);

const state = (page: Page) =>
    page.locator('.app').evaluate((el) => el.getAttribute('data-side'));

/** A fresh visitor: no remembered state, no session. */
async function open(page: Page, path = '/'): Promise<void> {
    await page.goto(path);
    await expect(page.locator('[data-test="sidebar"]')).toBeVisible();
}

test('the rail opens at the width the reference expands to', async ({ page }) => {
    await open(page);
    expect(await state(page)).toBe('expanded');
    await expectWidth(page, WIDTH.expanded, 'the expanded rail is not 300');
});

test('and collapses to icons at 80', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-handle"]').click();

    expect(await state(page)).toBe('collapsed');
    await expectWidth(page, WIDTH.collapsed, 'the collapsed rail is not 80');
    // Icons only: the labels go, and so do the affordances that need one.
    await expect(page.locator('[data-test="to-tickets"] .rail-label')).toBeHidden();
    await expect(page.locator('[data-test="to-tickets"]'), 'the entry itself left with its label')
        .toBeVisible();
});

// ─── The rail's second level: the catalogue ──────────────────────────────────
//
// The rail's second level is not its entries unfolding: it is a SECOND panel beside it with more
// entries, which can be pinned into the first. «All entities» opens that catalogue beside the rail,
// over the content — not the same rail widened to 360 showing the same entries.

const catalog = (page: Page) => page.locator('[data-test="catalog"]');

test('«All entities» opens a panel beside the rail, and the rail keeps its width', async ({ page }) => {
    await open(page);
    const all = page.locator('[data-test="side-all"]');
    await expect(all).toHaveAttribute('aria-expanded', 'false');
    await all.click();

    await expect(catalog(page), 'no panel opened').toBeVisible();
    await expect(all).toHaveAttribute('aria-expanded', 'true');
    await expectWidth(page, WIDTH.expanded, 'the rail itself changed width');
    // Beside the rail, not inside it.
    const rail = await page.locator('[data-test="sidebar"]').boundingBox();
    const panel = await catalog(page).boundingBox();
    expect(panel!.x, 'the panel is not beside the rail').toBeGreaterThanOrEqual(rail!.x + rail!.width - 1);
});

test('the catalogue lists entries the rail does not carry', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    // Employees is not a favourite on a first visit.
    const onlyHere = catalog(page).locator('[data-test="cat-employees"]');
    await expect(onlyHere, 'the catalogue has nothing the rail lacks').toBeVisible();
    await expect(page.locator('[data-test="nav"] [data-test="to-employees"]'), 'it is in the rail already')
        .toHaveCount(0);
});

test('an entry pinned from the catalogue joins the rail\'s Pinned group, and stays after a reload', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    const pin = catalog(page).locator('[data-test="cat-employees-pin"]');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-test="nav"] [data-test="to-employees"]'), 'not in the rail after pinning')
        .toBeVisible();

    await page.reload();
    await expect(page.locator('[data-test="nav"] [data-test="to-employees"]'), 'the pin did not survive a reload')
        .toBeVisible();
    // And it navigates from there.
    await page.locator('[data-test="nav"] [data-test="to-employees"]').click();
    await expect(page).toHaveURL(/\/employees$/);
});

test('Escape closes the catalogue, and the focus returns to «All entities»', async ({ page }) => {
    await open(page);
    const all = page.locator('[data-test="side-all"]');
    await all.click();
    await expect(catalog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(catalog(page)).toBeHidden();
    await expect(all).toBeFocused();
});

test('folding a group of the catalogue keeps it open: only a choice or a click outside closes it', async ({ page }) => {
    // Folding a group is not a choice: the second level stays open.
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await expect(catalog(page)).toBeVisible();
    const heading = catalog(page).locator('[data-test="cat-h-work"]');
    const toggle = heading.locator('xpath=ancestor-or-self::*[@aria-expanded][1]');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await heading.click();
    await expect(toggle, 'the group did not fold').toHaveAttribute('aria-expanded', 'false');
    await expect(catalog(page), 'folding a group closed the catalogue').toBeVisible();

    await heading.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(catalog(page), 'unfolding it closed the catalogue').toBeVisible();
});

test('a click outside closes it, and choosing an entry navigates and closes it', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await page.locator('.frame main').click({ position: { x: 900, y: 400 } });
    await expect(catalog(page), 'a click outside left it open').toBeHidden();

    await page.locator('[data-test="side-all"]').click();
    await catalog(page).locator('[data-test="cat-board"]').click();
    await expect(page).toHaveURL(/\/board$/);
    await expect(catalog(page), 'it stayed over the page it opened').toBeHidden();
});

// ─── The catalogue is the rail's second column ───────────────────────────────
//
// The reference's second level is a column attached to the rail, the window's height, the rail's
// own colour, with a search at its top — not a card floating over the page, with a shadow, its own
// surface and a gap above, which looks like it is hanging there.

const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, shadow: cs.boxShadow, bg: cs.backgroundColor };
});

for (const side of ['expanded', 'collapsed'] as const) {
    test(`${side}: the catalogue is a column attached to the rail, full height, in the rail's colour`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await open(page);
        if (side === 'collapsed') {
            await page.locator('[data-test="side-handle"]').click();
            await expectWidth(page, WIDTH.collapsed, 'the rail did not collapse');
        }
        await page.locator('[data-test="side-all"]').click();
        await expect(catalog(page)).toBeVisible();

        const rail = await box(page, '[data-test="sidebar"]');
        const panel = await box(page, '[data-test="catalog"]');
        expect(Math.abs(panel.left - rail.right), `the panel starts at ${panel.left}, the rail ends at ${rail.right}`).toBeLessThanOrEqual(1);
        expect(panel.top, 'the panel does not start at the top of the window').toBe(0);
        expect(Math.round(panel.height), 'the panel is not the window\'s height').toBe(900);
        expect(panel.shadow, 'the panel floats: it has a shadow').toBe('none');
        expect(panel.bg, 'the panel is not in the rail\'s colour').toBe(rail.bg);

        const railHead = await box(page, '.rail-head');
        const head = await box(page, '[data-test="catalog"] .catalog-head');
        expect(Math.abs(head.bottom - railHead.bottom), `the heads end at ${head.bottom} and ${railHead.bottom}`).toBeLessThanOrEqual(1);
    });
}

// The collapsed RAIL hides its labels, and the rule must not reach every `.rail-label` under `.app`
// — the catalogue's too: a list of every entity by glyph alone, and a search filtering entries
// nobody can read. The row above measures geometry and colour only, so it stays green on that.
test('collapsed: the catalogue still names its entries, and the rail does not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.locator('[data-test="side-handle"]').click();
    await expectWidth(page, WIDTH.collapsed, 'the rail did not collapse');
    await page.locator('[data-test="side-all"]').click();
    await expect(catalog(page)).toBeVisible();

    const label = catalog(page).locator('.rail-label').first();
    await expect(label, 'the catalogue\'s entries lost their names').toBeVisible();
    const width = await label.evaluate((el) => el.getBoundingClientRect().width);
    expect(width, 'the label is there but has no room').toBeGreaterThan(40);

    // Control: the collapsed rail keeps its own labels hidden.
    await expect(page.locator('[data-test="sidebar"] .rail-nav .rail-label').first()).toBeHidden();
});

test('with the catalogue open, the rail\'s handle is on top of it and still works', async ({ page }) => {
    // The collapse handle stays OVER the second column: under it, half of it is hidden, and the
    // pointer at its centre finds the panel.
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await expect(catalog(page)).toBeVisible();

    const handle = page.locator('[data-test="side-handle"]');
    const hit = await handle.evaluate((el) => {
        const r = el.getBoundingClientRect();
        // Its right half is the half over the panel.
        const at = document.elementFromPoint(r.left + r.width * 0.75, r.top + r.height / 2);
        return !!at && (at === el || el.contains(at));
    });
    expect(hit, 'the handle is under the catalogue').toBe(true);
    await handle.click();
    await expectWidth(page, WIDTH.collapsed, 'the handle did not collapse the rail');
});

test('the catalogue opens on its search, and the search narrows it', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    const search = catalog(page).locator('[data-test="catalog-search"]');
    await expect(search, 'the search does not have the focus').toBeFocused();

    const entries = catalog(page).locator('.pdx-nav-item[href]');
    const all = await entries.count();

    await search.fill('empl');
    // «Employees»: every entry whose name has it, and nothing else. pdx-nav-menu rebuilds its
    // entries in the frame after the change, so the narrowed list is waited for, not read at once:
    // read before that frame it is still the whole list (12 of 12, once in CI).
    await expect.poll(() => entries.count(), { message: 'nothing was filtered' }).toBeLessThan(all);
    const names = await entries.allInnerTexts();
    expect(names.every((n) => /empl/i.test(n)), `left: ${names.join(' | ')}`).toBe(true);
    await expect(catalog(page).locator('[data-test="catalog-empty"]')).toBeHidden();

    await search.fill('zzz');
    await expect(entries).toHaveCount(0);
    await expect(catalog(page).locator('[data-test="catalog-empty"]'), 'no match says nothing').toBeVisible();

    // Control: the whole list comes back.
    await search.fill('');
    await expect(entries).toHaveCount(all);
});

test('the search ignores case and accents, and ArrowDown moves into the list', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    const search = catalog(page).locator('[data-test="catalog-search"]');
    // Not «board»: «Dashboard» has it too, and the search is right to keep both.
    await search.fill('IMPÒRT');
    await expect(catalog(page).locator('.pdx-nav-item[href]')).toHaveText([/Import/]);
    await search.press('ArrowDown');
    await expect(catalog(page).locator('[data-test="cat-import"]')).toBeFocused();
});

test('a pin set on a search result writes the rail\'s Pinned group', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await catalog(page).locator('[data-test="catalog-search"]').fill('empl');
    await catalog(page).locator('[data-test="cat-employees-pin"]').click();
    await expect(page.locator('[data-test="nav"] [data-test="to-employees"]'), 'the pin did not reach the rail').toBeVisible();
});

test('the pin is a pushpin drawn in SVG, not a text glyph, and says whether it is pinned', async ({ page }) => {
    await open(page);
    // Board is a favourite on a first visit, so its pin is pressed.
    const pin = page.locator('[data-test="to-board-pin"]');
    await expect(pin.locator('svg'), 'the pin is not an svg').toHaveCount(1);
    expect((await pin.textContent())?.trim(), 'a text glyph is still in the pin').toBe('');
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
});

// Siblings of the entry's link, so they are read on their own: twelve «Pin this entry» are twelve
// buttons nobody can tell apart.
test('each entry\'s pin and new-tab link name the entry they act on, in the page\'s language', async ({ page }) => {
    await open(page);
    const pins = page.locator('[data-test="nav"] button[data-test$="-pin"]');
    const names = await pins.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(names.length, 'the premise: the rail carries pinned entries').toBeGreaterThan(1);
    expect(new Set(names).size, `the pins share a name: ${names}`).toBe(names.length);
    await expect(page.getByRole('button', { name: 'Pin Board', exact: true })).toHaveAttribute('data-test', 'to-board-pin');
    await expect(page.getByRole('link', { name: 'Open Board in a new tab', exact: true })).toHaveAttribute('data-test', 'to-board-new');

    // The catalogue's pins too.
    await page.locator('[data-test="side-all"]').click();
    await expect(page.locator('[data-test="catalog"]').getByRole('button', { name: 'Pin Employees', exact: true }))
        .toHaveAttribute('data-test', 'cat-employees-pin');

    await page.keyboard.press('Escape');
    await pickLocale(page, 'it');
    await expect(page.getByRole('button', { name: 'Appunta Bacheca', exact: true })).toHaveAttribute('data-test', 'to-board-pin');
    await expect(page.getByRole('link', { name: 'Apri Bacheca in una nuova scheda', exact: true })).toHaveAttribute('data-test', 'to-board-new');
});

test('control — pinning an entry the rail carries does not duplicate it in its own group', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await catalog(page).locator('[data-test="cat-account-pin"]').click();
    await expect(page.locator('[data-test="nav"] [data-test="to-account"]'), 'the entry is in the rail twice')
        .toHaveCount(1);
});

test('the state survives a reload, because a navigation that forgets is one you set again', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-handle"]').click();
    expect(await state(page)).toBe('collapsed');

    await page.reload();
    await expect(page.locator('[data-test="sidebar"]')).toBeVisible();
    expect(await state(page), 'the rail forgot how it was left').toBe('collapsed');
    await expectWidth(page, WIDTH.collapsed, 'the remembered state did not reach the width');
});

test('every state is reachable from the keyboard, and says which it is in', async ({ page }) => {
    // Dim 4's shape: the controls that change the shell are buttons, they are in the tab order, and
    // they carry the state they are in rather than only drawing it.
    await open(page);
    const handle = page.locator('[data-test="side-handle"]');
    await expect(handle).toHaveAttribute('aria-expanded', 'true');

    await handle.focus();
    await page.keyboard.press('Enter');
    await expect(handle, 'the handle does not report the state it put the rail in')
        .toHaveAttribute('aria-expanded', 'false');
    await expectWidth(page, WIDTH.collapsed, 'Enter reported the state without changing it');

    await page.keyboard.press('Enter');
    await expectWidth(page, WIDTH.expanded, 'Enter did not open it again');
});

test('an entry carries its own count, and there is no bell', async ({ page }) => {
    // The reference puts the counter ON the item: a number in a bell tells you something is
    // somewhere, a number on the entry tells you where.
    await open(page);
    await expect(page.locator('[data-test="to-tickets-count"]'), 'the tickets entry carries no count')
        .toBeVisible();
    await expect(page.locator('.app-bar [data-test$="-count"]'), 'a count moved into the bar')
        .toHaveCount(0);
});

// ─── The rail is personal ────────────────────────────────────────────────────
//
// One kind of entry, not entries by default AND pinned copies of them that jump to the top. The
// rail is Dashboard, Favourites and Recents: one kind of favourite, pinned in the catalogue and
// unpinned in the rail; every entity lives in the second level.

const railEntries = (page: Page) => page.locator('[data-test="nav"] .pdx-nav-item[href]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-test')));

async function signInAs(page: Page, username: 'admin' | 'tech'): Promise<void> {
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill(username);
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
}

test('a first visit: Dashboard, then the Favourites Tickets, Board and Customers, and no entity groups', async ({ page }) => {
    await open(page);
    expect(await railEntries(page)).toEqual(['to-dashboard', 'to-tickets', 'to-board', 'to-customers']);
    await expect(page.locator('[data-test="group-h-fav"]')).toBeVisible();
    for (const gone of ['group-h-work', 'group-h-entity', 'group-h-you', 'group-h-pin']) {
        await expect(page.locator(`[data-test="nav"] [data-test="${gone}"]`), `${gone} is still in the rail`).toHaveCount(0);
    }
});

test('unpinning a favourite in the rail removes it, and the catalogue still has it, unpinned', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="to-board-pin"]').click();
    await expect(page.locator('[data-test="nav"] [data-test="to-board"]'), 'the unpinned entry stayed').toHaveCount(0);
    await page.locator('[data-test="side-all"]').click();
    await expect(catalog(page).locator('[data-test="cat-board-pin"]')).toHaveAttribute('aria-pressed', 'false');
});

test('pinning in the catalogue adds the entry at the END of the Favourites, not at the top', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await catalog(page).locator('[data-test="cat-employees-pin"]').click();
    expect(await railEntries(page)).toEqual(['to-dashboard', 'to-tickets', 'to-board', 'to-customers', 'to-employees']);
});

test('Recents: the lists last opened, most recent first, a record counting as its list, no favourite twice', async ({ page }) => {
    await open(page);
    // Customers is a favourite on a first visit: unpinned, it can be a recent.
    await page.locator('[data-test="to-customers-pin"]').click();
    await page.goto('/employees');
    await expect(page.locator('[data-test="employees"]')).toBeVisible();
    await page.goto('/customers/1');
    await expect(page.locator('[data-test="group-h-recent"]')).toBeVisible();
    const recents = await page.locator('[data-test="nav"] .pdx-nav-item[href][data-test^="recent-"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-test')));
    expect(recents).toEqual(['recent-customers', 'recent-employees']);

    // A favourite opened is not a recent: Tickets is pinned.
    await page.goto('/tickets/3');
    await expect(page.locator('[data-test="nav"] [data-test="recent-tickets"]')).toHaveCount(0);

    // No entry twice in the rail.
    const all = await page.locator('[data-test="nav"] .pdx-nav-item[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(new Set(all).size, `twice: ${all.join(', ')}`).toBe(all.length);
});

test('Recents survive a reload, and are each person\'s own', async ({ page }) => {
    await signInAs(page, 'admin');
    await page.goto('/employees');
    await expect(page.locator('[data-test="employees"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-test="nav"] [data-test="recent-employees"]'), 'the recent did not survive a reload').toBeVisible();

    // Another person on the same browser does not see the first one's recents.
    await page.locator('[data-test="profile"]').click();
    await page.locator('.pdx-dropdown-menu-panel').getByRole('menuitem', { name: 'Sign out' }).click();
    await signInAs(page, 'tech');
    await expect(page.locator('[data-test="nav"] [data-test="recent-employees"]'), 'admin\'s recents are the technician\'s').toHaveCount(0);
});

test('control — pinning a recent moves it to the Favourites and out of the Recents', async ({ page }) => {
    await open(page);
    await page.goto('/employees');
    await expect(page.locator('[data-test="nav"] [data-test="recent-employees"]')).toBeVisible();
    await page.locator('[data-test="recent-employees-pin"]').click();
    await expect(page.locator('[data-test="nav"] [data-test="recent-employees"]')).toHaveCount(0);
    expect(await railEntries(page)).toContain('to-employees');
});

test('the foot names the environment and the version', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-test="env"]')).toHaveText('STAGING');
    await expect(page.locator('[data-test="version"]')).toHaveText(/^v\d+\.\d+\.\d+$/);
});

// ─── The rail stays in the window ────────────────────────────────────────────
//
// The rail is as tall as the window and stays put: on a long page such as /customers its foot does
// not sit at the bottom of the PAGE, below the fold, and the rail does not scroll away with the list.

const railInWindow = (page: Page) => page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    return { foot: r('.rail-foot'), head: r('.rail-head'), vh: innerHeight, scrolled: scrollY };
});

test('with a long page scrolled to its end, the rail\'s foot is still in the window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/customers');
    await expect(page.locator('[data-test="customers"] [role="gridcell"]').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const at = await railInWindow(page);
    expect(at.scrolled, 'the premise: the page is longer than the window and scrolled').toBeGreaterThan(0);
    expect(at.foot.bottom, `the foot ends at ${at.foot.bottom}, the window at ${at.vh}`).toBeLessThanOrEqual(at.vh);
    expect(at.foot.top, 'the foot is above the window').toBeGreaterThanOrEqual(0);
    expect(at.head.top, 'the rail scrolled away: its head left the window').toBe(0);
});

test('a page whose height ends in a fraction of a pixel scrolls to its end without moving the rail', async ({ page }) => {
    // The document's scroll extent is whole pixels and the content's height need not be: a page of
    // 931.5px scrolls to 32, half a pixel past the shell's bottom. A rail held by the shell — sticky
    // inside it — was pushed up by that half (-0.5 on the GitHub runner, whose fonts give such
    // heights). Held by the window instead, it does not move.
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/customers');
    await expect(page.locator('[data-test="customers"] [role="gridcell"]').first()).toBeVisible();
    await page.evaluate(() => {
        const half = document.createElement('div');
        half.style.height = '0.5px';
        document.querySelector('main')!.appendChild(half);
        window.scrollTo(0, document.body.scrollHeight);
    });
    const at = await railInWindow(page);
    expect(at.scrolled, 'the premise: the page is longer than the window and scrolled').toBeGreaterThan(0);
    expect(at.head.top, 'the rail moved with the page').toBe(0);
});

test('in a window shorter than the rail\'s list, the list scrolls inside the rail and the foot stays', async ({ page }) => {
    // A rail of every entity pinned: the first-visit rail is four entries and fits any window.
    await page.addInitScript(() => localStorage.setItem('showcase.pins', JSON.stringify(
        ['tickets', 'intake', 'board', 'customers', 'import', 'employees', 'account', 'settings'])));
    await page.setViewportSize({ width: 1440, height: 420 });
    await open(page, '/customers');
    const at = await railInWindow(page);
    expect(at.foot.bottom, `the foot ends at ${at.foot.bottom}, the window at ${at.vh}`).toBeLessThanOrEqual(at.vh);
    const nav = await page.locator('[data-test="nav"]').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(nav.scroll, 'the premise: the list is taller than its room').toBeGreaterThan(nav.client);
});

test('the bar is a SERVICE bar: no navigation in it', async ({ page }) => {
    // What the reference's topbar symbol contains is the right-hand cluster and nothing else. The
    // navigation is the rail's job, and a bar that keeps a copy of it is two navigations to keep
    // in step.
    await open(page);
    await expect(page.locator('.app-bar pdx-nav-menu, .app-bar .pdx-nav-item'), 'the navigation is still in the bar')
        .toHaveCount(0);
    await expect(page.locator('[data-test="bar-cluster"]')).toBeVisible();
    // The person, since the bar is only drawn for someone signed in; a guest has no bar, and no
    // language switch in it.
    await expect(page.locator('[data-test="session"] [data-test="profile"]')).toBeVisible();
});

test('and the cluster ends with the person, once they are signed in', async ({ page }) => {
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill('admin');
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();

    const avatar = page.locator('[data-test="avatar"]');
    await expect(avatar, 'the avatar is not in the bar').toBeVisible();
    await expect(avatar, 'the avatar does not carry the initials of the person').toHaveText('AA');
    // Last in the cluster, after the divider — the reference's order.
    const order = await page.locator('[data-test="bar-cluster"] > *').evaluateAll(
        (els) => els.map((e) => e.getAttribute('data-test') ?? e.className));
    expect(order[order.length - 1], 'the person is not last in the cluster').toBe('session');
});

test('the trail is route-derived AND names the entity', async ({ page }) => {
    // How the trail names the entity matters:
    //
    // `<pdx-breadcrumb>` takes `items`, so a page CAN assemble the trail it wants — and a page that
    // does loses the route-derived trail. Nothing in `app.pdx` or in any page mentions a crumb: the
    // trail comes from the `label` on each `@page`, so a renamed route renames the breadcrumb by
    // itself and a trail cannot go stale. Supplying `items` from the ticket page works, and takes
    // that down.
    //
    // The third way names it: a route label that is a FUNCTION of the params. The page
    // declares `@page '/tickets/:id' { label: ticketLabel }`, the compiler hoists the function to
    // module scope and registers the reference, and both routers call it while building the trail.
    // The page still passes no `items`, which is what this row is here to hold.
    await page.goto('/tickets/1');
    await expect(page.locator('[data-test="crumbs"] .pdx-breadcrumb-item').last())
        .toHaveText(/T-1000 · Printer on floor 2 is jammed/);
    await expect(page.locator('[data-test="ticket"] pdx-breadcrumb'),
        'the page assembled a trail of its own')
        .not.toHaveAttribute('items', /./);
});

// ─── The modal rule ───────────────────────────────────────────────────────────

test('the modal is the width the application states, and only that', async ({ page }) => {
    // Two widths and no others: the reference uses 650 for everything and 850 for a wizard. The
    // design system defaults to its own five sizes; the shell states which two this app uses, and
    // the dialog reads them from the tokens rather than from a stylesheet of the app's own.
    // At a width the modal fits in: below ~700 the panel is the viewport's, which is what a modal
    // should do and not what is under test here.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets');
    await page.locator('[data-test="new"] button').click();

    const panel = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(panel).toBeVisible();

    // The CEILING is the statement, and the rendered width obeys it: the library also gives a panel
    // `width: 90%`, so a modal never touches the edges of what it sits in — measured 647 of a 650
    // ceiling in a 1140px content area. Asserting the rendered number alone would be asserting
    // the width of the rail beside it.
    const box = await panel.evaluate((el) => ({
        width: Math.round(el.getBoundingClientRect().width),
        max: getComputedStyle(el).maxWidth,
    }));
    expect(box.max, 'the modal does not take the width the application stated').toBe('650px');
    expect(box.width, `the modal is ${box.width}px against a 650 ceiling`).toBeLessThanOrEqual(650);
    expect(box.width, 'the modal collapsed well under its ceiling').toBeGreaterThan(600);
});

test('and its header and footer are the heights the application states', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets');
    await page.locator('[data-test="new"] button').click();
    const header = page.locator('[data-test="create-dialog"] .pdx-dialog-header');
    await expect(header).toBeVisible();

    // 64 plus the 1px rule under it — the reference draws that rule too, and a `min-height` does
    // not include a border. Stated rather than rounded away.
    //
    // Polled: a dialog animates in, and read once this measures a header mid-transition — green
    // alone and red in a full run, which is the worst shape a test can have.
    await expect.poll(
        () => header.evaluate((el) => Math.round(el.getBoundingClientRect().height)),
        { message: 'the header is not the stated 64 plus its rule' },
    ).toBe(65);
});

test('control — the design system does NOT default to those numbers', async ({ page }) => {
    // Without this, "the modal is 650" would be satisfied by a library that ships 650, and the
    // application's declaration would be decoration. 480 is the library's md dialog, and what
    // `dialog.manifest.ts` asserts per theme.
    await page.goto('/tickets');
    const fromRoot = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--pdx-dialog-width-md').trim());
    const fromShell = await page.locator('pdx-app .app').evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--pdx-dialog-width-md').trim());

    expect(fromRoot, 'the design system no longer ships its own default width').toBe('480px');
    expect(fromShell, 'the shell states no width of its own').toBe('650px');
});

// ─── The rail's head meets the bar ────────────────────────────────────────────

const bottoms = (page: Page) => page.evaluate(() => {
    const edge = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const head = edge('.rail-head');
    const bar = edge('.app-bar');
    return { head: head.bottom, bar: bar.bottom, barHeight: bar.height };
});

for (const width of [1440, 1024]) {
    for (const side of ['expanded', 'collapsed'] as const) {
        test(`at ${width}, ${side}: the rail's head ends on the bar's bottom rule`, async ({ page }) => {
            // Not the reference's 120px head, its room for a graphic logo: the showcase has none,
            // and its rule would sit well below the bar's.
            await page.setViewportSize({ width, height: 900 });
            await open(page);
            if (side === 'collapsed') {
                await page.locator('[data-test="side-handle"]').click();
                await expectWidth(page, WIDTH.collapsed, 'the rail did not collapse');
            }
            const b = await bottoms(page);
            expect(Math.abs(b.head - b.bar), `the head ends at ${b.head}, the bar at ${b.bar}`).toBeLessThanOrEqual(1);
            // Control: the bar kept its own height. Meeting the rail by shrinking the bar would pass
            // the row above. 73 is the bar at zero: two 16px insets, the 40px language select, a 1px rule.
            expect(Math.round(b.barHeight), 'the bar changed height to meet the rail').toBe(73);
        });
    }
}

// ─── The handle sits on the bar's edge at every density ──────────────────────
//
// The bar's height follows `--pdx-density-factor`, which the profile menu's Settings sets, so a
// handle at a fixed 62px — the bar's bottom at density 1 — leaves the crossing when the density
// changes. `normal` is the control: it passes either way.
for (const density of ['compact', 'normal', 'comfortable']) {
    test(`at density ${density}, the rail's handle is centred on the bar's bottom edge`, async ({ page }) => {
        await page.addInitScript((d) => localStorage.setItem('showcase.density', d), density);
        await page.setViewportSize({ width: 1440, height: 900 });
        await open(page);
        const at = await page.evaluate(() => {
            const handle = document.querySelector('[data-test="side-handle"]')!.getBoundingClientRect();
            const bar = document.querySelector('.app-bar')!.getBoundingClientRect();
            return { centre: handle.top + handle.height / 2, edge: bar.bottom };
        });
        expect(Math.abs(at.centre - at.edge), `the handle's centre is at ${at.centre}, the bar ends at ${at.edge}`)
            .toBeLessThanOrEqual(1.5);
    });
}

// ─── Two levels, on pdx-nav-menu ─────────────────────────────────────────────
//
// The reference's menu has a second level. The rail is the framework's `pdx-nav-menu`, not
// hand-written markup one level deep: it brings the keyboard, folding headings, a flyout when
// collapsed, a lighter import and navigation under the router.

test('the rail is the framework\'s pdx-nav-menu, not hand-written markup', async ({ page }) => {
    await open(page);
    expect(await page.locator('[data-test="nav"]').evaluate((el) => el.localName)).toBe('pdx-nav-menu');
});

// The rail's entries are flat, after the reference: no entry has children, so there are no rows
// here for a nested entry or for the collapsed rail's flyout. The flyout itself is `pdx-nav-menu`'s, and `packages/ui/tests/unit/nav-menu-flyout.test.ts` holds it.

test('a group heading folds its entries, and the rail remembers it', async ({ page }) => {
    await open(page);
    const heading = page.locator('[data-test="group-h-fav"]');
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
    await heading.click();
    await expect(page.locator('[data-test="to-board"]')).toBeHidden();

    await page.reload();
    await expect(page.locator('[data-test="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-test="group-h-fav"]'), 'a reload opened the group again')
        .toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-test="to-board"]')).toBeHidden();
});

test('the keyboard: ArrowLeft folds a group, ArrowRight opens it', async ({ page }) => {
    await open(page);
    const heading = page.locator('[data-test="group-h-fav"]');
    await heading.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(heading).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(heading).toHaveAttribute('aria-expanded', 'true');
});

test('the entry of the current page is marked, a favourite\'s and a recent\'s', async ({ page }) => {
    // Not each `<pdx-link>` marking itself: the menu marks the key the shell derives from the router's path.
    await open(page, '/tickets');
    await expect(page.locator('[data-test="to-tickets"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-test="to-dashboard"]')).not.toHaveAttribute('aria-current', /.*/);
    // A recent is marked under its own key, and a record under its list's.
    await page.goto('/employees/1/personal');
    await expect(page.locator('[data-test="recent-employees"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-test="to-tickets"]')).not.toHaveAttribute('aria-current', /.*/);
});

test('control — an entry without children has no disclosure', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-test="to-tickets"]')).not.toHaveAttribute('aria-expanded', /.*/);
});

// ─── The shell is a layout ────────────────────────────────────────────────────

test('a page reached from the rail renders in the shell\'s main, in view', async ({ page }) => {
    // The outlet keeps a host inside the layout's slot. Without it, the first page is projected into
    // the slot and the slot is then gone: every page NAVIGATED to is appended after the whole 100vh
    // shell — at top=900, out of sight, so the click seems to do nothing until a reload.
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    for (const [link, target] of [['to-tickets', 'tickets'], ['to-board', 'board'], ['to-customers', 'customers']]) {
        await page.locator(`[data-test="${link}"]`).click();
        const shown = page.locator(`.app main [data-test="${target}"]`);
        await expect(shown, `${target} is not in the shell's main`).toHaveCount(1);
        const top = await shown.evaluate((el) => el.getBoundingClientRect().top);
        expect(top, `${target} is at ${top}px, below the fold`).toBeLessThan(200);
    }
});

// ─── Every page takes the frame's width ──────────────────────────────────────
//
// Every page takes the whole width, forms and text included. A page that caps itself in its own
// `<style scoped>`, at 1100 or 760px, stops short on a 1920 screen and leaves the rest of the frame
// empty. The reference's list is 1760 wide.

/** The page is as wide as `main`'s content box, within a pixel. */
async function fillsTheFrame(page: Page, pageTest: string): Promise<{ page: number; main: number }> {
    const shown = page.locator(`.app main [data-test="${pageTest}"]`);
    await expect(shown, `${pageTest} is not the page on screen`).toBeVisible();
    return shown.evaluate((el) => {
        const main = el.closest('main')!;
        const cs = getComputedStyle(main);
        const content = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { page: Math.round(el.getBoundingClientRect().width), main: Math.round(content) };
    });
}

const FULL_WIDTH: [string, string][] = [
    ['/customers', 'customers'], ['/customers/1', 'customer'], ['/employees', 'employees'],
    ['/employees/1/personal', 'employee'], ['/customers/import', 'import'], ['/tickets/1', 'ticket'],
    ['/', 'dashboard'], ['/intake', 'intake'],
];

for (const [path, pageTest] of FULL_WIDTH) {
    test(`at 1920, ${path} takes the frame's whole width`, async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(path);
        const w = await fillsTheFrame(page, pageTest);
        expect(Math.abs(w.page - w.main), `${path} is ${w.page}px in a ${w.main}px frame`).toBeLessThanOrEqual(1);
    });
}

test('at 1920, /account takes the frame\'s whole width, signed in', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/login?next=%2Faccount');
    await page.locator('[data-test="username"] input').fill('admin');
    await page.locator('[data-test="password"] input').fill('pdx');
    await page.locator('[data-test="sign-in"] button').click();
    await expect(page.locator('[data-test="account"]')).toBeVisible();
    const w = await fillsTheFrame(page, 'account');
    expect(Math.abs(w.page - w.main), `/account is ${w.page}px in a ${w.main}px frame`).toBeLessThanOrEqual(1);
});

test('control — at 1920, /tickets, which never capped itself, fills the frame', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/tickets');
    const w = await fillsTheFrame(page, 'tickets');
    expect(Math.abs(w.page - w.main)).toBeLessThanOrEqual(1);
});

test('the rail’s group headings are in the page’s language', async ({ page }) => {
    // The entries go through `$t`, and so do the headings above them: a heading written as a
    // literal leaves an Italian page reading «Cruscotto · Ticket · Bacheca» under **WORK**.
    // The rail's headings are Favourites and Recents: a list is opened first, so both are there.
    await page.goto('/employees');
    await expect(page.locator('[data-test="employees"]')).toBeVisible();
    await page.goto('/');
    const groups = page.locator('[data-test="nav"] .pdx-nav-heading');
    // The control: English first, so the assertion below cannot pass on a page that never was.
    await expect(groups).toHaveText(['Favourites', 'Recent']);

    await pickLocale(page, 'it');

    await expect(groups, 'the headings kept the language they were written in')
        .toHaveText(['Preferiti', 'Recenti']);
});


// ─── The catalogue lists kinds of records, never a record ─────────────────────
//
// The menu holds entities as a type, never a single one given an id: no «Ticket 1» or «Customer 1»
// shortcuts. A record is reached from its list, and the reference's menu holds none.

const catalogHrefs = (page: Page) => catalog(page).locator('.pdx-nav-item[href]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('href')!));

for (const locale of ['en', 'it'] as const) {
    test(`${locale}: no catalogue entry opens a single record`, async ({ page }) => {
        await open(page);
        if (locale === 'it') await pickLocale(page, 'it');
        await page.locator('[data-test="side-all"]').click();
        const hrefs = await catalogHrefs(page);
        expect(hrefs.length, 'the premise: the catalogue has entries').toBeGreaterThan(0);
        expect(hrefs.filter((h) => /\/\d+(\/|$)/.test(h)), 'entries that are one record').toEqual([]);
    });
}

test('the catalogue\'s groups are Work and You', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    const groups = await catalog(page).locator('[data-test^="cat-h-"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-test')));
    expect(groups).toEqual(['cat-h-work', 'cat-h-you']);
    // Settings is under You: the last group, and its last entry.
    const keys = await catalog(page).locator('.pdx-nav-item[href]').evaluateAll((els) => els.map((e) => e.getAttribute('data-test')));
    expect(keys.at(-1)).toBe('cat-settings');
});

test('a favourite stored under a removed entry is dropped, and the rail shows the others', async ({ page }) => {
    await page.addInitScript(() => {
        if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('showcase.pins', JSON.stringify(['tickets', 'customer', 'board']));
            sessionStorage.setItem('seeded', '1');
        }
    });
    await open(page);
    expect(await railEntries(page)).toEqual(['to-dashboard', 'to-tickets', 'to-board']);
    // Every row in the rail is one of those three: none drawn empty for the stored key.
    await expect(page.locator('[data-test="nav"] .pdx-nav-item'), 'a row for the removed key').toHaveCount(3);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('showcase.pins') ?? '[]'));
    expect(stored, 'the removed key is still stored').toEqual(['tickets', 'board']);
});

const TYPE_ENTRIES: [string, RegExp, string][] = [
    ['tickets', /\/tickets$/, 'tickets'], ['board', /\/board$/, 'board'], ['customers', /\/customers$/, 'customers'],
    ['employees', /\/employees$/, 'employees'], ['intake', /\/intake$/, 'intake'], ['import', /\/customers\/import$/, 'import'],
];

for (const [key, url, pageTest] of TYPE_ENTRIES) {
    test(`control — ${key} is still in the catalogue, and opens its page`, async ({ page }) => {
        await open(page);
        await page.locator('[data-test="side-all"]').click();
        await catalog(page).locator(`[data-test="cat-${key}"]`).click();
        await expect(page).toHaveURL(url);
        await expect(page.locator(`.app main [data-test="${pageTest}"]`)).toBeVisible();
    });
}

test('Intake sits in Work, right after Tickets', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    const keys = await catalog(page).locator('.pdx-nav-item[href]').evaluateAll((els) => els.map((e) => e.getAttribute('data-test')));
    expect(keys.indexOf('cat-intake'), `order: ${keys.join(', ')}`).toBe(keys.indexOf('cat-tickets') + 1);
});

// ─── An entry's controls are beside its link, not inside it ───────────────────
//
// The pin and «open in a new tab» sit beside the entry's <a>, in the menu's `actions` slot. Inside
// it they would be interactive content inside a link, which HTML forbids and axe reports as
// nested-interactive, with the controls' names folded into the link's.

test('no rail or catalogue entry link holds a button or another link', async ({ page }) => {
    await open(page);
    await page.locator('[data-test="side-all"]').click();
    await expect(catalog(page)).toBeVisible();
    const nested = await page.locator('a.pdx-nav-item').evaluateAll((links) => links
        .filter((a) => a.querySelector('button, a, input, select, textarea'))
        .map((a) => a.getAttribute('data-test')));
    expect(nested, 'entries with interactive content inside their link').toEqual([]);
    // The premise: the controls are still there, beside the links.
    await expect(page.locator('[data-test="nav"] [data-test="to-board-pin"]')).toHaveCount(1);
    await expect(page.locator('[data-test="catalog"] [data-test="cat-employees-pin"]')).toHaveCount(1);
});

test('a pin is reached by Tab after its entry, and the arrows skip it', async ({ page }) => {
    await open(page);
    const tickets = page.locator('[data-test="nav"] [data-test="to-tickets"]');
    await tickets.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-test="nav"] [data-test="to-board"]'), 'the arrow stopped on a control').toBeFocused();
});
