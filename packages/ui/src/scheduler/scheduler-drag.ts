// The pointer gestures of pdx-scheduler (#1020, part 6): move an event, resize it by an edge, or
// create one by dragging over empty slots. One listener on the grid, not one per event: the events
// are many, redrawn with the period and, in the timeline, virtualized.
//
// A press becomes a drag once the pointer has moved a few pixels; until then it is still a click,
// and the click's own handlers (`event-open`, `slot-open`) run. While it drags, the view draws the
// draft through `preview`; on release it hands the draft to `commit`, which asks the app and writes
// the events; Escape gives the event back. The click that follows a drag is swallowed.
//
// Mouse and pen. On touch the browser takes a moving finger for a scroll before a long press could
// start a drag; touch comes with the mobile part, and the single-pointer way (pick up, tap where)
// with the keyboard part.

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

export interface SchedulerDrag {
    /** The grid's `pointerdown`. */
    down(e: PointerEvent): void;
    /** Whether the click now arriving ends a drag, and is to be ignored. Reading it resets it. */
    swallowClick(): boolean;
    /** Stop a gesture in progress, drawing nothing. */
    cancel(): void;
}

export function schedulerDrag(host: DragHost): SchedulerDrag {
    let gesture: Gesture | null = null;
    let origin = { x: 0, y: 0 };
    let active = false;
    let draft: Draft | null = null;
    let swallow = false;

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
        gesture = null;
        active = false;
        draft = null;
        host.preview(null, null);
    }

    function onMove(e: PointerEvent): void {
        if (!gesture) return;
        if (!active) {
            if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < THRESHOLD) return;
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
            if (e.button !== 0 || e.pointerType === 'touch' || gesture) return;
            const target = e.target instanceof Element ? e.target : null;
            if (!target) return;
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
                if (!target.closest('[role="gridcell"]') || !host.canCreate()) return;
                gesture = { kind: 'create', anchor: point };
            }
            origin = { x: e.clientX, y: e.clientY };
            swallow = false;
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onCancel);
            window.addEventListener('keydown', onKey, true);
        },
        swallowClick() {
            const s = swallow;
            swallow = false;
            return s;
        },
        cancel: end,
    };
}
