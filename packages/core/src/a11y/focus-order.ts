// Focus order — manage Tab flow between composite Web Components.
// Ensures Tab enters a component, Arrow keys navigate internally,
// and Tab exits to the next component.
// Used by: Toolbar, Form, Layout with multiple WC children.

import type { Dispose } from '../utils/types';

export interface FocusOrderOptions {
    /** Tab sequentially between child components. Default: true. */
    sequential?: boolean;
    /** Skip disabled components in the Tab flow. Default: true. */
    skipDisabled?: boolean;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Manage Tab order between composite child components within a container.
 * Each direct child is treated as a "tab stop" — Tab moves between them,
 * Arrow keys are handled internally by each component's own focus group.
 */
export function manageFocusOrder(container: HTMLElement, options?: FocusOrderOptions): Dispose {
    if (typeof document === 'undefined') return () => {};

    const sequential = options?.sequential ?? true;
    const skipDisabled = options?.skipDisabled ?? true;

    function getTabStops(): HTMLElement[] {
        const children = Array.from(container.children) as HTMLElement[];
        return children.filter(child => {
            if (skipDisabled && (child.hasAttribute('disabled') || child.getAttribute('aria-disabled') === 'true')) {
                return false;
            }
            // A tab stop is a child that either is focusable itself or contains focusable elements
            return child.matches(FOCUSABLE) || child.querySelector(FOCUSABLE) !== null;
        });
    }

    function getFirstFocusable(el: HTMLElement): HTMLElement | null {
        if (el.matches(FOCUSABLE)) return el;
        return el.querySelector<HTMLElement>(FOCUSABLE);
    }

    function handleKeydown(e: KeyboardEvent): void {
        if (e.key !== 'Tab' || !sequential) return;

        const stops = getTabStops();
        if (stops.length <= 1) return;

        const active = document.activeElement as HTMLElement;
        if (!active) return;

        // Find which tab stop contains the active element
        const currentStopIdx = stops.findIndex(stop =>
            stop === active || stop.contains(active)
        );
        if (currentStopIdx === -1) return;

        const direction = e.shiftKey ? -1 : 1;
        const nextIdx = currentStopIdx + direction;

        // Let browser handle if going out of range
        if (nextIdx < 0 || nextIdx >= stops.length) return;

        const nextStop = stops[nextIdx];
        const focusTarget = getFirstFocusable(nextStop);

        if (focusTarget) {
            e.preventDefault();
            focusTarget.focus();
        }
    }

    container.addEventListener('keydown', handleKeydown);

    return () => {
        container.removeEventListener('keydown', handleKeydown);
    };
}
