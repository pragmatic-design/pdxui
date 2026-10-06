// Live Announcer — screen reader notifications via ARIA live region.
// Creates a visually hidden element that screen readers monitor for changes.

let liveRegion: HTMLElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function ensureLiveRegion(): HTMLElement {
    if (liveRegion && document.body.contains(liveRegion)) return liveRegion;

    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    // Visually hidden but accessible to screen readers
    Object.assign(liveRegion.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: '0',
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: '0',
    });
    document.body.appendChild(liveRegion);
    return liveRegion;
}

/**
 * Announce a message to screen readers via ARIA live region.
 *
 * Usage:
 *   announce('Item added to cart');
 *   announce('Error: invalid email', 'assertive');
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (typeof document === 'undefined') return;
    const region = ensureLiveRegion();
    region.setAttribute('aria-live', priority);

    // Clear then set — ensures screen readers detect the change even if same message
    if (clearTimer) clearTimeout(clearTimer);
    region.textContent = '';

    // Small delay ensures the clear is processed before the new message
    requestAnimationFrame(() => {
        region.textContent = message;
        // Auto-clear after 5 seconds to avoid stale announcements
        clearTimer = setTimeout(() => { region.textContent = ''; }, 5000);
    });
}

/** Remove the live region from DOM (cleanup). */
export function destroyAnnouncer(): void {
    if (liveRegion) {
        liveRegion.remove();
        liveRegion = null;
    }
    if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
}
