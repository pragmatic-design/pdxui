// Typed Slots — named slot system with type-safe scope data.
// Extends the native <slot> mechanism for Light DOM components.
// Supports: named slots, scoped slots (data passed to slot content),
// fallback content, slot forwarding.

import { signal } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export interface SlotDefinition<TScope = void> {
    /** Slot name. 'default' for the unnamed slot. */
    name: string;
    /** Whether this slot is required. Default: false. */
    required?: boolean;
    /** Fallback render function if no content is provided. */
    fallback?: (scope: TScope) => HTMLElement | string;
}

export interface SlotManager {
    /** Check if a named slot has content. */
    hasSlot(name: string): boolean;
    /** Get elements assigned to a named slot. */
    getSlotContent(name: string): HTMLElement[];
    /** Render a slot: returns content or fallback. */
    renderSlot<TScope = void>(name: string, scope?: TScope, fallback?: (scope: TScope) => HTMLElement | string): HTMLElement | DocumentFragment | null;
    /** Signal: which slots are filled (reactive). */
    filledSlots: ReadonlySignal<Set<string>>;
    /** Re-scan slots (after DOM mutation). */
    refresh(): void;
}

// ─── createSlotManager ────────────────────────────────────────

/**
 * Create a slot manager for a compound component.
 * Scans the host element for [slot="name"] children.
 *
 * @example
 * const slots = createSlotManager(hostEl);
 *
 * // Check if header slot is filled
 * if (slots.hasSlot('header')) { ... }
 *
 * // Render with fallback
 * const content = slots.renderSlot('footer', undefined, () => {
 *     const el = document.createElement('div');
 *     el.textContent = 'Default footer';
 *     return el;
 * });
 */
export function createSlotManager(host: HTMLElement): SlotManager {
    const _filledSlots = signal<Set<string>>(new Set());
    let slotMap = new Map<string, HTMLElement[]>();

    function scan(): void {
        slotMap = new Map();
        const filled = new Set<string>();

        for (const child of Array.from(host.children) as HTMLElement[]) {
            const slotName = child.getAttribute('slot') ?? 'default';
            if (!slotMap.has(slotName)) slotMap.set(slotName, []);
            slotMap.get(slotName)!.push(child);
            filled.add(slotName);
        }

        _filledSlots.set(filled);
    }

    // Initial scan
    scan();

    // Observe for dynamic slot content (fire-and-forget — lives as long as the host).
    if (typeof MutationObserver !== 'undefined') {
        new MutationObserver(scan).observe(host, { childList: true });
    }

    function hasSlot(name: string): boolean {
        return slotMap.has(name) && slotMap.get(name)!.length > 0;
    }

    function getSlotContent(name: string): HTMLElement[] {
        return slotMap.get(name) ?? [];
    }

    function renderSlot<TScope = void>(
        name: string,
        scope?: TScope,
        fallback?: (scope: TScope) => HTMLElement | string,
    ): HTMLElement | DocumentFragment | null {
        const content = slotMap.get(name);

        if (content && content.length > 0) {
            // For scoped slots: set data attributes on content elements
            if (scope && typeof scope === 'object') {
                for (const el of content) {
                    for (const [key, value] of Object.entries(scope as Record<string, unknown>)) {
                        el.setAttribute(`data-slot-${key}`, String(value));
                    }
                }
            }

            if (content.length === 1) return content[0];
            const fragment = document.createDocumentFragment();
            for (const el of content) fragment.appendChild(el.cloneNode(true));
            return fragment;
        }

        // Fallback
        if (fallback) {
            const result = fallback(scope as TScope);
            if (typeof result === 'string') {
                const el = document.createElement('span');
                el.textContent = result;
                return el;
            }
            return result;
        }

        return null;
    }

    return {
        hasSlot,
        getSlotContent,
        renderSlot,
        filledSlots: _filledSlots as ReadonlySignal<Set<string>>,
        refresh: scan,
    };
}

// ─── Slot forwarding helper ───────────────────────────────────

/**
 * Forward slots from outer host to inner component.
 * Used when a compound component wraps another compound component.
 *
 * @example
 * // <pdx-fancy-dialog> wraps <pdx-dialog>
 * // Forward 'header' and 'footer' slots to inner dialog
 * forwardSlots(outerHost, innerHost, ['header', 'footer']);
 */
export function forwardSlots(
    source: HTMLElement,
    target: HTMLElement,
    slotNames: string[],
): void {
    for (const name of slotNames) {
        const elements = Array.from(source.querySelectorAll(`[slot="${name}"]`)) as HTMLElement[];
        for (const el of elements) {
            target.appendChild(el);
        }
    }
}
