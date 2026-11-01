// pdx-aspect-ratio, pdx-row and pdx-col on the beta contract (#290). Each put a class on its own host —
// `.pdx-aspect-ratio`, `.pdx-row-wc`, `.pdx-col` — for its stylesheet to find it. The host carries no
// class now, and the stylesheet draws the same box from the tag: aspect-ratio.css from
// `:is(.pdx-aspect-ratio, pdx-aspect-ratio)`, col.css from `pdx-row:defined` (a registered row, where
// CSS-only markup uses the bare tag). Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the component named by `ready` to style itself. */
async function mount(page: Page, html: string, ready: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '600px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    // Each writes an inline style on its first frame: wait on that, not on a visible box.
    await expect.poll(() => page.locator(`#f ${ready}`).first().evaluate((el) => (el as HTMLElement).style.length)).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=layout-hosts-beta-contract'); });

test('pdx-aspect-ratio: no class on the host, and still a clipped box at its ratio that its content fills', async ({ page }) => {
    await mount(page, '<pdx-aspect-ratio ratio="2/1"><img alt="" data-test="media"></pdx-aspect-ratio>', 'pdx-aspect-ratio');
    const m = await page.locator('#f pdx-aspect-ratio').evaluate((h) => {
        const s = getComputedStyle(h);
        const r = h.getBoundingClientRect();
        const media = h.querySelector('[data-test="media"]')!.getBoundingClientRect();
        return {
            cls: h.getAttribute('class'),
            position: s.position, overflow: s.overflow,
            width: Math.round(r.width), height: Math.round(r.height),
            media: [Math.round(media.width), Math.round(media.height)],
        };
    });
    expect(m).toEqual({ cls: null, position: 'relative', overflow: 'hidden', width: 600, height: 300, media: [600, 300] });
});

test('pdx-masonry: no class on the host, and still balanced columns whose items do not break across them', async ({ page }) => {
    await mount(page, '<pdx-masonry columns="2"><div style="height: 40px">A</div><div style="height: 80px">B</div></pdx-masonry>', 'pdx-masonry');
    const m = await page.locator('#f pdx-masonry').evaluate((h) => ({
        cls: h.getAttribute('class'),
        columnFill: getComputedStyle(h).columnFill,
        breakInside: getComputedStyle(h.firstElementChild!).breakInside,
        itemGap: getComputedStyle(h.firstElementChild!).marginBottom,
    }));
    expect(m).toEqual({ cls: null, columnFill: 'balance', breakInside: 'avoid', itemGap: '16px' });
});

test('pdx-row and pdx-col: no class on either host, and col.css still reaches the registered row', async ({ page }) => {
    await mount(page, '<pdx-row gutter="sm"><pdx-col span="6">A</pdx-col><pdx-col span="6">B</pdx-col></pdx-row>', 'pdx-col');
    const m = await page.locator('#f pdx-row').evaluate((row) => {
        // col.css's override for a registered row. layout.css gives every pdx-row the same min-width and
        // max-width, so on this page — which loads the whole design system — the computed style cannot
        // tell whether the override applies; an app that loads col.css with pdx-col and not layout.css
        // can. So the rule itself is found in the CSSOM, and asked whether it selects the row.
        const rules: CSSStyleRule[] = [];
        const walk = (list: CSSRuleList) => {
            for (const r of [...list]) {
                if (r instanceof CSSStyleRule) rules.push(r);
                else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
            }
        };
        for (const sheet of [...document.styleSheets]) walk(sheet.cssRules);
        const override = rules.find((r) => r.selectorText.startsWith('pdx-row') && r.style.maxWidth === '100%' && r.style.minWidth === '0px');
        return {
            row: row.getAttribute('class'),
            cols: [...row.querySelectorAll('pdx-col')].map((c) => c.getAttribute('class')),
            overrideFound: !!override,
            overrideReachesRow: !!override && row.matches(override.selectorText),
            display: getComputedStyle(row).display,
            colDisplay: getComputedStyle(row.querySelector('pdx-col')!).display,
        };
    });
    expect(m).toEqual({ row: null, cols: [null, null], overrideFound: true, overrideReachesRow: true, display: 'flex', colDisplay: 'block' });
});
