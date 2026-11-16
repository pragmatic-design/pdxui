// The pointer gestures of pdx-scheduler (#1020, part 6): move an event, resize it by an edge, or
// create one by dragging over empty slots. One listener on the grid, not one per event: the events
// are many, redrawn with the period and, in the timeline, virtualized.
//
// A press becomes a drag once the pointer has moved a few pixels; until then it is still a click,
// and the click's own handlers (`event-open`, `slot-open`) run. While it drags, the view draws the
// draft through `preview`; on release it hands the draft to `commit`, which asks the app and writes
// the events; Escape gives the event back. The click that follows a drag is swallowed.
//
// Mouse and pen drag at once. A finger is the scroll's first (#1020, part 11b, the owner's decision): a
// short tap is a click, a finger that moves before LONG_PRESS scrolls the grid, and one held still
// that long lifts the event (or the edge), which then follows the finger. From the lift on, the
// touchmove that would start the browser's scroll is prevented (`holdScroll`), and a long press's
// context menu with it. Creating over empty slots stays the mouse's, the keyboard's and the editor's.
//
// `holdScroll` is a touchmove listener the host keeps on itself for good, not one added at the press:
// Chromium decides at touchstart whether a touch waits for a non-passive listener before it scrolls,
// and one added during the press came too late — measured, no touchmove reached the page and the
// browser cancelled the pointer to scroll.

import { createRange, moveEvent, resizeEvent, type DropPoint, type Placement } from './drag-model';
import type { SchedulerEvent } from './grid-model';

/** What the pointer is doing. */
export type Gesture =
    | { kind: 'move'; event: SchedulerEvent; grab: DropPoint }
    | { kind: 'resize'; event: SchedulerEvent; edge: 'start' | 'end' }
    | { kind: 'create'; anchor: DropPoint };

/** What the view draws while dragging: an event's new place, or the range being created (`id` empty). */
export type Draft = Placement & { id: string; allDay?: boolean };

export interface DragHost {
    /** The point under the pointer, or null outside the grid's cells. */
    pointAt(x: number, y: number): DropPoint | null;
    event(id: string): SchedulerEvent | undefined;
    /** Whether this event may be moved, or resized. */
    can(event: SchedulerEvent, what: 'move' | 'resize'): boolean;
    /** Whether an empty slot may start a create. */
    canCreate(): boolean;
    /** A slot's length in ms, the step of a timed resize or create. */
    step(): number;
    timeZone(): string;
    preview(draft: Draft | null, gesture: Gesture | null): void;
    /** The gesture ended on `draft`: ask, write, say. */
    commit(gesture: Gesture, draft: Draft): void;
}

/** How far, in px, a press moves before it is a drag and not a click. */
const THRESHOLD = 4;
/** How long, in ms, a finger is held still before it lifts an event. */
const LONG_PRESS = 500;
/** How far, in px, a finger may drift during the long press before it is taken for a scroll. */
const SLOP = 8;

export interface SchedulerDrag {
    /** The grid's `pointerdown`. */
    down(e: PointerEvent): void;
    /** Whether the click now arriving ends a drag, and is to be ignored. Reading it resets it. */
    swallowClick(): boolean;
    /** Stop a gesture in progress, drawing nothing. */
    cancel(): void;
    /** A non-passive touchmove listener for the host to keep: no scroll under a lifted event. */
    holdScroll(e: TouchEvent): void;
}

