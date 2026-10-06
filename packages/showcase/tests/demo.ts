// Reach a demo knob: open the Demo panel in the service bar and press it.
//
// The knobs that fake a colleague, a dropped connection or a refusing server left the screens for
// one panel. A spec that pressed `[data-test="refuse-next"]` in the page presses it here now, by
// the same name; pressing it puts the panel away, so the spec goes on with the screen.
import { expect, type Page } from '@playwright/test';

export async function demo(page: Page, knob: string): Promise<void> {
    const panel = page.locator('[data-test="demo-panel"]');
    if (!(await panel.isVisible())) await page.locator('[data-test="demo-open"]').click();
    await expect(panel).toBeVisible();
    await panel.locator(`[data-test="${knob}"]`).click();
    await expect(panel, 'the panel stayed over the screen after its knob was pressed').toBeHidden();
}
