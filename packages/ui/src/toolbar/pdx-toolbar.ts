// pdx-toolbar — Horizontal toolbar with buttons, separators, groups, spacer.
// One tab stop: the arrow keys (and Home/End) move between its controls, as the WAI-ARIA toolbar
// pattern asks. A control that uses those keys itself — a text field, a select — keeps them.

import { component, html, focusGroup, DEV } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import { anchorControl } from '../shared/anchor-control';
import { hasAccessibleName } from '../shared/accessible-name';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/toolbar';

/** Marks a control the toolbar found, so it is still found once its tabindex is -1. */
const CONTROL = 'data-pdx-toolbar-control';
const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';
/** Text entry: every navigation key is its own (caret, Enter, Space). */
const TEXT = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
/** Composite widgets that navigate with the arrows themselves. */
const COMPOSITE = '[role="slider"], [role="spinbutton"], [role="listbox"], [role="tree"], [role="grid"], [role="menu"], [role="radiogroup"], [role="tablist"]';
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ']);

/**
 * The toolbar's controls, in order: a focusable element, or the control inside a component (the
 * `<button>` of a pdx-button, the trigger of a pdx-select). A component is not searched beyond its
 * control, so a select's clear button or dropdown is never one of the toolbar's stops.
 */
function findControls(root: HTMLElement): HTMLElement[] {
    const found: HTMLElement[] = [];
    const visit = (parent: Element): void => {
        for (const child of Array.from(parent.children) as HTMLElement[]) {
            if (child.hasAttribute(CONTROL)) { found.push(child); continue; }
            if (child.tagName.includes('-')) {
                const known = child.querySelector<HTMLElement>(`[${CONTROL}]`);
                const control = known ?? anchorControl(child);
                if (control !== child || child.matches(FOCUSABLE)) {
                    control.setAttribute(CONTROL, '');
                    found.push(control);
                }
                continue;
            }
            if (child.matches(FOCUSABLE)) {
                child.setAttribute(CONTROL, '');
                found.push(child);
                continue;
            }
            visit(child);
        }
    };
    visit(root);
    return found;
}

const isDisabled = (el: HTMLElement): boolean => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

/**
 * A toolbar of buttons, separators, groups and spacers that is one tab stop: the arrow keys, Home
 * and End move between its controls.
 */
component('pdx-toolbar', {
    props: {
        /** Compact mode (less padding) */
        compact: { type: Boolean, default: false },
        /** Show border */
        bordered: { type: Boolean, default: false },
        /** Vertical orientation: ↑/↓ move between the controls instead of ←/→ */
        vertical: { type: Boolean, default: false },
        /** The toolbar's accessible name ("Text formatting"). Empty: the toolbar.label component string. */
        label: { type: String, default: '' },
    },
    setup(ctx) {
        ctx.track(() => {
            const compact = ctx.compact() as boolean;
            const bordered = ctx.bordered() as boolean;
            const vertical = ctx.vertical() as boolean;
            const label = ctx.label() as string;

            requestAnimationFrame(() => {
                ctx.el.classList.add('pdx-toolbar');
                ctx.el.classList.toggle('pdx-toolbar-compact', compact);
                ctx.el.classList.toggle('pdx-toolbar-bordered', bordered);
                ctx.el.classList.toggle('pdx-toolbar-vertical', vertical);
                ctx.el.setAttribute('role', 'toolbar');
                uiAttr(ctx.el, 'aria-label', () => label || uiString('toolbar', 'label'));
                if (vertical) ctx.el.setAttribute('aria-orientation', 'vertical');
                else ctx.el.removeAttribute('aria-orientation');
            });
        });

        // ── One tab stop ──
        // The toolbar is one tab stop and the arrows move inside it, not a tab stop per control.
        /** The roving tab stop: `stop` takes it, every other control gives it up. */
        function setStop(controls: HTMLElement[], stop: HTMLElement): void {
            for (const c of controls) c.setAttribute('tabindex', c === stop ? '0' : '-1');
        }

        /** Find the controls (new ones too) and keep exactly one tab stop among them. */
        function refresh(): HTMLElement[] {
            const controls = findControls(ctx.el);
            const enabled = controls.filter(c => !isDisabled(c));
            const current = enabled.find(c => c.getAttribute('tabindex') === '0');
            const stop = current ?? enabled[0];
            if (stop) setStop(controls, stop);
            return controls;
        }

        /**
         * A key the focused control handles itself does not move the toolbar: it was already handled
         * (`defaultPrevented` — a select opening on Enter would otherwise be clicked shut), or the
         * control is text entry, or a widget that navigates with the arrows. ←/→ still leave a
         * select-only combobox, which has no use for them. Registered before focusGroup's listener,
         * so stopping here keeps the event from it.
         */
        function guard(e: KeyboardEvent): void {
            if (!NAV_KEYS.has(e.key)) return;
            const target = e.target as HTMLElement;
            const inside = (sel: string): boolean => {
                const hit = target.closest?.(sel);
                return !!hit && ctx.el.contains(hit);
            };
            const across = ctx.vertical() ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
            const combobox = inside('[role="combobox"]') && !across.includes(e.key);
            if (e.defaultPrevented || inside(TEXT) || inside(COMPOSITE) || combobox) e.stopImmediatePropagation();
        }

        /** The control that takes focus — by click, Tab or code — is the one Tab comes back to. */
        function onFocusIn(e: FocusEvent): void {
            const controls = findControls(ctx.el);
            const hit = controls.find(c => c === e.target || c.contains(e.target as Node));
            if (hit) setStop(controls, hit);
        }

        ctx.track(() => {
            const vertical = ctx.vertical() as boolean;
            let disposeGroup: (() => void) | null = null;
            let observer: MutationObserver | null = null;
            let alive = true;
            ctx.el.addEventListener('keydown', guard);
            ctx.el.addEventListener('focusin', onFocusIn);
            // After the first frame: the controls of the components inside are rendered by then.
            ctx.frame(() => {
                if (!alive) return;
                const controls = refresh();
                disposeGroup = focusGroup(ctx.el, {
                    selector: `[${CONTROL}]`,
                    orientation: vertical ? 'vertical' : 'horizontal',
                    wrap: true,
                });
                observer = new MutationObserver(() => { refresh(); });
                observer.observe(ctx.el, { childList: true, subtree: true });
                // An icon-only button with no name renders fine and is announced "button": say so
                // once per toolbar. The site's third demo had seven.
                const unnamed = controls.filter(c => c.matches('button, a[href], [role="button"]') && !hasAccessibleName(c));
                if (DEV && unnamed.length) {
                    console.warn(`[pdx-toolbar] ${unnamed.length} control(s) with no accessible name are announced "button" alone: `
                        + `give each an aria-label (pdx-button: aria-label or label). ${ctx.el.outerHTML.slice(0, 120)}`);
                }
            });
            return () => {
                alive = false;
                ctx.el.removeEventListener('keydown', guard);
                ctx.el.removeEventListener('focusin', onFocusIn);
                disposeGroup?.();
                observer?.disconnect();
            };
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
