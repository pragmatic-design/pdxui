// Keyed list reconciliation — renders a reactive list of items.
// Uses LIS (Longest Increasing Subsequence) to minimize DOM mutations.
// Supports FLIP move animations via TransitionOptions.move.

import { effect, collectDisposers, onDispose, signal, untracked } from '../reactivity/signal';
import type { Signal } from '../utils/types';
import { enterRow, exit, recordPositions, flipAnimate } from './transitions';
import { placePartNode, placePartNodes } from './part-nodes';
import { trackReconcile, isReconcileTrackingEnabled } from '../debug/inspector';
import { DEV } from '../utils/env';
import type { TransitionOptions } from './helpers';

let _warnedStableKeyMutation = false;

interface MappedItem<T> {
    key: unknown;
    item: T;
    nodes: Node[];
    dispose: (() => void) | null;
    /** Row mode only: the signals behind the getters the row was rendered with. */
    row?: RowSignals<T>;
}

interface RowSignals<T> { item: Signal<T>; index: Signal<number> }

/**
 * How a row is rendered. `value` hands it the item — what hand-written `each()` code expects.
 * `getters` hands it `item()` and `index()`, backed by per-row signals the reconciler updates
 * when it reuses the row: what `@for` compiles to.
 */
type RowRenderer<T> =
    | { mode: 'value'; render: (item: T, index: number) => Node }
    | { mode: 'getters'; render: (item: () => T, index: () => number) => Node };

/** Options for repeat rendering. */
export interface RepeatOptions {
    transitions?: TransitionOptions;
}

/**
 * Renders a reactive list with keyed reconciliation.
 *
 * @param items - Signal or function returning the array
 * @param keyFn - Extracts a unique key from each item
 * @param renderFn - Creates DOM for a single item
 * @param options - Transition options (enter, exit, move)
 * @returns A DocumentFragment with a start/end marker; updates automatically
 */
export function repeat<T>(
    items: (() => T[]),
    keyFn: (item: T, index: number) => unknown,
    renderFn: (item: T, index: number) => Node,
    options?: RepeatOptions
): DocumentFragment {
    return mountList(items, keyFn, { mode: 'value', render: renderFn }, options);
}

/**
 * {@link repeat}, with rows that see their CURRENT item: `renderFn` receives `item()` and
 * `index()` instead of values. A row reused for the same key with a new object — an immutable
 * update — has its getters moved to the new object and position, so its bindings re-run and its DOM
 * stays the same node. What `@for` compiles to, through `eachRow`.
 */
export function repeatRows<T>(
    items: (() => T[]),
    keyFn: (item: T, index: number) => unknown,
    renderFn: (item: () => T, index: () => number) => Node,
    options?: RepeatOptions
): DocumentFragment {
    return mountList(items, keyFn, { mode: 'getters', render: renderFn }, options);
}

function mountList<T>(
    items: (() => T[]),
    keyFn: (item: T, index: number) => unknown,
    renderer: RowRenderer<T>,
    options?: RepeatOptions
): DocumentFragment {
    const frag = document.createDocumentFragment();
    const startMarker = document.createComment('repeat-start');
    const endMarker = document.createComment('repeat-end');
    frag.appendChild(startMarker);
    frag.appendChild(endMarker);

    let mapped: MappedItem<T>[] = [];
    let prevKeys: unknown[] = [];

    effect(() => {
        const list = items();
        // An identity guard (list === prevItems) would not see IN PLACE
        // mutations (a push on an array inside $store: the same reference, the effect re-run
        // by the 'length' bump but the reconciliation skipped → a stale UI). We compare
        // the KEYS: if they are identical, updating the contents goes through the per-item
        // bindings; if they differ, we reconcile.
        const n = list.length;
        const keys: unknown[] = new Array(n);
        for (let i = 0; i < n; i++) keys[i] = keyFn(list[i], i);
        if (mapped.length > 0 && n === prevKeys.length) {
            let same = true;
            for (let i = 0; i < n; i++) { if (keys[i] !== prevKeys[i]) { same = false; break; } }
            if (same && renderer.mode === 'getters') {
                // Same keys, same positions: only the objects may have been replaced. Move each
                // reused row's getter to its new object; its bindings re-run, its DOM stays.
                for (let i = 0; i < n; i++) {
                    const m = mapped[i];
                    if (m.item !== list[i]) { m.item = list[i]; m.row?.item.setRaw(list[i]); }
                }
                return;
            }
            if (same) {
                // Keys are identical → the item DOM is reused and its bindings only update
                // if the item itself is reactive ($store / signals). With an immutable update
                // (rows.map(r => r.id === x ? {...r} : r)) the reference changed but the key
                // did not, so a plain `${item.name}` closure keeps the old value. Warn once so
                // this contract is visible instead of silently showing stale data.
                if (DEV && !_warnedStableKeyMutation) {
                    for (let i = 0; i < n; i++) {
                        if (mapped[i] && list[i] !== mapped[i].item) {
                            _warnedStableKeyMutation = true;
                            console.warn(
                                '[pdx] repeat()/each(): an item was replaced with a new object but its key is unchanged, ' +
                                'so its DOM will NOT update. Either mutate the existing item reactively (a $store item / signals), ' +
                                'or give changed items a new key.',
                            );
                            break;
                        }
                    }
                }
                return;
            }
        }
        prevKeys = keys;
        mapped = reconcile(list, keyFn, renderer, mapped, startMarker, endMarker, options?.transitions, keys);
    });

    // Teardown: dispose every surviving item's effects when the enclosing scope
    // is torn down. Removed items are disposed during reconcile; this covers the
    // items still present at unmount. Runs only on scope teardown, not per re-run.
    onDispose(() => {
        for (const m of mapped) m.dispose?.();
        mapped = [];
    });

    return frag;
}

