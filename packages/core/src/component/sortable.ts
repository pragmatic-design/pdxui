// Sortable — drag-to-reorder inside a list.
// Builds on useDrag + useDropZone. Handles index calculation,
// placeholder gap, and FLIP animation on reorder.
// Used by: List reorder, Kanban, DataGrid row reorder, Tab reorder, Tree.

import { signal, effect, batch } from '../reactivity/signal';
import { announce } from '../a11y/announcer';
import { offscreenInstructions, describedBy } from '../a11y/instructions';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

/**
 * Write `from`'s computed style, and its descendants', inline on `to`, a deep clone of it.
 *
 * So the clone looks like the original wherever it is appended. Paired by child index, which a
 * `cloneNode(true)` guarantees. Read once, when a drag starts, so the cost is one
 * `getComputedStyle` per element of ONE item.
 */
export function inlineComputedStyle(from: Element, to: Element): void {
    const cs = getComputedStyle(from);
    const style = (to as HTMLElement).style;
    if (style) {
        for (let i = 0; i < cs.length; i++) {
            const prop = cs[i];
            style.setProperty(prop, cs.getPropertyValue(prop));
        }
    }
    const a = from.children;
    const b = to.children;
    for (let i = 0; i < a.length && i < b.length; i++) inlineComputedStyle(a[i], b[i]);
}

// ─── Types ─────────────────────────────────────────────────────

/**
 * What a list shows while one of its own items is being dragged.
 *
 * `gap: true` is the default: the items after the insertion point shift by the dragged
 * item's own size, so a space of exactly that size opens, and the dragged row stays where it was
 * at reduced opacity while a ghost follows the pointer.
 *
 * `gap: 'preview'` moves the dragged row INTO that space instead. The list then reads as the
 * arrangement the drop will produce, which is the strongest of the destination feedbacks and the
 * one that makes an insertion line unnecessary — the item is already where the line would point.
 */
export interface SortableFeedbackOptions {
    /** Open the space where the item will land. `'preview'` also moves the item into it. */
    gap?: boolean | 'preview';
    /**
     * The list under the pointer marks itself `data-pdx-drop="over"`, which `drop-zone.css`
     * paints. **Default: on with a `group`, off without one.**
     *
     * The same attribute and the same stylesheet as `useDropZone`, on purpose: a list
     * that is a drop target should not look different from every other drop target because it
     * happens to sort. It exists here because `useSortable` does NOT go through `useDrag` — it
     * runs its own pointer gesture, so no zone ever sees it, and a consumer that swapped
     * `useDrag` + `useDropZone` for this composable would silently lose the highlight it had.
     *
     * The default follows the argument the insertion line already follows: a highlight answers
     * "which list will take this", and a lone list is not being asked. Outlining it on every
     * drag would be noise, and would change the look of every single-list sortable that already
     * ships — `<pdx-sortable-list>` among them.
     */
    highlight?: boolean;
}

/**
 * What a keyboard reorder says. `{label}`, `{position}` and `{total}` are substituted.
 *
 * Strings and not a dictionary lookup, for the reason `useDrag` gives: `@pdxui/core` has no
 * dictionary — `uiString` is one level up, in `@pdxui/ui`. An application that localises
 * passes its own.
 *
 * The POSITION and never the index: "position 3 of 5" is what a reorder means to somebody who
 * cannot see it, and it is the rule `<pdx-sortable-list>` and dnd-kit both follow.
 */
export interface SortableA11yMessages {
    lifted: string;
    moved: string;
    dropped: string;
    cancelled: string;
}

