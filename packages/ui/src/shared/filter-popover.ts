// Shared filter condition popover — reusable by grid, filter-builder, and any component.
// Builds a dual-condition editor (operator + value + AND/OR + 2nd condition + Apply/Clear).

import type { FilterOperator, FilterDescriptor, CompositeFilter, FilterOptionsLoader } from '@pdxui/core';
import { opsForType, RELATIVE_DATE_OPS } from '@pdxui/core';
import type { FieldType } from '@pdxui/core';
import { uiString } from './i18n';

/** Operators that take NO value input: empties + relative-date presets. */
const NO_VALUE_OPS = new Set<string>(['isnull', 'isnotnull', ...RELATIVE_DATE_OPS]);
const isNoValueOp = (op: FilterOperator) => NO_VALUE_OPS.has(op);

// ─── Types ─────────────────────────────────────────────────

export interface FilterFieldInfo {
    field: string;
    label: string;
    type: FieldType;
    operators?: FilterOperator[];
    options?: { label: string; value: unknown }[];
    /** Enum/lookup: allow multiple selected values (operator `in`/`notin`). */
    multiple?: boolean;
    /** Enum/lookup: type-to-search in the value editor. */
    searchable?: boolean;
    /** Enum/lookup: load options on demand (server-side autocomplete). */
    optionsSource?: FilterOptionsLoader;
    /** Set/Excel filter: searchable checklist of distinct values (+ select-all). */
    setFilter?: boolean;
}

/** Sentinel value for the "(Blanks)" set-filter option → coerced to null on apply. */
export const FILTER_BLANK = '__pdx_blank__';

export interface FilterConditionState {
    op1: FilterOperator;
    val1: string;
    logic: 'and' | 'or';
    op2: FilterOperator;
    val2: string;
}

export interface OperatorOption {
    value: FilterOperator;
    label: string;
}

export interface FilterPopoverCallbacks {
    onApply: (state: FilterConditionState) => void;
    onClear: () => void;
    /** Closed without Apply or Clear: Escape, a click outside, a scroll. */
    onClose: () => void;
}

/** Where focus returns. A function is asked at close: the grid rebuilds its header, and the funnel
 *  that opened the popover may be a new element by then. */
export type FilterPopoverOpener = HTMLElement | null | (() => HTMLElement | null);

export interface FilterPopoverOptions {
    /** Where focus returns on Escape, and after Apply/Clear when the caller did not move it. Default:
     *  the anchor when it is an element, else what had focus at open. */
    opener?: FilterPopoverOpener;
}

/** The first control a keyboard user can reach inside `root`. */
function firstFocusable(root: HTMLElement): HTMLElement | null {
    return root.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
}

/**
 * The popover is a dialog: named, Escape closes it, and focus goes in on open and back to the opener
 * on close, so after Apply focus does not fall to <body>. Shared by the grid and the filter builder, so both get it.
 */
export function makeFilterDialog(popover: HTMLElement, label: string, opener: FilterPopoverOpener, dismiss: () => void): {
    /** Run a close; focus goes back to the opener if it was inside and the caller left it nowhere. */
    closing: (close: () => void) => void;
} {
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', label);
    popover.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // A control inside (pdx-select's list) stops its own Escape; one that reaches here closes
        // the popover, and goes no further — not to the overlay stack, not to a dialog behind.
        e.preventDefault();
        e.stopPropagation();
        dismiss();
    });
    // Focus in, once the content has rendered: a field that focuses its own value input keeps it.
    requestAnimationFrame(() => {
        if (popover.isConnected && !popover.contains(document.activeElement)) firstFocusable(popover)?.focus();
    });
    return {
        closing(close) {
            const inside = popover.contains(document.activeElement);
            close();
            const lost = !document.activeElement || document.activeElement === document.body;
            const back = typeof opener === 'function' ? opener() : opener;
            if (inside && lost && back?.isConnected) back.focus();
        },
    };
}

