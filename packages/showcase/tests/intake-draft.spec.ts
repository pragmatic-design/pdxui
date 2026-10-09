/**
 * A long form that is abandoned does not lose everything.
 *
 * Asking before leaving is not enough protection on its own. The answer to «you have
 * unsaved work» is a QUESTION, never a place to put the work: a reload, a crash, a closed tab, a
 * session that expired are all silent losses, and `onBeforeLeave` sees none of them.
 *
 * The other half is that a draft must not restore ITSELF. A form that silently refills is how
 * someone submits last week's answers without noticing, so the page says a draft exists, says when,
 * and waits. The control for every row below is that the fields are EMPTY before the choice.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';
import { clearAllButSession } from './session';

const step = (page: Page, label: string) => page.locator(`[data-wizard-step][data-label="${label}"]`);
const next = (page: Page) => page.locator('[data-wizard-next]');
const offer = (page: Page) => page.locator('[data-test="draft-offer"]');
const field = (page: Page, test: string) => page.locator(`[data-test="${test}"] input:not([type="hidden"])`);
/** A date picker's value, ISO: the hidden input the form submits, not the text shown in the locale. */
const dateOf = (page: Page, test: string) => page.locator(`[data-test="${test}"] input[type="hidden"]`);

async function openIntake(page: Page): Promise<void> {
    await page.goto('/intake');
    await expect(page.locator('[data-test="intake"]')).toBeVisible();
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
}

async function fill(page: Page, test: string, value: string): Promise<void> {
    await field(page, test).fill(value);
    await field(page, test).blur();
}

/** Step 1 and step 2 filled, ending on step 2 — enough for a draft with a step in it. */
async function fillTwoSteps(page: Page): Promise<void> {
    await fill(page, 'requester', 'Anna Bianchi');
    await fill(page, 'email', 'anna@example.com');
    await next(page).click();
    await expect(step(page, 'Window')).toBeVisible();
    await fill(page, 'starts', '2026-10-01');
    await fill(page, 'ends', '2026-10-03');
    // The draft is debounced: it is written after the typing stops, not per keystroke.
    await expect(page.locator('[data-test="draft-saved"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    // Each row starts with no draft: one left behind would make the next row pass for the wrong
    // reason, and `localStorage` survives a `page.goto` within a context.
    await page.goto('/intake');
    await clearAllButSession(page);
});

test('a reload offers the draft — and restores NOTHING until it is answered', async ({ page }) => {
    await openIntake(page);
    await fillTwoSteps(page);

    await page.reload();
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();

    await expect(offer(page), 'the work was lost without a word').toBeVisible();
    // When, not just that: «you have a draft» with no date is a thing nobody can judge.
    await expect(offer(page)).toContainText(/\d/);

    // THE CONTROL. A form that refilled itself would pass every other row here.
    await expect(field(page, 'requester'), 'the form restored itself without asking').toHaveValue('');
    await expect(step(page, 'Requester'), 'and it jumped to the saved step before being asked').toBeVisible();
});

test('Resume puts the values back, on the step it was left on', async ({ page }) => {
    await openIntake(page);
    await fillTwoSteps(page);
    await page.reload();

    await page.locator('[data-test="draft-resume"]').click();

    await expect(step(page, 'Window'), 'resumed at the beginning instead of where it was left').toBeVisible();
    await expect(dateOf(page, 'starts')).toHaveValue('2026-10-01');
    await expect(dateOf(page, 'ends')).toHaveValue('2026-10-03');
    // And the steps behind it, which are the ones a reader will go back to check.
    await page.locator('[data-wizard-back], [data-wizard-prev]').click();
    await expect(field(page, 'requester')).toHaveValue('Anna Bianchi');
    await expect(field(page, 'email')).toHaveValue('anna@example.com');
    await expect(offer(page), 'the offer stayed after it was taken').toBeHidden();
});

test('Discard leaves an empty form, and does not ask again', async ({ page }) => {
    await openIntake(page);
    await fillTwoSteps(page);
    await page.reload();

    await page.locator('[data-test="draft-discard"]').click();
    await expect(offer(page)).toBeHidden();
    await expect(field(page, 'requester')).toHaveValue('');

    await page.reload();
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
    await expect(offer(page), 'a discarded draft came back').toBeHidden();
});

test('a submit that went through leaves no draft; one the server refused keeps it', async ({ page }) => {
    await openIntake(page);
    await fillTwoSteps(page);

    // Step 3 has nothing required, step 4 has the PO.
    await next(page).click();
    await expect(step(page, 'Details')).toBeVisible();
    await next(page).click();
    await expect(step(page, 'Billing')).toBeVisible();
    await fill(page, 'po', 'PO-9001');

    // Refused first: the work is still unsaved, so the draft is exactly what must survive.
    await demo(page, 'refuse-next');
    await page.locator('[data-test="submit"]').click();
    await expect(page.locator('[data-test="server-error"]')).toBeVisible();
    await page.reload();
    await expect(offer(page), 'a refused submit threw the work away').toBeVisible();
    await page.locator('[data-test="draft-resume"]').click();

    // Then the one that lands.
    await page.locator('[data-test="submit"]').click();
    await expect(page.locator('[data-test="submitted"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
    await expect(offer(page), 'a submitted form left a draft to resume').toBeHidden();
});

test('the draft holds values, not files — and says which attachment it could not keep', async ({ page }) => {
    await openIntake(page);
    await fill(page, 'requester', 'Anna Bianchi');
    await fill(page, 'email', 'anna@example.com');
    await next(page).click();
    await expect(step(page, 'Window')).toBeVisible();
    await fill(page, 'starts', '2026-10-01');
    await fill(page, 'ends', '2026-10-03');
    await next(page).click();
    await expect(step(page, 'Details')).toBeVisible();

    await page.locator('[data-test="attachment"] input[type="file"]').setInputFiles({
        name: 'site-plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4'),
    });
    await expect(page.locator('[data-test="attachment"]')).toContainText('site-plan.pdf');
    await expect(page.locator('[data-test="draft-saved"]')).toBeVisible();

    // Nothing of the file reached storage: not its bytes, and not a pretence that it is still there.
    const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    expect(stored, 'the file itself was written to localStorage').not.toContain('%PDF');

    await page.reload();
    await expect(offer(page)).toBeVisible();
    await expect(offer(page), 'the draft lost an attachment and said nothing').toContainText('site-plan.pdf');

    await page.locator('[data-test="draft-resume"]').click();
    await expect(dateOf(page, 'starts')).toHaveValue('2026-10-01');
    await expect(page.locator('[data-test="attachment"]'), 'a file came back out of localStorage').not.toContainText('site-plan.pdf');
});
