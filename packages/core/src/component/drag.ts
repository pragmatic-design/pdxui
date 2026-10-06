// Drag and Drop — signal-based drag state + drop zones.
// PointerEvent-based: unifies touch, mouse, pen.
// Used by: Grid reorder, Kanban, Tree, FileUpload, List, Splitter.

import { signal, effect, batch } from '../reactivity/signal';
import { announce } from '../a11y/announcer';
import { offscreenInstructions, describedBy } from '../a11y/instructions';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface DragOptions {
    /** CSS selector for the drag handle. If omitted, the entire element is the handle. */
    handle?: string;
    /** Constrain drag axis. Default: 'both'. */
    axis?: 'x' | 'y' | 'both';
    /** Constrain drag within bounds. 'parent' = parent element. */
    bounds?: 'parent' | HTMLElement | (() => HTMLElement | null);
    /** Create a custom ghost element for drag preview. */
    ghost?: (el: HTMLElement) => HTMLElement;
    /**
     * Move the element under the pointer. Default: **true**, unless a `ghost` is given.
     *
     * A composable that only reported the gesture would leave every consumer writing the same
     * four lines to paint it, and one of them forgetting. It applies `translate()` on top of whatever transform the element already has,
     * and puts that back when the drag ends.
     *
     * `false` is for a handle whose VALUE follows the pointer while the handle stays put — a
     * splitter, a slider. A `ghost` implies it: the ghost is a second element under the pointer,
     * and moving the original as well would show two things moving for one gesture.
     */
    move?: boolean;
    /** Data payload attached to this draggable. */
    data?: () => unknown;
    /** Reactive getter: disable dragging. */
    disabled?: () => boolean;
    /** Minimum hold time (ms) before drag activates on touch. Default: 0 (immediate). */
    longPressDelay?: number;
    /**
     * What the keyboard drag tells assistive technology. `false` turns all of it off, for a
     * component that announces the operation itself in terms its own users understand — a list
     * reorder says "position 3 of 7", which this cannot know.
     */
    a11y?: DragA11yOptions | false;
}

/**
 * The sentences a keyboard drag says. `{label}` is the draggable, `{zone}` the drop target.
 *
 * They are strings rather than a dictionary lookup because `@pdxui/core` has no dictionary:
 * the UI package's `uiString` is one level up. An application that localises passes its own.
 */
export interface DragA11yMessages {
    lifted: string;
    over: string;
    outside: string;
    droppedOn: string;
    dropped: string;
    cancelled: string;
}

export interface DragA11yOptions {
    /** What to call the draggable. Default: its `aria-label`, then its text, then 'Item'. */
    label?: () => string;
    /** `aria-roledescription` on the draggable. `false` to set none. Default: 'draggable'. */
    roleDescription?: string | false;
    /** Off-screen instructions, pointed at by `aria-describedby`. `false` to set none. */
    instructions?: string | false;
    /** Override any of the sentences. */
    messages?: Partial<DragA11yMessages>;
}

export interface DragReturn {
    /** Whether the element is currently being dragged (reactive). */
    isDragging: ReadonlySignal<boolean>;
    /** Current position relative to start (reactive). */
    position: ReadonlySignal<{ x: number; y: number }>;
    /** Delta from last position (reactive). */
    delta: ReadonlySignal<{ dx: number; dy: number }>;
    /** Velocity in px/sec (reactive). */
    velocity: ReadonlySignal<{ vx: number; vy: number }>;
    /** Cleanup. */
    dispose: Dispose;
}

export type DropEdge = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface DropPosition {
    /** The drop edge relative to the drop zone. */
    edge: DropEdge;
    /** Client coordinates of the drop. */
    x: number;
    y: number;
}

/**
 * What the DESTINATION shows while something is held over it.
 *
 * The state — `isOver()` and `edge()` — is only half: with nothing putting it on the element, a
 * drop is a leap of faith. This is the other half: the zone writes `data-pdx-drop` and
 * `data-pdx-drop-edge` about itself and the design system paints them, which is what makes the
 * feedback follow the theme instead of being re-invented per application.
 *
 * `line` is OFF by default and that is not timidity. It is the one normative rule anybody in this
 * space has written down, and it is Atlassian's: a line communicates RELATIVE placement — before
 * or after — and must not be shown where no relative placement exists. A kanban column where the
 * order does not matter wants the highlight; an ordered list wants the line. They answer different
 * questions, so the caller says which question it is.
 */
