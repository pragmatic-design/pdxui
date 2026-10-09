/**
 * Settings: the gear in the bar, and a page of tiles that each open a real screen.
 *
 * The reference's gear opens a page of tiles in titled groups — SYSTEM, ACCESS AND AUTHORISATIONS —
 * each an icon above its name. The rule is that every tile is a screen that works: a tile that opens «coming soon» is a dead link with an icon.
 *
 * Not the profile menu's Settings: that submenu is the reader's own preferences (language, scheme,
 * density). This is the application's: its closed value sets, its saved views, its users and roles.
 */
import { test, expect, type Page } from './fixture';
import { pickLocale } from './locale';

const TILES: [string, string, string][] = [
    ['lookups', 'Lookups', '/settings/lookups'],
    ['views', 'Saved views', '/settings/views'],
    ['users', 'Users', '/settings/users'],
    ['permissions', 'Permissions', '/settings/permissions'],
];

const tiles = (page: Page) => page.locator('[data-test="settings"] [data-test^="tile-"]');

async function openSettings(page: Page): Promise<void> {
    await page.goto('/settings');
    await expect(page.locator('[data-test="settings"]')).toBeVisible();
}

test('the gear in the bar opens Settings: two titled groups of tiles', async ({ page }) => {
    await page.goto('/');
    await page.locator('.app-bar').getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('[data-test="settings-group"]')).toHaveText(['System', 'Access and authorisations']);
    await expect(tiles(page)).toHaveCount(TILES.length);
});

test('Settings is in the catalogue, under You', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test="cat-settings"]')).toHaveCount(1);
});

for (const [key, name, path] of TILES) {
    test(`the ${name} tile opens a screen of its own`, async ({ page }) => {
        await openSettings(page);
        const tile = page.locator(`[data-test="tile-${key}"]`);
        await expect(tile).toHaveAccessibleName(name);
        await tile.click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(page.getByRole('heading', { level: 1, name, exact: true }), `${name} is a dead link`).toBeVisible();
    });
}

test('Lookups: the ticket statuses, each code with its label — and in Italian the labels move, the codes do not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings/lookups');
    const table = page.locator('[data-test="lookup-ticketStatus"]');
    await expect(table).toBeVisible();
    await expect(table.locator('[data-test="code"]')).toHaveText(['open', 'waiting', 'closed']);
    await expect(table.locator('[data-test="label"]')).toHaveText(['Open', 'Waiting', 'Closed']);
    // How many tickets hold each, asked of the store: the seed's 15 / 9 / 12.
    await expect(table.locator('[data-test="in-use"]')).toHaveText(['15', '9', '12']);

    // The other sets, one at a time from the menu on the left.
    for (const set of ['ticketPriority', 'customerTier', 'customerStatus']) {
        await page.locator(`[data-test="set-${set}"]`).click();
        await expect(page.locator(`[data-test="set-${set}"]`)).toHaveAttribute('aria-current', 'true');
        await expect(page.locator(`[data-test="lookup-${set}"] [data-test="code"]:visible`), `${set} is empty`).toHaveCount(3);
        await expect(table, 'two sets on screen at once').toBeHidden();
    }
    await page.locator('[data-test="set-ticketStatus"]').click();

    await pickLocale(page, 'it');
    await expect(page.locator('html')).toHaveAttribute('lang', 'it');
    await expect(table.locator('[data-test="label"]')).toHaveText(['Aperto', 'In attesa', 'Chiuso']);
    await expect(table.locator('[data-test="code"]')).toHaveText(['open', 'waiting', 'closed']);
});

/** The views the tickets list's picker offers, read by opening it (a `pdx-select`). */
async function offeredOnTickets(page: Page): Promise<string[]> {
    const combobox = page.locator('[data-test="view-picker"] [role="combobox"]');
    await combobox.click();
    const names = await page.getByRole('option').allTextContents();
    await page.keyboard.press('Escape');
    return names.map((n) => n.trim());
}

/** A view of the tickets list, stored where the list keeps them. */
async function seedView(page: Page, name: string): Promise<void> {
    await page.goto('/settings/views');
    await page.evaluate((n) => localStorage.setItem('pdx.views.tickets', JSON.stringify([
        { key: n.toLowerCase(), name: n, state: { filter: [], sort: [], columnOrder: [], pageSize: 10 } },
    ])), name);
    await page.reload();
    await expect(page.locator('[data-test="view-row"]')).toHaveCount(1);
}

