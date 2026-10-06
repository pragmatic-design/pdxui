// Popover headless composable — positioning, trigger, dismiss, ARIA.
// Foundation for: Tooltip, Dropdown, Select, Combobox, Menu, DatePicker, ColorPicker.
// Headless: provides logic and ARIA, no UI.

import { signal, effect, computed, onDispose } from '../reactivity/signal';
import { computePosition, offset as mwOffset, flip as mwFlip, shift as mwShift } from './positioning';
import type { Placement } from './positioning';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export type PopoverPlacement = 'top' | 'bottom' | 'left' | 'right'
    | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
    | 'left-start' | 'left-end' | 'right-start' | 'right-end';

export type PopoverTrigger = 'click' | 'hover' | 'focus' | 'manual';

export interface PopoverOptions {
    /** How to trigger open/close. Default: 'click'. */
    trigger?: PopoverTrigger;
    /** Placement relative to trigger. Default: 'bottom-start'. */
    placement?: PopoverPlacement;
    /** Offset from trigger (px). Default: 8. */
    offset?: number;
    /** Flip if no space. Default: true. */
    flip?: boolean;
    /** Dismiss on click-outside. Default: true. */
    dismissOnOutside?: boolean;
    /** Dismiss on Escape. Default: true. */
    dismissOnEscape?: boolean;
    /** Hover delay (ms). Default: { open: 0, close: 150 }. */
    hoverDelay?: { open?: number; close?: number };
    /** Called when open state changes. */
    onOpenChange?: (open: boolean) => void;
    /**
     * Container element for click-outside detection.
     * Clicks inside this element are NOT considered "outside".
     * Use for light DOM Web Components where trigger and content are siblings
     * inside a host custom element — pass the host element here.
     */
    container?: HTMLElement | (() => HTMLElement | null);
    /**
     * Whether the composable positions the content. Default: always. Return false to leave it where
     * the stylesheet puts it — a bottom sheet below a breakpoint: the inline position this composable
     * wrote is cleared, and nothing is written while it stays false. Asked on every update, so a
     * resize across the breakpoint switches between the two. Two positioning systems on one element
     * would put pdx-date-picker's sheet 8px off a phone screen, and its size observer would chase its
     * own writes.
     */
    positioned?: () => boolean;
}

export interface PopoverReturn {
    /** Whether the popover is open. */
    isOpen: ReadonlySignal<boolean>;
    /** Current computed position { x, y, placement }. */
    position: ReadonlySignal<{ x: number; y: number; placement: PopoverPlacement }>;
    /** Open the popover. */
    open(): void;
    /** Close the popover. */
    close(): void;
    /** Toggle open/close. */
    toggle(): void;
    /** Set the trigger element reference. */
    setTrigger(el: HTMLElement | null): void;
    /** Set the content element reference. */
    setContent(el: HTMLElement | null): void;
    /** ARIA props to spread on the trigger element. */
    triggerProps: {
        'aria-expanded': ReadonlySignal<boolean>;
        'aria-haspopup': 'true';
    };
    /** ARIA props to spread on the content element. */
    contentProps: {
        role: 'dialog' | 'listbox' | 'menu';
    };
    /** Cleanup all listeners. */
    dispose(): void;
}

// The stack of open popovers (in opening order): Escape closes only the top one,
// not every instance with its own independent document listener.
const _openPopoverTokens: object[] = [];

// ─── usePopover() ──────────────────────────────────────────────────

/**
 * Headless popover composable.
 * Provides positioning, trigger handling, dismiss logic, and ARIA attributes.
 * Does NOT render any UI — the consumer provides trigger and content elements.
 *
 * Usage:
 *   const pop = usePopover({ trigger: 'click', placement: 'bottom-start' });
 *   // In template:
 *   <button :ref="pop.setTrigger" :aria-expanded="pop.isOpen">Open</button>
 *   <div :ref="pop.setContent" :show="pop.isOpen" :style="popoverStyle(pop.position)">
 *     Content here
 *   </div>
 */