export interface DropFeedbackOptions {
    /** The area marks itself while a droppable item is over it. Default: true. */
    highlight?: boolean;
    /** Report the edge the drop would insert at, for an insertion line. Default: false. */
    line?: boolean;
    /** A zone that refuses the data says so, rather than not reacting. Default: true. */
    reject?: boolean;
}

export interface DropZoneOptions {
    /** Filter which drag data this zone accepts. */
    accept?: (data: unknown) => boolean;
    /** What the zone shows while something is over it. `false` turns all of it off. */
    feedback?: DropFeedbackOptions | false;
    /** Called when a draggable is dropped on this zone. */
    onDrop?: (data: unknown, position: DropPosition) => void;
    /** Called when a draggable enters this zone. */
    onEnter?: (data: unknown) => void;
    /** Called when a draggable leaves this zone. */
    onLeave?: () => void;
}

export interface DropZoneReturn {
    /** Whether a draggable is currently over this zone (reactive). */
    isOver: ReadonlySignal<boolean>;
    /** Which edge the pointer is closest to (reactive). */
    edge: ReadonlySignal<DropEdge | null>;
    /**
     * Whether a draggable is over this zone and this zone REFUSED it (reactive).
     *
     * A zone that says nothing when it cannot take the drop is the hole react-beautiful-dnd has
     * open as issue #1712: a disabled droppable is never told it is being dragged over, so it
     * cannot tell the user either. `isOver()` stays false — it is not a target — and this says
     * why.
     */
    isRejected: ReadonlySignal<boolean>;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── Global drag state ─────────────────────────────────────────

// Shared between useDrag and useDropZone via hit-testing (not pointer events)
let _activeDragData: unknown = null;
let _activeDragId = 0;
const _dragActive = signal(false);

// Registry of active drop zones for hit-testing with elementFromPoint
const _dropZoneRegistry = new Map<HTMLElement, {
    options?: DropZoneOptions;
    isOver: ReturnType<typeof signal<boolean>>;
    edge: ReturnType<typeof signal<DropEdge | null>>;
    rejected: ReturnType<typeof signal<boolean>>;
}>();

// Current zone the pointer is over (for enter/leave tracking)
let _currentDropZone: HTMLElement | null = null;
// …and the one refusing it, which is a different thing.
let _rejectedZone: HTMLElement | null = null;

// ─── Drop zone hit-testing (called from useDrag's pointermove) ─

function hitTestDropZones(clientX: number, clientY: number): void {
    if (_dropZoneRegistry.size === 0) return;

    let hitZone: HTMLElement | null = null;
    let hitEdge: DropEdge = 'center';

    // Check each registered drop zone's bounding rect
    for (const [el] of _dropZoneRegistry) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
            hitZone = el;
            hitEdge = computeEdgeFromRect(rect, clientX, clientY);
            break; // first match wins (could prioritize by z-index/depth)
        }
    }

    // A refusal is a state, not an absence.
    //
    // A zone whose `accept` says no is not dropped on the floor here — `hitZone = null` with
    // nothing recorded would leave it unable to tell the user anything, which is react-beautiful-dnd's
    // issue #1712. It is told, separately from `isOver`: it is still not a target, and it can
    // still say why.
    const refusedZone = hitZone && _dropZoneRegistry.get(hitZone)?.options?.accept?.(_activeDragData) === false
        ? hitZone
        : null;
    if (_rejectedZone && _rejectedZone !== refusedZone) {
        _dropZoneRegistry.get(_rejectedZone)?.rejected.set(false);
        _rejectedZone = null;
    }
    if (refusedZone) {
        _dropZoneRegistry.get(refusedZone)?.rejected.set(true);
        _rejectedZone = refusedZone;
    }

    // Handle enter/leave transitions
    if (hitZone !== _currentDropZone) {
        // Leave old zone
        if (_currentDropZone) {
            const oldEntry = _dropZoneRegistry.get(_currentDropZone);
            if (oldEntry) {
                oldEntry.isOver.set(false);
                oldEntry.edge.set(null);
                oldEntry.options?.onLeave?.();
            }
        }
        // Enter new zone
        if (hitZone) {
            const newEntry = _dropZoneRegistry.get(hitZone);
            if (newEntry) {
                if (newEntry.options?.accept && !newEntry.options.accept(_activeDragData)) {
                    hitZone = null; // rejected — and recorded above
                } else {
                    newEntry.isOver.set(true);
                    newEntry.edge.set(hitEdge);
                    newEntry.options?.onEnter?.(_activeDragData);
                }
            }
        }
        _currentDropZone = hitZone;
    } else if (hitZone) {
        // Still over same zone — update edge
        const entry = _dropZoneRegistry.get(hitZone);
        if (entry) entry.edge.set(hitEdge);
    }
}