test('Saved views: deleting one asks first; confirmed, the tickets list no longer offers it', async ({ page }) => {
    await seedView(page, 'Mine');
    const row = page.locator('[data-test="view-row"]');
    await expect(row).toContainText('Mine');

    await row.getByRole('button', { name: 'Delete' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask, 'deleted without asking').toBeVisible();
    await expect(row, 'deleted before the answer').toHaveCount(1);
    await ask.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
    await expect(page.locator('[data-test="views-empty"]')).toBeVisible();

    await page.goto('/tickets');
    expect(await offeredOnTickets(page)).not.toContain('Mine');
});

test('control — cancelling the delete keeps the view', async ({ page }) => {
    await seedView(page, 'Mine');
    await page.locator('[data-test="view-row"]').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
    await expect(page.locator('[data-test="view-row"]')).toHaveCount(1);
});

test('Saved views: a rename is what the tickets list offers next', async ({ page }) => {
    await seedView(page, 'Mine');
    const row = page.locator('[data-test="view-row"]');
    await row.getByRole('button', { name: 'Rename' }).click();
    const name = row.getByRole('textbox', { name: 'Name' });
    await name.fill('Closed this week');
    await name.press('Enter');
    await expect(row).toContainText('Closed this week');

    await page.goto('/tickets');
    expect(await offeredOnTickets(page)).toContain('Closed this week');
});

test('Users: the accounts that can sign in, with their name, email and role', async ({ page }) => {
    await page.goto('/settings/users');
    const rows = page.locator('[data-test="user-row"]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Ada Admin');
    await expect(rows.nth(0)).toContainText('ada@example.com');
    await expect(rows.nth(0)).toContainText('Administrator');
    await expect(rows.nth(1)).toContainText('Tom Technician');
    await expect(rows.nth(1)).toContainText('Technician');
    // The suite signs in as the administrator, who holds `settings.permissions`: each account's roles
    // are a control here. What changing them does is `permissions-edit.spec.ts`'s, on a
    // server of its own.
    await expect(page.locator('[data-test^="roles-"]')).toHaveCount(2);
});

test('Permissions: the matrix grants billing.write to the administrator and not to the technician', async ({ page }) => {
    // The permission `auth.spec.ts` proves on the account page: the technician does not see «close
    // the month», and the server refuses it.
    await page.goto('/settings/permissions');
    await expect(page.locator('[data-test="perm-billing.write-admin"]')).toHaveAttribute('data-granted', 'true');
    await expect(page.locator('[data-test="perm-billing.write-technician"]')).toHaveAttribute('data-granted', 'false');
    await expect(page.locator('[data-test="perm-account.read-technician"]'), 'control: a grant the technician has')
        .toHaveAttribute('data-granted', 'true');
});

// The screens under Settings use the full width: each one's table spans the content, at 1440, rather than a column of 720px down its left side.
for (const [path, table] of [
    ['/settings/users', '[data-test="settings-users"] [role="table"]'],
    ['/settings/permissions', '[data-test="settings-permissions"] [role="table"]'],
    ['/settings/lookups', '[data-test="settings-lookups"] .layout'],
]) {
    test(`${path} uses the page's width at 1440`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(path);
        const [t, h] = await Promise.all([
            page.locator(table).boundingBox(),
            page.locator(`${table.split(' ')[0]} h1`).evaluate((el) => el.parentElement!.parentElement!.getBoundingClientRect().width),
        ]);
        expect(t!.width, `${Math.round(t!.width)}px of ${Math.round(h)}`).toBeGreaterThanOrEqual(h - 2);
    });
}

test('/settings/views shows what each view holds, and opens it on the list', async ({ page }) => {
    await page.goto('/settings/views');
    await page.evaluate(() => localStorage.setItem('pdx.views.tickets', JSON.stringify([
        { key: 'closed', name: 'Closed', state: { filter: [{ field: 'status', operator: 'eq', value: 'closed' }], sort: [{ field: 'priority', dir: 'desc' }], columnOrder: [], pageSize: 20 } },
    ])));
    await page.reload();
    const row = page.locator('[data-test="view-row"]');
    await expect(row).toContainText('status = closed');
    await expect(row).toContainText('priority ↓');
    await expect(row).toContainText('20');
    await row.getByRole('link', { name: 'Closed' }).click();
    await expect(page).toHaveURL(/\/tickets\?view=closed$/);
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
});

test('the tiles are two per row at 390, and centred on one row at 1440', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSettings(page);
    const tops = async () => tiles(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const narrow = await tops();
    // Two groups of two: each group's pair on one row.
    expect(narrow[0], `first pair not on one row: ${narrow}`).toBe(narrow[1]);
    expect(narrow[2], `second pair not on one row: ${narrow}`).toBe(narrow[3]);

    await page.setViewportSize({ width: 1440, height: 900 });
    const group = page.locator('[data-test="tiles"]').first();
    const g = (await group.boundingBox())!;
    const first = (await tiles(page).nth(0).boundingBox())!;
    const second = (await tiles(page).nth(1).boundingBox())!;
    const left = first.x - g.x;
    const right = g.x + g.width - (second.x + second.width);
    expect(Math.abs(left - right), `not centred: ${left} left, ${right} right`).toBeLessThanOrEqual(2);
    expect(Math.round(first.width)).toBe(120);
});

// ─── Categories: the one lookup that is managed here ──────────────────────────
//
// Cross-entity categories are a lookup in Settings, the reference's way. The seed's
// counts are arithmetic — tickets by subject (12 subjects, three tickets each), customers by tier,
// sector and every fourth id, assets by kind — and the column asks each store with a filter.

test('Lookups › Categories lists eight, each with how many tickets, customers and assets carry it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings/lookups');
    await page.locator('[data-test="set-categories"]').click();
    const table = page.locator('[data-test="lookup-categories"]');
    await expect(table.locator('[data-test="category"]')).toHaveCount(8);
    const usage = (code: string) => table.locator(`[data-test="category"][data-code="${code}"] [data-test="usage"]`);
    // hardware: 6 subjects × 3 tickets; 32 assets (every kind but network). network: 2 subjects × 3; 8 assets.
    await expect(usage('hardware')).toHaveText('18 · — · 32');
    await expect(usage('network')).toHaveText('6 · — · 8');
    // key-account: the 8 enterprise customers; billing: 6 tickets and the 6 customers with i % 4 === 1.
    await expect(usage('key-account')).toHaveText('— · 8 · —');
    await expect(usage('billing')).toHaveText('6 · 6 · —');
});

test('control — the other lookups stay read-only: no field, no add, no deactivate', async ({ page }) => {
    await page.goto('/settings/lookups');
    for (const set of ['ticketStatus', 'ticketPriority', 'customerTier', 'customerStatus']) {
        await page.locator(`[data-test="set-${set}"]`).click();
        const table = page.locator(`[data-test="lookup-${set}"]`);
        await expect(table).toBeVisible();
        await expect(table.locator('input, button'), `${set} can be edited`).toHaveCount(0);
    }
});
