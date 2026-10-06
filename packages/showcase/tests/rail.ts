/**
 * Pin entries in the rail before the page starts.
 *
 * The rail is personal: Dashboard, the Favourites (Tickets, Board and Customers on a
 * first visit) and the Recents. Every other entity lives in the catalogue. A spec that navigates
 * FROM the rail to one of those — a SPA navigation, not a page load, is often the subject — pins it
 * first, as a reader would, rather than opening the catalogue in every row.
 *
 * An init script, so it holds across the reloads a spec makes. It only ever adds.
 */
import type { Page } from '@playwright/test';

export async function pinInRail(page: Page, ...keys: string[]): Promise<void> {
    await page.addInitScript((add) => {
        const current: string[] = JSON.parse(localStorage.getItem('showcase.pins') ?? '["tickets","board","customers"]');
        localStorage.setItem('showcase.pins', JSON.stringify([...new Set([...current, ...add])]));
    }, keys);
}
