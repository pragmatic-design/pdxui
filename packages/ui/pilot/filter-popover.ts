// The pilot's filter popover (#137): src/shared/filter-popover.ts with its content drawn by
// pilot/filter-popover.pdx instead of built by hand.
//
// Everything else is the shared module's own, re-exported: the operators, the state conversions, the
// chip text, the dialog helper. What is redefined here is what builds the content and the lifecycle
// around it. The lifecycle is one open popover per page, the press outside and the scroll that close
// it, and the placement under the anchor: module state, not a component's. It is the TypeScript part
// of the pilot's filter popover, and PILOT.md counts it apart.
import {
    getFieldOperators, makeFilterDialog,
    type FilterFieldInfo, type FilterConditionState, type FilterPopoverCallbacks,
    type FilterPopoverOptions, type FilterPopoverOpener,
} from '../src/shared/filter-popover';
import { onPressOutside } from '../src/shared/press-outside';
import { loadTag, type LazyTag } from '../src/shared/lazy-tags';
import './filter-popover.pdx';

export * from '../src/shared/filter-popover';

type ContentElement = HTMLElement & { field: FilterFieldInfo; state: FilterConditionState; operators: unknown };

/** The popover's content, a <pdx-filter-popover>, appended to `container`. */
export function buildFilterPopoverContent(
    container: HTMLElement,
    field: FilterFieldInfo,
    state: FilterConditionState,
    callbacks: FilterPopoverCallbacks,
): void {
    const content = document.createElement('pdx-filter-popover') as ContentElement;
    content.field = field;
    content.state = state;
    content.operators = getFieldOperators(field);
    content.addEventListener('apply', (e) => callbacks.onApply((e as CustomEvent<FilterConditionState>).detail));
    content.addEventListener('clear', () => callbacks.onClear());
    container.appendChild(content);
}

let activePopover: HTMLElement | null = null;
let detach: (() => void) | null = null;
let openings = 0;

export function closeFilterPopover(): void {
    openings++;
    if (activePopover) { activePopover.remove(); activePopover = null; }
    if (detach) { detach(); detach = null; }
}

/** The controls a condition is edited with, loaded on first use (lazy-tags.ts). */
const CONTROLS: readonly LazyTag[] = ['pdx-select', 'pdx-input', 'pdx-number-input', 'pdx-date-picker'];

/** Open a filter popover anchored to an element, once its controls are defined. */
export function openFilterPopoverFor(
    field: FilterFieldInfo,
    state: FilterConditionState,
    anchorEl: HTMLElement | { getBoundingClientRect: () => DOMRect },
    callbacks: FilterPopoverCallbacks,
    options: FilterPopoverOptions = {},
): void {
    closeFilterPopover();
    const opening = openings;

    const popover = document.createElement('div');
    popover.className = 'pdx-dg-filter-popover';
    activePopover = popover;

    const offPress = onPressOutside({
        type: 'pointerdown',
        capture: true,
        inside: (t) => popover.contains(t),
        outside: () => { closeFilterPopover(); callbacks.onClose(); },
    });
    const onScroll = (e: Event) => {
        if (popover.contains(e.target as Node)) return;
        closeFilterPopover();
        callbacks.onClose();
    };
    window.addEventListener('scroll', onScroll, true);
    detach = () => { offPress(); window.removeEventListener('scroll', onScroll, true); };

    const missing = CONTROLS.filter((tag) => !customElements.get(tag));
    if (missing.length === 0) { show(popover, field, state, anchorEl, callbacks, options); return; }
    void Promise.all(missing.map(loadTag)).then(() => {
        if (opening === openings) show(popover, field, state, anchorEl, callbacks, options);
    });
}

function show(
    popover: HTMLElement,
    field: FilterFieldInfo,
    state: FilterConditionState,
    anchorEl: HTMLElement | { getBoundingClientRect: () => DOMRect },
    callbacks: FilterPopoverCallbacks,
    options: FilterPopoverOptions,
): void {
    const opener: FilterPopoverOpener = options.opener !== undefined ? options.opener
        : anchorEl instanceof HTMLElement ? anchorEl : (document.activeElement as HTMLElement | null);
    const dismiss = () => dialog.closing(() => { closeFilterPopover(); callbacks.onClose(); });
    const dialog = makeFilterDialog(popover, field.label, opener, dismiss);

    popover.style.position = 'fixed';
    popover.style.zIndex = '1000';
    document.body.appendChild(popover);

    buildFilterPopoverContent(popover, field, state, {
        onApply: (s) => dialog.closing(() => { callbacks.onApply(s); closeFilterPopover(); }),
        onClear: () => dialog.closing(() => { callbacks.onClear(); closeFilterPopover(); }),
        onClose: dismiss,
    });

    // Under the control that opened it, right edges aligned, by its measured width; again on the next
    // frame, once the condition editors have settled.
    const MARGIN = 8;
    const place = (): void => {
        const rect = anchorEl.getBoundingClientRect();
        const width = popover.offsetWidth;
        popover.style.top = `${rect.bottom + 4}px`;
        popover.style.left = `${Math.max(MARGIN, Math.min(rect.right - width, window.innerWidth - width - MARGIN))}px`;
    };
    place();
    // Again whenever its size changes, not only on the next frame: the condition editors are in a
    // @defer, which renders after its load resolves even when the code is there, so the box can still
    // be empty a frame after the append (PILOT.md, finding 14).
    const resized = new ResizeObserver(() => { if (popover.isConnected) place(); });
    resized.observe(popover);
    const detachPress = detach;
    detach = () => { resized.disconnect(); detachPress?.(); };
}
