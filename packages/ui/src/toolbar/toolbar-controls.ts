// pdx-toolbar's controls: which of its descendants are stops, and which keep the navigation keys.
// Pure, beside the component: a .pdx script runs at every mount, and these are fixed.

import { anchorControl } from '../shared/anchor-control';

/** Marks a control the toolbar found, so it is still found once its tabindex is -1. */
export const CONTROL = 'data-pdx-toolbar-control';
const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';
/** Text entry: every navigation key is its own (caret, Enter, Space). */
export const TEXT = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
/** Composite widgets that navigate with the arrows themselves. */
export const COMPOSITE = '[role="slider"], [role="spinbutton"], [role="listbox"], [role="tree"], [role="grid"], [role="menu"], [role="radiogroup"], [role="tablist"]';
export const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter', ' ']);

/**
 * The toolbar's controls, in order: a focusable element, or the control inside a component (the
 * `<button>` of a pdx-button, the trigger of a pdx-select). A component is not searched beyond its
 * control, so a select's clear button or dropdown is never one of the toolbar's stops.
 */
export function findControls(root: HTMLElement): HTMLElement[] {
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

export const isDisabled = (el: HTMLElement): boolean => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