export function usePopover(options?: PopoverOptions): PopoverReturn {
    const opts = {
        trigger: options?.trigger ?? 'click' as PopoverTrigger,
        placement: options?.placement ?? 'bottom-start' as PopoverPlacement,
        // Kept as declared, INCLUDING undefined: the token is consulted per open, on the floating
        // element, so collapsing it to a number here would put the fallback in front of the theme.
        offset: options?.offset,
        flip: options?.flip ?? true,
        dismissOnOutside: options?.dismissOnOutside ?? true,
        dismissOnEscape: options?.dismissOnEscape ?? true,
        hoverDelay: { open: 0, close: 150, ...options?.hoverDelay },
        onOpenChange: options?.onOpenChange ?? (() => {}),
        container: options?.container ?? null,
        positioned: options?.positioned ?? (() => true),
    };

    const _isOpen = signal(false);
    const _triggerEl = signal<HTMLElement | null>(null);
    const _contentEl = signal<HTMLElement | null>(null);
    const _position = signal({ x: 0, y: 0, placement: opts.placement });
    const disposers: Dispose[] = [];

    let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
    let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;

    // ─── Position updating ──────────────────────────────────

    function updatePosition(): void {
        const trigger = _triggerEl.peek();
        const content = _contentEl.peek();
        if (!trigger || !content || !_isOpen.peek()) return;

        // The stylesheet owns the position (a bottom sheet): take back what was written, write
        // nothing. The size observer below then has no write of ours to chase.
        if (!opts.positioned()) {
            content.style.removeProperty('position');
            content.style.removeProperty('left');
            content.style.removeProperty('top');
            content.removeAttribute('data-placement');
            return;
        }

        const refRect = trigger.getBoundingClientRect();
        const floatRect = content.getBoundingClientRect();
        const offset = opts.offset ?? readFloatOffset(content);
        const pos = computePositionInline(refRect, floatRect, opts.placement, offset, opts.flip);
        _position.set(pos as never);

        // Apply position CSS directly — composable manages all positioning
        content.style.position = 'fixed';
        content.style.left = `${pos.x}px`;
        content.style.top = `${pos.y}px`;
        // Expose the RESOLVED placement (after flip) so arrow CSS — e.g.
        // .pdx-tooltip-float[data-placement^="bottom"] .pdx-tooltip-arrow — can position correctly.
        content.setAttribute('data-placement', pos.placement);
    }

    // Effect: reposition when open changes, on scroll/resize, or content resize
    disposers.push(effect(() => {
        if (!_isOpen()) return;
        updatePosition();

        const onScroll = () => updatePosition();
        window.addEventListener('scroll', onScroll, { capture: true, passive: true });
        window.addEventListener('resize', onScroll, { passive: true });

        // Watch the size of the content (a filtered list shrinks or grows) AND of the trigger: a
        // trigger that grows after the panel opened — a web font arriving late, a row of chips —
        // would otherwise leave the panel over it.
        // TRACKED reads: if either is mounted after the opening (a conditional render on isOpen)
        // the effect re-runs and attaches the observer, which an untracked read would lose.
        let resizeObs: ResizeObserver | null = null;
        const content = _contentEl();
        const trigger = _triggerEl();
        if ((content || trigger) && typeof ResizeObserver !== 'undefined') {
            resizeObs = new ResizeObserver(() => updatePosition());
            if (content) resizeObs.observe(content);
            if (trigger) resizeObs.observe(trigger);
        }

        return () => {
            window.removeEventListener('scroll', onScroll, { capture: true });
            window.removeEventListener('resize', onScroll);
            resizeObs?.disconnect();
        };
    }));

    // ─── Open/close logic ──────────────────────────────────

    // This instance's identity token in the stack of open popovers
    const _stackToken = {};

    function setOpen(open: boolean): void {
        if (_isOpen.peek() === open) return;
        _isOpen.set(open);
        if (open) {
            _openPopoverTokens.push(_stackToken);
        } else {
            const i = _openPopoverTokens.indexOf(_stackToken);
            if (i >= 0) _openPopoverTokens.splice(i, 1);
        }
        opts.onOpenChange(open);
        if (open) requestAnimationFrame(updatePosition);
    }

    // ─── Trigger binding ────────────────────────────────────

    function bindTrigger(el: HTMLElement): Dispose {
        const handlers: { event: string; fn: EventListener; options?: AddEventListenerOptions }[] = [];

        function on(event: string, fn: EventListener, eventOpts?: AddEventListenerOptions): void {
            el.addEventListener(event, fn, eventOpts);
            handlers.push({ event, fn, options: eventOpts });
        }

        if (opts.trigger === 'click') {
            on('click', () => setOpen(!_isOpen.peek()));
        } else if (opts.trigger === 'hover') {
            on('mouseenter', () => {
                if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
                hoverOpenTimer = setTimeout(() => setOpen(true), opts.hoverDelay.open);
            });
            on('mouseleave', () => {
                if (hoverOpenTimer) { clearTimeout(hoverOpenTimer); hoverOpenTimer = null; }
                hoverCloseTimer = setTimeout(() => setOpen(false), opts.hoverDelay.close);
            });
        } else if (opts.trigger === 'focus') {
            on('focusin', () => setOpen(true));
            on('focusout', (e) => {
                const related = (e as FocusEvent).relatedTarget as Node | null;
                const content = _contentEl.peek();
                if (content && related && content.contains(related)) return;
                setOpen(false);
            });
        }

        return () => {
            for (const h of handlers) el.removeEventListener(h.event, h.fn, h.options);
        };
    }

    // ─── Content binding (hover relay, outside click, escape) ─

    function bindContent(el: HTMLElement): Dispose {
        const handlers: { event: string; fn: EventListener; target: EventTarget }[] = [];

        function on(target: EventTarget, event: string, fn: EventListener): void {
            target.addEventListener(event, fn);
            handlers.push({ event, fn, target });
        }

        // Hover: keep open when mouse enters content
        if (opts.trigger === 'hover') {
            on(el, 'mouseenter', () => {
                if (hoverCloseTimer) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null; }
            });
            on(el, 'mouseleave', () => {
                hoverCloseTimer = setTimeout(() => setOpen(false), opts.hoverDelay.close);
            });
        }

        // Click outside
        if (opts.dismissOnOutside) {
            on(document, 'pointerdown', (e) => {
                if (!_isOpen.peek()) return;
                const target = e.target as Node;
                const trigger = _triggerEl.peek();
                if (trigger?.contains(target) || el.contains(target)) return;
                // Light DOM: check container element (host CE) if provided
                const container = typeof opts.container === 'function' ? opts.container() : opts.container;
                if (container?.contains(target)) return;
                setOpen(false);
            });
        }

        // Escape — stack-aware: it closes only if this instance is the most
        // recently opened popover (nested menus/multiple overlays).
        if (opts.dismissOnEscape) {
            on(document, 'keydown', (e) => {
                if (!_isOpen.peek() || (e as KeyboardEvent).key !== 'Escape') return;
                if (_openPopoverTokens[_openPopoverTokens.length - 1] !== _stackToken) return;
                setOpen(false);
                _triggerEl.peek()?.focus();
            });
        }

        return () => {
            for (const h of handlers) h.target.removeEventListener(h.event, h.fn);
        };
    }

    // ─── Element ref setters ────────────────────────────────

    let triggerDispose: Dispose | null = null;
    let contentDispose: Dispose | null = null;

    function setTrigger(el: HTMLElement | null): void {
        if (triggerDispose) { triggerDispose(); triggerDispose = null; }
        _triggerEl.set(el as never);
        if (el) triggerDispose = bindTrigger(el);
    }

    function setContent(el: HTMLElement | null): void {
        if (contentDispose) { contentDispose(); contentDispose = null; }
        _contentEl.set(el as never);
        if (el) contentDispose = bindContent(el);
    }

    const disposeAll = (): void => {
        for (const d of disposers) d();
        if (triggerDispose) triggerDispose();
        if (contentDispose) contentDispose();
        if (hoverOpenTimer) clearTimeout(hoverOpenTimer);
        if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
        const i = _openPopoverTokens.indexOf(_stackToken);
        if (i >= 0) _openPopoverTokens.splice(i, 1);
    };

    // Auto-teardown with the component's ownership scope: the document listeners
    // (pointerdown/keydown) do not survive the unmount if the consumer
    // forgets dispose(). A no-op outside a scope.
    onDispose(disposeAll);

    return {
        isOpen: computed(() => _isOpen()),
        position: computed(() => _position()),
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!_isOpen.peek()),
        setTrigger,
        setContent,
        triggerProps: {
            'aria-expanded': computed(() => _isOpen()),
            'aria-haspopup': 'true' as const,
        },
        contentProps: {
            role: 'dialog' as const,
        },
        dispose: disposeAll,
    };
}