function dropOnCurrentZone(clientX: number, clientY: number): void {
    // Before the early return: a drag that ended over a REFUSING zone has no current zone, and
    // its refusal would otherwise stay painted after the pointer was released.
    clearRejection();
    if (!_currentDropZone) return;
    const entry = _dropZoneRegistry.get(_currentDropZone);
    if (!entry) return;

    const rect = _currentDropZone.getBoundingClientRect();
    const edge = computeEdgeFromRect(rect, clientX, clientY);

    entry.options?.onDrop?.(_activeDragData, { edge, x: clientX, y: clientY });
    entry.isOver.set(false);
    entry.edge.set(null);
    _currentDropZone = null;
    clearRejection();
}

/** A refusal lasts exactly as long as the drag that caused it. */
function clearRejection(): void {
    if (!_rejectedZone) return;
    _dropZoneRegistry.get(_rejectedZone)?.rejected.set(false);
    _rejectedZone = null;
}

function clearDropZoneState(): void {
    if (_currentDropZone) {
        const entry = _dropZoneRegistry.get(_currentDropZone);
        if (entry) {
            entry.isOver.set(false);
            entry.edge.set(null);
            entry.options?.onLeave?.();
        }
        _currentDropZone = null;
    }
    clearRejection();
}

function computeEdgeFromRect(rect: DOMRect, clientX: number, clientY: number): DropEdge {
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    const distances = { top: relY, bottom: 1 - relY, left: relX, right: 1 - relX };
    const minDist = Math.min(...Object.values(distances));
    if (minDist > 0.25) return 'center';
    const entries = Object.entries(distances) as [DropEdge, number][];
    return entries.reduce((a, b) => a[1] < b[1] ? a : b)[0];
}

// ─── Auto-scroll ──────────────────────────────────────────────

const SCROLL_EDGE_PX = 40;
const SCROLL_SPEED = 8;
let _scrollRaf = 0;

function startAutoScroll(clientX: number, clientY: number): void {
    cancelAnimationFrame(_scrollRaf);

    // Find nearest scrollable ancestor from pointer position
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return;

    const scrollable = findScrollableAncestor(el);
    if (!scrollable) return;

    const rect = scrollable === document.documentElement
        ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
        : scrollable.getBoundingClientRect();

    let dx = 0, dy = 0;
    if (clientY < rect.top + SCROLL_EDGE_PX) dy = -SCROLL_SPEED;
    else if (clientY > rect.bottom - SCROLL_EDGE_PX) dy = SCROLL_SPEED;
    if (clientX < rect.left + SCROLL_EDGE_PX) dx = -SCROLL_SPEED;
    else if (clientX > rect.right - SCROLL_EDGE_PX) dx = SCROLL_SPEED;

    if (dx === 0 && dy === 0) return;

    function tick() {
        scrollable!.scrollBy(dx, dy);
        _scrollRaf = requestAnimationFrame(tick);
    }
    _scrollRaf = requestAnimationFrame(tick);
}

function stopAutoScroll(): void {
    cancelAnimationFrame(_scrollRaf);
    _scrollRaf = 0;
}

function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = el;
    while (current) {
        const style = getComputedStyle(current);
        if (/auto|scroll|overlay/.test(style.overflow + style.overflowX + style.overflowY)) {
            return current;
        }
        current = current.parentElement;
    }
    return document.documentElement;
}

// ─── Keyboard drag (a11y) ─────────────────────────────────────

const KEYBOARD_STEP = 10;

// ─── Telling assistive technology about a keyboard drag ────────────────────────
//
// Not `aria-grabbed` on the lifted element: WAI-ARIA 1.1 DEPRECATED it. The plan was to replace it
// with drag and drop in the native accessibility APIs, that never arrived, and the guidance settled
// on the other answer — expose the operation through what a screen reader still reads. An attribute
// nothing is expected to act on is not an accessible drag, it is the appearance of one.
//
// So, three things, the same shape `<pdx-sortable-list>` has: a role description, reachable
// instructions, and an announcement at every step. What is announced is chosen to be worth hearing
// — the lift, the drop target as it CHANGES (not every arrow press, which at 10px a step is noise),
// the drop and the cancel.

