// Roving tabindex — keyboard navigation pattern for composite widgets.
// Used by: tabs, menu, listbox, tree, toolbar, radio group.
// Arrow keys move focus, Tab leaves the group entirely.
// Delegates to focusGroup() internally for the actual keyboard handling.

import type { Dispose } from '../utils/types';
import { focusGroup } from './focus-group';

export interface RovingOptions {
    /** CSS selector for focusable items within the container. Default: '[role="option"], [role="tab"], [role="menuitem"]'. */
    selector?: string;
    /** Navigation axis. Default: 'both'. */
    orientation?: 'horizontal' | 'vertical' | 'both';
    /** Wrap around at edges. Default: true. */
    wrap?: boolean;
    /** Called when an item receives focus. */
    onFocus?: (el: HTMLElement, index: number) => void;
    /** Called when Enter/Space is pressed on an item. */
    onSelect?: (el: HTMLElement, index: number) => void;
}

/**
 * Enable roving tabindex pattern on a container.
 * Only ONE item inside the container has tabindex="0" (the active one).
 * All others have tabindex="-1". Arrow keys move focus between items.
 *
 * This is a convenience wrapper around focusGroup() — backward compatible API.
 *
 * Usage:
 *   const dispose = roving(tablistElement, {
 *     orientation: 'horizontal',
 *     onSelect: (el, i) => activateTab(i),
 *   });
 */
export function roving(container: HTMLElement, options?: RovingOptions): Dispose {
    return focusGroup(container, {
        selector: options?.selector,
        orientation: options?.orientation ?? 'both',
        wrap: options?.wrap ?? true,
        onFocus: options?.onFocus,
        onSelect: options?.onSelect,
    });
}
