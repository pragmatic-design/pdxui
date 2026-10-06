// Selection model — key-based selection for lists, grids, trees, comboboxes.
// Supports: none/single/multiple modes, toggle/replace behavior, range select.
// Signal-based: selected, anchor, isSelected are all reactive.

import { signal, computed, batch } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────

export type SelectionMode = 'none' | 'single' | 'multiple';
export type SelectionBehavior = 'toggle' | 'replace';

export interface SelectionOptions<K = string> {
    /** Selection mode. Default: 'single'. */
    mode?: SelectionMode;
    /** Behavior on select(): toggle the key or replace previous selection. Default: 'replace'. */
    behavior?: SelectionBehavior;
    /** Initially selected keys. */
    defaultSelected?: Set<K>;
    /** Reactive getter for disabled keys that cannot be selected. */
    disabledKeys?: () => Set<K>;
    /** Callback when selection changes. */
    onSelectionChange?: (selected: Set<K>) => void;
}

export interface Selection<K = string> {
    /** The set of currently selected keys (reactive). */
    selected: ReadonlySignal<Set<K>>;
    /** Check if a specific key is selected. */
    isSelected: (key: K) => boolean;
    /** Select a key (respects mode and behavior). */
    select: (key: K) => void;
    /** Deselect a key. */
    deselect: (key: K) => void;
    /** Toggle a key's selection state. */
    toggle: (key: K) => void;
    /** Select all provided keys (multiple mode only). */
    selectAll: (keys: K[]) => void;
    /** Clear all selections. */
    clear: () => void;
    /** Range select from anchor to target (Shift+Click). Requires ordered allKeys. */
    extendTo: (key: K, allKeys: K[]) => void;
    /** The anchor key for range selection (reactive). */
    anchor: ReadonlySignal<K | null>;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── createSelection ───────────────────────────────────────────

/**
 * Create a key-based selection model.
 *
 * @example
 * ```ts
 * const sel = createSelection<string>({ mode: 'multiple', behavior: 'toggle' });
 * sel.select('item-1');
 * sel.toggle('item-2');
 * console.log(sel.selected()); // Set { 'item-1', 'item-2' }
 * sel.extendTo('item-5', allItemKeys); // Shift+Click range
 * ```
 */
export function createSelection<K = string>(options?: SelectionOptions<K>): Selection<K> {
    const mode = options?.mode ?? 'single';
    const behavior = options?.behavior ?? 'replace';
    const disabledKeys = options?.disabledKeys;
    const onChange = options?.onSelectionChange;

    const _selected = signal<Set<K>>(new Set(options?.defaultSelected));
    const _anchor = signal<K | null>(null);

    function isDisabled(key: K): boolean {
        return disabledKeys ? disabledKeys().has(key) : false;
    }

    function notify(): void {
        if (onChange) onChange(new Set(_selected.peek()));
    }

    function select(key: K): void {
        if (mode === 'none' || isDisabled(key)) return;

        batch(() => {
            if (mode === 'single') {
                _selected.set(new Set([key]));
                _anchor.set(key);
            } else {
                // multiple
                if (behavior === 'replace') {
                    _selected.set(new Set([key]));
                } else {
                    // toggle behavior — add
                    const next = new Set(_selected.peek());
                    next.add(key);
                    _selected.set(next);
                }
                _anchor.set(key);
            }
        });
        notify();
    }

    function deselect(key: K): void {
        if (mode === 'none') return;
        const prev = _selected.peek();
        if (!prev.has(key)) return;

        const next = new Set(prev);
        next.delete(key);
        _selected.set(next);
        notify();
    }

    function toggle(key: K): void {
        if (mode === 'none' || isDisabled(key)) return;

        batch(() => {
            const prev = _selected.peek();
            if (prev.has(key)) {
                const next = new Set(prev);
                next.delete(key);
                _selected.set(next);
            } else {
                if (mode === 'single') {
                    _selected.set(new Set([key]));
                } else {
                    const next = new Set(prev);
                    next.add(key);
                    _selected.set(next);
                }
            }
            _anchor.set(key);
        });
        notify();
    }

    function selectAll(keys: K[]): void {
        if (mode !== 'multiple') return;

        const filtered = keys.filter(k => !isDisabled(k));
        _selected.set(new Set(filtered));
        notify();
    }

    function clear(): void {
        if (_selected.peek().size === 0) return;
        _selected.set(new Set());
        _anchor.set(null);
        notify();
    }

    function extendTo(key: K, allKeys: K[]): void {
        if (mode !== 'multiple') return;
        if (isDisabled(key)) return;

        const anchorKey = _anchor.peek();
        if (anchorKey === null) {
            select(key);
            return;
        }

        const startIdx = allKeys.indexOf(anchorKey);
        const endIdx = allKeys.indexOf(key);
        if (startIdx === -1 || endIdx === -1) return;

        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);

        const rangeKeys = allKeys.slice(lo, hi + 1).filter(k => !isDisabled(k));
        _selected.set(new Set(rangeKeys));
        notify();
    }

    return {
        selected: computed(() => _selected()),
        isSelected: (key: K) => _selected().has(key),
        select,
        deselect,
        toggle,
        selectAll,
        clear,
        extendTo,
        anchor: computed(() => _anchor()),
        dispose: () => {
            _selected.set(new Set());
            _anchor.set(null);
        },
    };
}