const DEFAULT_DRAG_MESSAGES: DragA11yMessages = {
    lifted: '{label} lifted.',
    over: 'Over {zone}.',
    outside: 'Not over a drop target.',
    droppedOn: '{label} dropped on {zone}.',
    dropped: '{label} dropped.',
    cancelled: 'Drag cancelled.',
};

const DEFAULT_DRAG_INSTRUCTIONS =
    'Press Space to lift, the arrow keys to move, Space or Enter to drop, and Escape to cancel.';

/** One element for every draggable on the page: N identical copies help nobody. */
const DRAG_INSTRUCTIONS_ID = 'pdx-drag-instructions';

/** What an element calls itself: its label, then its text, then nothing. */
function accessibleName(el: HTMLElement | null): string {
    if (!el) return '';
    const label = el.getAttribute('aria-label');
    if (label) return label.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const source = document.getElementById(labelledBy);
        if (source?.textContent) return source.textContent.trim();
    }
    return (el.textContent ?? '').trim().slice(0, 60);
}

function fill(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? '');
}

/** The a11y surface of one draggable, resolved once. Null when the caller passed `a11y: false`. */
interface DragSpeech {
    label(): string;
    messages: DragA11yMessages;
}

function resolveSpeech(target: HTMLElement, options?: DragOptions): DragSpeech | null {
    if (options?.a11y === false) return null;
    const a11y = options?.a11y ?? {};

    if (a11y.roleDescription !== false) {
        target.setAttribute('aria-roledescription', a11y.roleDescription ?? 'draggable');
    }
    if (a11y.instructions !== false) {
        describedBy(target, offscreenInstructions(DRAG_INSTRUCTIONS_ID, a11y.instructions ?? DEFAULT_DRAG_INSTRUCTIONS));
    }

    return {
        label: () => a11y.label?.() || accessibleName(target) || 'Item',
        messages: { ...DEFAULT_DRAG_MESSAGES, ...a11y.messages },
    };
}

// ARIA drag pattern: Space to grab → Arrow to move → Space/Enter to drop → Escape to cancel.
// No Alt modifier — avoids browser shortcut conflicts (Alt+Arrow = Back/Forward).
function setupKeyboardDrag(
    target: HTMLElement,
    isDragging: ReturnType<typeof signal<boolean>>,
    position: ReturnType<typeof signal<{ x: number; y: number }>>,
    axis: 'x' | 'y' | 'both',
    options?: DragOptions,
): Dispose {
    const speech = resolveSpeech(target, options);

    /** Say something, unless the caller said it would do the talking. */
    function say(key: keyof DragA11yMessages, values: Record<string, string> = {}): void {
        if (!speech) return;
        const text = fill(speech.messages[key], { label: speech.label(), ...values });
        if (text) announce(text);
    }

    /** The drop target the element is over, as a name a person would recognise. */
    function zoneName(): string {
        return accessibleName(_currentDropZone);
    }

    /** Announce the drop, naming the target when there is one. */
    function sayDropped(): void {
        const zone = zoneName();
        if (zone) say('droppedOn', { zone });
        else say('dropped');
    }

    function onKeydown(e: KeyboardEvent): void {
        const dragging = isDragging.peek();

        // Space = toggle grab/drop
        if (e.key === ' ') {
            e.preventDefault();
            if (!dragging) {
                // Grab
                isDragging.set(true);
                _activeDragData = options?.data?.() ?? null;
                _activeDragId++;
                _dragActive.set(true);
                position.set({ x: 0, y: 0 });
                say('lifted');
            } else {
                // Drop
                const rect = target.getBoundingClientRect();
                sayDropped();   // before the drop: it clears the zone this sentence names
                dropOnCurrentZone(rect.left + rect.width / 2, rect.top + rect.height / 2);
                isDragging.set(false);
                _dragActive.set(false);
                _activeDragData = null;
            }
            return;
        }

        if (e.key === 'Enter' && dragging) {
            e.preventDefault();
            const rect = target.getBoundingClientRect();
            sayDropped();
            dropOnCurrentZone(rect.left + rect.width / 2, rect.top + rect.height / 2);
            isDragging.set(false);
            _dragActive.set(false);
            _activeDragData = null;
            position.set({ x: 0, y: 0 });
            return;
        }

        if (e.key === 'Escape' && dragging) {
            e.preventDefault();
            clearDropZoneState();
            isDragging.set(false);
            _dragActive.set(false);
            _activeDragData = null;
            position.set({ x: 0, y: 0 });
            say('cancelled');
            return;
        }

        // Arrow keys move only when grabbed
        if (!dragging) return;

        const pos = position.peek();
        let { x, y } = pos;
        let handled = false;

        switch (e.key) {
            case 'ArrowUp':    if (axis !== 'x') { y -= KEYBOARD_STEP; handled = true; } break;
            case 'ArrowDown':  if (axis !== 'x') { y += KEYBOARD_STEP; handled = true; } break;
            case 'ArrowLeft':  if (axis !== 'y') { x -= KEYBOARD_STEP; handled = true; } break;
            case 'ArrowRight': if (axis !== 'y') { x += KEYBOARD_STEP; handled = true; } break;
        }

        if (handled) {
            e.preventDefault();
            position.set({ x, y });
            const rect = target.getBoundingClientRect();
            // Announce the TARGET, not the movement. A step is 10px; at that size "moved right"
            // on every key press is noise, and the thing a person needs to know is what they are
            // over now — so this speaks only when that changes.
            const before = _currentDropZone;
            hitTestDropZones(rect.left + rect.width / 2, rect.top + rect.height / 2);
            if (_currentDropZone !== before) {
                if (_currentDropZone) say('over', { zone: zoneName() });
                else say('outside');
            }
        }
    }

    target.addEventListener('keydown', onKeydown);
    return () => target.removeEventListener('keydown', onKeydown);
}

