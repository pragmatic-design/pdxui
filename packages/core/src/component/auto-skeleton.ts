// Auto-Skeleton — generate loading placeholder from component structure.
// Runtime version: scans DOM and replaces content with skeleton shapes.
// Future: compiler generates skeleton statically from template AST.
//
// The element's own nodes are set aside and put back, never serialised: the content used to be kept
// as an HTML string in an attribute and restored with innerHTML, so the nodes that came back were new
// ones — their listeners and component state gone — and whatever wrote that attribute in between
// chose the HTML. The shapes are built with the DOM, and the options reach them as style properties,
// so no option is ever read as markup or as a stylesheet (#65).

import type { Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface SkeletonOptions {
    /** Animation style. Default: 'pulse'. */
    animation?: 'pulse' | 'wave' | 'none';
    /** Border radius for skeleton shapes. Default: '4px'. */
    borderRadius?: string;
    /** Background color. Default: '#e0e0e0'. */
    color?: string;
    /** Highlight color (for wave). Default: '#f0f0f0'. */
    highlightColor?: string;
    /** Elements to skip (CSS selector). Default: none. */
    skip?: string;
}

// ─── showSkeleton / hideSkeleton ──────────────────────────────

const SKELETON_ATTR = 'data-pdx-skeleton';
const ANIMATIONS = new Set(['pulse', 'wave', 'none']);

/** What an element showed before its skeleton: its own child nodes, in order. */
const originals = new WeakMap<HTMLElement, Node[]>();

/** The shapes' look, as custom properties on the host the stylesheet reads. */
const COLOR_PROPS = ['--pdx-skeleton-color', '--pdx-skeleton-highlight'] as const;

/**
 * Replace element content with skeleton placeholders.
 * Scans children and creates matching skeleton shapes:
 * - Text nodes → gray rectangles matching line height
 * - Images → gray rectangles matching dimensions
 * - Buttons → rounded rectangles
 * - Inputs → input-shaped rectangles
 *
 * @returns Dispose function to restore original content.
 */
export function showSkeleton(
    el: HTMLElement,
    options?: SkeletonOptions,
): Dispose {
    if (!isBrowser) return () => {};
    if (originals.has(el)) hideSkeleton(el);

    const animation = ANIMATIONS.has(options?.animation as string) ? options!.animation! : 'pulse';
    const look: Look = { radius: options?.borderRadius ?? '4px', animation };
    const skipSelector = options?.skip;

    injectSkeletonStyles();
    el.style.setProperty(COLOR_PROPS[0], options?.color ?? '#e0e0e0');
    el.style.setProperty(COLOR_PROPS[1], options?.highlightColor ?? '#f0f0f0');

    // Measure and build every shape while the originals are still laid out, then swap.
    const kept = Array.from(el.childNodes);
    const shapes: Node[] = [];
    const elementChildren = kept.filter((n): n is HTMLElement => n.nodeType === Node.ELEMENT_NODE);
    if (elementChildren.length === 0 && el.textContent?.trim()) {
        const rect = el.getBoundingClientRect();
        shapes.push(createSkeletonRect(rect.width, rect.height || 16, look));
    } else {
        for (const node of kept) {
            // A skipped child is shown as itself, and is put back where it was.
            if (node.nodeType === Node.ELEMENT_NODE && skipSelector && (node as HTMLElement).matches(skipSelector)) shapes.push(node);
            else shapes.push(skeletonFor(node, look));
        }
    }

    originals.set(el, kept);
    el.setAttribute(SKELETON_ATTR, '');
    el.replaceChildren(...shapes);

    return () => hideSkeleton(el);
}

/**
 * Restore original content from skeleton.
 */
export function hideSkeleton(el: HTMLElement): void {
    const kept = originals.get(el);
    if (!kept) return;
    originals.delete(el);
    el.replaceChildren(...kept);
    el.removeAttribute(SKELETON_ATTR);
    for (const prop of COLOR_PROPS) el.style.removeProperty(prop);
}

// ─── Internal helpers ─────────────────────────────────────────

interface Look { radius: string; animation: string }

/** The shape that stands for `node`: a new node, measured from it; `node` itself is untouched. */
function skeletonFor(node: Node, look: Look): Node {
    if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent?.trim()) return node.cloneNode();
        const span = document.createElement('span');
        span.appendChild(createSkeletonRect(Math.min(200, node.textContent.length * 7), 16, look));
        return span;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createComment('');

    const el = node as HTMLElement;
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();

    if (tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'svg') {
        // Media → rectangle matching aspect ratio
        return createSkeletonRect(rect.width, rect.height, look);
    }
    if (tag === 'button' || tag === 'a') {
        // Buttons → rounded rectangle
        return createSkeletonRect(rect.width, rect.height, { ...look, radius: '20px' });
    }
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        // Inputs → input shape
        return createSkeletonRect(rect.width, rect.height, look);
    }
    // A custom element is not cloned: a clone is a new instance, and it would render.
    if (tag.includes('-')) return createSkeletonRect(rect.width, rect.height, look);

    // A container keeps its own box (a shallow copy, for the layout) with its children as shapes.
    const box = el.cloneNode(false) as HTMLElement;
    if (el.children.length > 0) {
        for (const child of Array.from(el.childNodes)) box.appendChild(skeletonFor(child, look));
    } else if (el.textContent?.trim()) {
        // Text element → text-shaped rectangles, the last line shorter
        const lines = Math.ceil(rect.height / 20) || 1;
        for (let i = 0; i < lines; i++) {
            box.appendChild(createSkeletonRect(i === lines - 1 ? rect.width * 0.7 : rect.width, 14, look));
            const gap = document.createElement('div');
            gap.style.height = '6px';
            box.appendChild(gap);
        }
    }
    return box;
}

function createSkeletonRect(w: number, h: number, look: Look): HTMLElement {
    const shape = document.createElement('div');
    shape.className = `pdx-skeleton pdx-skeleton-${look.animation}`;
    shape.style.width = `${w}px`;
    shape.style.height = `${h}px`;
    // A style PROPERTY, not a declaration in a string: a value that is not a radius is dropped.
    shape.style.borderRadius = look.radius;
    shape.style.display = 'inline-block';
    return shape;
}

let _stylesInjected = false;

/** One stylesheet, the same for every call: the colours come from custom properties on the host. */
function injectSkeletonStyles(): void {
    if (_stylesInjected || !isBrowser) return;
    _stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'pdx-skeleton-styles';
    style.textContent = `
        .pdx-skeleton { background: var(--pdx-skeleton-color, #e0e0e0); }
        .pdx-skeleton-pulse { animation: pdx-skeleton-pulse 1.5s ease-in-out infinite; }
        .pdx-skeleton-wave { background: linear-gradient(90deg, var(--pdx-skeleton-color, #e0e0e0) 25%, var(--pdx-skeleton-highlight, #f0f0f0) 50%, var(--pdx-skeleton-color, #e0e0e0) 75%); background-size: 200% 100%; animation: pdx-skeleton-wave 1.5s ease-in-out infinite; }
        @keyframes pdx-skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes pdx-skeleton-wave { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    `;
    document.head.appendChild(style);
}