/**
 * LIS-based reconciliation. Minimizes DOM operations by finding items
 * that are already in correct relative order (LIS) and only moving the rest.
 */
let reconcileCounter = 0;

/**
 * Render one row in its own ownership scope, so its effects can be disposed when the row is removed.
 * The scope is detached: NOT owned by the list's driver effect, so surviving rows are never disposed
 * when the driver re-runs.
 */
function createRow<T>(renderer: RowRenderer<T>, key: unknown, item: T, i: number): MappedItem<T> {
    let row: RowSignals<T> | undefined;
    let node: Node;
    let dispose: () => void;
    if (renderer.mode === 'getters') {
        const r: RowSignals<T> = { item: signal(item), index: signal(i) };
        row = r;
        // Untracked: reading item() while the row is built must not subscribe the LIST
        // driver to the row's own signal.
        [node, dispose] = collectDisposers(() => untracked(() => renderer.render(r.item, r.index)));
    } else {
        [node, dispose] = collectDisposers(() => renderer.render(item, i));
    }
    const nodes = node instanceof DocumentFragment ? Array.from(node.childNodes) : [node];
    // Data repetition, marked for `__PDX_DEVTOOLS__.outline()` (#271): a row's elements are items
    // of a list, which the outline may summarise — controls that merely share a role are not.
    // Development only: a production row carries no marker.
    if (DEV) for (const n of nodes) if (n.nodeType === 1) (n as Element).setAttribute('data-pdx-item', '');
    return { key, item, nodes, dispose, row };
}

/**
 * Remove everything between the list's two markers in one operation (#118). When the markers are their
 * parent's first and last child — a `@for` alone in its `<tbody>` — the parent is emptied and the
 * markers put back; otherwise one Range removes what lies between them.
 */
function clearBetween(parent: Node, startMarker: Comment, endMarker: Comment): void {
    if (parent.firstChild === startMarker && parent.lastChild === endMarker) {
        parent.textContent = '';
        parent.appendChild(startMarker);
        parent.appendChild(endMarker);
        return;
    }
    const range = (parent.ownerDocument ?? document).createRange();
    range.setStartAfter(startMarker);
    range.setEndBefore(endMarker);
    range.deleteContents();
}