// ─── useDrag ───────────────────────────────────────────────────

/**
 * Make an element draggable: it FOLLOWS the pointer, and the gesture is reported as signals.
 *
 * The movement is the default (`move: false` opts out, and a `ghost` opts out for you). Reporting
 * only — `isDragging()`, `position()`, the drop-zone hit testing — would leave every caller writing
 * the same four lines to paint it, and a board whose cards do not move under the pointer.
 *
 * Uses PointerEvent for unified touch/mouse/pen support.
 * Features: axis constraint, bounds, ghost, auto-scroll, velocity,
 * keyboard a11y (Alt+Arrow), long-press activation for touch.
 */
export function useDrag(
    el: () => HTMLElement | null,
    options?: DragOptions,
): DragReturn {
    const axis = options?.axis ?? 'both';
    // A ghost already gives the pointer something to carry, so it opts out by default.
    const movesElement = options?.move ?? !options?.ghost;
    const longPressDelay = options?.longPressDelay ?? 0;

    const _isDragging = signal(false);
    const _position = signal({ x: 0, y: 0 });
    const _delta = signal({ dx: 0, dy: 0 });
    const _velocity = signal({ vx: 0, vy: 0 });

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let ghostEl: HTMLElement | null = null;
    /** What the element's `transform` was before the drag, restored when it ends. */
    let baseTransform = '';
    let pointerId = -1;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingDrag = false; // waiting for long-press threshold

    // Gesture priority: block browser scroll while dragging
    function preventTouchScroll(e: TouchEvent): void {
        if (_isDragging.peek()) e.preventDefault();
    }

    function activateDrag(e: PointerEvent): void {
        const target = el();
        if (!target) return;

        startX = e.clientX;
        startY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
        lastTime = performance.now();

        batch(() => {
            _isDragging.set(true);
            _position.set({ x: 0, y: 0 });
            baseTransform = target.style.transform;
            _delta.set({ dx: 0, dy: 0 });
            _velocity.set({ vx: 0, vy: 0 });
        });

        _activeDragData = options?.data?.() ?? null;
        _activeDragId++;
        _dragActive.set(true);

        // Ghost element
        if (options?.ghost) {
            ghostEl = options.ghost(target);
            ghostEl.style.position = 'fixed';
            ghostEl.style.pointerEvents = 'none';
            ghostEl.style.zIndex = '10000';
            ghostEl.style.left = `${e.clientX}px`;
            ghostEl.style.top = `${e.clientY}px`;
            document.body.appendChild(ghostEl);
        }

    }

    function onPointerDown(e: PointerEvent): void {
        if (options?.disabled?.()) return;
        const target = el();
        if (!target) return;

        // Check handle
        if (options?.handle) {
            const handleEl = target.querySelector(options.handle);
            if (!handleEl || !handleEl.contains(e.target as Node)) return;
        }

        e.preventDefault();
        pointerId = e.pointerId;

        // Gesture priority: prevent browser scroll during drag.
        // Set touch-action immediately at pointerdown (before first pointermove)
        // and add touchmove preventDefault as safety net.
        target.style.touchAction = 'none';
        document.addEventListener('touchmove', preventTouchScroll, { passive: false });

        if (longPressDelay > 0 && e.pointerType === 'touch') {
            // Long-press activation for touch
            pendingDrag = true;
            longPressTimer = setTimeout(() => {
                pendingDrag = false;
                activateDrag(e);
            }, longPressDelay);
        } else {
            activateDrag(e);
        }

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
    }

    // A rAF throttle: the body of the move does a gBCR on bounds/target, a hit test on
    // EVERY drop zone and an elementFromPoint for the auto-scroll — at 120Hz without a throttle
    // that is guaranteed layout thrash. At most one move is processed per frame.
    let moveRaf = 0;
    let lastMoveEvent: PointerEvent | null = null;

    function onPointerMove(e: PointerEvent): void {
        if (e.pointerId !== pointerId) return;

        // Cancel long-press if moved too far before activation
        if (pendingDrag) {
            const moved = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
            if (moved > 10) {
                if (longPressTimer) clearTimeout(longPressTimer);
                longPressTimer = null;
                pendingDrag = false;
                cleanup();
                return;
            }
            return; // not yet activated
        }

        lastMoveEvent = e;
        if (moveRaf) return;
        moveRaf = requestAnimationFrame(() => {
            moveRaf = 0;
            if (lastMoveEvent) processMove(lastMoveEvent);
        });
    }

    function processMove(e: PointerEvent): void {
        let dx = e.clientX - startX;
        let dy = e.clientY - startY;

        if (axis === 'x') dy = 0;
        if (axis === 'y') dx = 0;

        // Clamp to bounds
        if (options?.bounds) {
            const target = el();
            if (target) {
                const boundsEl = options.bounds === 'parent'
                    ? target.parentElement
                    : typeof options.bounds === 'function' ? options.bounds() : options.bounds;
                if (boundsEl) {
                    const br = boundsEl.getBoundingClientRect();
                    const tr = target.getBoundingClientRect();
                    const curPos = _position.peek();
                    const baseLeft = tr.left - curPos.x;
                    const baseTop = tr.top - curPos.y;
                    dx = Math.max(br.left - baseLeft, Math.min(dx, br.right - baseLeft - tr.width));
                    dy = Math.max(br.top - baseTop, Math.min(dy, br.bottom - baseTop - tr.height));
                }
            }
        }

        // Velocity calculation
        const now = performance.now();
        const dt = (now - lastTime) / 1000; // seconds
        const vx = dt > 0 ? (e.clientX - lastX) / dt : 0;
        const vy = dt > 0 ? (e.clientY - lastY) / dt : 0;

        const deltaDx = e.clientX - lastX;
        const deltaDy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        lastTime = now;

        batch(() => {
            _position.set({ x: dx, y: dy });
            _delta.set({ dx: deltaDx, dy: deltaDy });
            _velocity.set({ vx: Math.round(vx), vy: Math.round(vy) });
        });

        // The element follows the pointer. On TOP of the transform it came with: a
        // card rotated by its own CSS must not come back straight.
        if (movesElement) {
            const moving = el();
            if (moving) moving.style.transform = `${baseTransform} translate(${dx}px, ${dy}px)`.trim();
        }

        // Ghost follows pointer
        if (ghostEl) {
            ghostEl.style.left = `${e.clientX}px`;
            ghostEl.style.top = `${e.clientY}px`;
        }

        // Hit-test drop zones (replaces pointerenter/leave which don't work with capture)
        hitTestDropZones(e.clientX, e.clientY);

        // Auto-scroll near container edges
        startAutoScroll(e.clientX, e.clientY);
    }

    function cleanup(): void {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchmove', preventTouchScroll);
        if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
        lastMoveEvent = null;
        // The restore ALWAYS happens here: cancelling the long press must not exit without restoring
        // touch-action:none, or native scrolling from the element stays broken.
        const target = el();
        if (target) target.style.touchAction = '';
    }

    function onPointerUp(e: PointerEvent): void {
        if (e.pointerId !== pointerId) return;

        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        pendingDrag = false;

        // Drop on current zone before resetting state
        dropOnCurrentZone(e.clientX, e.clientY);

        stopAutoScroll();

        batch(() => {
            _isDragging.set(false);
            _velocity.set({ vx: 0, vy: 0 });
        });
        _dragActive.set(false);
        _activeDragData = null;
        pointerId = -1;

        // Put it back where it was, with the transform it came with.
        if (movesElement) {
            const moved = el();
            if (moved) moved.style.transform = baseTransform;
        }

        // Remove ghost
        if (ghostEl) { ghostEl.remove(); ghostEl = null; }

        // touch-action e listener ripristinati da cleanup()
        cleanup();
    }

    // Attach pointer + keyboard listeners
    let cleanupEffect: Dispose | null = null;
    let cleanupKeyboard: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;

            target.addEventListener('pointerdown', onPointerDown);
            // Keyboard a11y: Alt+Arrow to drag, Enter to drop, Escape to cancel
            cleanupKeyboard = setupKeyboardDrag(target, _isDragging, _position, axis, options);

            return () => {
                target.removeEventListener('pointerdown', onPointerDown);
                cleanupKeyboard?.();
            };
        });
    }

    return {
        isDragging: _isDragging as ReadonlySignal<boolean>,
        position: _position as ReadonlySignal<{ x: number; y: number }>,
        delta: _delta as ReadonlySignal<{ dx: number; dy: number }>,
        velocity: _velocity as ReadonlySignal<{ vx: number; vy: number }>,
        dispose: () => {
            cleanupEffect?.();
            cleanupKeyboard?.();
            stopAutoScroll();
            if (ghostEl) { ghostEl.remove(); ghostEl = null; }
            cleanup();
        },
    };
}