export interface SortableA11yOptions {
    /** What to call an item in an announcement, by index. Default: its text, then 'Item'. */
    label?: (index: number) => string;
    /** `aria-roledescription` on each item. `false` to set none. Default: 'draggable'. */
    roleDescription?: string | false;
    /** Off-screen instructions, pointed at by `aria-describedby`. `false` to set none. */
    instructions?: string | false;
    /** Override any of the sentences. */
    messages?: Partial<SortableA11yMessages>;
    /**
     * How a lifted item moves while the arrows carry it.
     *
     * `'transform'` (default) shifts the items it passes with CSS and leaves the DOM alone, which
     * is what the pointer drag does and what animates.
     *
     * `'reorder'` moves the NODE, so the list reads in its new order at every step — for a
     * consumer whose rows carry focus or state, and for one whose tests read the DOM rather than a
     * transform. `<pdx-sortable-list>` is that consumer: its handle is a real button, the focus
     * travels inside the node, and a row that is visually somewhere else and structurally where it
     * was is a row a screen reader reads in the wrong order.
     */
    preview?: 'transform' | 'reorder';
    /** A class carried by the lifted element for as long as it is lifted. Default: none. */
    liftedClass?: string;
}

const DEFAULT_SORTABLE_MESSAGES: SortableA11yMessages = {
    lifted: '{label} lifted. Position {position} of {total}.',
    moved: 'Position {position} of {total}.',
    dropped: '{label} dropped. Position {position} of {total}.',
    cancelled: 'Reorder cancelled.',
};

const SORTABLE_INSTRUCTIONS =
    'Press Space or Enter to lift the item, the arrow keys to move it, Space or Enter to drop it, '
    + 'and Escape to cancel.';

export interface SortableOptions<T = unknown> {
    /** Reactive getter for the items array. */
    items: () => T[];
    /** Called when an item is reordered. The consumer mutates the array. */
    onReorder: (fromIndex: number, toIndex: number) => void;
    /** Layout axis. Default: 'vertical'. */
    axis?: 'vertical' | 'horizontal';
    /** CSS selector for the drag handle within each item. */
    handle?: string;
    /** Group name — enables drag between lists with the same group. */
    group?: string;
    /** What the list shows while one of its items is dragged. `false` paints nothing. */
    feedback?: SortableFeedbackOptions | false;
    /**
     * The keyboard reorder, and what it says. `false` for a component that has its own —
     * `<pdx-sortable-list>` announces by position from a real button handle, and two keyboard
     * paths over one list lift the same row twice.
     */
    a11y?: SortableA11yOptions | false;
    /** Called when an item is received from another list (cross-list). */
    onReceive?: (item: T, fromIndex: number, toIndex: number) => void;
    /** Called when an item is removed to another list (cross-list). */
    onRemove?: (item: T, fromIndex: number) => void;
    /** CSS selector for sortable children. Default: direct children. */
    itemSelector?: string;
    /**
     * The list is not reorderable right now — neither by pointer nor by keyboard.
     *
     * A getter, because it is a prop: `<pdx-sortable-list disabled>` can change while mounted, and
     * an option read once at setup would keep the answer it was given. Without it a consumer can
     * only refuse the RESULT, which is what the component did — the row still lifted and still
     * followed the pointer, and nothing happened at the end.
     */
    disabled?: () => boolean;
    /** Minimum distance (px) before drag activates. Default: 5. */
    threshold?: number;
    /** Enable FLIP animation on reorder. Default: true. */
    animate?: boolean;
    /** Animation duration in ms. Default: 200. */
    animationDuration?: number;
}

