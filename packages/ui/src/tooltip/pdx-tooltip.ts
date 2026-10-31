// pdx-tooltip — Positioned tooltip with hover bridge via usePopover().
// Uses manual trigger mode + explicit hover/focus handling for disabled/overflowOnly veto.
// ARIA: aria-describedby on trigger → floating element with role="tooltip" (WAI).

import { component, html, signal, effect, event, generatedId } from '@pdxui/core';
import { usePopover, overlayStack } from '@pdxui/core';
import type { PopoverPlacement } from '@pdxui/core';
import { anchorControl } from '../shared/anchor-control';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/tooltip';

let _ttCounter = 0;

/**
 * A tooltip that describes its trigger on hover or focus, in one of 12 placements, with show and
 * hide delays.
 */
component('pdx-tooltip', {
    events: {
        /**
         * The tooltip showed (`true`) or hid (`false`): its open state, read-only (#288). The parent
         * never writes it, so it is not a model, and `::open` on it is an error.
         */
        'open-change': event<{ value: boolean }>(),
    },
    // On the host as custom states (#132, #288): `open` while it shows, and `placed-<side>`, the side
    // it went to after flipping, which draws the arrow.
    states: ['open', 'placed-top', 'placed-bottom', 'placed-left', 'placed-right'],
    // The floating element and its arrow. The trigger is the page's own element.
    parts: ['root', 'arrow'],
    props: {
        text: { type: String, default: '' },
        placement: { type: String, default: 'top' },
        delay: { type: Number, default: 200 },
        hideDelay: { type: Number, default: 100 },
        arrow: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        overflowOnly: { type: Boolean, default: false },
    },
    setup(ctx) {
        const visible = signal(false);
        let popover: ReturnType<typeof usePopover> | null = null;
        let overlayId = '';
        let showTimer: ReturnType<typeof setTimeout> | null = null;
        let hideTimer: ReturnType<typeof setTimeout> | null = null;
        const tooltipId = generatedId('pdx-tt-float');

        function getTrigger(): HTMLElement | null {
            const parent = ctx.el.parentElement;
            if (parent) {
                const explicit = parent.querySelector('[data-pdx-trigger]') as HTMLElement;
                if (explicit) return explicit;
            }
            return ctx.el.previousElementSibling as HTMLElement ?? null;
        }

        function isOverflowing(el: HTMLElement): boolean {
            return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
        }

        function canShow(trigger: HTMLElement): boolean {
            if (ctx.disabled()) return false;
            if (ctx.overflowOnly() && !isOverflowing(trigger)) return false;
            return true;
        }

        function doShow() {
            if (!popover || visible.peek()) return;
            visible.set(true);
            popover.open();
            overlayId = 'pdx-tt-' + (++_ttCounter);
            const zIndex = overlayStack.push(overlayId);
            const floatingEl = ctx.el.querySelector('.pdx-tooltip-float') as HTMLElement;
            if (floatingEl) floatingEl.style.zIndex = String(zIndex);
            ctx.state('open', true);
            ctx.emit('open-change', { value: true });
        }

        function doHide() {
            if (showTimer) { clearTimeout(showTimer); showTimer = null; }
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            const wasVisible = visible.peek();
            visible.set(false);
            if (popover) popover.close();
            if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
            // Announced once, by the close that hid it: a timer, a blur and a disconnect may all call
            // this on a tooltip already hidden.
            if (wasVisible) {
                ctx.state('open', false);
                ctx.emit('open-change', { value: false });
            }
        }

        /** Mark the side it was placed on, none while it is hidden. */
        function setPlaced(side: string) {
            ctx.state('placed-top', side === 'top');
            ctx.state('placed-bottom', side === 'bottom');
            ctx.state('placed-left', side === 'left');
            ctx.state('placed-right', side === 'right');
        }

        function scheduleShow(trigger: HTMLElement) {
            if (!canShow(trigger)) return;
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            if (showTimer) { clearTimeout(showTimer); showTimer = null; }
            showTimer = setTimeout(() => { showTimer = null; doShow(); }, ctx.delay() as number);
        }

        function scheduleHide() {
            if (showTimer) { clearTimeout(showTimer); showTimer = null; }
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
            hideTimer = setTimeout(() => { hideTimer = null; doHide(); }, ctx.hideDelay() as number);
        }

        // Named handler refs for proper cleanup
        function onTriggerEnter() { const t = getTrigger(); if (t) scheduleShow(t); }
        function onTriggerLeave() { scheduleHide(); }
        function onTriggerFocus() { const t = getTrigger(); if (t) scheduleShow(t); }
        function onTriggerBlur() { doHide(); }
        // Escape dismisses it without moving the pointer or the focus (WCAG 1.4.13). The popover's
        // own Escape would close it but leave `visible` set, so it would stay on screen, and would
        // move focus to the trigger.
        function onEscape(e: KeyboardEvent) {
            if (e.key === 'Escape' && visible.peek()) doHide();
        }

        ctx.track(() => {
            const trigger = getTrigger();
            if (!trigger) return;
            // The description goes on the control that takes focus: the inner <button> of a
            // pdx-button, not the host, where a screen reader never hears it.
            const control = anchorControl(trigger);

            // Use manual trigger — we control open/close ourselves for veto logic
            popover = usePopover({
                trigger: 'manual',
                placement: ctx.placement() as PopoverPlacement,
                // No offset: the gap comes from `--pdx-float-offset`, as it does for the popover
                // and the select. An explicit offset is exactly what stops `usePopover` reading
                // the token — so a theme that set it would move every floating element EXCEPT
                // this one.
                //
                // Dimension 5 photographs the scenario AT REST and a tooltip opens on hover, so
                // `tooltip-top`'s baseline is a picture of the trigger with no tooltip in it: a
                // green visual suite is not evidence that a change to the tooltip's offset is safe.
                dismissOnOutside: false,
                dismissOnEscape: false,
                hoverDelay: { open: 0, close: ctx.hideDelay() as number },
            });

            popover.setTrigger(control);
            // The side it went to after flipping (`top-start` is `top`), read from the position the
            // composable resolved, while it shows.
            const pop = popover;
            const stopPlaced = effect(() => {
                setPlaced(visible() ? pop.position().placement.split('-')[0] : '');
            });
            // Hover bridge: keep open when mouse enters tooltip content. Bound once the content is
            // rendered: queried here, during setup, it is not there yet and the bridge would never bind.
            const onContentEnter = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } };
            const onContentLeave = () => { scheduleHide(); };
            let floatingEl: HTMLElement | null = null;
            requestAnimationFrame(() => {
                floatingEl = ctx.el.querySelector('.pdx-tooltip-float') as HTMLElement | null;
                if (!floatingEl || !popover) return;
                popover.setContent(floatingEl);
                floatingEl.addEventListener('mouseenter', onContentEnter);
                floatingEl.addEventListener('mouseleave', onContentLeave);
            });

            // Hover on trigger; focus by focusin/focusout, which bubble from the inner control of a
            // component trigger — `focus` on a pdx-button host never fires, so the keyboard would
            // never show the tooltip.
            trigger.addEventListener('mouseenter', onTriggerEnter);
            trigger.addEventListener('mouseleave', onTriggerLeave);
            trigger.addEventListener('focusin', onTriggerFocus);
            trigger.addEventListener('focusout', onTriggerBlur);
            document.addEventListener('keydown', onEscape);

            // ARIA: aria-describedby on the control → the floating element with role="tooltip". Its id
            // is in the template: set here, during setup, it went on nothing, and the reference
            // pointed at no element.
            control.setAttribute('aria-describedby', tooltipId);

            return () => {
                trigger.removeEventListener('mouseenter', onTriggerEnter);
                trigger.removeEventListener('mouseleave', onTriggerLeave);
                trigger.removeEventListener('focusin', onTriggerFocus);
                trigger.removeEventListener('focusout', onTriggerBlur);
                document.removeEventListener('keydown', onEscape);
                control.removeAttribute('aria-describedby');
                if (floatingEl) {
                    floatingEl.removeEventListener('mouseenter', onContentEnter);
                    floatingEl.removeEventListener('mouseleave', onContentLeave);
                }
                doHide();
                stopPlaced();
                if (popover) { popover.dispose(); popover = null; }
            };
        });

        // The overlay verbs (#288): show(), close(), toggle(). `hide()` is `close()`.
        ctx.expose({
            show() { doShow(); },
            close() { doHide(); },
            toggle() { if (visible.peek()) doHide(); else doShow(); },
            get isOpen() { return visible() as boolean; },
        });

        return { visible, tooltipId };
    },
    render: (ctx) => html`
        <div class="pdx-tooltip-float" data-part="root" role="tooltip" :id="${() => ctx.tooltipId}"
            :style="${() => ctx.visible() ? '' : 'display:none'}">
            ${() => ctx.text() || html`<slot></slot>`}
            ${() => ctx.arrow() ? html`<div class="pdx-tooltip-arrow" data-part="arrow"></div>` : ''}
        </div>
    `,
});
