// Live Region — screen reader announcements via aria-live.
// Manages a singleton live region element for polite/assertive announcements.

const isBrowser = typeof document !== 'undefined';

export type LivePoliteness = 'polite' | 'assertive';

export interface LiveRegion {
    /** Announce a message to screen readers. */
    announce(message: string, politeness?: LivePoliteness): void;
    /** Clear the live region. */
    clear(): void;
    /** Remove the live region element from the DOM. */
    dispose(): void;
}

let _politeEl: HTMLElement | null = null;
let _assertiveEl: HTMLElement | null = null;

function ensureRegion(politeness: LivePoliteness): HTMLElement {
    const isPolite = politeness === 'polite';
    const existing = isPolite ? _politeEl : _assertiveEl;
    if (existing && document.body.contains(existing)) return existing;

    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;padding:0;margin:-1px;';

    document.body.appendChild(el);
    if (isPolite) _politeEl = el;
    else _assertiveEl = el;
    return el;
}

/**
 * Create or get the global live region for screen reader announcements.
 *
 * @example
 * const live = createLiveRegion();
 * live.announce('Item deleted'); // polite (default)
 * live.announce('Error: connection lost', 'assertive');
 */
export function createLiveRegion(): LiveRegion {
    function announce(message: string, politeness: LivePoliteness = 'polite'): void {
        if (!isBrowser) return;
        const el = ensureRegion(politeness);
        // Clear then re-set on a microtask to force a screen-reader re-read.
        // queueMicrotask (not rAF): predictable, and fires even when the tab is
        // backgrounded or in headless contexts (project convention — see CONTRIBUTING.md).
        el.textContent = '';
        queueMicrotask(() => { el.textContent = message; });
    }

    function clear(): void {
        if (_politeEl) _politeEl.textContent = '';
        if (_assertiveEl) _assertiveEl.textContent = '';
    }

    function dispose(): void {
        _politeEl?.remove();
        _assertiveEl?.remove();
        _politeEl = null;
        _assertiveEl = null;
    }

    return { announce, clear, dispose };
}