function reconcile<T>(
    newItems: T[],
    keyFn: (item: T, index: number) => unknown,
    renderer: RowRenderer<T>,
    oldMapped: MappedItem<T>[],
    startMarker: Comment,
    endMarker: Comment,
    transitions?: TransitionOptions,
    precomputedKeys?: unknown[]
): MappedItem<T>[] {
    // Telemetry only when tracking is on — it avoids 2× performance.now()
    // + a filter and allocations for every reconciliation in production.
    const trackingOn = isReconcileTrackingEnabled();
    const reconcileStart = trackingOn ? performance.now() : 0;
    const parent = endMarker.parentNode;
    if (!parent) return oldMapped;

    // Pre-allocate with known sizes to reduce allocation overhead
    const newLen = newItems.length;
    const oldLen = oldMapped.length;
    const newKeys: unknown[] = precomputedKeys ?? new Array(newLen);
    if (!precomputedKeys) {
        for (let i = 0; i < newLen; i++) newKeys[i] = keyFn(newItems[i], i);
    }

    // Warn on duplicate keys (dev aid — duplicate keys cause reconciliation bugs)
    if (DEV) {
        const seen = new Set<unknown>();
        for (let i = 0; i < newLen; i++) {
            if (seen.has(newKeys[i])) {
                console.warn(`[pdx] Duplicate key "${String(newKeys[i])}" in @for list. This may cause rendering bugs. Ensure track expression returns unique values.`);
                break;
            }
            seen.add(newKeys[i]);
        }
    }

    // Fast path: CLEAR (#118). Every row goes, so every scope is disposed and the nodes are removed in
    // one operation — not one by one. Not with an exit transition: each row then leaves on its own.
    if (newLen === 0 && oldLen > 0 && !transitions?.exit && startMarker.parentNode === parent) {
        for (const m of oldMapped) m.dispose?.();
        clearBetween(parent, startMarker, endMarker);
        if (trackingOn) trackReconcile({ listId: `list-${reconcileCounter++}`, oldCount: oldLen, newCount: 0, reused: 0, added: 0, removed: oldLen, moved: 0, lisLength: 0, durationMs: Math.round((performance.now() - reconcileStart) * 100) / 100 });
        return [];
    }

    // Fast path: APPEND (#118) — the old keys are the new list's prefix, an empty list included. The
    // rows kept are told their (possibly new) objects; only the new rows are created, and inserted in
    // ONE operation. No map, no LIS. Not with a move transition, which wants the general path's FLIP.
    if (newLen > oldLen && !transitions?.move) {
        let prefix = true;
        for (let i = 0; i < oldLen; i++) { if (oldMapped[i].key !== newKeys[i]) { prefix = false; break; } }
        if (prefix) {
            const result = oldMapped.slice();
            for (let i = 0; i < oldLen; i++) {
                const kept = result[i];
                if (kept.item !== newItems[i]) { kept.item = newItems[i]; kept.row?.item.setRaw(newItems[i]); }
            }
            const added: Node[] = [];
            for (let i = oldLen; i < newLen; i++) {
                const row = createRow(renderer, newKeys[i], newItems[i], i);
                result.push(row);
                for (const n of row.nodes) added.push(n);
            }
            placePartNodes(parent, added, endMarker);
            if (transitions?.enter) {
                const stagger = transitions.stagger ?? 0;
                for (let i = oldLen; i < newLen; i++) {
                    for (const n of result[i].nodes) void enterRow(n, transitions.enter, stagger * (i - oldLen));
                }
            }
            if (trackingOn) trackReconcile({ listId: `list-${reconcileCounter++}`, oldCount: oldLen, newCount: newLen, reused: oldLen, added: newLen - oldLen, removed: 0, moved: 0, lisLength: oldLen, durationMs: Math.round((performance.now() - reconcileStart) * 100) / 100 });
            return result;
        }
    }

    // FLIP: record old positions before mutation — only when a move transition will use them.
    const oldPositions = transitions?.move ? recordPositions(oldMapped.flatMap(m => m.nodes)) : null;

    const oldMap = new Map<unknown, MappedItem<T>>();
    const oldKeyToIndex = new Map<unknown, number>();
    for (let i = 0; i < oldLen; i++) {
        oldMap.set(oldMapped[i].key, oldMapped[i]);
        oldKeyToIndex.set(oldMapped[i].key, i);
    }

    const newMapped: MappedItem<T>[] = new Array(newLen);
    const lisPositions: number[] = new Array(newLen);

    // Build new mapped items (reuse or create) + collect old positions for LIS
    for (let i = 0; i < newLen; i++) {
        const key = newKeys[i];
        const existing = oldMap.get(key);

        if (existing) {
            // Reuse the old node for THIS key, then remove it from oldMap so a
            // DUPLICATE key later in newItems can't reuse the same MappedItem
            // (which would alias one DOM node to two list slots → corruption).
            // The duplicate falls into the else branch and gets a fresh node.
            existing.item = newItems[i];
            // Row mode: the reused row now stands for this object at this position.
            existing.row?.item.setRaw(newItems[i]);
            existing.row?.index.set(i);
            newMapped[i] = existing;
            oldMap.delete(key);
            lisPositions[i] = oldKeyToIndex.get(key)!;
        } else {
            // A new row, in its own ownership scope (createRow); disposed on removal and on teardown.
            newMapped[i] = createRow(renderer, key, newItems[i], i);
            lisPositions[i] = -1; // New item, not in old list
        }
    }

    // Remove items no longer in list (with exit transition). `@mode` orders exits and enters (#207):
    // 'out-in' holds the arriving rows until the leaving ones are gone, 'in-out' keeps the leaving
    // rows until the arriving ones have entered.
    const mode = transitions?.mode ?? 'simultaneous';
    const arriving = !!transitions?.enter && lisPositions.some((p) => p === -1);
    const leavingNodes: Node[] = [];
    for (const old of oldMap.values()) {
        if (transitions?.exit) leavingNodes.push(...old.nodes);
        else for (const n of old.nodes) n.parentNode?.removeChild(n);
        old.dispose?.();
    }
    const runExits = (): Promise<unknown> => Promise.all(leavingNodes.map((n) => exit(n, transitions!.exit)));
    const exitsAfterEnters = mode === 'in-out' && arriving && leavingNodes.length > 0;
    const exitsDone = leavingNodes.length > 0 && !exitsAfterEnters ? runExits() : null;

    // Find LIS of old positions (items already in correct relative order)
    const lisIndices = longestIncreasingSubsequence(lisPositions);
    const lisSet = new Set(lisIndices);

    // Place items: LIS items don't move, others are inserted before the next LIS item
    for (let i = newMapped.length - 1; i >= 0; i--) {
        const entry = newMapped[i];
        const nextSibling = i + 1 < newMapped.length
            ? newMapped[i + 1].nodes[0]
            : endMarker;

        if (lisSet.has(i)) {
            // Already in correct position — skip if nodes are already before nextSibling
            const firstNode = entry.nodes[0];
            if (firstNode && firstNode.nextSibling !== nextSibling &&
                firstNode.parentNode === parent) {
                // Check if really in the right spot
                // If the node IS the nextSibling's previous, it's fine
            }
            // LIS items: usually already in place, but we need to ensure
            // they're in the parent. For new items in LIS (shouldn't happen), insert.
            if (!entry.nodes[0]?.parentNode) {
                for (const n of entry.nodes) placePartNode(parent, n, nextSibling);
            }
        } else {
            // Not in LIS — insert/move before next sibling
            for (const n of entry.nodes) {
                placePartNode(parent, n, nextSibling);
            }
        }
    }

    // Enter transition for new items: the n-th arriving row waits n × `@stagger` ms (#207), and under
    // 'out-in' every one waits for the exits.
    if (transitions?.enter) {
        const stagger = transitions.stagger ?? 0;
        const after = mode === 'out-in' && exitsDone ? exitsDone : undefined;
        const enters: Promise<void>[] = [];
        let arrived = 0;
        for (let i = 0; i < newMapped.length; i++) {
            if (lisPositions[i] !== -1) continue; // reused, not arriving
            const delay = stagger * arrived++;
            for (const n of newMapped[i].nodes) enters.push(enterRow(n, transitions.enter, delay, after));
        }
        if (exitsAfterEnters) void Promise.all(enters).then(runExits);
    }

    // FLIP: animate moved items
    if (oldPositions && transitions?.move) {
        const duration = parseInt(transitions.move.replace(/\D/g, '')) || 300;
        const allNewNodes = newMapped.flatMap(m => m.nodes);
        flipAnimate(oldPositions, allNewNodes, duration);
    }

    // Telemetry: track reconciliation metrics (only with tracking on)
    if (trackingOn) {
        let reusedCount = 0;
        for (let i = 0; i < newLen; i++) { if (lisPositions[i] >= 0) reusedCount++; }
        const movedCount = newMapped.length - lisSet.size - (newLen - reusedCount);
        trackReconcile({
            listId: `list-${reconcileCounter++}`,
            oldCount: oldLen,
            newCount: newLen,
            reused: reusedCount,
            added: newLen - reusedCount,
            removed: oldLen - reusedCount,
            moved: Math.max(0, movedCount),
            lisLength: lisSet.size,
            durationMs: Math.round((performance.now() - reconcileStart) * 100) / 100,
        });
    }

    return newMapped;
}