export interface SortableReturn {
    /** Index of the item being dragged (-1 if none). */
    activeIndex: ReadonlySignal<number>;
    /** Index where the item would be inserted (-1 if none). */
    overIndex: ReadonlySignal<number>;
    /** Whether a drag is in progress. */
    isDragging: ReadonlySignal<boolean>;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── Cross-list registry ──────────────────────────────────────

interface SortableGroup {
    containers: Map<HTMLElement, {
        items: () => unknown[];
        onReceive?: (item: unknown, from: number, to: number) => void;
        onRemove?: (item: unknown, from: number) => void;
        axis: 'vertical' | 'horizontal';
        /** How the RECEIVER finds its items. A list whose container holds a heading as well as
         *  its rows would otherwise have the heading shifted to make room. */
        itemSelector?: string;
    }>;
}

const _groups = new Map<string, SortableGroup>();

// ─── useSortable ──────────────────────────────────────────────

/**
 * Drag-to-reorder within a list: pointer handling, the drop indicator, and the reordered result.
 *
 * Works on pointer events, so touch and mouse take the same path. `handle` restricts the grab area
 * to a drag handle, which is what makes a list whose items also contain buttons usable.
 *
 * `group` makes two lists one destination: an item dragged out of a list and into a sibling with
 * the same group name opens the space THERE, and on release the source is told `onRemove` and the
 * receiver `onReceive`.
 */
export function useSortable<T = unknown>(
    el: () => HTMLElement | null,
    options: SortableOptions<T>,
): SortableReturn {
    const axis = options.axis ?? 'vertical';
    const threshold = options.threshold ?? 5;
    const animate = options.animate ?? true;
    const animDuration = options.animationDuration ?? 200;
    const gapMode = options.feedback === false ? false : (options.feedback?.gap ?? true);
    const highlight = options.feedback === false ? false : (options.feedback?.highlight ?? Boolean(options.group));

    const _activeIndex = signal(-1);
    const _overIndex = signal(-1);
    const _isDragging = signal(false);

    let container: HTMLElement | null = null;
    let dragEl: HTMLElement | null = null;
    let ghostEl: HTMLElement | null = null;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let activated = false;
    let rects: DOMRect[] = [];
    // The last shift applied per child: writing identical transform/transition on every
    // move causes useless style recalcs on long lists.
    const lastShift = new Map<HTMLElement, number>();
    /** A sibling list in the same group that the pointer is currently over, and where in it. */
    let hoverContainer: HTMLElement | null = null;
    let hoverIndex = -1;
    /** What we shifted in THAT list, so it can be put back exactly. */
    const foreignShift = new Map<HTMLElement, number>();
    /** The list currently wearing `data-pdx-drop`, so exactly one ever does. */
    let marked: HTMLElement | null = null;

    function getChildren(): HTMLElement[] {
        if (!container) return [];
        if (options.itemSelector) {
            return Array.from(container.querySelectorAll(options.itemSelector)) as HTMLElement[];
        }
        return Array.from(container.children) as HTMLElement[];
    }

    function snapshotRects(): void {
        rects = getChildren().map(c => c.getBoundingClientRect());
    }

    function computeInsertIndex(clientX: number, clientY: number): number {
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            const mid = axis === 'vertical'
                ? r.top + r.height / 2
                : r.left + r.width / 2;
            const pointer = axis === 'vertical' ? clientY : clientX;
            if (pointer < mid) return i;
        }
        return rects.length;
    }

    // ─── The keyboard ─────────────────────────────────────────────
    //
    // A list a mouse can reorder is a list a keyboard can reorder too.
    //
    // The keys are `useDrag`'s, so somebody who learned one knows the other. What differs is the
    // unit and the words: the arrows move by ITEM, and what is announced is the POSITION, because
    // "position 3 of 5" is what a reorder means to somebody who cannot see it.
    const a11y = options.a11y === false ? null : (options.a11y ?? {});
    const messages: SortableA11yMessages = { ...DEFAULT_SORTABLE_MESSAGES, ...a11y?.messages };
    const preview = a11y?.preview ?? 'transform';
    /** Where the lifted item currently sits, or -1. Kept apart from the pointer's `_activeIndex`. */
    let liftedFrom = -1;
    let liftedAt = -1;
    /** The lifted NODE. Followed rather than looked up: in `reorder` mode its index changes. */
    let liftedEl: HTMLElement | null = null;

    const isDisabled = (): boolean => options.disabled?.() === true;