// ─── Operator labels ───────────────────────────────────────

const OP_LABELS: Record<string, string> = {
    contains: 'Contains', eq: 'Equals', neq: 'Not equals',
    startswith: 'Starts with', endswith: 'Ends with',
    gt: 'Greater than', gte: 'Greater or equal',
    lt: 'Less than', lte: 'Less or equal',
    isnull: 'Is empty', isnotnull: 'Is not empty', in: 'In', notin: 'Not in',
    between: 'Between',
    today: 'Today', yesterday: 'Yesterday', thisweek: 'This week',
    thismonth: 'This month', thisyear: 'This year',
    last7days: 'Last 7 days', last30days: 'Last 30 days',
};

// Date fields read better with temporal labels for the comparison operators.
const DATE_OP_LABELS: Record<string, string> = {
    eq: 'On', neq: 'Not on',
    gt: 'After', gte: 'On or after',
    lt: 'Before', lte: 'On or before',
};

export function getOpLabel(op: FilterOperator, type?: string): string {
    if (type === 'date' && DATE_OP_LABELS[op]) return DATE_OP_LABELS[op];
    return OP_LABELS[op] || op;
}

/** Get operators for a field. */
export function getFieldOperators(field: FilterFieldInfo): OperatorOption[] {
    const ops = field.operators ?? opsForType(field.type);
    return ops.map(op => ({ value: op, label: getOpLabel(op, field.type) }));
}

/** Create empty state for a field. */
export function createEmptyState(field: FilterFieldInfo): FilterConditionState {
    const ops = field.operators ?? opsForType(field.type);
    const defaultOp = ops[0] ?? 'contains';
    return { op1: defaultOp, val1: '', logic: 'and', op2: defaultOp, val2: '' };
}

// ─── Build condition row (operator + value input) ──────────

interface ConditionRow {
    el: HTMLElement;
    commit: () => void;
}

