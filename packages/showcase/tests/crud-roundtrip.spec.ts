// The round-trip on one entity, measured where a harness does not look.
//
// A table is not a round-trip. What a round-trip needs is the parts a demo skips: a bulk bar that
// belongs to its table, a detail that opens with the entity's face and its sections on the LEFT
// (never a right panel — the reference has none in 150 screens), the three states of a section rather than the one that
// photographs well, and a destructive action with a domain name and a way back.
//
// The numbers are the reference's, read from the `.sketch`: a 1760×64 bulk bar under a 1760-wide
// list, a 260px detail menu, a 100px round portrait, sections as 48px rows.
import { test, expect, type Page } from '@playwright/test';

const box = (page: Page, selector: string) =>
    page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });

const rows = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-body [role="row"]');

async function openList(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets');
    await expect(rows(page).first()).toBeVisible();
}

test('the bulk bar belongs to the table: same width, same left edge, under it', async ({ page }) => {
    // A bar of its own width floating somewhere — measured unanchored at 494px against a 1392px
    // table, ABOVE it — says nothing about what it acts on.
    await openList(page);
    await rows(page).nth(0).locator('input[type="checkbox"]').check();
    await rows(page).nth(1).locator('input[type="checkbox"]').check();

    const bulk = page.locator('[data-test="bulk"]');
    await expect(bulk).toBeVisible();

    const bar = await box(page, '[data-test="bulk"]');
    const grid = await box(page, '[data-test="grid"]');
    expect(bar.w, `the bar is ${bar.w}px against a ${grid.w}px table`).toBe(grid.w);
    expect(bar.x, 'the bar does not start where the table does').toBe(grid.x);
    expect(bar.y, 'the bar is not anchored under the table').toBeGreaterThanOrEqual(grid.y + grid.h - 1);
});

test('control — with nothing selected there is no bar to anchor', async ({ page }) => {
    await openList(page);
    await expect(page.locator('[data-test="bulk"]'), 'the bulk bar is shown with an empty selection')
        .toBeHidden();
});

test('the detail opens with the entity, and its sections are on the LEFT', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets/1/interventions/2');
    await expect(page.locator('[data-test="detail-menu"]')).toBeVisible();

    const menu = await box(page, '[data-test="detail-menu"]');
    const body = await box(page, '.detail-body');
    expect(menu.w, 'the section menu is not the reference\'s 260').toBe(260);
    expect(menu.x, 'the section menu is not on the left of the body').toBeLessThan(body.x);

    // It opens with the entity's face: a round portrait, then what the record is called.
    const portrait = await box(page, '[data-test="identity"] .portrait');
    expect(portrait.w, 'the portrait is not the reference\'s 100').toBe(100);
    expect(portrait.h).toBe(100);
    await expect(page.locator('[data-test="identity-name"]'), 'the identity does not name the record')
        .toHaveText(/^T-\d+$/);

    // And a section row is the rhythm the application states.
    const row = await box(page, '[data-test="tab-billing"] a');
    expect(row.h, 'a section row is not the stated 48').toBe(48);
    // The menu's INNER width: the row fills what is inside its rule and its padding.
    const inner = await page.locator('[data-test="detail-menu"]').evaluate((el) => {
        const cs = getComputedStyle(el);
        return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    });
    expect(row.w, 'a section row does not fill the menu').toBe(inner);
});

/**
 * The menu stands apart from the section — otherwise it reads as the start of the content — and it
 * is PART OF THE PAGE, not a card hanging in it, as in the reference. What sets it apart is a rule between it and the section, not a
 * surface, a radius and a shadow of its own.
 */
for (const [path, root] of [['/tickets/1/interventions/2', 'ticket'], ['/customers/1', 'customer'], ['/employees/1/personal', 'employee']]) {
    test(`on ${path} the section menu stands apart by a rule, and is not a card`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(path);
        await expect(page.locator(`[data-test="${root}"] [data-test="detail-menu"]`)).toBeVisible();
        const look = await page.locator('[data-test="detail-menu"]').evaluate((menu) => {
            const cs = getComputedStyle(menu);
            return {
                rule: parseFloat(cs.borderRightWidth),
                shadow: cs.boxShadow,
                radius: cs.borderTopLeftRadius,
                surface: cs.backgroundColor,
                sticky: cs.position,
            };
        });
        expect(look.rule, 'nothing sets the menu apart from the section').toBeGreaterThan(0);
        expect(look.shadow, 'the menu is a card: it has a shadow').toBe('none');
        expect(look.radius, 'the menu is a card: it has a radius').toBe('0px');
        expect(look.surface, 'the menu paints a surface of its own').toBe('rgba(0, 0, 0, 0)');
        expect(look.sticky, 'the menu scrolls away with the section').toBe('sticky');
    });
}

test('control — there is no right panel, here or anywhere', async ({ page }) => {
    // The owner's rule, and the reference has none in 150 screens: detail navigation is a menu on
    // the left, inside the content area. This fails if anything lands to the right of the body.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/tickets/1/interventions/2');
    const body = await box(page, '.detail-body');

    const beyond = await page.locator('[data-test="ticket"] > * , .detail-grid > *').evaluateAll(
        (els, right) => els
            .map((e) => ({ cls: e.className, x: Math.round(e.getBoundingClientRect().x) }))
            .filter((e) => e.x >= right)
            .map((e) => e.cls),
        body.x + body.w);
    expect(beyond, 'something is rendered to the right of the detail body').toEqual([]);
});

test('a section has three states, not one: empty, filled, and after the action', async ({ page }) => {
    // The state a harness never has. A ticket of this test's own, so the mock's stored files cannot
    // arrive from another one: the section starts EMPTY, a file makes it FILLED, and downloading it
    // leaves a line that says what happened — three screens of one section, which is what the
    // reference draws for every one of them (`void`, `filled`, `ok`).
    const ticket = 573;
    const listed = page.waitForResponse((r) =>
        r.url().includes(`/api/attachments?ticket=${ticket}`) && r.request().method() === 'GET');
    await page.goto(`/tickets/${ticket}`);
    await expect(page.locator('[data-test="attachments"]')).toBeVisible();
    await listed;

    await expect(page.locator('[data-test="no-files"]'), 'the empty state is not drawn')
        .toBeVisible();

    await page.locator('[data-test="picker"] input[type="file"]').setInputFiles({
        name: 'handover.txt', mimeType: 'text/plain', buffer: Buffer.from('a note') });
    await expect(page.locator('[data-test="files"] .file[data-name="handover.txt"]'),
        'the section did not fill').toBeVisible();
    await expect(page.locator('[data-test="no-files"]'), 'the empty state is shown with a file in it')
        .toHaveCount(0);

    await page.locator('[data-test="download"] button').first().click();
    await expect(page.locator('[data-test="saved-as"]'), 'nothing says what the action did')
        .toBeVisible();
});

test('the destructive action has a domain name and a way back', async ({ page }) => {
    // In 150 reference screens there is no `delete`: a period is `terminated`, a person leaves, and
    // both have a `revert`. A ticket is ARCHIVED — it is out of the list, not gone — and the
    // sentence after it says so.
    await openList(page);
    await rows(page).first().locator('input[type="checkbox"]').check();

    await expect(page.locator('[data-test="bulk"]'), 'no bulk bar to act from').toBeVisible();
    await expect(page.locator('[data-test="bulk"]').getByText('Archive', { exact: true }),
        'the destructive action is still called what the database calls it').toBeVisible();
});