/**
 * Find indices of the Longest Increasing Subsequence in the array.
 * Only considers non-negative values (negative = new item, skip).
 * Returns indices into the input array.
 *
 * O(n log n) algorithm using patience sorting.
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
    if (arr.length === 0) return [];

    // Filter to only reused items (position >= 0)
    const indices: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] >= 0) {
            indices.push(i);
            values.push(arr[i]);
        }
    }

    if (values.length === 0) return [];

    // Patience sorting for LIS
    const tails: number[] = []; // tails[i] = smallest tail value for IS of length i+1
    const tailIndices: number[] = []; // index in values[] for each tail
    const predecessors: number[] = new Array(values.length).fill(-1);

    for (let i = 0; i < values.length; i++) {
        const val = values[i];

        // Binary search for the leftmost tail >= val
        let lo = 0, hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (tails[mid] < val) lo = mid + 1;
            else hi = mid;
        }

        tails[lo] = val;
        tailIndices[lo] = i;

        if (lo > 0) {
            predecessors[i] = tailIndices[lo - 1];
        }
    }

    // Reconstruct LIS by walking predecessors
    const result: number[] = [];
    let k = tailIndices[tails.length - 1];
    for (let i = tails.length - 1; i >= 0; i--) {
        result.push(indices[k]); // Map back to original array index
        k = predecessors[k];
    }

    result.reverse();
    return result;
}