// ─── useDropZone ───────────────────────────────────────────────

/**
 * Make an element a drop zone for draggables.
 * Uses hit-testing via bounding rect (not pointer events) —
 * works even when the drag source captures the pointer.
 */
export function useDropZone(
    el: () => HTMLElement | null,
    options?: DropZoneOptions,
): DropZoneReturn {
    const _isOver = signal(false);
    const _edge = signal<DropEdge | null>(null);
    const _rejected = signal(false);

    const feedback = options?.feedback === false
        ? { highlight: false, line: false, reject: false }
        : {
            highlight: options?.feedback?.highlight ?? true,
            line: options?.feedback?.line ?? false,
            reject: options?.feedback?.reject ?? true,
        };

    let cleanupEffect: Dispose | null = null;
    let cleanupPaint: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;

            // Register in global registry for hit-testing
            _dropZoneRegistry.set(target, { options, isOver: _isOver, edge: _edge, rejected: _rejected });

            return () => {
                _dropZoneRegistry.delete(target);
                // If this was the current zone, clean up
                if (_currentDropZone === target) {
                    _currentDropZone = null;
                }
                if (_rejectedZone === target) {
                    _rejectedZone = null;
                }
            };
        });

        // The state, written onto the element for the design system to paint.
        //
        // An attribute and not a class: it carries a VALUE — `over` against `rejected`, and which
        // edge — where a class would need one name per state and per edge. And on the zone itself
        // rather than in a component the caller has to place, because placing the indicator is the
        // only genuinely hard part of this and the caller should not inherit it.
        cleanupPaint = effect(() => {
            const target = el();
            if (!target) return;
            const over = _isOver();
            const rejected = _rejected();
            const edge = _edge();

            if (over && feedback.highlight) target.setAttribute('data-pdx-drop', 'over');
            else if (rejected && feedback.reject) target.setAttribute('data-pdx-drop', 'rejected');
            else target.removeAttribute('data-pdx-drop');

            if (over && feedback.line && edge) target.setAttribute('data-pdx-drop-edge', edge);
            else target.removeAttribute('data-pdx-drop-edge');

            return () => {
                target.removeAttribute('data-pdx-drop');
                target.removeAttribute('data-pdx-drop-edge');
            };
        });
    }

    return {
        isOver: _isOver as ReadonlySignal<boolean>,
        edge: _edge as ReadonlySignal<DropEdge | null>,
        isRejected: _rejected as ReadonlySignal<boolean>,
        dispose: () => { cleanupEffect?.(); cleanupPaint?.(); },
    };
}