function buildConditionRow(
    operators: OperatorOption[],
    currentOp: FilterOperator,
    currentVal: string,
    colType: string,
    onChange: (op: FilterOperator, val: string) => void,
    autoFocus = false,
    onEnter?: () => void,
): ConditionRow {
    const row = document.createElement('div');
    row.className = 'pdx-dg-fp-condition';

    const opSelect = document.createElement('pdx-select') as any;
    opSelect.size = 'sm';
    opSelect.style.flex = '1';
    opSelect.style.minWidth = '0';
    requestAnimationFrame(() => {
        opSelect.options = operators.map(op => ({ label: op.label, value: op.value }));
        opSelect.value = currentOp;
    });
    row.appendChild(opSelect);

    const isNullOpf = isNoValueOp; // empties + relative-date presets → no value input
    const isBetween = (op: FilterOperator) => op === 'between';

    // Factory for a value input of the right kind for this column type.
    const mkInput = (placeholder: string): any => {
        let el: any;
        if (colType === 'number' || colType === 'currency') {
            el = document.createElement('pdx-number-input');
            el.controls = 'none';
        } else if (colType === 'date') {
            el = document.createElement('pdx-date-picker');
        } else {
            el = document.createElement('pdx-input');
        }
        el.size = 'sm';
        el.placeholder = placeholder;
        el.style.flex = '1';
        el.style.minWidth = '0';
        return el;
    };
    const setVal = (el: any, v: string) => {
        if (!v || v === '__null__') { if (colType === 'number' || colType === 'currency') el.value = null; return; }
        el.value = (colType === 'number' || colType === 'currency') ? Number(v) : v;
    };

    // between stores two bounds as "min|max"; other ops use a single value.
    const parts = isBetween(currentOp) ? String(currentVal ?? '').split('|') : [currentVal];
    // The value input's placeholder follows the operator: a range's lower bound, a date, or a value.
    const valuePlaceholder = (op: FilterOperator): string =>
        uiString('shared', isBetween(op) ? 'from' : colType === 'date' ? 'date' : 'value');
    const valueEl = mkInput(valuePlaceholder(currentOp));
    const valueEl2 = mkInput(uiString('shared', 'to'));
    requestAnimationFrame(() => { setVal(valueEl, parts[0] ?? ''); setVal(valueEl2, parts[1] ?? ''); });
    if (isNullOpf(currentOp)) valueEl.style.display = 'none';
    valueEl2.style.display = isBetween(currentOp) ? '' : 'none';
    row.appendChild(valueEl);
    row.appendChild(valueEl2);

    // Track current operator via event (CE .value is unreliable for pdx-select)
    let trackedOp: FilterOperator = currentOp;
    const readOp = () => trackedOp;
    const readOne = (el: any): string => {
        const inner = el.querySelector?.('input') ?? el;
        return inner.value != null ? String(inner.value) : '';
    };
    // between → "min|max"; null ops → sentinel; else single value.
    const readVal = () => {
        if (isNullOpf(trackedOp)) return '__null__';
        if (isBetween(trackedOp)) return `${readOne(valueEl)}|${readOne(valueEl2)}`;
        return readOne(valueEl);
    };

    opSelect.addEventListener('pdx-change', (e: any) => {
        const op = (e.detail?.value ?? currentOp) as FilterOperator;
        trackedOp = op;
        valueEl.style.display = isNullOpf(op) ? 'none' : '';
        valueEl2.style.display = isBetween(op) ? '' : 'none';
        valueEl.placeholder = valuePlaceholder(op);
        onChange(op, readVal());
    });

    const onValueChange = () => onChange(readOp(), readVal());
    for (const el of [valueEl, valueEl2]) {
        el.addEventListener('pdx-input', onValueChange);
        el.addEventListener('pdx-change', onValueChange);
    }

    // Enter key → apply filter
    if (onEnter) {
        for (const el of [valueEl, valueEl2]) {
            const inner = el.querySelector?.('input') ?? el;
            (inner as HTMLElement).addEventListener('keydown', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); onEnter(); }
            });
            el.addEventListener('keydown', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); onEnter(); }
            });
        }
    }

    if (autoFocus) {
        requestAnimationFrame(() => {
            if (!isNullOpf(trackedOp)) (valueEl.querySelector?.('input') ?? valueEl).focus?.();
        });
    }

    function commit() { onChange(readOp(), readVal()); }

    return { el: row, commit };
}

// ─── Build full filter popover content ─────────────────────

/** Build the dual-condition filter content inside a container element.
 *  Returns nothing — appends DOM to `container`. */
