// pdx-divider on the beta contract (#290). It drew every line with an inline style built from its props,
// so no theme could reach it and `variant` was a string spliced into `border-top`. Now `variant` is a
// variant axis (#153), reflected on the host and drawn by divider.css with `@variant`; the lines and the
// label are the parts `line` and `label`, styled by the stylesheet, not inline; `orientation` and
// `labelPosition` are the custom states `vertical`, `label-left` and `label-right`. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the divider to draw its separator. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '300px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await expect(page.locator('#f [role="separator"]').first()).toBeAttached();
}

const host = (page: Page) => page.locator('#f pdx-divider').first();

/** Each line part: its style attribute and the computed border the stylesheet gives it. */
const lines = (page: Page) => host(page).evaluate((h) => [...h.querySelectorAll('[data-part="line"]')].map((l) => {
    const s = getComputedStyle(l);
    return {
        inline: l.getAttribute('style'),
        top: `${s.borderTopWidth} ${s.borderTopStyle}`,
        left: `${s.borderLeftWidth} ${s.borderLeftStyle}`,
        width: Math.round(l.getBoundingClientRect().width),
    };
}));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=divider-beta-contract'); });

test('a plain divider: one line part, drawn by the stylesheet, solid; variant is an axis reflected on the host', async ({ page }) => {
    await mount(page, '<pdx-divider></pdx-divider>');
    expect(await lines(page)).toEqual([{ inline: null, top: '1px solid', left: '0px none', width: 300 }]);

    await host(page).evaluate((h) => { (h as unknown as { variant: string }).variant = 'dotted'; });
    await expect(host(page)).toHaveAttribute('variant', 'dotted');
    await expect.poll(async () => (await lines(page))[0].top).toBe('1px dotted');
});

test('a labelled divider: two line parts around the label part; label-left is a state that shortens the first', async ({ page }) => {
    await mount(page, '<pdx-divider variant="dashed" label-position="left">OR</pdx-divider>');
    const facts = await host(page).evaluate((h) => ({
        label: h.querySelector('[data-part="label"]')?.textContent?.trim(),
        labelInline: h.querySelector('[data-part="label"]')?.getAttribute('style'),
        states: ['vertical', 'label-left', 'label-right'].filter((s) => h.matches(`:state(${s})`)),
    }));
    expect(facts).toEqual({ label: 'OR', labelInline: null, states: ['label-left'] });
    const [first, second] = await lines(page);
    expect([first.inline, second.inline, first.top, second.top]).toEqual([null, null, '1px dashed', '1px dashed']);
    expect(first.width, 'label-left: the line before the label is 1rem').toBe(16);
    expect(second.width).toBeGreaterThan(100);
});

test('a vertical divider: the vertical state, an inline-block host, and a left border on its line part', async ({ page }) => {
    await mount(page, '<span>A</span><pdx-divider orientation="vertical"></pdx-divider><span>B</span>');
    const facts = await host(page).evaluate((h) => ({
        vertical: h.matches(':state(vertical)'),
        display: getComputedStyle(h).display,
        inlineHost: (h as HTMLElement).style.display,
    }));
    expect(facts).toEqual({ vertical: true, display: 'inline-block', inlineHost: '' });
    const [line] = await lines(page);
    expect([line.inline, line.left, line.top]).toEqual([null, '1px solid', '0px none']);
});
