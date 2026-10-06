// pdx-accordion — Expandable sections with animated height.
// Covers both single collapsible and multi-item accordion.
// Uses focusGroup for keyboard nav between triggers.
// mode="single" (one open at a time) or mode="multiple" (free).

import { component, html, focusGroup } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/accordion';

let _accCounter = 0;

/**
 * Expandable sections with animated height, opened one at a time or several together, and navigated
 * with the arrow keys, Home and End.
 */
component('pdx-accordion', {
    props: {
        /** "single" = one open at a time (default), "multiple" = any number open */
        mode: { type: String, default: 'single' },
        /** Disable all items */
        disabled: { type: Boolean, default: false },
        /** Show loading state */
        loading: { type: Boolean, default: false },
    },
    setup(ctx) {
        let focusGroupDispose: Dispose | null = null;
        // Generated ids carry a per-instance uid: an index inside ONE accordion alone would repeat
        // in a second accordion on the page, and its aria-controls would point into the first.
        // `seq` numbers items as they are wired, not by
        // position, so an item added later cannot reuse an id either.
        const uid = 'pdx-acc-' + (++_accCounter);
        let seq = 0;
        const wired = new WeakSet<HTMLElement>();

        function getItems(): HTMLElement[] {
            return Array.from(ctx.el.querySelectorAll('[data-accordion-item]'));
        }

        function isItemOpen(item: HTMLElement): boolean {
            return item.hasAttribute('data-open');
        }

        function isItemDisabled(item: HTMLElement): boolean {
            return (ctx.disabled() as boolean) || item.hasAttribute('data-disabled');
        }

        /**
         * A disabled item's trigger says so: `aria-disabled="true"`, removed when it is enabled again.
         * It stays focusable, as the APG accordion keeps a disabled header discoverable — the arrow
         * keys reach it, and it announces why Enter does nothing. Without aria-disabled it would read
         * as an ordinary collapsed button.
         */
        function syncDisabled(item: HTMLElement): void {
            const trigger = item.querySelector('[data-accordion-trigger]');
            if (!trigger) return;
            if (isItemDisabled(item)) trigger.setAttribute('aria-disabled', 'true');
            else trigger.removeAttribute('aria-disabled');
        }

        // height + vertical padding are animated TOGETHER. The content has CSS padding
        // (var(--pdx-space-sm/md)); with box-sizing:border-box, height:0 clamps to that padding
        // height (~28px), so the visual collapse finished early at that "floor" and then snapped
        // to display:none only when the 250ms timer elapsed ("it does part of it and then jumps", translated). Animating
        // the padding to 0 too lets the content collapse to a TRUE zero, in sync with transitionend.
        const ANIM = 'height 0.25s ease, padding-top 0.25s ease, padding-bottom 0.25s ease';

        function animateOpen(content: HTMLElement) {
            content.style.display = 'block';
            content.style.overflow = 'hidden';
            // Measure the natural full height (with CSS padding) before collapsing.
            content.style.height = '';
            content.style.paddingTop = '';
            content.style.paddingBottom = '';
            const cs = getComputedStyle(content);
            const padTop = cs.paddingTop;
            const padBottom = cs.paddingBottom;
            const targetH = content.scrollHeight;
            // Collapse to true zero (height + vertical padding).
            content.style.height = '0px';
            content.style.paddingTop = '0px';
            content.style.paddingBottom = '0px';
            content.style.transition = ANIM;
            // double rAF so the browser commits the collapsed state before transitioning to target.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                content.style.height = targetH + 'px';
                content.style.paddingTop = padTop;
                content.style.paddingBottom = padBottom;
            }));
            const onEnd = (e: TransitionEvent) => {
                // transitionend BUBBLES — ignore a child's transition (e.g. a button), which would
                // otherwise reset height mid-animation. Settle on the height end (padding ends with it).
                if (e.target !== content || e.propertyName !== 'height') return;
                content.style.height = '';
                content.style.overflow = '';
                content.style.transition = '';
                content.style.paddingTop = '';
                content.style.paddingBottom = '';
                content.removeEventListener('transitionend', onEnd as EventListener);
            };
            content.addEventListener('transitionend', onEnd as EventListener);
        }

        function animateClose(content: HTMLElement) {
            const cs = getComputedStyle(content);
            const padTop = cs.paddingTop;
            const padBottom = cs.paddingBottom;
            const currentH = content.scrollHeight;
            content.style.overflow = 'hidden';
            content.style.height = currentH + 'px';
            content.style.paddingTop = padTop;
            content.style.paddingBottom = padBottom;
            content.style.transition = ANIM;
            requestAnimationFrame(() => requestAnimationFrame(() => {
                content.style.height = '0px';
                content.style.paddingTop = '0px';
                content.style.paddingBottom = '0px';
            }));
            const onEnd = (e: TransitionEvent) => {
                if (e.target !== content || e.propertyName !== 'height') return;
                content.style.display = 'none';
                content.style.height = '';
                content.style.overflow = '';
                content.style.transition = '';
                content.style.paddingTop = '';
                content.style.paddingBottom = '';
                content.removeEventListener('transitionend', onEnd as EventListener);
            };
            content.addEventListener('transitionend', onEnd as EventListener);
        }

        function toggle(item: HTMLElement) {
            if (isItemDisabled(item)) return;
            const content = item.querySelector('[data-accordion-content]') as HTMLElement;
            if (!content) return;
            const trigger = item.querySelector('[data-accordion-trigger]') as HTMLElement;
            const wasOpen = isItemOpen(item);

            if (wasOpen) {
                item.removeAttribute('data-open');
                if (trigger) trigger.setAttribute('aria-expanded', 'false');
                animateClose(content);
            } else {
                // Single mode: close others first
                if ((ctx.mode() as string) === 'single') {
                    for (const other of getItems()) {
                        if (other !== item && isItemOpen(other)) {
                            other.removeAttribute('data-open');
                            const otherTrigger = other.querySelector('[data-accordion-trigger]') as HTMLElement;
                            if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
                            const otherContent = other.querySelector('[data-accordion-content]') as HTMLElement;
                            if (otherContent) animateClose(otherContent);
                        }
                    }
                }
                item.setAttribute('data-open', '');
                if (trigger) trigger.setAttribute('aria-expanded', 'true');
                animateOpen(content);
            }

            ctx.emit('pdx-change', { open: !wasOpen });
        }

        /** ARIA links, roles and the closed state of one item — once per item, whenever it arrives. */
        function wireItem(item: HTMLElement) {
            if (wired.has(item)) return;
            const trigger = item.querySelector('[data-accordion-trigger]') as HTMLElement | null;
            const content = item.querySelector('[data-accordion-content]') as HTMLElement | null;
            if (!content) return; // its content may still be on the way: the next mutation retries
            wired.add(item);

            const n = ++seq;
            const contentId = content.id || `${uid}-content-${n}`;
            const triggerId = trigger?.id || `${uid}-trigger-${n}`;
            content.id = contentId;
            if (trigger) {
                trigger.id = triggerId;
                trigger.setAttribute('aria-controls', contentId);
                trigger.setAttribute('aria-expanded', String(isItemOpen(item)));
                if (!trigger.getAttribute('role')) trigger.setAttribute('role', 'button');
                // One tab stop: focusGroup gives tabindex 0 to one trigger and -1 to the rest, but
                // only to the triggers it saw at start. A trigger arriving later joins at -1.
                if (!trigger.getAttribute('tabindex')) trigger.setAttribute('tabindex', hasTabStop(trigger) ? '-1' : '0');
            }
            content.setAttribute('role', 'region');
            content.setAttribute('aria-labelledby', triggerId);
            syncDisabled(item);

            if (!isItemOpen(item)) {
                content.style.display = 'none';
            }
        }

        function hasTabStop(except: HTMLElement): boolean {
            return Array.from(ctx.el.querySelectorAll('[data-accordion-trigger]'))
                .some(t => t !== except && t.getAttribute('tabindex') === '0');
        }

        function onClick(e: MouseEvent) {
            const trigger = (e.target as HTMLElement).closest('[data-accordion-trigger]') as HTMLElement;
            if (!trigger) return;
            const item = trigger.closest('[data-accordion-item]') as HTMLElement;
            if (item) toggle(item);
        }

        ctx.track(() => {
            const el = ctx.el;

            if (ctx.loading()) el.setAttribute('aria-busy', 'true');
            else el.removeAttribute('aria-busy');

            el.addEventListener('click', onClick);

            // focusGroup for arrow key navigation between triggers
            if (focusGroupDispose) focusGroupDispose();
            focusGroupDispose = focusGroup(el, {
                selector: '[data-accordion-trigger]',
                orientation: 'vertical',
                wrap: true,
                // A disabled header stays in the arrow-key order and announces itself (aria-disabled),
                // as in the APG accordion; toggle() ignores it. focusGroup would skip it.
                skipDisabled: false,
                onSelect: (triggerEl) => {
                    const item = triggerEl.closest('[data-accordion-item]') as HTMLElement;
                    if (item) toggle(item);
                },
            });

            // Initialize: set ARIA, hide closed content
            requestAnimationFrame(() => getItems().forEach(wireItem));

            // Items added later (history that arrives on scroll) are wired too: the init above
            // runs once, and without this they would get no id, no aria-expanded and no region, and
            // stay visible while closed. Subtree, because items may sit inside a wrapper — getItems()
            // finds them by selector at any depth.
            const observer = new MutationObserver((records) => {
                if (records.some(r => [...r.addedNodes].some(n => n.nodeType === Node.ELEMENT_NODE))) {
                    getItems().forEach(wireItem);
                }
                // An item's own data-disabled, set or removed after it was wired.
                for (const r of records) {
                    if (r.type === 'attributes' && (r.target as HTMLElement).hasAttribute('data-accordion-item')) {
                        syncDisabled(r.target as HTMLElement);
                    }
                }
            });
            observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-disabled'] });

            return () => {
                el.removeEventListener('click', onClick);
                observer.disconnect();
                if (focusGroupDispose) { focusGroupDispose(); focusGroupDispose = null; }
            };
        });

        // The accordion's own `disabled` reaches every trigger, both ways. Read here, synchronously, so
        // the track subscribes; the items may not be wired yet, which wireItem covers.
        ctx.track(() => {
            void ctx.disabled();
            getItems().forEach(syncDisabled);
        });

        // Imperative API: el.expand(id)/collapse(id)/toggle(id) (id = data-accordion-item o indice) + expandAll/collapseAll
        const toggleItem = toggle;
        const resolveItem = (idOrIndex: string | number): HTMLElement | undefined => {
            const items = getItems();
            if (typeof idOrIndex === 'number') return items[idOrIndex];
            return items.find(it => it.getAttribute('data-accordion-item') === String(idOrIndex)) ?? items[Number(idOrIndex)];
        };
        ctx.expose({
            /** Open the item, by id or index. No-op if it is already open, disabled, or not found. */
            expand(id: string | number) { const it = resolveItem(id); if (it && !isItemOpen(it)) toggleItem(it); },
            /** Close the item, by id or index. No-op if it is already closed, disabled, or not found. */
            collapse(id: string | number) { const it = resolveItem(id); if (it && isItemOpen(it)) toggleItem(it); },
            /** Open the item if closed, close it if open. No-op if disabled or not found. */
            toggle(id: string | number) { const it = resolveItem(id); if (it) toggleItem(it); },
            /** Open every item — but under `mode="single"` each one closes the previous, so only the last stays open. */
            expandAll() { for (const it of getItems()) if (!isItemOpen(it)) toggleItem(it); },
            /** Close every item. */
            collapseAll() { for (const it of getItems()) if (isItemOpen(it)) toggleItem(it); },
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
