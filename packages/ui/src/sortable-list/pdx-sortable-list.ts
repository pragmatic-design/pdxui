// pdx-sortable-list — a list the user can reorder, by pointer and by keyboard.
//
// The component `useSortable` was written for. Without it the primitives are reachable only by
// wiring them yourself — a container getter, an items getter, an onReorder, and the render of the
// rows — and "a list the user can reorder", one of the commonest things a business screen needs,
// would start from a composable.
//
// It does NOT mutate the array. `useSortable` hands back (from, to) and this component emits them;
// the application writes the new value. That is the contract `createFieldArray` keeps, and it is
// what keeps the list one source of truth.
//
// Accessibility, from the research that designed this component:
//   - NO `aria-grabbed`. It is deprecated in WAI-ARIA 1.1, and the recommendation is accessible
//     controls instead — so the grab target is a real <button>, carrying
//     `aria-roledescription="draggable"` and pointing at off-screen instructions.
//   - Space/Enter lifts, arrows move, Space/Enter drops, Escape cancels (the dnd-kit pattern).
//   - Announcements speak POSITION, not index: "position 2 of 5".
//   - Roving tabindex over the handles, so the list costs one Tab stop.
//
// The keyboard reorder itself is `useSortable`'s: one interaction has one implementation, and the
// component keeps the half a primitive cannot know: the handle is a real button with a label in
// the app's language, the strings come from `uiString`, and `labelOf` reads the ITEM rather than
// the row's text. Those travel as `a11y` options; the state machine does not.

import { component, html, useSortable, useRovingTabindex, onDestroy } from '@pdxui/core';
import type { SlotFunction, Dispose } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/sortable-list';

let _uid = 0;

/**
 * A list the user can put in another order, by dragging a row's handle or from the keyboard alone.
 *
 * It emits `pdx-reorder` with the indices and never writes to `items`: the application applies the
 * move, so the array it owns stays the one source of truth.
 *
 * @slot item - Scoped — renders one row's content. Receives `{ item, index }`. Without it the row
 *   shows the item's `label-field`.
 */
