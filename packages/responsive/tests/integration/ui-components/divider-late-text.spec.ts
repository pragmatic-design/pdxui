// pdx-divider's text-content label when the text arrives after the divider connected — a parser, or
// a framework that appends children late — and when a bound text node changes. Measured in Chromium:
// the path runs through a MutationObserver, which happy-dom may silence after a GC.
//
// The line is redrawn on the host, beside the slot. The host's late-children watcher (core
// `_watchLateSlots`) leaves nodes a template part placed where they are: taking a redrawn line for
// authored content and moving it into the hidden holder, again and again, freezes the page and this
// test times out.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const SCOPE = 'section:not([hidden])';

async function open(page: Page): Promise<void> {
    await goToScenario(page, 'divider-text-label', 'neutral', { page: scenarioPage['divider-text-label'] });
    await settle(page);
}

test.describe('pdx-divider text label added after connect', () => {
    test('text appended after mount becomes the label, and the line stays visible', async ({ page }) => {
        await open(page);
        await page.locator(SCOPE).evaluate((section) => {
            const el = document.createElement('pdx-divider');
            el.setAttribute('data-test', 'late');
            section.appendChild(el);
            // Next task: the divider has mounted with no text, as after a late framework append.
            setTimeout(() => el.appendChild(document.createTextNode('Later')), 0);
        });
        const late = page.locator(`${SCOPE} pdx-divider[data-test="late"]`);
        // Whatever the markup: one separator, visible, saying "Later".
        const sep = late.locator('[role="separator"]');
        await expect(sep).toHaveCount(1);
        await expect(sep).toHaveText('Later');
        await expect(sep).toBeVisible();
        await expect(late.locator('[data-divider-text] [role="separator"], [data-divider-text] hr'),
            'a drawn line was moved into the hidden holder').toHaveCount(0);
    });

    test('a text node that changes updates the label', async ({ page }) => {
        await open(page);
        const host = page.locator(`${SCOPE} pdx-divider[data-test="div-text"]`);
        await expect(host.locator('[role="separator"]')).toHaveText('OR');
        await host.evaluate((el) => {
            const text = [...el.querySelector('[data-divider-text]')!.childNodes].find(n => n.nodeType === Node.TEXT_NODE)!;
            text.nodeValue = 'AND';
        });
        await expect(host.locator('[role="separator"]')).toHaveText('AND');
    });
});
