// pdx-popover — Thin wrapper over usePopover() headless composable.
// Provides: click/hover/manual trigger, positioning, hover relay, outside click, Escape.
// Uses core primitive for all logic — no reimplementation.

import { component, html } from '@pdxui/core';
import { usePopover, overlayStack, focusFirst } from '@pdxui/core';
import type { PopoverTrigger, PopoverPlacement } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import { anchorControl } from '../shared/anchor-control';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/popover';

let _popoverCounter = 0;

/**
 * A floating panel anchored to a trigger, opened by click, hover or manually, and closed by a click
 * outside or Escape.
 */
component('pdx-popover', {
    props: {
        trigger: { type: String, default: 'click' },
        placement: { type: String, default: 'bottom' },
        /** The dialog's name. Empty: its first heading, else the popover.label component string. */
        ariaLabel: { type: String, default: '' },
        open: { type: Boolean, default: false },
        closeOnOutside: { type: Boolean, default: true },
        closeOnEscape: { type: Boolean, default: true },
        // null, not 8: a numeric default is always passed, and a value that is always passed
        // means `--pdx-float-offset` can never be reached. The sentinel is what makes the
        // token the default and this prop the override.
        offsetPx: { type: Number, default: null },
    },
    setup(ctx) {
        let overlayId = '';
        let popover: ReturnType<typeof usePopover> | null = null;
        const floatId = 'pdx-popover-float-' + (++_popoverCounter);

        function getTrigger(): HTMLElement | null {
            const parent = ctx.el.parentElement;
            if (parent) {
                const explicit = parent.querySelector('[data-pdx-trigger]') as HTMLElement;
                if (explicit) return explicit;
            }
            return ctx.el.previousElementSibling as HTMLElement ?? null;
        }

        const floating = () => ctx.el.querySelector('.pdx-popover-float') as HTMLElement | null;

        /**
         * The dialog's name: the aria-label prop, else its first heading, else the generic string,
         * so not every popover is "Popover".
         */
        function nameDialog(): void {
            const float = floating();
            if (!float) return;
            const own = ctx.ariaLabel() as string;
            const heading = own ? null : float.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]');
            if (heading) {
                if (!heading.id) heading.id = floatId + '-title';
                float.setAttribute('aria-labelledby', heading.id);
                float.removeAttribute('aria-label');
            } else {
                uiAttr(float, 'aria-label', () => own || uiString('popover', 'label'));
                float.removeAttribute('aria-labelledby');
            }
        }

        ctx.track(() => {
            const anchor = getTrigger();
            if (!anchor) return;
            // The relation and the focus go on the control that takes focus: the inner <button> of a
            // pdx-button, not the host.
            const trigger = anchorControl(anchor);
            const triggerMode = ctx.trigger() as PopoverTrigger;
            const shouldBeOpen = ctx.open();

            popover = usePopover({
                trigger: triggerMode,
                placement: ctx.placement() as PopoverPlacement,
                offset: (ctx.offsetPx() as number | null) ?? undefined,
                dismissOnOutside: ctx.closeOnOutside() as boolean,
                dismissOnEscape: ctx.closeOnEscape() as boolean,
                hoverDelay: { open: 0, close: 150 },
                onOpenChange: (open) => {
                    if (open) {
                        overlayId = 'pdx-popover-' + (++_popoverCounter);
                        const zIndex = overlayStack.push(overlayId);
                        const floatingEl = floating();
                        if (floatingEl) floatingEl.style.zIndex = String(zIndex);
                        nameDialog();
                        // Opened by a click: into the dialog, so its content can be reached. It stayed
                        // on the trigger and the next Tab went on down the page. A hover popover keeps
                        // focus where it is.
                        if (triggerMode === 'click') {
                            requestAnimationFrame(() => {
                                const f = floating();
                                if (f && !focusFirst(f)) f.focus();
                            });
                        }
                    } else {
                        if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
                    }
                },
            });

            // Apply ARIA: a dialog pops up, this one, open or not.
            trigger.setAttribute('aria-haspopup', 'dialog');
            trigger.setAttribute('aria-controls', floatId);

            // Sync aria-expanded reactively from popover open state
            const ariaDispose = ctx.track(() => {
                const open = popover!.isOpen();
                trigger.setAttribute('aria-expanded', String(open));
            });

            // A hover popover opens on keyboard focus too, and closes when focus leaves — unless it
            // moved into the popover. It opened on the mouse only.
            const onFocusIn = () => { if (popover && !popover.isOpen()) popover.open(); };
            const onFocusOut = (e: FocusEvent) => {
                const to = e.relatedTarget as Node | null;
                if (to && (floating()?.contains(to) || trigger.contains(to))) return;
                popover?.close();
            };
            if (triggerMode === 'hover') {
                trigger.addEventListener('focusin', onFocusIn);
                trigger.addEventListener('focusout', onFocusOut);
            }

            // Bind trigger and content
            popover.setTrigger(trigger);
            const bindContent = () => {
                const floatingEl = floating();
                if (floatingEl && popover) {
                    popover.setContent(floatingEl);
                    // Manual mode: apply initial open state after content is bound
                    if (triggerMode === 'manual' && shouldBeOpen) {
                        popover.open();
                    }
                }
            };
            if (floating()) bindContent();
            else requestAnimationFrame(bindContent);

            return () => {
                ariaDispose();
                trigger.removeEventListener('focusin', onFocusIn);
                trigger.removeEventListener('focusout', onFocusOut);
                trigger.removeAttribute('aria-haspopup');
                trigger.removeAttribute('aria-expanded');
                trigger.removeAttribute('aria-controls');
                if (popover) { popover.dispose(); popover = null; }
                if (overlayId) { overlayStack.pop(overlayId); overlayId = ''; }
            };
        });

        // Named with or without a trigger (a popover opened by show() has none): once the slot is
        // projected, after setup, and again on each open.
        ctx.track(() => {
            void ctx.ariaLabel();
            nameDialog();
            requestAnimationFrame(nameDialog);
        });

        // Manual mode: react to open prop changes AFTER initial setup
        ctx.track(() => {
            if (ctx.trigger() !== 'manual') return;
            const shouldOpen = ctx.open();
            // Defer to next microtask so the first track() has time to create popover
            queueMicrotask(() => {
                if (!popover) return;
                if (shouldOpen && !popover.isOpen()) popover.open();
                else if (!shouldOpen && popover.isOpen()) popover.close();
            });
        });

        // Imperative API: el.show() / el.hide() / el.toggle() / el.isOpen
        ctx.expose({
            show() { popover?.open(); },
            hide() { popover?.close(); },
            toggle() { popover?.isOpen() ? popover.close() : popover?.open(); },
            get isOpen() { return popover?.isOpen() ?? false; },
        });

        return {
            isOpen: () => popover?.isOpen() ?? false,
            hide: () => popover?.close(),
            floatId,
        };
    },
    render: (ctx) => html`
        <div class="pdx-popover-float" role="dialog" tabindex="-1" :id="${() => ctx.floatId}"
            :style="${() => ctx.isOpen() ? '' : 'display:none'}">
            <slot></slot>
        </div>
    `,
});
