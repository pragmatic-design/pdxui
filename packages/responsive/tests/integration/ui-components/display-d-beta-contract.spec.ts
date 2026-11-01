// The fourth batch of #291 on the beta contract: pdx-banner and pdx-relative-time. A dismissed banner is
// the host's custom state, not an inline display it writes; its alert or status is in the tree only
// while it is shown (A4); `show` and `dismiss` are its exposed verbs; its pieces are named parts and
// `pdx-close` stays on it. pdx-relative-time does no work on a frozen page (lifecycle.md): its updates
// stop with the page and run again when it comes back, through the scope's suspend and resume (#269).
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '360px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

/** The element's own parts: not those of a component nested in it (the banner's icon). */
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => {
    const owner = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && !p.tagName.includes('-')) p = p.parentElement;
        return p;
    };
    return [...new Set([...h.querySelectorAll('[data-part]')].filter((e) => owner(e) === h).map((e) => e.getAttribute('data-part')))].sort();
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=display-d-beta-contract'); });

test('pdx-banner: dismissed is a state, not an inline style; its alert is in the tree only while shown (A4); pdx-close stays on it', async ({ page }) => {
    await mount(page, '<pdx-banner variant="danger" closable>Payment failed</pdx-banner><pdx-banner variant="info">Saved</pdx-banner>');
    const danger = page.locator('#f pdx-banner[variant="danger"]');
    await expect(page.locator('#f [data-part="close"]')).toHaveCount(1);
    const said = (role: 'alert' | 'status') => page.locator('#f').getByRole(role)
        .evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(await said('alert')).toEqual(['Payment failed ×']);
    expect(await said('status')).toEqual(['Saved']);
    expect(await parts(page, '#f pdx-banner[variant="danger"]')).toEqual(['close', 'icon', 'message', 'root']);

    await danger.evaluate((h) => {
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('pdx-close', () => { log.own++; });
        h.parentElement!.addEventListener('pdx-close', () => { log.parent++; });
    });
    await page.locator('#f [data-part="close"]').click();
    expect(await danger.evaluate((h) => ({
        dismissed: h.matches(':state(dismissed)'),
        display: getComputedStyle(h).display,
        inline: (h as HTMLElement).style.display,
        visible: (h as unknown as { isVisible: boolean }).isVisible,
    }))).toEqual({ dismissed: true, display: 'none', inline: '', visible: false });
    expect(await page.locator('#f').getByRole('alert').count(), 'a dismissed banner says nothing').toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ own: 1, parent: 0 });

    await danger.evaluate((h) => { (h as unknown as { show(): void }).show(); });
    expect(await danger.evaluate((h) => ({ dismissed: h.matches(':state(dismissed)'), hidden: getComputedStyle(h).display === 'none' })))
        .toEqual({ dismissed: false, hidden: false });
    expect(await page.locator('#f').getByRole('alert').count()).toBe(1);
});

test('pdx-relative-time: its updates stop while its page is frozen and run again when the page comes back', async ({ page }) => {
    // The page wrapper is what the router outlet freezes: marked kept-alive and moved, whole, into a
    // DocumentFragment (#268, #269).
    const at = new Date(Date.now() - 90_000).toISOString();
    await mount(page, `<div id="kept"><pdx-relative-time datetime="${at}" update-interval="200"></pdx-relative-time></div>`);
    await expect(page.locator('#f [data-part="root"]')).toHaveCount(1);
    // Every update is a write of the <time>'s text: counted by an observer, which sees the frozen fragment too.
    await page.evaluate(() => {
        const w = window as unknown as { __updates: number };
        w.__updates = 0;
        new MutationObserver((records) => { w.__updates += records.length; })
            .observe(document.querySelector('#kept time')!, { childList: true, characterData: true, subtree: true });
    });
    const updates = () => page.evaluate(() => (window as unknown as { __updates: number }).__updates);
    await expect.poll(updates, { message: 'it never updated' }).toBeGreaterThan(0);

    await page.evaluate(() => {
        const kept = document.getElementById('kept')! as HTMLElement & { _keepAlive?: boolean };
        kept._keepAlive = true;
        const w = window as unknown as { __frozen: DocumentFragment; __kept: HTMLElement };
        w.__kept = kept;
        w.__frozen = document.createDocumentFragment();
        w.__frozen.appendChild(kept);
    });
    const atFreeze = await updates();
    // Five intervals with the page frozen: a fixed window, because what is measured is that nothing
    // happens in it.
    await page.waitForTimeout(1000);
    expect(await updates(), 'it updated on the frozen page').toBe(atFreeze);

    await page.evaluate(() => {
        document.getElementById('f')!.appendChild((window as unknown as { __kept: HTMLElement }).__kept);
    });
    await expect.poll(updates, { message: 'it did not update again with the page' }).toBeGreaterThan(atFreeze);
    expect(await parts(page, '#f pdx-relative-time')).toEqual(['root']);
    expect(await page.locator('#f pdx-relative-time').evaluate((h) => h.getAttribute('class'))).toBeNull();
});