export function schedulerDrag(host: DragHost): SchedulerDrag {
    let gesture: Gesture | null = null;
    let origin = { x: 0, y: 0 };
    let active = false;
    let draft: Draft | null = null;
    let swallow = false;
    /** The gesture is a finger's, which lifts after a long press. */
    let touch = false;
    let lifting: ReturnType<typeof setTimeout> | undefined;
    /**
     * The node the finger came down on. A touch's events all go to it, and the lifted event is drawn
     * anew: once it is out of the document, its touchmove reaches neither the host nor the window, so
     * it is held here too.
     */
    let touched: Element | null = null;
    const holdTouched = (e: Event) => { if (touch && active && e.cancelable) e.preventDefault(); };

    const holdMenu = (e: Event) => { e.preventDefault(); };

    /** The long press is held: lift the event where the finger is. */
    function lift(): void {
        lifting = undefined;
        if (!gesture) return;
        active = true;
        navigator.vibrate?.(10);
        const p = host.pointAt(origin.x, origin.y);
        if (!p) return;
        draft = draftAt(gesture, p);
        host.preview(draft, gesture);
    }

    function draftAt(g: Gesture, p: DropPoint): Draft {
        const tz = host.timeZone();
        if (g.kind === 'move') return { id: g.event.id, ...moveEvent(g.event, { point: g.grab }, p, tz) };
        if (g.kind === 'resize') return { id: g.event.id, ...resizeEvent(g.event, g.edge, p, host.step(), tz) };
        const r = createRange(g.anchor, p, host.step(), tz);
        return { id: '', start: r.start, end: r.end, resource: r.resource ?? undefined, allDay: r.allDay };
    }

    function end(): void {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('contextmenu', holdMenu, true);
        touched?.removeEventListener('touchmove', holdTouched);
        touched = null;
        if (lifting !== undefined) clearTimeout(lifting);
        lifting = undefined;
        touch = false;
        gesture = null;
        active = false;
        draft = null;
        host.preview(null, null);
    }

    function onMove(e: PointerEvent): void {
        if (!gesture) return;
        if (!active) {
            const moved = Math.hypot(e.clientX - origin.x, e.clientY - origin.y);
            // A finger that moves before the long press is a scroll: the gesture is over.
            if (touch) { if (moved > SLOP) end(); return; }
            if (moved < THRESHOLD) return;
            active = true;
        }
        e.preventDefault();
        const p = host.pointAt(e.clientX, e.clientY);
        if (!p) return;
        draft = draftAt(gesture, p);
        host.preview(draft, gesture);
    }

    function onUp(): void {
        const g = gesture;
        const d = draft;
        const was = active;
        end();
        if (!was || !g) return;
        swallow = true;
        if (d) host.commit(g, d);
    }

    function onCancel(): void {
        if (active) swallow = true;
        end();
    }

    function onKey(e: KeyboardEvent): void {
        if (e.key !== 'Escape' || !active) return;
        e.preventDefault();
        e.stopPropagation();
        swallow = true;
        end();
    }

    return {
        down(e) {
            if (e.button !== 0 || gesture) return;
            const finger = e.pointerType === 'touch';
            const target = e.target instanceof Element ? e.target : null;
            // An event's ⋯ opens its menu: a press there is not a drag.
            if (!target || target.closest('[data-part="eventMenu"]')) return;
            const handle = target.closest('[data-part="resizeHandle"]') as HTMLElement | null;
            const button = target.closest('[data-part="event"][data-id]') as HTMLElement | null;
            const point = host.pointAt(e.clientX, e.clientY);
            if (!point) return;
            if (button) {
                const event = host.event(button.dataset.id ?? '');
                if (!event) return;
                if (handle) {
                    if (!host.can(event, 'resize')) return;
                    gesture = { kind: 'resize', event, edge: handle.dataset.edge === 'start' ? 'start' : 'end' };
                } else {
                    if (!host.can(event, 'move')) return;
                    gesture = { kind: 'move', event, grab: point };
                }
            } else {
                if (finger || !target.closest('[role="gridcell"]') || !host.canCreate()) return;
                gesture = { kind: 'create', anchor: point };
            }
            origin = { x: e.clientX, y: e.clientY };
            swallow = false;
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
            window.addEventListener('keydown', onKey, true);
            if (finger) {
                touch = true;
                lifting = setTimeout(lift, LONG_PRESS);
                window.addEventListener('contextmenu', holdMenu, true);
                touched = target;
                touched.addEventListener('touchmove', holdTouched, { passive: false });
            }
        },
        swallowClick() {
            const s = swallow;
            swallow = false;
            return s;
        },
        cancel: end,
        holdScroll(e) {
            // Once a finger has lifted an event, it drags it: the browser does not scroll under it.
            if (touch && active && e.cancelable) e.preventDefault();
        },
    };
}
