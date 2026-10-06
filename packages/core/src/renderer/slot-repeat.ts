// repeatWithSlot — Bridge between repeat() keyed reconciliation and scoped slots.
// Priority chain: slot function > render callback prop > default renderer.
// Each component provides a scopeMapper to shape the slot scope per-item.

import { repeat } from './list';
import type { RepeatOptions } from './list';
import type { SlotFunction } from './slot';

/**
 * Renders a reactive keyed list using the best available renderer.
 *
 * Priority: slot template (declarative) > render callback (imperative) > default.
 * The slot function is called once per item inside repeat()'s reconciliation —
 * it does NOT create a separate effect per item.
 *
 * @param items - Signal or getter returning the array
 * @param keyFn - Unique key extractor per item
 * @param slotFn - Parent-provided scoped slot (from ctx.__slots)
 * @param renderFn - Imperative render callback prop (backward compat)
 * @param defaultFn - Built-in default renderer
 * @param scopeMapper - Converts (item, index) to the slot scope object
 * @param options - Transition options for enter/exit/move animations
 */
export function repeatWithSlot<T>(
    items: () => T[],
    keyFn: (item: T, index: number) => unknown,
    slotFn: SlotFunction | undefined | null,
    renderFn: ((item: T, index: number) => Node) | null,
    defaultFn: (item: T, index: number) => Node,
    scopeMapper?: (item: T, index: number) => Record<string, unknown>,
    options?: RepeatOptions,
): DocumentFragment {
    // Resolve the effective renderer once (priority: slot > callback > default)
    let effectiveRender: (item: T, index: number) => Node;

    if (slotFn) {
        const mapper = scopeMapper ?? ((item: T, index: number) => ({ item, index }));
        effectiveRender = (item, index) => {
            const scope = mapper(item, index);
            const result = slotFn(scope);
            // SlotFunction can return DocumentFragment — repeat() handles both
            return result;
        };
    } else if (renderFn) {
        effectiveRender = renderFn;
    } else {
        effectiveRender = defaultFn;
    }

    return repeat(items, keyFn, effectiveRender, options);
}
