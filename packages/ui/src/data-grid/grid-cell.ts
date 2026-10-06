// Rendering of one data-grid cell — the ONE place (used by grid-body and grid-virtual → no drift).
// Ordine: 1) cell typed (sicuro, textContent) → 2) format (string|fn, HTML sanitizzato) → 3) default per tipo.

import type { AnyColumn } from './grid-context';
import { sanitizeHTML } from '../shared/sanitize';
import { sanitizeUrl, DEV } from '@pdxui/core';
import { openGridMenu } from './grid-menu';
import { t } from './grid-i18n';

/** `pdx-icon` the first time a cell action names an icon: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

// One-time deprecation notice per column when an HTML-string formatter is used (see CellSpec).
const _warnedHtmlFormat = new WeakSet<object>();
// One-time notice per column when `cell` is set to something that is not a known CellSpec.
const _warnedUnknownCell = new WeakSet<object>();

/**
 * `cell: (row) => '…'` is truthy, has no `kind`, and matches no case below: without this the column
 * would fall through to its default in silence. A spec whose kind the grid does not know lands here too, so the message names it.
 */
function warnUnknownCell(col: AnyColumn, cell: unknown): void {
    if (_warnedUnknownCell.has(col.def)) return;
    _warnedUnknownCell.add(col.def);
    const got = typeof cell === 'function'
        ? 'a function'
        : typeof cell === 'object' && cell !== null && 'kind' in cell
            ? `a spec of kind '${String((cell as { kind: unknown }).kind)}'`
            : `${typeof cell === 'object' ? 'an object with no kind' : 'a ' + typeof cell}`;
    if (DEV) console.warn(
        `[pdx-data-grid] column "${(col.def as { field?: string }).field ?? '?'}": cell: got ${got}, which the grid ` +
        `does not render. cell: takes what a cell builder returns — badge(), status(), link(), currency(), ` +
        `dateCell(), booleanIcon(), actions(), rowMenu(). To relabel a value, use format: (value, row) => '…'. ` +
        `The column shows its default rendering instead.`,
    );
}

/**
 * What a badge or a status cell SAYS: the column's `format` when it has a function one, else the
 * value. The tone stays keyed by the value — `tones: { active: 'success' }` — and the label is the
 * reader's: a stored `active` shows «Attivo». Text, never markup: it goes to
 * `textContent`, which is the point of a typed cell.
 */
function cellLabel(raw: string, value: unknown, col: AnyColumn, row: Record<string, unknown>): string {
    const format = (col.def as { format?: unknown }).format;
    if (typeof format !== 'function') return raw;
    const label = (format as (v: unknown, r: Record<string, unknown>) => unknown)(value, row);
    return label == null ? '' : String(label);
}

/**
 * Text in its own element, never a bare node in the cell: `.pdx-dg-td` is a flex container, and in
 * one `text-overflow` does not apply — a long subject would be cut mid-word with no ellipsis and no
 * way to read the rest. The element clips with an ellipsis, and names its whole text in a
 * `title` when, and only when, it is actually cut — measured as the pointer arrives, so a cell that
 * fits carries no tooltip repeating what it already shows.
 */
function textCell(node: Text): HTMLElement {
    const span = document.createElement('span');
    span.className = 'pdx-dg-td-text';
    span.appendChild(node);
    span.addEventListener('pointerenter', fitTitle);
    return span;
}

function fitTitle(this: HTMLElement): void {
    if (this.scrollWidth > this.clientWidth) this.title = this.textContent ?? '';
    else this.removeAttribute('title');
}

export function renderCellNode(value: unknown, col: AnyColumn, row: Record<string, unknown>): Node {
    const node = renderCellContent(value, col, row);
    return node.nodeType === Node.TEXT_NODE ? textCell(node as Text) : node;
}

