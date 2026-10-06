// Positioning engine — middleware-based floating element positioning.
// Inspired by Floating UI. Pure math, zero DOM mutation.
// Used by: Popover, Tooltip, Select, Combobox, Menu, ContextMenu, DatePicker.

import type { Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Alignment = 'start' | 'end';
export type Placement = Side | `${Side}-${Alignment}`;

/** Virtual element — anything with getBoundingClientRect (cursor, selection, coordinates). */
export interface VirtualElement {
    getBoundingClientRect(): DOMRect;
}

export interface MiddlewareState {
    x: number;
    y: number;
    placement: Placement;
    rects: { reference: DOMRect; floating: DOMRect };
    elements: { reference: HTMLElement | VirtualElement; floating: HTMLElement };
}

export interface MiddlewareResult {
    x?: number;
    y?: number;
    placement?: Placement;
    data?: Record<string, unknown>;
}

export interface Middleware {
    name: string;
    fn(state: MiddlewareState): MiddlewareResult;
}

export interface PositionOptions {
    placement?: Placement;
    middleware?: Middleware[];
    strategy?: 'absolute' | 'fixed';
    /** If the reference is inside an iframe, pass the iframe element for cross-frame offset calculation. */
    iframe?: HTMLIFrameElement;
}

export interface PositionResult {
    x: number;
    y: number;
    placement: Placement;
    strategy: 'absolute' | 'fixed';
    middlewareData: Record<string, Record<string, unknown>>;
}

// ─── Core geometry helpers ─────────────────────────────────────

function getSide(placement: Placement): Side {
    return placement.split('-')[0] as Side;
}

function getAlignment(placement: Placement): Alignment | undefined {
    return placement.split('-')[1] as Alignment | undefined;
}

function getOppositeSide(side: Side): Side {
    const map: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    return map[side];
}

function isVerticalSide(side: Side): boolean {
    return side === 'top' || side === 'bottom';
}

function getRect(el: HTMLElement | VirtualElement): DOMRect {
    return el.getBoundingClientRect();
}

function getViewportRect(): { width: number; height: number } {
    if (!isBrowser) return { width: 1024, height: 768 };
    return { width: window.innerWidth, height: window.innerHeight };
}

/** Get bounds rect for middleware — from boundary element or viewport, with padding applied. */
function getBoundsRect(boundary: HTMLElement | undefined, padding: number): { top: number; left: number; right: number; bottom: number } {
    if (boundary) {
        const r = boundary.getBoundingClientRect();
        return { top: r.top + padding, left: r.left + padding, right: r.right - padding, bottom: r.bottom - padding };
    }
    const vp = getViewportRect();
    return { top: padding, left: padding, right: vp.width - padding, bottom: vp.height - padding };
}

/** Calculate initial position from placement + rects. */
function computeCoords(reference: DOMRect, floating: DOMRect, placement: Placement): { x: number; y: number } {
    const side = getSide(placement);
    const alignment = getAlignment(placement);
    const vertical = isVerticalSide(side);

    // Main axis position
    let x: number;
    let y: number;

    switch (side) {
        case 'top':
            x = reference.left + reference.width / 2 - floating.width / 2;
            y = reference.top - floating.height;
            break;
        case 'bottom':
            x = reference.left + reference.width / 2 - floating.width / 2;
            y = reference.bottom;
            break;
        case 'left':
            x = reference.left - floating.width;
            y = reference.top + reference.height / 2 - floating.height / 2;
            break;
        case 'right':
            x = reference.right;
            y = reference.top + reference.height / 2 - floating.height / 2;
            break;
    }

    // Cross-axis alignment
    if (alignment === 'start') {
        if (vertical) x = reference.left;
        else y = reference.top;
    } else if (alignment === 'end') {
        if (vertical) x = reference.right - floating.width;
        else y = reference.bottom - floating.height;
    }

    return { x: x!, y: y! };
}

// ─── computePosition ──────────────────────────────────────────

/**
 * Compute the position for a floating element relative to a reference.
 * Pure math — does NOT apply styles. Consumer applies x/y to the floating element.
 */
export function computePosition(
    reference: HTMLElement | VirtualElement,
    floating: HTMLElement,
    options?: PositionOptions,
): PositionResult {
    const placement = options?.placement ?? 'bottom';
    const strategy = options?.strategy ?? 'absolute';
    const middlewareList = options?.middleware ?? [];

    let refRect = getRect(reference);
    const floatRect = getRect(floating);

    // Iframe offset: if reference is inside an iframe, adjust its rect to parent window coordinates
    if (options?.iframe) {
        const iframeRect = options.iframe.getBoundingClientRect();
        refRect = new DOMRect(
            refRect.x + iframeRect.x,
            refRect.y + iframeRect.y,
            refRect.width,
            refRect.height,
        );
    }

    // Portal-aware: if floating element is in a portal (position:fixed in body),
    // no offset adjustment needed — coordinates are already viewport-relative.

    const coords = computeCoords(refRect, floatRect, placement);

    let state: MiddlewareState = {
        x: coords.x,
        y: coords.y,
        placement,
        rects: { reference: refRect, floating: floatRect },
        elements: { reference, floating },
    };

    const middlewareData: Record<string, Record<string, unknown>> = {};

    // Run middleware pipeline
    for (const mw of middlewareList) {
        const result = mw.fn(state);

        if (result.x !== undefined) state = { ...state, x: result.x };
        if (result.y !== undefined) state = { ...state, y: result.y };
        if (result.placement !== undefined) state = { ...state, placement: result.placement };
        if (result.data) middlewareData[mw.name] = result.data;
    }

    return {
        x: state.x,
        y: state.y,
        placement: state.placement,
        strategy,
        middlewareData,
    };
}

// ─── Middleware: offset ────────────────────────────────────────

export type OffsetValue = number | { mainAxis?: number; crossAxis?: number };

/** Add distance between reference and floating element. */
export function offset(value: OffsetValue): Middleware {
    return {
        name: 'offset',
        fn(state) {
            const mainAxis = typeof value === 'number' ? value : (value.mainAxis ?? 0);
            const crossAxis = typeof value === 'number' ? 0 : (value.crossAxis ?? 0);
            const side = getSide(state.placement);
            const vertical = isVerticalSide(side);

            let { x, y } = state;

            // Main axis
            switch (side) {
                case 'top': y -= mainAxis; break;
                case 'bottom': y += mainAxis; break;
                case 'left': x -= mainAxis; break;
                case 'right': x += mainAxis; break;
            }

            // Cross axis
            if (vertical) x += crossAxis;
            else y += crossAxis;

            return { x, y };
        },
    };
}

// ─── Middleware: flip ──────────────────────────────────────────

export interface FlipOptions {
    /** Alternative placements to try. Default: opposite side. */
    fallbackPlacements?: Placement[];
    /** Padding in px. Default: 8. */
    padding?: number;
    /** Boundary element to check overflow against. Default: viewport. */
    boundary?: HTMLElement;
}

/** Flip to the opposite side if the floating element overflows the boundary (or viewport). */
export function flip(options?: FlipOptions): Middleware {
    return {
        name: 'flip',
        fn(state) {
            const padding = options?.padding ?? 8;
            const bounds = getBoundsRect(options?.boundary, padding);

            const { x, y, rects } = state;
            const fw = rects.floating.width;
            const fh = rects.floating.height;

            const overflows =
                x < bounds.left || y < bounds.top ||
                x + fw > bounds.right || y + fh > bounds.bottom;

            if (!overflows) return {};

            // Try fallback placements
            const side = getSide(state.placement);
            const alignment = getAlignment(state.placement);
            const fallbacks = options?.fallbackPlacements ?? [
                (alignment ? `${getOppositeSide(side)}-${alignment}` : getOppositeSide(side)) as Placement,
            ];

            for (const fallback of fallbacks) {
                const coords = computeCoords(state.rects.reference, state.rects.floating, fallback);
                const fits =
                    coords.x >= bounds.left && coords.y >= bounds.top &&
                    coords.x + fw <= bounds.right && coords.y + fh <= bounds.bottom;

                if (fits) {
                    return { x: coords.x, y: coords.y, placement: fallback, data: { flipped: true } };
                }
            }

            return {};
        },
    };
}

// ─── Middleware: shift ─────────────────────────────────────────

export interface ShiftOptions {
    /** Padding in px. Default: 8 (16 on touch devices if not set). */
    padding?: number;
    /** Boundary element to clamp within. Default: viewport. */
    boundary?: HTMLElement;
}

/** Shift the floating element along the axis to keep it within the boundary (or viewport). */
export function shift(options?: ShiftOptions): Middleware {
    return {
        name: 'shift',
        fn(state) {
            const isMobile = isBrowser && 'ontouchstart' in window && window.innerWidth < 768;
            const padding = options?.padding ?? (isMobile ? 16 : 8);
            const bounds = getBoundsRect(options?.boundary, padding);
            const { rects } = state;

            let { x, y } = state;

            x = Math.max(bounds.left, Math.min(x, bounds.right - rects.floating.width));
            y = Math.max(bounds.top, Math.min(y, bounds.bottom - rects.floating.height));

            return { x, y };
        },
    };
}

// ─── Middleware: arrow ─────────────────────────────────────────

export interface ArrowOptions {
    /** The arrow element inside the floating element. */
    element: HTMLElement;
    /** Minimum padding from the edges. Default: 4. */
    padding?: number;
}

/** Compute the arrow position relative to the floating element. */
export function arrow(options: ArrowOptions): Middleware {
    return {
        name: 'arrow',
        fn(state) {
            const padding = options.padding ?? 4;
            const { rects, placement } = state;
            const side = getSide(placement);
            const vertical = isVerticalSide(side);

            const refCenter = vertical
                ? rects.reference.left + rects.reference.width / 2
                : rects.reference.top + rects.reference.height / 2;

            const floatingStart = vertical ? state.x : state.y;
            const floatingSize = vertical ? rects.floating.width : rects.floating.height;

            // Arrow offset relative to floating element
            let arrowOffset = refCenter - floatingStart;
            arrowOffset = Math.max(padding, Math.min(arrowOffset, floatingSize - padding));

            return {
                data: {
                    x: vertical ? arrowOffset : undefined,
                    y: vertical ? undefined : arrowOffset,
                    side: getOppositeSide(side),
                },
            };
        },
    };
}

// ─── Middleware: size ──────────────────────────────────────────

export interface SizeOptions {
    /** Max width to constrain to. */
    maxWidth?: number;
    /** Max height to constrain to. */
    maxHeight?: number;
    /** Viewport padding in px. Default: 8. */
    padding?: number;
    /** Boundary element to constrain within. Default: the viewport (consistent with flip/shift). */
    boundary?: HTMLElement;
}

/** Constrain the floating element's max dimensions to available space. */
export function size(options?: SizeOptions): Middleware {
    return {
        name: 'size',
        fn(state) {
            const padding = options?.padding ?? 8;
            const bounds = getBoundsRect(options?.boundary, padding);
            const side = getSide(state.placement);

            const availableWidth = bounds.right - bounds.left;
            let availableHeight: number;

            switch (side) {
                case 'top':
                    availableHeight = state.rects.reference.top - bounds.top;
                    break;
                case 'bottom':
                    availableHeight = bounds.bottom - state.rects.reference.bottom;
                    break;
                default:
                    availableHeight = bounds.bottom - bounds.top;
                    break;
            }

            const maxW = options?.maxWidth
                ? Math.min(options.maxWidth, availableWidth)
                : availableWidth;
            const maxH = options?.maxHeight
                ? Math.min(options.maxHeight, availableHeight)
                : availableHeight;

            return {
                data: { maxWidth: maxW, maxHeight: maxH, availableWidth, availableHeight },
            };
        },
    };
}

// ─── Middleware: hide ─────────────────────────────────────────

export interface HideOptions {
    /** The scrollable ancestor to check visibility against. If omitted, uses viewport. */
    boundary?: HTMLElement;
    /** Padding inside the boundary. Default: 0. */
    padding?: number;
}

/**
 * Hide the floating element when the reference scrolls out of a boundary.
 * Sets data.hidden = true/false. Consumer applies display:none based on this.
 */
export function hide(options?: HideOptions): Middleware {
    return {
        name: 'hide',
        fn(state) {
            const boundary = options?.boundary;
            const padding = options?.padding ?? 0;
            const refRect = state.rects.reference;

            let hidden: boolean;
            if (boundary) {
                const bRect = boundary.getBoundingClientRect();
                hidden = refRect.bottom < bRect.top + padding ||
                         refRect.top > bRect.bottom - padding ||
                         refRect.right < bRect.left + padding ||
                         refRect.left > bRect.right - padding;
            } else {
                const vp = getViewportRect();
                hidden = refRect.bottom < padding ||
                         refRect.top > vp.height - padding ||
                         refRect.right < padding ||
                         refRect.left > vp.width - padding;
            }

            return { data: { hidden } };
        },
    };
}

// ─── autoUpdate ───────────────────────────────────────────────

/**
 * Listen for scroll/resize events and call `update` whenever the position
 * may have changed. Returns a Dispose function to remove listeners.
 */
export function autoUpdate(
    reference: HTMLElement | VirtualElement,
    floating: HTMLElement,
    update: () => void,
): Dispose {
    if (!isBrowser) return () => {};

    // Passive scroll listeners on ancestors of BOTH reference and floating.
    // The reference may be in a scrollable container separate from the floating.
    const floatingAncestors = getScrollAncestors(floating);
    const refAncestors = 'parentElement' in reference
        ? getScrollAncestors(reference as HTMLElement)
        : [];

    // Deduplicate (window appears in both)
    const allAncestors = new Set([...floatingAncestors, ...refAncestors]);

    for (const ancestor of allAncestors) {
        ancestor.addEventListener('scroll', update, { passive: true });
    }
    window.addEventListener('resize', update, { passive: true });

    // Async content that changes size: it repositions even without a scroll.
    let resizeObs: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(() => update());
        resizeObs.observe(floating);
        if (reference instanceof Element) resizeObs.observe(reference);
    }

    // Initial update
    update();

    return () => {
        for (const ancestor of allAncestors) {
            ancestor.removeEventListener('scroll', update);
        }
        window.removeEventListener('resize', update);
        resizeObs?.disconnect();
    };
}

/** Walk up the DOM to find all scrollable ancestors. */
function getScrollAncestors(el: HTMLElement): (HTMLElement | Window)[] {
    const ancestors: (HTMLElement | Window)[] = [];
    let current: HTMLElement | null = el.parentElement;

    while (current) {
        const { overflow, overflowX, overflowY } = getComputedStyle(current);
        if (/auto|scroll|overlay/.test(overflow + overflowY + overflowX)) {
            ancestors.push(current);
        }
        current = current.parentElement;
    }

    ancestors.push(window);
    return ancestors;
}