export function buildFilterPopoverContent(
    container: HTMLElement,
    field: FilterFieldInfo,
    state: FilterConditionState,
    callbacks: FilterPopoverCallbacks,
): void {
    const operators = getFieldOperators(field);

    // Title
    const title = document.createElement('div');
    title.className = 'pdx-dg-fp-title';
    title.textContent = field.label;
    container.appendChild(title);

    // Enum/lookup filter — checkbox list (static options), searchable select (server-side optionsSource),
    // or set/excel checklist. buildEnumContent routes between them; it must run whenever ANY of these is
    // configured, not only for static `options` (otherwise an optionsSource-only field falls back to a text box).
    if ((field.options && field.options.length > 0) || field.optionsSource || field.setFilter) {
        buildEnumContent(container, field, state, callbacks);
        return;
    }

    // Second condition area (hidden by default)
    let cond2: { el: HTMLElement; commit: () => void } | null = null;
    const cond2Container = document.createElement('div');
    cond2Container.style.display = 'none';

    // Apply helper
    const doApply = () => {
        cond1.commit();
        if (cond2) cond2.commit();
        // Clear cond2 state if hidden
        if (cond2Container.style.display === 'none') {
            state.op2 = operators[0]?.value ?? 'contains';
            state.val2 = '';
        }
        callbacks.onApply(state);
    };

    // Condition 1
    const cond1 = buildConditionRow(operators, state.op1, state.val1, field.type, (op, val) => {
        state.op1 = op; state.val1 = val;
    }, true, doApply);
    container.appendChild(cond1.el);

    // "+ Add condition" button (shows cond2 + AND/OR)
    const hasExistingCond2 = state.val2 && state.val2 !== '';
    const addCondBtn = document.createElement('button');
    addCondBtn.className = 'pdx-dg-fp-add-cond';
    addCondBtn.type = 'button';
    addCondBtn.textContent = uiString('shared', 'addCondition');
    addCondBtn.style.display = hasExistingCond2 ? 'none' : '';
    addCondBtn.addEventListener('click', () => {
        addCondBtn.style.display = 'none';
        cond2Container.style.display = '';
    });
    container.appendChild(addCondBtn);

    // AND/OR toggle + Condition 2 (in cond2Container)
    const logicRow = document.createElement('div');
    logicRow.className = 'pdx-dg-fp-logic';
    const andBtn = document.createElement('button');
    andBtn.className = 'pdx-dg-fp-logic-btn' + (state.logic === 'and' ? ' active' : '');
    andBtn.textContent = uiString('shared', 'and');
    andBtn.addEventListener('click', () => { state.logic = 'and'; andBtn.classList.add('active'); orBtn.classList.remove('active'); });
    const orBtn = document.createElement('button');
    orBtn.className = 'pdx-dg-fp-logic-btn' + (state.logic === 'or' ? ' active' : '');
    orBtn.textContent = uiString('shared', 'or');
    orBtn.addEventListener('click', () => { state.logic = 'or'; orBtn.classList.add('active'); andBtn.classList.remove('active'); });
    logicRow.appendChild(andBtn);
    logicRow.appendChild(orBtn);
    cond2Container.appendChild(logicRow);

    cond2 = buildConditionRow(operators, state.op2, state.val2, field.type, (op, val) => {
        state.op2 = op; state.val2 = val;
    }, false, doApply);
    cond2Container.appendChild(cond2.el);

    // Remove condition 2 button
    const removeCond2Btn = document.createElement('button');
    removeCond2Btn.className = 'pdx-dg-fp-add-cond';
    removeCond2Btn.type = 'button';
    removeCond2Btn.textContent = uiString('shared', 'removeCondition');
    removeCond2Btn.addEventListener('click', () => {
        cond2Container.style.display = 'none';
        addCondBtn.style.display = '';
        state.val2 = '';
    });
    cond2Container.appendChild(removeCond2Btn);

    container.appendChild(cond2Container);

    // Show cond2 if it already has a value (editing existing filter)
    if (hasExistingCond2) cond2Container.style.display = '';

    // Actions
    const actions = document.createElement('div');
    actions.className = 'pdx-dg-fp-actions';

    const clearBtn = document.createElement('pdx-button') as any;
    clearBtn.setAttribute('variant', 'ghost');
    clearBtn.setAttribute('size', 'xs');
    clearBtn.textContent = uiString('shared', 'clear');
    clearBtn.addEventListener('click', () => callbacks.onClear());

    const applyBtn = document.createElement('pdx-button') as any;
    applyBtn.setAttribute('variant', 'primary');
    applyBtn.setAttribute('size', 'xs');
    applyBtn.textContent = uiString('shared', 'apply');
    applyBtn.addEventListener('click', () => doApply());

    actions.appendChild(clearBtn);
    actions.appendChild(applyBtn);
    container.appendChild(actions);
}

// ─── Enum filter (checkbox list) ───────────────────────────

/** Multi-value enum/lookup editor backed by pdx-select (search + server-side options).
 *  `currentValues` are pre-selected (as strings); `onChange` receives the string values. */