function renderCellContent(value: unknown, col: AnyColumn, row: Record<string, unknown>): Node {
    // 1. The typed cell contract (preferred, and SAFE: no innerHTML of the value — only built DOM).
    const cell = col.def.cell;
    if (cell) {
        switch (cell.kind) {
            case 'badge': {
                const one = (item: unknown): HTMLElement => {
                    const v = item == null ? '' : String(item);
                    const tone = cell.tone ?? cell.tones?.[v] ?? 'muted';
                    const span = document.createElement('span');
                    span.className = 'pdx-dg-badge pdx-dg-badge-' + tone;
                    span.textContent = cellLabel(v, item, col, row);
                    return span;
                };
                // A LIST of values — a record's categories — is a badge each, toned and labelled by
                // its own value; stringified it would be one grey «a,b».
                if (!Array.isArray(value)) return one(value);
                const list = document.createElement('span');
                list.className = 'pdx-dg-badges';
                for (const item of value) list.appendChild(one(item));
                return list;
            }
            case 'status': {
                const v = value == null ? '' : String(value);
                const tone = cell.tone ?? cell.tones?.[v] ?? 'muted';
                const span = document.createElement('span');
                span.className = 'pdx-dg-status pdx-dg-status-' + tone;
                const dot = document.createElement('span');
                dot.className = 'pdx-dg-status-dot';
                span.appendChild(dot);
                span.appendChild(document.createTextNode(cellLabel(v, value, col, row)));
                return span;
            }
            case 'link': {
                const a = document.createElement('a');
                a.className = 'pdx-dg-link';
                a.href = sanitizeUrl(cell.href(value, row)) ?? '#';
                if (cell.target) { a.target = cell.target; a.rel = 'noopener'; }
                a.textContent = cell.text ? cell.text(value, row) : (value == null ? '' : String(value));
                return a;
            }
            case 'currency': {
                if (value == null) return document.createTextNode('—');
                try {
                    return document.createTextNode(new Intl.NumberFormat(cell.locale, { style: 'currency', currency: cell.currency ?? 'EUR' }).format(Number(value)));
                } catch { return document.createTextNode(String(value)); }
            }
            case 'date': {
                if (value == null) return document.createTextNode('—');
                try {
                    const d = value instanceof Date ? value : new Date(value as string);
                    return document.createTextNode(new Intl.DateTimeFormat(cell.locale, cell.options).format(d));
                } catch { return document.createTextNode(String(value)); }
            }
            case 'boolean-icon': {
                const span = document.createElement('span');
                span.className = value ? 'pdx-dg-bool-true' : 'pdx-dg-bool-false';
                span.textContent = value ? (cell.trueLabel ?? '✓') : (cell.falseLabel ?? '✗');
                return span;
            }
            case 'row-menu': {
                // ONE control, not a row of buttons: `actions()` is right for one or two, and at
                // 390px a row of four is the whole width of the phone. What opens is
                // the grid's own menu — the arrows, type-ahead, Escape back to the trigger and the
                // click outside are the ones the filter's operator menu has.
                const wrap = document.createElement('div');
                wrap.className = 'pdx-dg-actions';
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-dg-action pdx-dg-row-menu-btn';
                const name = (typeof cell.label === 'function' ? cell.label(row) : cell.label) || t('row.actions');
                btn.setAttribute('aria-label', name);
                btn.setAttribute('aria-haspopup', 'menu');
                btn.setAttribute('aria-expanded', 'false');
                loadIcon();
                const ic = document.createElement('pdx-icon');
                ic.setAttribute('name', cell.icon ?? 'more-horizontal');
                btn.appendChild(ic);
                btn.addEventListener('click', (e) => {
                    // The row underneath selects on click: an action of the row is not a vote on it.
                    e.stopPropagation();
                    openGridMenu(btn, cell.items.map((item) => ({
                        label: typeof item.label === 'function' ? item.label(row) : item.label,
                        icon: item.icon,
                        danger: item.danger,
                        href: item.href ? item.href(row) : undefined,
                        target: item.target,
                        disabled: typeof item.disabled === 'function' ? item.disabled(row) : item.disabled,
                        disabledReason: item.disabledReason,
                        select: item.onSelect ? () => item.onSelect!(row) : undefined,
                    })), {
                        label: name,
                        menuClass: 'pdx-dg-row-menu',
                        itemClass: 'pdx-dg-row-menu-item',
                        place: (menu, rect) => {
                            // Right-aligned: this column is the last one, and a menu hung from the
                            // left edge of a 40px button leaves the viewport.
                            const w = menu.offsetWidth || 180;
                            menu.style.left = `${Math.max(4, Math.min(rect.right - w, window.innerWidth - w - 4))}px`;
                            const below = window.innerHeight - rect.bottom;
                            const h = menu.offsetHeight || 0;
                            menu.style.top = below < h + 8 && rect.top > h
                                ? `${rect.top - h - 2}px`
                                : `${rect.bottom + 2}px`;
                        },
                    });
                });
                wrap.appendChild(btn);
                return wrap;
            }
            case 'actions': {
                const wrap = document.createElement('div');
                wrap.className = 'pdx-dg-actions';
                for (const act of cell.actions) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'pdx-dg-action' + (act.tone ? ' pdx-dg-action-' + act.tone : '');
                    // Always give the button an accessible name; icon-only buttons fall back to the icon.
                    const label = typeof act.label === 'function' ? act.label(row) : act.label;
                    const accName = label || act.icon;
                    if (accName) btn.setAttribute('aria-label', accName);
                    if (act.icon) {
                        loadIcon();
                        const ic = document.createElement('pdx-icon');
                        ic.setAttribute('name', act.icon);
                        btn.appendChild(ic);
                    } else if (label) {
                        btn.textContent = label;
                    }
                    btn.addEventListener('click', (e) => { e.stopPropagation(); act.onClick(row); });
                    wrap.appendChild(btn);
                }
                return wrap;
            }
        }
        // Every known kind returned above: this is a cell the grid cannot render. Fall through, as
        // before — but say so.
        warnUnknownCell(col, cell as unknown);
    }

    // 2. format legacy (string pattern o funzione). Se HTML → sanitizzato.
    if (col.def.format) {
        const formatted = typeof col.def.format === 'function'
            ? col.def.format(value, row)
            : String(value ?? '');
        if (typeof formatted === 'string' && formatted.includes('<')) {
            if (DEV && !_warnedHtmlFormat.has(col.def)) {
                _warnedHtmlFormat.add(col.def);
                console.warn(
                    `[pdx-data-grid] column "${(col.def as { field?: string }).field ?? '?'}": an HTML-string ` +
                    `cell formatter is @deprecated. The HTML is sanitized, but a typed cell renderer ` +
                    `(badge/status/link/currency/date/booleanIcon/actions) is safer and generator-friendly.`,
                );
            }
            const wrapper = document.createElement('span');
            wrapper.innerHTML = sanitizeHTML(formatted);
            return wrapper;
        }
        return document.createTextNode(formatted);
    }

    // 3. Default per tipo colonna.
    switch (col.type) {
        case 'boolean': {
            const span = document.createElement('span');
            span.className = value ? 'pdx-dg-bool-true' : 'pdx-dg-bool-false';
            span.textContent = value ? '✓' : '✗';
            return span;
        }
        case 'date': {
            if (value == null) return document.createTextNode('—');
            try {
                const d = value instanceof Date ? value : new Date(value as string);
                return document.createTextNode(d.toLocaleDateString());
            } catch {
                return document.createTextNode(String(value));
            }
        }
        case 'currency': {
            if (value == null) return document.createTextNode('—');
            try {
                return document.createTextNode(new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(Number(value)));
            } catch {
                return document.createTextNode(String(value));
            }
        }
        case 'number': {
            if (value == null) return document.createTextNode('—');
            const n = Number(value);
            return document.createTextNode(Number.isNaN(n) ? String(value) : n.toLocaleString());
        }
        default:
            return document.createTextNode(value != null ? String(value) : '');
    }
}