// ─── Positioning delegated to the shared engine (positioning.ts) ──
// No second inline engine here: there is no circular dependency to avoid, and two
// implementations would have to be kept in step.
// offset+flip+shift with a padding of 8.

/** The composable's own default, used when neither the caller nor the theme says otherwise. */
const DEFAULT_FLOAT_OFFSET = 8;

/**
 * The gap between a trigger and its floating element, in px, from `--pdx-float-offset`.
 *
 * The token is not a CSS property of anything, it is a number the positioning code applies, so
 * nothing reads it unless the code does. Read here because this is where the floating element
 * is in hand, and read PER OPEN so a theme switch takes effect without remounting.
 *
 * Resolved through a temporary declaration rather than by parsing the text: the token may be any
 * CSS length — `1rem`, `0.5em`, `calc(…)` — and treating the string as a number yields NaN, which
 * positions the element at the top left of the screen.
 */
function readFloatOffset(floating: HTMLElement): number {
    if (typeof getComputedStyle !== 'function') return DEFAULT_FLOAT_OFFSET;
    const declared = getComputedStyle(floating).getPropertyValue('--pdx-float-offset').trim();
    if (!declared) return DEFAULT_FLOAT_OFFSET;

    // A custom property's computed value is its text, unresolved. Assigning it to a property that
    // takes a length makes the engine resolve the unit; an invalid value is refused and leaves the
    // property empty, which is the "cannot make sense of it" case.
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.height = declared;
    floating.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).height);
    probe.remove();

    return Number.isFinite(px) ? px : DEFAULT_FLOAT_OFFSET;
}

function computePositionInline(
    ref: DOMRect, float: DOMRect, placement: PopoverPlacement, offset: number, flip: boolean,
): { x: number; y: number; placement: PopoverPlacement } {
    const middleware = [mwOffset(offset)];
    if (flip) middleware.push(mwFlip({ padding: 8 }));
    middleware.push(mwShift({ padding: 8 }));

    const result = computePosition(
        { getBoundingClientRect: () => ref },
        { getBoundingClientRect: () => float } as unknown as HTMLElement,
        { placement: placement as Placement, middleware },
    );
    return { x: result.x, y: result.y, placement: result.placement as PopoverPlacement };
}
