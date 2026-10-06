// What `drag-primitives.html` hands a spec, declared ONCE.
//
// Two specs drive that page — `drag-primitives.spec.ts` and `drag-mechanisms.spec.ts`, one per
// `?case=` — and they share this one `declare global { interface Window { __drag: … } }`.
// Two declarations of the same global property do not compose: TypeScript reports TS2717 on the
// second and then types every read in one of the two files against the OTHER file's shape.
//
// The page builds ONE case per load, so no single load exposes all of this. The interface is the
// union of everything the page can expose rather than a per-case type: a spec knows which case it
// opened, and a union that is honest about the page's shape is worth more here than a narrowing
// ceremony at every read.

/** A row's computed transform/opacity during a sortable drag. */
export interface RowStyle {
    test: string;
    transform: string;
    opacity: string;
}

/** An event recorded by the page: drop-zone events carry `zone`, the grid's reorder carries `detail`. */
export interface HarnessEvent {
    type: string;
    zone?: string;
    data?: unknown;
    edge?: string;
    detail?: { from: number; to: number };
}

/** The drag state the page reports. Which fields are meaningful depends on the case. */
export interface DragState {
    isDragging: boolean;
    /** sortable */
    activeIndex: number;
    /** sortable */
    overIndex: number;
    /** drop zones */
    position: { x: number; y: number };
    /** drop zones */
    velocity: { vx: number; vy: number };
    /** drop zones */
    overA: boolean;
    /** drop zones */
    edgeA: string | null;
    /** drop zones — the zone that rejects everything */
    overB: boolean;
    /** mechanisms — the single zone of that case */
    over: boolean;
    /** mechanisms */
    edge: string | null;
    /** drop zones — `aria-grabbed`, which must always be null */
    grabbed: string | null;
    /** drop zones — the zone that refuses, and whether it SAYS so */
    rejectedB: boolean;
    /** drop zones — what each zone writes about itself for the design system to paint */
    dropA: string | null;
    dropEdgeA: string | null;
    dropB: string | null;
    /** drop zones — what the draggable calls itself */
    roleDescription: string | null;
    /** drop zones — the id it points at, and the text that id resolves to */
    describedBy: string | null;
    describedText: string | null;
}

export interface DragHarness {
    frame(): Promise<void>;
    /** cross-list: what each list was told, and the two models */
    received(): { list: string; item: string; from: number; to: number }[];
    removed(): { list: string; item: string; from: number }[];
    model(): { a: string[]; b: string[] };
    reorders: [number, number][];
    order(): string[];
    model(): string[];
    styles(): RowStyle[];
    ghosts(): number;
    events: HarnessEvent[];
    state(): DragState;
    dispose(): void;
}

declare global {
    interface Window {
        __drag: DragHarness;
    }
}