export function buildEnumSelect(
    field: FilterFieldInfo,
    currentValues: string[],
    onChange: (values: string[]) => void,
): HTMLElement {
    const sel = document.createElement('pdx-select') as any;
    sel.size = 'sm';
    sel.multiple = true;
    sel.clearable = true;
    sel.searchable = !!(field.searchable || field.optionsSource);
    sel.placeholder = uiString('shared', 'select');
    // Compact trigger in narrow filter cells: collapse chips to "N selected".
    sel.maxTagCount = 0;

    const toOpts = (items: { label: string; value: unknown }[]) =>
        items.map(o => ({ label: o.label, value: String(o.value) }));

    requestAnimationFrame(() => {
        if (field.options && field.options.length) sel.options = toOpts(field.options);
        if (currentValues.length) sel.value = currentValues; // array → multi init
    });

    // Server-side: feed options from the loader on open + as the user types.
    if (field.optionsSource) {
        const load = (q: string) => field.optionsSource!(q).then(items => { sel.options = toOpts(items); });
        load('');
        let t: ReturnType<typeof setTimeout> | null = null;
        sel.addEventListener('pdx-search', (e: CustomEvent) => {
            if (t) clearTimeout(t);
            t = setTimeout(() => load(e.detail?.query ?? ''), 200);
        });
    }

    const emit = (e: CustomEvent) => onChange(((e.detail?.values ?? []) as unknown[]).map(String));
    sel.addEventListener('pdx-change', emit);
    sel.addEventListener('pdx-clear', () => onChange([]));
    return sel;
}

