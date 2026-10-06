// A real mouse click in a searchable pdx-select's search field opens the list, and throws nothing.
//
// A focus handler that fakes a click whose target is null throws on `target.closest()` at every
// focus. The list still opens — the real click that follows the focus does it — so only an error
// collector notices. Opening from the focus instead exposes the other half: the click bubbles to
// the trigger, whose handler toggles, and closes the list the focus has just opened.
// happy-dom never produces that focus-then-click order from `.click()`; Chromium does, so this is
// measured here with a real mouse.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

async function mountSearchable(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await goToScenario(page, 'select-closed', 'neutral', { page: scenarioPage['select-closed'] });
    await settle(page);
    await page.evaluate(() => {
        const el = document.createElement('pdx-select') as HTMLElement & { options: string[] };
        el.setAttribute('searchable', '');
        el.setAttribute('data-test', 'searchable');
        el.style.cssText = 'display:block;width:240px;margin:24px';
        document.body.prepend(el);
        el.options = ['Rossi', 'Bianchi'];
    });
    await page.locator('[data-test="searchable"] input.pdx-select-search').waitFor();
    return errors;
}

const isOpen = (page: Page): Promise<boolean> =>
    page.evaluate(() => !!document.querySelector('[data-test="searchable"] .pdx-select-dropdown')?.classList.contains('open'));

test.describe('pdx-select searchable — the search field', () => {
    test('a mouse click opens the list, and no error reaches the page', async ({ page }) => {
        const errors = await mountSearchable(page);
        await page.locator('[data-test="searchable"] input.pdx-select-search').click();
        await expect.poll(() => isOpen(page), { message: 'the list is not open after the click' }).toBe(true);
        expect(errors, 'an error reached the page').toEqual([]);
    });

    test('a second click in the field keeps it open, so the user can place the caret', async ({ page }) => {
        const errors = await mountSearchable(page);
        const search = page.locator('[data-test="searchable"] input.pdx-select-search');
        await search.click();
        await search.click();
        await expect.poll(() => isOpen(page)).toBe(true);
        expect(errors).toEqual([]);
    });
});
