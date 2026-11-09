/**
 * A form-associated host's labels, read from its ElementInternals (#987), in Chromium: happy-dom has
 * no ElementInternals, so only a browser associates a <label for> with a custom element.
 *
 * The fixture, `tests/fixtures/host-labels/`, is a page of its own served by the dev server: a compiled
 * `.pdx` that names its inner field after its label through `self.labels`, and two descriptor
 * components, one form-associated and named by no label, one not form-associated.
 */
import { test, expect, type Page } from './fixture';

const FIXTURE = '/tests/fixtures/host-labels/index.html';

/** The text of each label `el.labels` holds, for the element `selector` names. */
function labelsOf(page: Page, selector: string): Promise<string[] | null> {
    return page.evaluate((s) => {
        const labels = (document.querySelector(s) as unknown as { labels?: NodeListOf<HTMLLabelElement> }).labels;
        return labels ? [...labels].map((l) => l.textContent ?? '') : null;
    }, selector);
}

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => (window as unknown as { __hl?: { ready: boolean } }).__hl?.ready === true);
});

test('a form-associated host holds the <label for> that names it', async ({ page }) => {
    expect(await labelsOf(page, '#name')).toEqual(['Name']);
});

test('the .pdx reads it as self.labels, and names its inner field after it, with no document query', async ({ page }) => {
    const labelId = await page.locator('label[for="name"]').getAttribute('id');
    expect(labelId, 'the component did not give its label an id').toBe('name-label');
    await expect(page.locator('#name input.inner')).toHaveAttribute('aria-labelledby', 'name-label');
});

test('one with no id, inside a <label>, holds that label', async ({ page }) => {
    // The getter skips the platform's list for a host no label can name (no id, in no label): this is
    // the other way a label names it.
    expect(await labelsOf(page, '#wrap > hl-unlabelled')).toEqual(['Wrapped ']);
});

test('one named by no label holds an empty list', async ({ page }) => {
    expect(await labelsOf(page, '#other')).toEqual([]);
});

test('one that is not form-associated holds an empty list, not an error, whatever labels point at it', async ({ page }) => {
    expect(await labelsOf(page, '#plain')).toEqual([]);
});

test('pdx-select: a <label for> its host names the combobox, read from its labels', async ({ page }) => {
    // Was a happy-dom case of select-combobox-a11y.test.ts, which looked the label up in the document.
    // The select reads its host's labels now, and only a browser associates them.
    const combobox = page.locator('#size-select [role="combobox"]');
    await expect(combobox).toHaveAccessibleName('Size');
    const labelledBy = await combobox.getAttribute('aria-labelledby');
    expect(labelledBy, 'the combobox is not labelled by the <label for>').toBe(await page.locator('label[for="size-select"]').getAttribute('id'));
});

test('a label added after mount is in the list the next time it is read', async ({ page }) => {
    await page.evaluate(() => {
        const label = document.createElement('label');
        label.htmlFor = 'other';
        label.textContent = 'Later';
        document.getElementById('f')!.append(label);
    });
    expect(await labelsOf(page, '#other')).toEqual(['Later']);
});
