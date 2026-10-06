import { test, expect, type Page } from '@playwright/test';

// CSS-only components in a box narrower than their content.
//
// On a phone the site clips the page sideways (`overflow-x: clip`), so a row that runs past the
// edge is not scrollable: it is gone. Measured at 390px on /design/tabs (a tab at right = 421) and
// /design/pagination (a step at 470). A CSS-only component cannot measure itself, so it must lay
// itself out to fit: the tab strip wraps, the stepper's steps shrink and truncate their labels.
// (The <pdx-tabs> element measures its strip and scrolls it instead: tabs.manifest.ts, tabs-narrow.)

const HARNESS = '/demo/test-harness.html';

async function mount(page: Page, html: string): Promise<void> {
    await page.goto(HARNESS);
    await page.evaluate((markup) => {
        const host = document.createElement('div');
        host.id = 'narrow-box';
        host.style.width = '240px';
        host.innerHTML = markup;
        document.body.prepend(host);
    }, html);
}

/** Right edge of the box, and of every element under it that is past it. */
async function pastTheEdge(page: Page): Promise<{ box: number; past: string[] }> {
    return page.evaluate(() => {
        const box = document.getElementById('narrow-box')!;
        const right = box.getBoundingClientRect().right;
        const past = Array.from(box.querySelectorAll('*'))
            .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > right + 0.5)
            .map((el) => `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')} right=${Math.round(el.getBoundingClientRect().right)}`);
        return { box: right, past };
    });
}

test('a CSS-only tab strip narrower than its tabs wraps them, and every tab stays in the box', async ({ page }) => {
    await mount(page, `
        <div class="pdx-tabs" role="tablist">
            <button class="pdx-tab" role="tab" aria-selected="true">Account</button>
            <button class="pdx-tab" role="tab" aria-selected="false">Security</button>
            <button class="pdx-tab" role="tab" aria-selected="false">Notifications</button>
            <button class="pdx-tab" role="tab" aria-selected="false">Billing</button>
        </div>`);
    expect((await pastTheEdge(page)).past).toEqual([]);
    const tops = await page.locator('#narrow-box .pdx-tab').evaluateAll((tabs) => tabs.map((t) => Math.round(t.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'the tabs keep one row').toBeGreaterThan(1);
});

test('a CSS-only stepper narrower than its steps shrinks them, and every step stays in the box', async ({ page }) => {
    await mount(page, `
        <div class="pdx-stepper">
            <div class="pdx-step" data-status="done"><span class="pdx-step-number">1</span><span class="pdx-step-label">Account</span></div>
            <div class="pdx-step-connector"></div>
            <div class="pdx-step" data-status="active"><span class="pdx-step-number">2</span><span class="pdx-step-label">Profile</span></div>
            <div class="pdx-step-connector"></div>
            <div class="pdx-step"><span class="pdx-step-number">3</span><span class="pdx-step-label">Payment</span></div>
            <div class="pdx-step-connector"></div>
            <div class="pdx-step"><span class="pdx-step-number">4</span><span class="pdx-step-label">Confirm</span></div>
        </div>`);
    expect((await pastTheEdge(page)).past).toEqual([]);
    // Shrunk, not wrapped: the step numbers keep their size and one row.
    const numbers = await page.locator('#narrow-box .pdx-step-number').evaluateAll((ns) => ns.map((n) => {
        const r = n.getBoundingClientRect();
        return { top: Math.round(r.top), width: Math.round(r.width) };
    }));
    expect(new Set(numbers.map((n) => n.top)).size, 'the steps keep one row').toBe(1);
    for (const n of numbers) expect(n.width, 'a step number keeps its size').toBeGreaterThanOrEqual(20);
});

// The input is what gives: a text input's intrinsic width is about twenty characters of the font,
// so with the default min-width it never shrank below that, and the addons and the button were
// pushed past the edge — 6px and 17px past it at 390px on the GitHub runner, whose fonts are wider.
test('a CSS-only input group narrower than its parts shrinks the input, and every part stays in the box', async ({ page }) => {
    await mount(page, `
        <div class="pdx-input-group">
            <span class="pdx-input-addon">@</span>
            <input class="pdx-input" type="text" placeholder="username" />
        </div>
        <div class="pdx-input-group">
            <input class="pdx-input" type="text" placeholder="Search..." />
            <button class="pdx-primary">Go</button>
        </div>
        <div class="pdx-input-group">
            <span class="pdx-input-addon">https://</span>
            <input class="pdx-input" type="text" placeholder="example.com" />
            <span class="pdx-input-addon">/path</span>
        </div>`);
    expect((await pastTheEdge(page)).past).toEqual([]);
});
