// An accordion item appended after mount is wired like the others, keeps one tab stop, and a
// removed accordion stops wiring, measured in Chromium.
//
// Late items reach the accordion through a MutationObserver, so these cases are not unit tests in
// happy-dom, whose MutationObserver holds its delivery callback in a WeakRef: after a garbage
// collection records stop arriving. Inside the full `pnpm test` the tab-stop case would fail with the
// late trigger's tabindex null, and the removal case could not fail at all — an observer the GC has
// silenced "stops watching" whatever the component does.
import { test, expect, type Page } from './contracts/fixture';
import { goToScenario } from './contracts/measure';
import { settle } from './contracts/assertions';
import { scenarioPage } from './contracts/generated/manifests';

const SCOPE = 'section:not([hidden])';

async function open(page: Page): Promise<void> {
    await goToScenario(page, 'accordion-two-instances', 'neutral', { page: scenarioPage['accordion-two-instances'] });
    await settle(page);
}

/** Appends a closed item labelled `label` to the accordion `data-test=which`, inside the visible scenario. */
async function append(page: Page, which: string, label: string): Promise<void> {
    await page.locator(`${SCOPE} [data-test="${which}"]`).evaluate((acc, text) => {
        const item = document.createElement('div');
        item.setAttribute('data-accordion-item', '');
        item.innerHTML = `<button data-accordion-trigger>${text}</button><div data-accordion-content>${text} body</div>`;
        acc.appendChild(item);
    }, label);
}

const lateTrigger = (page: Page, label: string) => page.locator(`${SCOPE} [data-accordion-trigger]`, { hasText: label });

test.describe('pdx-accordion items added after mount', () => {
    test('an appended item is wired: id, aria-expanded, aria-controls, a region, hidden while closed', async ({ page }) => {
        await open(page);
        await append(page, 'acc-a', 'Warranty');
        const trigger = lateTrigger(page, 'Warranty');
        await expect(trigger, 'the late item got no aria-expanded').toHaveAttribute('aria-expanded', 'false');

        const wiring = await trigger.evaluate((t) => {
            const content = t.closest('[data-accordion-item]')!.querySelector('[data-accordion-content]') as HTMLElement;
            const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
            return {
                triggerId: t.id, contentId: content.id, controls: t.getAttribute('aria-controls'),
                role: content.getAttribute('role'), labelledBy: content.getAttribute('aria-labelledby'),
                hidden: getComputedStyle(content).display === 'none', duplicates: ids.length - new Set(ids).size,
            };
        });
        expect(wiring.contentId, 'the late content got no id').not.toBe('');
        expect(wiring.controls).toBe(wiring.contentId);
        expect(wiring.role).toBe('region');
        expect(wiring.labelledBy).toBe(wiring.triggerId);
        expect(wiring.hidden, 'a closed late item is visible').toBe(true);
        expect(wiring.duplicates, 'the late item reused an id').toBe(0);
    });

    test('keeps one tab stop: a late trigger joins the roving group at tabindex -1', async ({ page }) => {
        await open(page);
        await append(page, 'acc-a', 'Warranty');
        await expect(lateTrigger(page, 'Warranty')).toHaveAttribute('tabindex', '-1');
        await expect(page.locator(`${SCOPE} [data-test="acc-a"] [data-accordion-trigger][tabindex="0"]`),
            'a late trigger added a second tab stop').toHaveCount(1);
    });

    test('stops watching once the accordion is removed', async ({ page }) => {
        await open(page);
        // One task: acc-a leaves the document and gets an item, acc-b (still connected) gets one
        // too. Both observers' records are delivered at the same microtask checkpoint, so once
        // acc-b's item is wired, anything acc-a's observer was going to do has happened.
        await page.locator(`${SCOPE} [data-test="acc-a"]`).evaluate((acc) => {
            (window as Window & { __detached?: Element }).__detached = acc;
            acc.remove();
            const add = (host: Element, text: string) => {
                const item = document.createElement('div');
                item.setAttribute('data-accordion-item', '');
                item.innerHTML = `<button data-accordion-trigger>${text}</button><div data-accordion-content>${text} body</div>`;
                host.appendChild(item);
            };
            add(acc, 'Detached');
            add(document.querySelector('section:not([hidden]) [data-test="acc-b"]')!, 'Control');
        });
        await expect(lateTrigger(page, 'Control'), 'the control: a connected accordion wires its late item').toHaveAttribute('aria-expanded', 'false');
        const detachedWired = await page.evaluate(() => {
            const acc = (window as Window & { __detached?: Element }).__detached!;
            return acc.querySelector('[data-accordion-item]:last-child [data-accordion-trigger]')!.hasAttribute('aria-expanded');
        });
        expect(detachedWired, 'a detached accordion is still wiring items').toBe(false);
    });
});