component('pdx-sortable-list', {
    props: {
        items: { type: Array, default: [] },
        /** How a row is identified. Empty: the row's index. */
        idField: { type: String, default: 'id' },
        /** What a row shows without an `item` slot, and what names its handle either way. */
        labelField: { type: String, default: 'label' },
        /** 'vertical' | 'horizontal' — decides which arrows move, and which way rows shift. */
        axis: { type: String, default: 'vertical' },
        /** A selector inside the row that the POINTER may grab. Empty: the rendered handle. */
        handle: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
    },
    setup(ctx) {
        let built = false;
        let listEl: HTMLElement | null = null;
        const helpId = `pdx-sortable-help-${++_uid}`;
        // Kept so they can be disposed. useSortable puts listeners on the DOCUMENT for the duration
        // of a gesture: a host destroyed mid-drag would leave them there, moving nothing, forever.
        const teardown: Dispose[] = [];

        // After a rebuild the DOM nodes are new: the handle at this index takes the focus back.
        let refocusIndex = -1;

        function getItemSlot(): SlotFunction | undefined {
            return (ctx as unknown as { __slots?: Record<string, SlotFunction> }).__slots?.['item'];
        }

        function rows(): unknown[] {
            return (ctx.items() as unknown[]) ?? [];
        }

        function labelOf(item: unknown, index: number): string {
            const field = ctx.labelField() as string;
            const value = (item as Record<string, unknown>)?.[field];
            if (typeof value === 'string' || typeof value === 'number') return String(value);
            return typeof item === 'string' || typeof item === 'number' ? String(item) : String(index + 1);
        }

        function idOf(item: unknown, index: number): unknown {
            const field = ctx.idField() as string;
            if (!field) return index;
            return (item as Record<string, unknown>)?.[field] ?? index;
        }

        function items(): HTMLElement[] {
            return listEl ? (Array.from(listEl.children) as HTMLElement[]) : [];
        }

        // ─── Rendering ─────────────────────────────────────────────────

        function buildRow(item: unknown, index: number): HTMLElement {
            const li = document.createElement('li');
            li.className = 'pdx-sortable-item';
            li.dataset.pdxKey = String(idOf(item, index));

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'pdx-sortable-handle';
            uiAttr(handle, 'aria-roledescription', () => uiString('sortable-list', 'draggable'));
            handle.setAttribute('aria-describedby', helpId);
            uiAttr(handle, 'aria-label', () => format(uiString('sortable-list', 'reorder'), { label: labelOf(item, index) }));
            if (ctx.disabled() as boolean) handle.setAttribute('aria-disabled', 'true');
            handle.appendChild(document.createElement('span')).className = 'pdx-sortable-grip';
            li.appendChild(handle);

            const body = document.createElement('div');
            body.className = 'pdx-sortable-body';
            const slot = getItemSlot();
            if (slot) body.appendChild(slot({ item, index }));
            else body.textContent = labelOf(item, index);
            li.appendChild(body);

            return li;
        }

        function rebuild(): void {
            if (!listEl) return;
            listEl.replaceChildren(...rows().map(buildRow));
            if (refocusIndex >= 0) {
                // A rebuild throws away the node that had the focus. Without this, a keyboard
                // reorder drops the user back at the top of the page — which is the whole gesture
                // wasted.
                items()[refocusIndex]?.querySelector<HTMLElement>('.pdx-sortable-handle')?.focus();
                refocusIndex = -1;
            }
        }

        // ─── The reorder itself ────────────────────────────────────────

        function emitReorder(from: number, to: number): void {
            if (from === to) return;
            const item = rows()[from];
            refocusIndex = to;
            ctx.emit('pdx-reorder', { from, to, id: idOf(item, from) });
        }

        // ─── Build ─────────────────────────────────────────────────────

        ctx.track(() => {
            void ctx.items();
            void ctx.idField();
            void ctx.labelField();
            void ctx.disabled();
            const axis = ctx.axis() as string;

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    ctx.el.classList.add('pdx-sortable-root');

                    const help = document.createElement('div');
                    help.id = helpId;
                    help.className = 'pdx-sr-only';
                    help.textContent = uiString('sortable-list', 'instructions');
                    ctx.el.appendChild(help);

                    listEl = document.createElement('ul');
                    listEl.className = 'pdx-sortable-list';
                    listEl.setAttribute('role', 'list');
                    listEl.dataset.axis = axis;
                    ctx.el.appendChild(listEl);

                    rebuild();

                    const sortable = useSortable(() => listEl, {
                        // The keyboard reorder is the composable's. What travels from
                        // here is only what it cannot know: the item's own label rather than the
                        // row's text, this app's sentences through `uiString`, and the two
                        // presentation choices this component makes — the rows really move, and
                        // the lifted one is marked so the stylesheet can show it.
                        a11y: {
                            label: (index) => labelOf(rows()[index], index),
                            // Set on the BUTTON in `buildRow`, where the focus is; on the row as
                            // well it would be announced twice.
                            roleDescription: false,
                            // The component's own help element: one `uiString`, pointed at by
                            // every handle's `aria-describedby`.
                            instructions: false,
                            messages: {
                                lifted: `${uiString('sortable-list', 'lifted')} ${uiString('sortable-list', 'position')}`,
                                moved: uiString('sortable-list', 'position'),
                                dropped: `${uiString('sortable-list', 'dropped')} ${uiString('sortable-list', 'position')}`,
                                cancelled: uiString('sortable-list', 'cancelled'),
                            },
                            preview: 'reorder',
                            liftedClass: 'pdx-sortable-item-lifted',
                        },
                        disabled: () => ctx.disabled() as boolean,
                        items: () => rows(),
                        axis: axis === 'horizontal' ? 'horizontal' : 'vertical',
                        handle: (ctx.handle() as string) || '.pdx-sortable-handle',
                        onReorder: emitReorder,
                    });

                    const roving = useRovingTabindex(() => listEl, {
                        orientation: axis === 'horizontal' ? 'horizontal' : 'vertical',
                        itemSelector: '.pdx-sortable-handle',
                        wrap: false,
                    });

                    teardown.push(sortable.dispose, roving.dispose);
                });
                return;
            }

            ctx.frame(() => rebuild());
        });

        onDestroy(() => {
            for (const dispose of teardown.splice(0)) dispose();
        });

        return {};
    },
    render: () => html``,
});
