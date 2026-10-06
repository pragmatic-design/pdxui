// A disabled accordion item announces itself, and follows its data-disabled and the accordion's
// disabled after mount, measured in Chromium.
//
// The trigger of a disabled item carries aria-disabled: without it, it is an ordinary collapsed button
// to a screen reader, reachable with the arrow keys, doing nothing on Enter. The static case is in the
// manifest's keyboard steps. The changes after mount arrive through a MutationObserver (an item's
// data-disabled) and a prop track (the accordion's disabled), and are measured here rather than in
// happy-dom, whose MutationObserver holds its callback in a WeakRef: once collected, records stop
// arriving, and a test of it passes alone and fails inside the full suite.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const SCOPE = 'section:not([hidden])';
const trig = (page: Page, which: string) => page.locator(`${SCOPE} [data-test="acc-${which}"]`);

async function open(page: Page): Promise<void> {
    await goToScenario(page, 'accordion-disabled-item', 'neutral', { page: scenarioPage['accordion-disabled-item'] });
    await settle(page);
}

test.describe('pdx-accordion disabled items', () => {
    test('a data-disabled item is announced as disabled, the others are not', async ({ page }) => {
        await open(page);
        await expect(page.getByRole('button', { name: 'Admin (requires permissions)' })).toBeDisabled();
        await expect(trig(page, 'admin')).toHaveAttribute('aria-disabled', 'true');
        await expect(trig(page, 'security')).not.toHaveAttribute('aria-disabled');
    });

    test('data-disabled set and removed on an item after mount', async ({ page }) => {
        await open(page);
        const billing = trig(page, 'billing');
        await billing.evaluate((t) => t.closest('[data-accordion-item]')!.setAttribute('data-disabled', ''));
        await expect(billing).toHaveAttribute('aria-disabled', 'true');
        await billing.evaluate((t) => t.closest('[data-accordion-item]')!.removeAttribute('data-disabled'));
        await expect(billing).not.toHaveAttribute('aria-disabled');
    });

    test('the accordion\'s disabled reaches every trigger, both ways; the item\'s own stays', async ({ page }) => {
        await open(page);
        const acc = page.locator(`${SCOPE} pdx-accordion`);
        await acc.evaluate((el) => { (el as HTMLElement & { disabled: boolean }).disabled = true; });
        for (const which of ['security', 'admin', 'billing']) await expect(trig(page, which)).toHaveAttribute('aria-disabled', 'true');
        await acc.evaluate((el) => { (el as HTMLElement & { disabled: boolean }).disabled = false; });
        await expect(trig(page, 'security')).not.toHaveAttribute('aria-disabled');
        await expect(trig(page, 'billing')).not.toHaveAttribute('aria-disabled');
        await expect(trig(page, 'admin'), 'the item\'s own data-disabled was cleared with the accordion\'s').toHaveAttribute('aria-disabled', 'true');
    });
});