function buildEnumContent(
    container: HTMLElement,
    field: FilterFieldInfo,
    state: FilterConditionState,
    callbacks: FilterPopoverCallbacks,
): void {
    const options = field.options ?? [];
    const selectedValues = new Set<string>(state.val1 ? String(state.val1).split('|') : []);
    const isServer = !!field.optionsSource;
    // value → label cache, so already-selected values still render with a readable
    // label even when they're not in the current (server) page of results.
    const labelMap = new Map<string, string>();
    for (const o of options) labelMap.set(String(o.value), o.label);

    // Always an INLINE checklist — never a floating dropdown inside the popover, which
    // would overlap the Apply button below it (forcing an awkward extra click). Server-
    // backed sets load on search (debounced); the current selection is pinned at the top
    // so it never scrolls out of reach while you search.
    const showSearch = isServer || !!field.setFilter || options.length > 8;
    let query = '';
    let loading = false;
    let pageOptions: { label: string; value: unknown }[] = options.slice();

    const wrap = document.createElement('div');
    wrap.className = 'pdx-dg-fp-enum';

    let searchInput: HTMLInputElement | null = null;
    if (showSearch) {
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'pdx-dg-fp-enum-search pdx-input';
        searchInput.placeholder = uiString('shared', 'search');
        wrap.appendChild(searchInput);
    }

    const list = document.createElement('div');
    list.className = 'pdx-dg-fp-enum-list';
    wrap.appendChild(list);

    // Select-all only makes sense for a known, finite universe (static/set filters),
    // not for server-backed search where the full set is never fully loaded.
    let allRow: HTMLLabelElement | null = null;
    let allCb: HTMLInputElement | null = null;
    const localVisible = () => options.filter(o => !query || o.label.toLowerCase().includes(query));
    const syncAll = () => { if (allCb) { const vis = localVisible(); allCb.checked = vis.length > 0 && vis.every(o => selectedValues.has(String(o.value))); } };
    if (!isServer) {
        allRow = document.createElement('label');
        allRow.className = 'pdx-dg-fp-enum-item pdx-dg-fp-enum-all';
        allCb = document.createElement('input');
        allCb.type = 'checkbox';
        const allLabel = document.createElement('span');
        allLabel.textContent = uiString('shared', 'selectAll');
        allRow.appendChild(allCb); allRow.appendChild(allLabel);
        allCb.addEventListener('change', () => {
            for (const o of localVisible()) { const v = String(o.value); if (allCb!.checked) selectedValues.add(v); else selectedValues.delete(v); }
            renderList();
        });
    }

    const makeRow = (value: string, label: string): HTMLLabelElement => {
        const row = document.createElement('label');
        row.className = 'pdx-dg-fp-enum-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedValues.has(value);
        cb.addEventListener('change', () => {
            if (cb.checked) { selectedValues.add(value); labelMap.set(value, label); }
            else selectedValues.delete(value);
            syncAll();
        });
        const span = document.createElement('span');
        span.textContent = label;
        row.appendChild(cb); row.appendChild(span);
        return row;
    };

    function renderList(): void {
        list.innerHTML = '';
        if (allRow) list.appendChild(allRow);

        if (isServer) {
            // Pinned selection first, then the current result page (minus already-pinned).
            const pinned = [...selectedValues];
            for (const v of pinned) list.appendChild(makeRow(v, labelMap.get(v) ?? v));
            if (pinned.length) {
                const sep = document.createElement('div');
                sep.className = 'pdx-dg-fp-enum-sep';
                sep.style.cssText = 'border-top:1px solid var(--pdx-color-border,#ddd);margin:4px 0;';
                list.appendChild(sep);
            }
            for (const o of pageOptions) { const v = String(o.value); if (!selectedValues.has(v)) list.appendChild(makeRow(v, o.label)); }
            if (!pageOptions.some(o => !selectedValues.has(String(o.value)))) {
                const msg = document.createElement('div');
                msg.className = 'pdx-dg-fp-enum-empty';
                msg.style.cssText = 'padding:6px 8px;color:var(--pdx-color-muted,#888);font-size:0.85em;';
                msg.textContent = uiString('shared', loading ? 'loading' : 'noMatches');
                list.appendChild(msg);
            }
        } else {
            for (const o of localVisible()) list.appendChild(makeRow(String(o.value), o.label));
            syncAll();
        }
    }

    const loadServer = (q: string): void => {
        const src = field.optionsSource;
        if (!src) return;
        loading = true; renderList();
        src(q).then(items => {
            pageOptions = items.map(o => ({ label: o.label, value: o.value }));
            for (const o of pageOptions) labelMap.set(String(o.value), o.label);
            loading = false; renderList();
        }).catch(() => { loading = false; renderList(); });
    };

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            query = searchInput!.value.toLowerCase();
            if (isServer) { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => loadServer(searchInput!.value), 200); }
            else renderList();
        });
    }

    if (isServer) loadServer(''); else renderList();
    container.appendChild(wrap);

    const actions = document.createElement('div');
    actions.className = 'pdx-dg-fp-actions';

    const clearBtn = document.createElement('pdx-button') as any;
    clearBtn.setAttribute('variant', 'ghost');
    clearBtn.setAttribute('size', 'xs');
    clearBtn.textContent = uiString('shared', 'clear');
    clearBtn.addEventListener('click', () => callbacks.onClear());

    const applyBtn = document.createElement('pdx-button') as any;
    applyBtn.setAttribute('variant', 'primary');
    applyBtn.setAttribute('size', 'xs');
    applyBtn.textContent = uiString('shared', 'apply');
    applyBtn.addEventListener('click', () => {
        if (selectedValues.size > 0) {
            state.op1 = 'in' as FilterOperator;
            state.val1 = [...selectedValues].join('|');
        } else {
            state.val1 = '';
        }
        state.val2 = '';
        callbacks.onApply(state);
    });

    actions.appendChild(clearBtn);
    actions.appendChild(applyBtn);
    container.appendChild(actions);
}

// ─── Popover positioning + lifecycle ───────────────────────

let _activePopover: HTMLElement | null = null;

/** Takes the open popover's outside-click and scroll listeners away, attached or still pending. */
let _detach: (() => void) | null = null;

export function closeFilterPopover(): void {
    if (_activePopover) { _activePopover.remove(); _activePopover = null; }
    if (_detach) { _detach(); _detach = null; }
}

