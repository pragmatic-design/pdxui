// What pdx-data-grid keeps once per module, not once per grid: a .pdx script is the component's setup,
// which runs for each instance (#1210). The scrollbar's width is measured once, a grid is told once
// that its rowHeight does nothing, and the empty state's default icon is in the grid's chunk.

import { DEV } from '@pdxui/core';
import { defineIcons } from '../icon/icon-map';
import iconInbox from '../icon/pragmatic/inbox';

// Measured once: width the OS reserves for a classic scrollbar (0 on overlay-scrollbar systems).
// Used in fill mode to reserve the same gutter on the header/filter row as the body's vertical
// scrollbar consumes, so columns stay aligned.
let _scrollbarWidth = -1;
export function scrollbarWidth(): number {
    if (_scrollbarWidth >= 0) return _scrollbarWidth;
    const outer = document.createElement('div');
    outer.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
    document.body.appendChild(outer);
    _scrollbarWidth = outer.offsetWidth - outer.clientWidth;
    outer.remove();
    return _scrollbarWidth;
}

/** Grids already told that their rowHeight does nothing: once per element, not once per rebuild. */
const _warnedRowHeight = new WeakSet<Element>();

/** Whether a node shows anything: an element, or text that is not only whitespace. Comments do not. */
function showsSomething(node: Node): boolean {
    if (node.nodeType === Node.ELEMENT_NODE) return true;
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').trim() !== '';
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) return [...node.childNodes].some(showsSomething);
    return false;
}

/**
 * What a snippet drew, or null when it drew nothing (#597). One `cell(row, column)` snippet serves
 * every column, and a page's `@if (column.field === 'price') { … }` renders an empty fragment for the
 * others — those columns are the grid's to draw, as if no snippet had been given.
 */
export function drawn(node: Node | null | undefined): Node | null {
    return node && showsSomething(node) ? node : null;
}

/**
 * rowHeight places rows by number, which is what virtualisation needs; a content grid sizes its rows
 * by what they hold and should not clip them. So without virtualScroll it does nothing — and says so,
 * rather than being ignored in silence.
 */
export function warnRowHeightIgnored(el: Element): void {
    if (!DEV || _warnedRowHeight.has(el)) return;
    _warnedRowHeight.add(el);
    console.warn(
        '[pdx-data-grid] rowHeight is set, but it applies only with virtualScroll: a plain grid sizes ' +
        'its rows by their content. Add virtual-scroll, or remove row-height.',
    );
}

/** The empty state's default icon, in the grid's chunk (#47): defined when the empty state is drawn. */
export function defineEmptyIcon(): void {
    defineIcons({ inbox: iconInbox });
}
