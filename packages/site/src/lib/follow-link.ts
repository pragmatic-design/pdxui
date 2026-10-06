// The site's links are plain <a href> — a reader can copy them, a crawler follows them — and a click
// on one navigates in the page instead of reloading it. One handler for every route, and it lets a
// modified click through.

import { navigate } from '@pdxui/router';

/**
 * Follow the clicked link in the page. A click with Ctrl, Meta, Shift or Alt, or a button other than
 * the main one, is left to the browser: a new tab, a new window, a download.
 */
export function followLink(e: MouseEvent): void {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const href = (e.currentTarget as Element).getAttribute('href');
    if (!href) return;
    e.preventDefault();
    navigate(href);
}