    function labelOf(index: number): string {
        if (a11y?.label) return a11y.label(index);
        const el = getChildren()[index];
        return (el?.textContent ?? '').trim().slice(0, 60) || 'Item';
    }

    function say(key: keyof SortableA11yMessages, index: number): void {
        if (!a11y) return;
        const total = getChildren().length;
        const text = messages[key]
            .replace('{label}', labelOf(liftedFrom >= 0 ? liftedFrom : index))
            .replace('{position}', String(index + 1))
            .replace('{total}', String(total));
        if (text) announce(text);
    }

    /** Move the lifted item to `to` visually, by shifting what it passes. */
    function previewLift(to: number): void {
        const children = getChildren();
        const lifted = children[liftedFrom];
        if (!lifted) return;
        const size = axis === 'vertical'
            ? lifted.getBoundingClientRect().height
            : lifted.getBoundingClientRect().width;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (i === liftedFrom) continue;
            let shift = 0;
            if (to > liftedFrom && i > liftedFrom && i <= to) shift = -size;
            else if (to < liftedFrom && i >= to && i < liftedFrom) shift = size;
            child.style.transform = shift !== 0
                ? `translate${axis === 'vertical' ? 'Y' : 'X'}(${shift}px)`
                : '';
        }
        lifted.style.transform = to !== liftedFrom
            ? `translate${axis === 'vertical' ? 'Y' : 'X'}(${(to - liftedFrom) * size}px)`
            : '';
    }

    /** Move the node itself, the way `reorder` previews a lift. */
    function moveNode(from: number, to: number): void {
        const children = getChildren();
        const node = children[from];
        const ref = children[to];
        if (!node || !ref?.parentNode) return;
        // The focus travels with the node in a browser, and does not in every environment. Read
        // it before the move and put it back: a keyboard reorder that loses the focus halfway is
        // the gesture wasted, and the next arrow would carry a different row.
        const focused = document.activeElement as HTMLElement | null;
        const carried = focused && node.contains(focused) ? focused : null;
        ref.parentNode.insertBefore(node, from < to ? ref.nextSibling : ref);
        carried?.focus();
    }

    /** Begin a keyboard lift at `index`. */
    function beginLift(index: number): void {
        liftedFrom = index;
        liftedAt = index;
        liftedEl = getChildren()[index] ?? null;
        if (a11y?.liftedClass && liftedEl) liftedEl.classList.add(a11y.liftedClass);
    }

    /** Carry the lifted item to `to`, the way this consumer asked to see it. */
    function moveLift(to: number): void {
        if (preview === 'reorder') moveNode(liftedAt, to);
        liftedAt = to;
        if (preview !== 'reorder') previewLift(to);
    }

    /**
     * End the lift. `restore` puts the item back where it started — Escape, and nothing else.
     *
     * A drop does NOT restore: the item stays where the arrows left it, and the consumer's
     * `onReorder` makes that real.
     */
    function endLift(restore: boolean): void {
        if (liftedFrom < 0) return;
        if (preview === 'reorder') {
            if (restore && liftedAt !== liftedFrom) moveNode(liftedAt, liftedFrom);
        } else {
            for (const child of getChildren()) {
                child.style.transform = '';
                child.style.transition = '';
            }
        }
        if (a11y?.liftedClass && liftedEl) liftedEl.classList.remove(a11y.liftedClass);
        liftedEl = null;
        liftedFrom = -1;
        liftedAt = -1;
    }

    function onKeydown(e: KeyboardEvent): void {
        if (!a11y || !container || isDisabled()) return;
        // The list was re-rendered under a lift - the consumer applied something, or the items
        // changed - so the indices this was holding describe nodes that are gone. Dropped rather
        // than acted on: `reorder` would otherwise move the wrong row back.
        if (liftedEl && !liftedEl.isConnected) { liftedEl = null; liftedFrom = -1; liftedAt = -1; }

        const children = getChildren();
        const from = children.findIndex(c => c === e.target || c.contains(e.target as Node));
        if (from < 0) return;

        const forward = axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
        const backward = axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

        // Space or Enter, both ways round: the instructions this composable prints say "Space or
        // Enter to lift", and Enter refused with its default prevented would do nothing at all on a
        // button handle. It is also dnd-kit's rule.
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (liftedFrom < 0) {
                beginLift(from);
                say('lifted', from);
                return;
            }
            const start = liftedFrom;
            const end = liftedAt;
            say('dropped', end);
            endLift(false);
            if (start !== end) options.onReorder(start, end);
            return;
        }

        if (e.key === 'Escape' && liftedFrom >= 0) {
            e.preventDefault();
            // Stopped, so a list inside a dialog does not also close it on the key that cancelled
            // the lift.
            e.stopPropagation();
            say('cancelled', liftedAt);
            endLift(true);
            return;
        }

        if (liftedFrom < 0) return;
        if (e.key !== forward && e.key !== backward) return;
        e.preventDefault();
        // IMMEDIATE, and this is the line that lets a lifted row keep the arrows to itself. A
        // consumer commonly puts a roving tabindex on the same container - `<pdx-sortable-list>`
        // does - and that listener sits on the same element, where plain `stopPropagation` never
        // reaches it. While a row is lifted the arrows move the ROW; the cursor keeps them the
        // rest of the time.
        e.stopImmediatePropagation();
        const next = e.key === forward
            ? Math.min(liftedAt + 1, children.length - 1)
            : Math.max(liftedAt - 1, 0);
        if (next === liftedAt) return;
        moveLift(next);
        say('moved', next);
    }

    /** Say what each item is, and where the instructions are. */
    function describeItems(): void {
        if (!a11y) return;
        const id = a11y.instructions === false
            ? null
            : offscreenInstructions('pdx-sortable-instructions', a11y.instructions ?? SORTABLE_INSTRUCTIONS);
        for (const child of getChildren()) {
            if (a11y.roleDescription !== false) {
                child.setAttribute('aria-roledescription', a11y.roleDescription ?? 'draggable');
            }
            if (id) describedBy(child, id);
        }
    }

    // ─── Cross-list ───────────────────────────────────────────────

    /** The list in this group under the pointer, if any. Rects, not elementFromPoint: the ghost
     *  is on top of everything and would answer every question with itself. */
    function containerAt(x: number, y: number): HTMLElement | null {
        const group = options.group ? _groups.get(options.group) : undefined;
        if (!group) return null;
        for (const el of group.containers.keys()) {
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
        }
        return null;
    }

    /** Put back whatever we moved in a sibling list. */
    function clearForeignShifts(): void {
        for (const [el] of foreignShift) {
            el.style.transform = '';
            el.style.transition = '';
        }
        foreignShift.clear();
    }

    /** The sibling list's items and their rects, un-shifted, read once when the pointer entered it. */
    let foreignChildren: HTMLElement[] = [];
    let foreignRects: DOMRect[] = [];
    let foreignSize = 0;

    /**
     * Open the space in a sibling list, at the index the pointer is over.
     *
     * The rects are read ONCE, on entering the list, before anything in it is shifted — the way
     * our own list reads them at `pointerdown`. Reading them on every move would mean clearing the
     * shift first, and the read forces a layout that commits the cleared state: the transition
     * starts again from closed, and the gap closes and reopens on every pixel.
     * A move writes only the cards whose shift changes, and nothing while the index holds.
     */
    function openForeignGap(target: HTMLElement, x: number, y: number): void {
        const entry = options.group ? _groups.get(options.group)?.containers.get(target) : undefined;
        if (!entry || !dragEl) return;

        if (target !== hoverContainer) {
            clearForeignShifts();
            foreignChildren = (entry.itemSelector
                ? Array.from(target.querySelectorAll(entry.itemSelector))
                : Array.from(target.children)) as HTMLElement[];
            foreignRects = foreignChildren.map(c => c.getBoundingClientRect());
            foreignSize = axis === 'vertical'
                ? dragEl.getBoundingClientRect().height
                : dragEl.getBoundingClientRect().width;
            hoverContainer = target;
            hoverIndex = -1;
        }

        let index = foreignChildren.length;
        for (let i = 0; i < foreignRects.length; i++) {
            const r = foreignRects[i];
            const mid = axis === 'vertical' ? r.top + r.height / 2 : r.left + r.width / 2;
            if ((axis === 'vertical' ? y : x) < mid) { index = i; break; }
        }
        if (index === hoverIndex) return;

        for (let i = 0; i < foreignChildren.length; i++) {
            const child = foreignChildren[i];
            const shift = i >= index ? foreignSize : 0;
            if ((foreignShift.get(child) ?? 0) === shift) continue;
            if (shift === 0) foreignShift.delete(child);
            else foreignShift.set(child, shift);
            child.style.transform = shift !== 0 ? `translate${axis === 'vertical' ? 'Y' : 'X'}(${shift}px)` : '';
            child.style.transition = animate ? `transform ${animDuration}ms ease` : '';
        }
        hoverIndex = index;
    }

    /**
     * Whichever list the release would land in: the sibling under the pointer when there is a
     * group, our own otherwise. Null once the pointer is outside every list, which is what makes
     * the mark disappear rather than follow the pointer off the board.
     */
    function dropTargetAt(x: number, y: number): HTMLElement | null {
        if (options.group) return containerAt(x, y);
        if (!container) return null;
        const r = container.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom ? container : null;
    }

    /** One list wears the mark at a time, and `drop-zone.css` paints it. */
    function markDropTarget(target: HTMLElement | null): void {
        if (marked === target) return;
        marked?.removeAttribute('data-pdx-drop');
        marked = target;
        marked?.setAttribute('data-pdx-drop', 'over');
    }

    /** Undo our own list's gap — used when the pointer leaves it for a sibling. */
    function clearLocalShifts(): void {
        for (const child of getChildren()) {
            if (child === dragEl) continue;
            child.style.transform = '';
            child.style.transition = '';
        }
        lastShift.clear();
    }

    function onPointerDown(e: PointerEvent): void {
        if (!container || isDisabled()) return;
        const children = getChildren();

        // Find which child was clicked
        const target = e.target as HTMLElement;
        let childEl: HTMLElement | null = null;
        for (const child of children) {
            if (child.contains(target)) { childEl = child; break; }
        }
        if (!childEl) return;

        // Check handle
        if (options.handle) {
            const handleEl = childEl.querySelector(options.handle);
            if (!handleEl || !handleEl.contains(target)) return;
        }

        e.preventDefault();
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        dragEl = childEl;
        activated = false;

        const idx = children.indexOf(childEl);
        _activeIndex.set(idx);

        lastShift.clear();
        snapshotRects();
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
        document.addEventListener('touchmove', preventScroll, { passive: false });
    }

    function preventScroll(e: TouchEvent): void {
        if (activated) e.preventDefault();
    }

    function onPointerMove(e: PointerEvent): void {
        if (e.pointerId !== pointerId || !dragEl) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Threshold check.
        //
        // On the drag axis for a lone list: a vertical list that armed on horizontal movement
        // would steal a horizontal scroll or a text selection that was never meant for it.
        //
        // On the DISTANCE as soon as there is a group, and that is measured, not tidiness: two
        // columns of a board sit side by side, so dragging the first card of one onto the first
        // card of the next is a move of ~400px in x and ~0 in y. Against `Math.abs(dy)` the
        // gesture never passes the threshold and the drag never begins — a board could cross
        // columns only where the two happen to differ in height.
        if (!activated) {
            const dist = options.group
                ? Math.hypot(dx, dy)
                : Math.abs(axis === 'vertical' ? dy : dx);
            if (dist < threshold) return;
            activated = true;
            _isDragging.set(true);

            // Create ghost. It carries the item's COMPUTED style: on <body> it is outside the
            // ancestor a component's scoped CSS hangs on (`[data-pdx-…] .card`), and a bare clone
            // there is the card's text with no box around it. The positioning is
            // written after, so it wins over what was copied.
            const rect = dragEl.getBoundingClientRect();
            ghostEl = dragEl.cloneNode(true) as HTMLElement;
            inlineComputedStyle(dragEl, ghostEl);
            ghostEl.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;box-sizing:border-box;margin:0;transform:none;pointer-events:none;z-index:10000;opacity:0.85;transition:none;animation:none;`;
            document.body.appendChild(ghostEl);

            // Hide original (keep space with visibility)
            dragEl.style.opacity = '0.3';
        }

        // Move ghost
        if (ghostEl) {
            const rect = rects[_activeIndex.peek()];
            if (rect) {
                ghostEl.style.left = `${rect.left + dx}px`;
                ghostEl.style.top = `${rect.top + dy}px`;
            }
        }

        if (highlight) markDropTarget(dropTargetAt(e.clientX, e.clientY));

        // Over a SIBLING list in the same group? Then the space opens there and not here.
        if (options.group) {
            const under = containerAt(e.clientX, e.clientY);
            if (under && under !== container) {
                clearLocalShifts();
                _overIndex.set(-1);
                openForeignGap(under, e.clientX, e.clientY);
                return;
            }
            if (hoverContainer) {
                clearForeignShifts();
                hoverContainer = null;
                hoverIndex = -1;
            }
        }

        // Compute insertion index
        const newOverIndex = computeInsertIndex(e.clientX, e.clientY);
        _overIndex.set(newOverIndex);

        // Visual gap: shift children to make room
        const children = getChildren();
        const active = _activeIndex.peek();

        // `gap: 'preview'` — the dragged row goes INTO the space rather than staying in its old
        // slot at reduced opacity.
        //
        // From the snapshotted rects and not from an index times a height, because the rows are
        // not obliged to be the same size. And read the SAME bounds the shift loop below uses:
        // going down `newOverIndex` is EXCLUSIVE (`i < newOverIndex`), so the row lands after
        // `newOverIndex - 1`; going up it is inclusive (`i >= newOverIndex`), so it lands on
        // `newOverIndex`. Reading the index as inclusive both ways put the row one slot too far,
        // which the measurement caught: 120px where 80px was the space that had opened.
        if (gapMode === 'preview' && dragEl && rects[active]) {
            const over = newOverIndex;
            let offset = 0;
            if (over > active && rects[over - 1]) offset = rects[over - 1].bottom - rects[active].height - rects[active].top;
            else if (over < active && rects[over]) offset = rects[over].top - rects[active].top;
            if (lastShift.get(dragEl) !== offset) {
                lastShift.set(dragEl, offset);
                dragEl.style.transform = offset !== 0
                    ? `translate${axis === 'vertical' ? 'Y' : 'X'}(${offset}px)`
                    : '';
                dragEl.style.transition = animate ? `transform ${animDuration}ms ease` : '';
            }
        }

        if (gapMode === false) return;
        for (let i = 0; i < children.length; i++) {
            if (i === active) continue;
            const child = children[i];
            let shift = 0;
            if (newOverIndex <= active) {
                // Dragging up/left: items between overIndex and activeIndex shift down/right
                if (i >= newOverIndex && i < active) {
                    shift = axis === 'vertical' ? rects[active].height : rects[active].width;
                }
            } else {
                // Dragging down/right: items between activeIndex and overIndex shift up/left
                if (i > active && i < newOverIndex) {
                    shift = -(axis === 'vertical' ? rects[active].height : rects[active].width);
                }
            }
            if (lastShift.get(child) === shift) continue; // unchanged: no style recalc
            lastShift.set(child, shift);
            child.style.transform = shift !== 0
                ? `translate${axis === 'vertical' ? 'Y' : 'X'}(${shift}px)`
                : '';
            child.style.transition = animate ? `transform ${animDuration}ms ease` : '';
        }
    }

    /** The shared teardown at the end of a gesture (a drop or a cancel). */
    function teardownGesture(): void {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerCancel);
        document.removeEventListener('touchmove', preventScroll);

        if (ghostEl) { ghostEl.remove(); ghostEl = null; }
        if (dragEl) { dragEl.style.opacity = ''; }
        for (const child of getChildren()) {
            child.style.transform = '';
            child.style.transition = '';
        }
        lastShift.clear();
        clearForeignShifts();
        // A cancel ends here too, and the next drag must read the sibling's rects afresh.
        hoverContainer = null;
        hoverIndex = -1;
        markDropTarget(null);

        batch(() => {
            _activeIndex.set(-1);
            _overIndex.set(-1);
            _isDragging.set(false);
        });

        dragEl = null;
        pointerId = -1;
        activated = false;
    }

    // pointercancel (the browser takes over the gesture on touch): without it, an orphaned
    // ghost, a half-transparent item and active document listeners are left behind.
    function onPointerCancel(e: PointerEvent): void {
        if (e.pointerId !== pointerId) return;
        teardownGesture();
    }

    function onPointerUp(e: PointerEvent): void {
        if (e.pointerId !== pointerId) return;

        const fromIndex = _activeIndex.peek();
        const toIndex = _overIndex.peek();
        const wasActivated = activated;
        // Read before teardown clears them, and read the ITEM before either callback mutates the
        // list it came from.
        const landedIn = hoverContainer;
        const landedAt = hoverIndex;
        const moved = wasActivated && fromIndex !== -1 ? options.items()[fromIndex] : undefined;

        teardownGesture();
        hoverContainer = null;
        hoverIndex = -1;

        // It left this list for a sibling in the same group.
        if (wasActivated && landedIn && landedIn !== container && fromIndex !== -1) {
            const entry = options.group ? _groups.get(options.group)?.containers.get(landedIn) : undefined;
            // The receiver first: it is handed the item, and the source's `onRemove` is what
            // makes the item disappear from here. The other order asks the receiver to insert
            // something the caller has already deleted.
            entry?.onReceive?.(moved, fromIndex, landedAt);
            options.onRemove?.(moved as T, fromIndex);
            return;
        }

        // Trigger reorder if moved
        if (wasActivated && fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
            const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
            options.onReorder(fromIndex, adjustedTo);
        }
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;
            container = target;

            target.addEventListener('pointerdown', onPointerDown);
            target.addEventListener('keydown', onKeydown);
            // After the children exist: the effect runs when the container does, and a list built
            // by the caller is populated by then.
            describeItems();

            // Register in cross-list group
            if (options.group) {
                if (!_groups.has(options.group)) {
                    _groups.set(options.group, { containers: new Map() });
                }
                _groups.get(options.group)!.containers.set(target, {
                    items: options.items as () => unknown[],
                    onReceive: options.onReceive as ((item: unknown, from: number, to: number) => void) | undefined,
                    onRemove: options.onRemove as ((item: unknown, from: number) => void) | undefined,
                    axis,
                    itemSelector: options.itemSelector,
                });
            }

            return () => {
                target.removeEventListener('pointerdown', onPointerDown);
                target.removeEventListener('keydown', onKeydown);
                if (options.group) {
                    _groups.get(options.group)?.containers.delete(target);
                }
            };
        });
    }

    return {
        activeIndex: _activeIndex as ReadonlySignal<number>,
        overIndex: _overIndex as ReadonlySignal<number>,
        isDragging: _isDragging as ReadonlySignal<boolean>,
        dispose: () => {
            cleanupEffect?.();
            teardownGesture();
        },
    };
}