/** Open a filter popover anchored to an element. */
export function openFilterPopoverFor(
    field: FilterFieldInfo,
    state: FilterConditionState,
    anchorEl: HTMLElement | { getBoundingClientRect: () => DOMRect },
    callbacks: FilterPopoverCallbacks,
    options: FilterPopoverOptions = {},
): void {
    closeFilterPopover();

    const popover = document.createElement('div');
    popover.className = 'pdx-dg-filter-popover';
    _activePopover = popover;

    const opener: FilterPopoverOpener = options.opener !== undefined ? options.opener
        : anchorEl instanceof HTMLElement ? anchorEl : (document.activeElement as HTMLElement | null);
    const dismiss = () => dialog.closing(() => { closeFilterPopover(); callbacks.onClose(); });
    const dialog = makeFilterDialog(popover, field.label, opener, dismiss);

    buildFilterPopoverContent(popover, field, state, {
        onApply: (s) => dialog.closing(() => { callbacks.onApply(s); closeFilterPopover(); }),
        onClear: () => dialog.closing(() => { callbacks.onClear(); closeFilterPopover(); }),
        onClose: dismiss,
    });

    // Position: under the control that opened it, their RIGHT edges aligned.
    //
    // The funnel sits at the END of a header cell, and so does the chip in the toolbar: an overlay
    // opened from an end-aligned control hangs from that end. Aligned by its LEFT edge it would
    // appear a whole column's width away from the thing that was clicked.
    //
    // The width is MEASURED, not assumed: the popover renders 290 to 355 depending on the field's
    // editor, so a constant would trigger the flip away from the viewport edge late by up to 85px.
    // Appended first, measured, then placed: the focus it takes is in
    // a requestAnimationFrame (see the dialog helper), which runs after this.
    popover.style.position = 'fixed';
    popover.style.zIndex = '1000';
    document.body.appendChild(popover);

    const MARGIN = 8;
    const place = (): void => {
        const rect = anchorEl.getBoundingClientRect();
        const width = popover.offsetWidth;
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${Math.max(MARGIN, Math.min(rect.right - width, window.innerWidth - width - MARGIN))}px`;
    };
    place();
    // Again on the next frame: the content settles after connection — the editors of a condition
    // fill in their own rAF — and the box can measure 290 at append against 324 once settled, which
    // would put the popover 34px off the funnel. Hiding it until then is not an option: the dialog takes focus
    // in a rAF registered BEFORE this one, and focus does not land in a hidden subtree.
    requestAnimationFrame(() => { if (popover.isConnected) place(); });

    // Close on outside click or scroll. Attached a tick later, so the click that opened the popover
    // does not close it; every close — these two, Apply, Clear, Escape, a reopen, the grid's own —
    // goes through closeFilterPopover, which detaches them.
    // A click outside puts focus where it clicked, so it is not sent back to the opener.
    const onClickOutside = (e: MouseEvent) => {
        if (!popover.contains(e.target as Node)) {
            closeFilterPopover();
            callbacks.onClose();
        }
    };
    const onScroll = (e: Event) => {
        if (popover.contains(e.target as Node)) return;
        closeFilterPopover();
        callbacks.onClose();
    };

    let attached = false;
    const attach = setTimeout(() => {
        attached = true;
        document.addEventListener('pointerdown', onClickOutside, true);
        window.addEventListener('scroll', onScroll, true);
    }, 0);
    _detach = () => {
        clearTimeout(attach);
        if (!attached) return;
        document.removeEventListener('pointerdown', onClickOutside, true);
        window.removeEventListener('scroll', onScroll, true);
    };
}

// ─── Convert state to FilterDescriptor/CompositeFilter ─────

export function stateToFilter(field: string, state: FilterConditionState): FilterDescriptor | CompositeFilter | null {
    // between stores "min|max"; valid if at least one bound is set.
    const hasVal = (op: FilterOperator, v: string) =>
        op === 'between' ? String(v ?? '').split('|').some(p => p.trim() !== '') : !!(v && v !== '');
    const hasVal1 = hasVal(state.op1, state.val1);
    const hasVal2 = hasVal(state.op2, state.val2);
    const isNull1 = isNoValueOp(state.op1);
    const isNull2 = isNoValueOp(state.op2);

    const cond1Valid = hasVal1 || isNull1;
    const cond2Valid = hasVal2 || isNull2;

    if (!cond1Valid && !cond2Valid) return null;

    const coerceOne = (v: string): unknown => {
        const num = Number(v);
        return (!Number.isNaN(num) && v.trim() !== '') ? num : v;
    };
    const coerce = (val: string, op: FilterOperator): unknown => {
        if (val === '__null__') return null;
        // set operators: pipe-separated string → array; sentinel "(Blanks)" → null
        if (op === 'in' || op === 'notin') return val.split('|').map(s => s === FILTER_BLANK ? null : s);
        // range: "min|max" → [min, max] (empty bound stays '' → open-ended at match time)
        if (op === 'between') return val.split('|').map(p => p.trim() === '' ? null : coerceOne(p));
        return coerceOne(val);
    };

    const f1 = cond1Valid ? { field, operator: state.op1, value: isNull1 ? null : coerce(state.val1, state.op1) } : null;
    const f2 = cond2Valid ? { field, operator: state.op2, value: isNull2 ? null : coerce(state.val2, state.op2) } : null;

    if (f1 && f2) return { logic: state.logic, filters: [f1, f2] } as CompositeFilter;
    return (f1 ?? f2) as FilterDescriptor;
}

/**
 * Format state as display text for chip.
 *
 * `options` is the field's own list, and without it a select filter shows the stored CODE where
 * the popover offered a word — `Status Equals "closed"` for a chip the user made by picking
 * «Closed», and `"closed"` again inside the accessible name built from this text. An enum is
 * stored as a code and must never be shown as one; in a localised app the popover offers «Chiuso»
 * and the chip must not answer `"closed"`.
 *
 * Optional, because every other filter in the application goes through here and a free-text value
 * must not acquire a mapping it never had.
 */
export function stateToChipText(
    label: string,
    state: FilterConditionState,
    type?: string,
    options?: { label: string; value: unknown }[],
): string {
    const hasVal1 = state.val1 && state.val1 !== '' && state.val1 !== '__null__';
    const hasVal2 = state.val2 && state.val2 !== '' && state.val2 !== '__null__';
    const isNull1 = isNoValueOp(state.op1);
    const isNull2 = isNoValueOp(state.op2);

    const cond1Valid = hasVal1 || isNull1;
    const cond2Valid = hasVal2 || isNull2;

    if (!cond1Valid) return `${label}: (no filter)`;

    const truncate = (v: string) => v.length > 15 ? v.slice(0, 15) + '...' : v;
    /** The word the user picked, or the stored value when the list cannot name it. */
    const labelOf = (v: string) =>
        options?.find(o => String(o.value) === v)?.label ?? v;
    const fmtVal = (op: FilterOperator, v: string) => {
        // `between` joins its two bounds with the same `|` a multi-select uses for its values,
        // so the OPERATOR decides which one this is — splitting on the separator alone turns a
        // date range into two failed lookups.
        if (op === 'between') return v.split('|').map(p => p.trim() || '∞').join(' – ');
        if (op === 'in' || op === 'notin') return `"${truncate(v.split('|').map(labelOf).join(', '))}"`;
        return `"${truncate(labelOf(v))}"`;
    };
    const text1 = isNull1 ? `${getOpLabel(state.op1, type)}` : `${getOpLabel(state.op1, type)} ${fmtVal(state.op1, state.val1)}`;

    if (!cond2Valid) return `${label} ${text1}`;

    const text2 = isNull2 ? `${getOpLabel(state.op2, type)}` : `${getOpLabel(state.op2, type)} ${fmtVal(state.op2, state.val2)}`;
    return `${label} ${text1} ${state.logic.toUpperCase()} ${text2}`;
}
