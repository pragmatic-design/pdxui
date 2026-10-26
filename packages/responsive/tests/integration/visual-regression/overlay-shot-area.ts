/**
 * The overlays a visual scenario draws outside the area its screenshot holds (#714).
 *
 * The runner shoots the scenario's section. An overlay drawn `position: fixed` (a modal dialog,
 * a drawer, a popover portalled to <body>, a toast, a bottom bar) is placed against the viewport,
 * not the section: below a short section it lies outside the shot, and the baseline holds the
 * backdrop and none of the overlay — `dialog-open` was a 1200×79 grey strip in every theme, and a
 * change to the dialog's look passed.
 *
 * An overlay here is a rendered, visible element whose computed position is `fixed`. One that
 * covers the whole viewport is a layer, a backdrop or a centring wrapper: it is painted wherever
 * the shot is taken, so what is measured is what it holds — its rendered children, down to the
 * first ones smaller than the viewport. Every overlay must lie inside the shot area, edge for edge.
 */
import type { Page } from '@playwright/test';

/** `'viewport'` for a scenario shot as the whole viewport, or the selector of the element shot. */
export type ShotArea = 'viewport' | string;

export async function overlaysOutsideShot(page: Page, area: ShotArea): Promise<string[]> {
    return page.evaluate((areaSelector) => {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const shot = areaSelector === 'viewport'
            ? new DOMRect(0, 0, vw, vh)
            : document.querySelector(areaSelector)!.getBoundingClientRect();

        const rendered = (el: Element) => {
            if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? r : null;
        };
        const coversViewport = (r: DOMRect) => r.left <= 0 && r.top <= 0 && r.right >= vw && r.bottom >= vh;

        // A fixed layer the size of the viewport stands for what it holds.
        const overlays = new Set<Element>();
        const collect = (el: Element) => {
            const r = rendered(el);
            if (!r) return;
            if (!coversViewport(r)) { overlays.add(el); return; }
            for (const child of el.children) collect(child);
        };
        for (const el of document.body.querySelectorAll('*')) {
            if (getComputedStyle(el).position === 'fixed') collect(el);
        }

        const box = (b: DOMRect) => `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`;
        const outside: string[] = [];
        const tol = 1;
        for (const el of overlays) {
            const r = el.getBoundingClientRect();
            if (r.left >= shot.left - tol && r.top >= shot.top - tol
                && r.right <= shot.right + tol && r.bottom <= shot.bottom + tol) continue;
            const test = el.getAttribute('data-test');
            const classes = typeof el.className === 'string' && el.className.trim()
                ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            const name = el.tagName.toLowerCase() + (test ? `[data-test="${test}"]` : '') + classes;
            outside.push(`${name} at ${box(r)} lies outside the shot area at ${box(shot)}`);
        }
        return outside;
    }, area);
}
