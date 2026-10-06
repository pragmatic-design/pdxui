// Auto-Skeleton — generate loading placeholder from component structure.
// Runtime version: scans DOM and replaces content with skeleton shapes.
// Future: compiler generates skeleton statically from template AST.

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
const ORIGINAL_ATTR = 'data-pdx-skeleton-original';

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

    const animation = options?.animation ?? 'pulse';
    const radius = options?.borderRadius ?? '4px';
    const color = options?.color ?? '#e0e0e0';
    const highlightColor = options?.highlightColor ?? '#f0f0f0';
    const skipSelector = options?.skip;

    // Inject animation styles once
    injectSkeletonStyles(animation, color, highlightColor);

    // Store original HTML
    el.setAttribute(ORIGINAL_ATTR, el.innerHTML);
    el.setAttribute(SKELETON_ATTR, '');

    // Scan and replace each child
    const children = Array.from(el.children) as HTMLElement[];
    for (const child of children) {
        if (skipSelector && child.matches(skipSelector)) continue;
        replaceWithSkeleton(child, radius, animation);
    }

    // If no children but has text content, create a text skeleton
    if (children.length === 0 && el.textContent?.trim()) {
        const rect = el.getBoundingClientRect();
        el.innerHTML = createSkeletonRect(rect.width, rect.height || 16, radius, animation);
    }

    return () => hideSkeleton(el);
}

/**
 * Restore original content from skeleton.
 */
export function hideSkeleton(el: HTMLElement): void {
    const original = el.getAttribute(ORIGINAL_ATTR);
    if (original !== null) {
        el.innerHTML = original;
        el.removeAttribute(ORIGINAL_ATTR);
        el.removeAttribute(SKELETON_ATTR);
    }
}

// ─── Internal helpers ─────────────────────────────────────────

function replaceWithSkeleton(el: HTMLElement, radius: string, animation: string): void {
    const rect = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const w = rect.width;
    const h = rect.height;

    if (tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'svg') {
        // Media → rectangle matching aspect ratio
        el.outerHTML = createSkeletonRect(w, h, radius, animation);
    } else if (tag === 'button' || tag === 'a') {
        // Buttons → rounded rectangle
        el.outerHTML = createSkeletonRect(w, h, '20px', animation);
    } else if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        // Inputs → input shape
        el.outerHTML = createSkeletonRect(w, h, radius, animation);
    } else if (el.children.length > 0) {
        // Container with children → recurse
        for (const child of Array.from(el.children) as HTMLElement[]) {
            replaceWithSkeleton(child, radius, animation);
        }
        // Hide text nodes in this container
        for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                const span = document.createElement('span');
                span.innerHTML = createSkeletonRect(
                    Math.min(200, node.textContent.length * 7),
                    16,
                    radius,
                    animation,
                );
                node.replaceWith(span);
            }
        }
    } else if (el.textContent?.trim()) {
        // Text element → text-shaped rectangle
        const lines = Math.ceil(h / 20) || 1;
        let html = '';
        for (let i = 0; i < lines; i++) {
            const lineW = i === lines - 1 ? w * 0.7 : w; // last line shorter
            html += createSkeletonRect(lineW, 14, radius, animation) +
                    '<div style="height:6px"></div>';
        }
        el.innerHTML = html;
    }
}

function createSkeletonRect(w: number, h: number, radius: string, animation: string): string {
    return `<div class="pdx-skeleton pdx-skeleton-${animation}" style="width:${w}px;height:${h}px;border-radius:${radius};display:inline-block;"></div>`;
}

let _stylesInjected = false;

function injectSkeletonStyles(_animation: string, color: string, highlight: string): void {
    if (_stylesInjected || !isBrowser) return;
    _stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'pdx-skeleton-styles';
    style.textContent = `
        .pdx-skeleton { background: ${color}; }
        .pdx-skeleton-pulse { animation: pdx-skeleton-pulse 1.5s ease-in-out infinite; }
        .pdx-skeleton-wave { background: linear-gradient(90deg, ${color} 25%, ${highlight} 50%, ${color} 75%); background-size: 200% 100%; animation: pdx-skeleton-wave 1.5s ease-in-out infinite; }
        @keyframes pdx-skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes pdx-skeleton-wave { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
    `;
    document.head.appendChild(style);
}
