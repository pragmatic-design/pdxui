// pdx-filter-builder — Notion-style chip-based filter builder.
// Standalone component: works with DataSource, pdx-data-grid, or any list.
// Uses shared filter-popover for the condition editor (same as grid filter).

import { component, html, signal, DEV } from '@pdxui/core';
import type { FilterDescriptor, CompositeFilter } from '@pdxui/core';
import { toFilterFields } from '@pdxui/core';
import { uiString, uiAttr} from '../shared/i18n';
import type { FieldDefinition, FilterField } from '@pdxui/core';
import {
    openFilterPopoverFor, createEmptyState, stateToFilter, stateToChipText, makeFilterDialog,
} from '../shared/filter-popover';
import type { FilterConditionState, FilterFieldInfo } from '../shared/filter-popover';
import { filterToState, filterField } from '../shared/filter-state';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/filter-builder';
import '../auto-form/pdx-auto-form'; // rendered by this component, and registered by nobody else

// ─── Per-field filter state ────────────────────────────────

interface ActiveFilter {
    field: string;
    info: FilterFieldInfo;
    state: FilterConditionState;
}

/**
 * A chip-based filter bar driven by field definitions, for a DataSource, a data grid or any list.
 */
component('pdx-filter-builder', {
    props: {
        /** Field definitions (FieldDefinition[] or FilterField[]). */
        fields: { type: Array, default: [] },
        /** DataSource to auto-bind filters. */
        source: { type: Object, default: null },
        /** Initial filter descriptors. */
        value: { type: Array, default: [] },
        /** Default logic between filters. */
        logic: { type: String, default: 'and' },
    },
    setup(ctx) {
        let _built = false;
        let _barEl: HTMLElement | null = null;
        const _filters = signal<ActiveFilter[]>([]);

        /**
         * Field declarations already reported, so the same typo is named once.
         *
         * `resolveFields()` is called from inside `ctx.track`, so a warning written straight into
         * it is written again on every notification — and a warning that repeats a dozen times is
         * one the reader filters out of the console.
         */
        const _reported = new Set<string>();

        /**
         * Name a field declaration that carries no `field`, and say which key it should have used.
         *
         * A field written `{ name: 'status', … }` resolves to `field: undefined`, and without this
         * every filter naming it would be dropped in silence — the list would come back unfiltered
         * and nothing would say why. The mistake is the expected one: `<pdx-auto-form>` calls a field `name`
         * and this component calls it `field`, and an application declares both schemas within a
         * few lines of each other.
         *
         * A warning and not a throw: a schema with one bad entry is still a usable filter bar, and
         * the other fields work.
         */
        function reportMissingField(raw: Record<string, unknown>): void {
            const wrongKey = ['name', 'key', 'id', 'prop'].find(k => typeof raw[k] === 'string');
            const names = wrongKey ? String(raw[wrongKey]) : (typeof raw.label === 'string' ? raw.label : '?');
            const signature = `${wrongKey ?? 'none'}:${names}`;
            if (!DEV || _reported.has(signature)) return;
            _reported.add(signature);
            console.warn(
                `[pdx-filter-builder] the field "${names}" declares no \`field\`, so every filter naming it is dropped.`
                + (wrongKey ? ` It uses \`${wrongKey}\`, which is <pdx-auto-form>'s key — a filter field is \`field\`.` : '')
                + ` Write { field: '${names}', … }.`,
            );
        }

        /** Resolve fields to FilterFieldInfo[]. */
        function resolveFields(): FilterFieldInfo[] {
            const raw = ctx.fields() as (FieldDefinition | FilterField)[];
            if (!raw || !raw.length) return [];
            const filterFields = ('operators' in raw[0]) ? raw as FilterField[] : toFilterFields(raw as FieldDefinition[]);
            const out: FilterFieldInfo[] = [];
            filterFields.forEach((f, i) => {
                // `toFilterFields` reads `f.field`, so a declaration using another key arrives
                // here with `field: undefined`. The original is what names the mistake, because
                // the converted copy no longer carries the key the author actually wrote.
                if (typeof f.field !== 'string' || f.field === '') {
                    reportMissingField((raw[i] ?? f) as unknown as Record<string, unknown>);
                    return;
                }
                out.push({
                    field: f.field, label: f.label, type: f.type,
                    operators: f.operators, options: f.options,
                    multiple: f.multiple, searchable: f.searchable, optionsSource: f.optionsSource,
                });
            });
            return out;
        }

        /** Get fields not already filtered. */
        function getAvailableFields(): FilterFieldInfo[] {
            const all = resolveFields();
            const used = new Set(_filters.peek().map(f => f.field));
            return all.filter(f => !used.has(f.field));
        }

        /** Apply all filters to the DataSource, and announce them either way. */
        function applyToSource(): void {
            const allFilters: (FilterDescriptor | CompositeFilter)[] = [];
            for (const af of _filters.peek()) {
                const filter = stateToFilter(af.field, af.state);
                if (filter) allFilters.push(filter);
            }

            // `logic` cannot be expressed by the
            // array alone: an array of filters is an implicit AND at match time (`matchesFilters`,
            // core/data/data-utils.ts), so OR has to become a single CompositeFilter. One filter has
            // no logic to express, so it stays flat.
            const logic: 'and' | 'or' = (ctx.logic() as string) === 'or' ? 'or' : 'and';
            const payload: (FilterDescriptor | CompositeFilter)[] =
                (logic === 'or' && allFilters.length > 1)
                    ? [{ logic: 'or', filters: allFilters } as CompositeFilter]
                    : allFilters;

            // Read source from signal or fall back to element property
            const src = (ctx.source() || (ctx.el as any).source) as any;
            if (src && typeof src.setFilter === 'function') src.setFilter(payload);
            // ⚠️ Emitted even without a source. Returning before this line would leave a builder
            // used standalone — which the header of this file offers — with no output at all.
            ctx.emit('pdx-filter-change', { filters: payload, logic });
        }

        // Focus after a change. The chips are rebuilt from scratch, so the button that had
        // focus is gone and focus would fall to <body>: it goes to the chip just applied, or after a removal
        // to the chip now in that place, or to "+ Add Filter".
        const removeButtons = () => Array.from(_barEl?.querySelectorAll<HTMLElement>('.pdx-fb-chip-remove') ?? []);
        const barHasFocus = () => !!_barEl?.contains(document.activeElement);
        const focusChipOrAdd = (index: number) => (removeButtons()[index] ?? _addBtn)?.focus();

        /** Update or add a filter. `focusChip`: from the popover's Apply — focus lands on its chip. */
        function setFilter(fieldInfo: FilterFieldInfo, state: FilterConditionState, focusChip = false): void {
            const current = _filters.peek().slice();
            let idx = current.findIndex(f => f.field === fieldInfo.field);
            if (idx >= 0) {
                current[idx] = { field: fieldInfo.field, info: fieldInfo, state };
            } else {
                idx = current.push({ field: fieldInfo.field, info: fieldInfo, state }) - 1;
            }
            _filters.set(current);
            applyToSource();
            rebuildChips();
            if (focusChip) focusChipOrAdd(idx);
        }

        /** Remove a filter by index. Focus moves when it was on the bar, or when asked to. */
        function removeFilter(index: number, moveFocus = barHasFocus()): void {
            const current = _filters.peek().slice();
            current.splice(index, 1);
            _filters.set(current);
            applyToSource();
            rebuildChips();
            if (moveFocus) focusChipOrAdd(index);
        }

        /** Clear all filters. */
        function clearAll(): void {
            const moveFocus = barHasFocus();
            _filters.set([]);
            applyToSource();
            rebuildChips();
            if (moveFocus) _addBtn?.focus();
        }

        // ─── Field picker popover ──────────────────────────

        let _pickerPopover: HTMLElement | null = null;
        let _addBtn: HTMLButtonElement | null = null;

        /** "+ Add Filter" says whether its dialog — the field picker, then the value step — is open. */
        const setExpanded = (open: boolean) => _addBtn?.setAttribute('aria-expanded', String(open));

        /** `keepExpanded`: the picker hands over to the value step, which is the same flow. */
        function closePickerPopover(keepExpanded = false): void {
            if (_pickerPopover) { _pickerPopover.remove(); _pickerPopover = null; }
            document.removeEventListener('pointerdown', onPickerOutside, true);
            if (!keepExpanded) setExpanded(false);
        }

        const onPickerOutside = (e: MouseEvent) => {
            if (_pickerPopover && !_pickerPopover.contains(e.target as Node)) closePickerPopover();
        };

        // Teardown on destroy: otherwise an unmount with the picker open would leave
        // the capture pointerdown orphaned on document.
        ctx.track(() => () => closePickerPopover());

        function openFieldPicker(anchorEl: HTMLElement): void {
            closePickerPopover();
            const fields = getAvailableFields();
            if (!fields.length) return;

            const pop = document.createElement('div');
            pop.className = 'pdx-fb-popover';
            pop.style.position = 'fixed';
            pop.style.zIndex = '1000';
            // A named dialog, Escape back to the button.
            const dialog = makeFilterDialog(pop, uiString('filter-builder', 'dialog'), anchorEl,
                () => dialog.closing(() => closePickerPopover()));

            const title = document.createElement('div');
            title.className = 'pdx-fb-popover-title';
            title.textContent = uiString('filter-builder', 'selectField');
            pop.appendChild(title);

            for (const field of fields) {
                const item = document.createElement('button');
                item.className = 'pdx-fb-field-item';
                item.type = 'button';
                item.textContent = field.label;
                item.addEventListener('click', () => {
                    closePickerPopover(true);
                    const state = createEmptyState(field);
                    openFilterPopoverFor(field, state, anchorEl, {
                        onApply: (s) => setFilter(field, s, true),
                        onClear: () => setExpanded(false),
                        onClose: () => setExpanded(false),
                    }, { opener: anchorEl });
                });
                pop.appendChild(item);
            }

            const rect = anchorEl.getBoundingClientRect();
            pop.style.top = `${rect.bottom + 4}px`;
            pop.style.left = `${rect.left}px`;
            document.body.appendChild(pop);
            _pickerPopover = pop;
            setExpanded(true);
            (pop.querySelector('.pdx-fb-field-item') as HTMLElement | null)?.focus();
            setTimeout(() => document.addEventListener('pointerdown', onPickerOutside, true), 0);
        }

        // ─── Chip rendering ────────────────────────────────

        function rebuildChips(): void {
            if (!_barEl) return;
            _barEl.innerHTML = '';

            const filters = _filters.peek();
            for (let i = 0; i < filters.length; i++) {
                const af = filters[i];
                const chip = document.createElement('span');
                chip.className = 'pdx-fb-chip';

                const text = stateToChipText(af.info.label, af.state, af.info.type, af.info.options);

                // The label is a button: the filter is edited from the keyboard too. As a span with
                // a click listener, a filter could be removed without a mouse but not changed.
                const labelBtn = document.createElement('button');
                labelBtn.type = 'button';
                labelBtn.className = 'pdx-fb-chip-label';
                labelBtn.textContent = text;
                uiAttr(labelBtn, 'aria-label', () => uiString('filter-builder', 'editFilter').replace('{filter}', text));
                // Click chip → reopen editor with current values (no remove)
                labelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = chip.getBoundingClientRect();
                    const anchor = { getBoundingClientRect: () => rect } as HTMLElement;
                    // Open popover with CURRENT state (pre-filled); Escape returns to this label.
                    openFilterPopoverFor(af.info, { ...af.state }, anchor, {
                        onApply: (s) => setFilter(af.info, s, true),
                        onClear: () => { removeFilter(i, true); },
                        onClose: () => {},
                    }, { opener: labelBtn });
                });
                chip.appendChild(labelBtn);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'pdx-fb-chip-remove';
                removeBtn.type = 'button';
                removeBtn.textContent = '\u2715';
                // Named after its chip, so two chips do not read the same.
                uiAttr(removeBtn, 'aria-label', () => uiString('filter-builder', 'removeFilter').replace('{filter}', text)); // icon-only \u2192 an accessible name
                removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFilter(i); });
                chip.appendChild(removeBtn);

                _barEl.appendChild(chip);
            }

            // + Add Filter button
            const addBtn = document.createElement('button');
            addBtn.className = 'pdx-fb-add-btn';
            addBtn.type = 'button';
            // The icon via innerHTML, the LABEL via textContent: a string hidden in the middle of
            // that SVG would be untranslatable, and invisible to the i18n guard, which does not
            // read innerHTML. A translated app would have to patch this button from the outside
            // with a MutationObserver.
            addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>&nbsp;';
            addBtn.appendChild(document.createTextNode(uiString('filter-builder', 'addFilter')));
            uiAttr(addBtn, 'aria-label', () => uiString('filter-builder', 'addFilter'));
            addBtn.setAttribute('aria-haspopup', 'dialog');
            addBtn.setAttribute('aria-expanded', 'false');
            addBtn.addEventListener('click', () => openFieldPicker(addBtn));
            _barEl.appendChild(addBtn);
            _addBtn = addBtn;

            // Clear all
            if (filters.length > 0) {
                const clearBtn = document.createElement('button');
                clearBtn.className = 'pdx-fb-clear-btn';
                clearBtn.type = 'button';
                clearBtn.textContent = uiString('filter-builder', 'clearAll');
                clearBtn.addEventListener('click', clearAll);
                _barEl.appendChild(clearBtn);
            }
        }

        // ─── Saved view ────────────────────────────────────
        // `value` seeds the builder, so a saved view can be restored into it rather than the
        // builder always starting empty. Seeding is keyed on the IDENTITY
        // of the array the author passes, not on its content — re-seeding on every notification
        // would wipe the chips the user is in the middle of editing.
        let _seeded: unknown;

        ctx.track(() => {
            const incoming = ctx.value() as (FilterDescriptor | CompositeFilter)[];
            void ctx.fields();
            if (incoming === _seeded) return;
            const first = _seeded === undefined;
            _seeded = incoming;
            // A component that mounts with no value stays silent: it has nothing to say, and pushing
            // an empty filter set to the source would clear filters it never set.
            if (first && (!incoming || !incoming.length)) return;

            const infos = resolveFields();
            const next: ActiveFilter[] = [];
            for (const f of incoming ?? []) {
                const name = filterField(f);
                const info = name ? infos.find(i => i.field === name) : undefined;
                // A saved view naming a field this builder no longer declares: dropped, rather than
                // shown as a chip no editor can open.
                if (!info) continue;
                const state = filterToState(f, info);
                if (state) next.push({ field: info.field, info, state });
            }
            _filters.set(next);
            applyToSource();
            rebuildChips();
        });

        // ─── Build ─────────────────────────────────────────

        ctx.track(() => {
            // `resolveFields()` and not `void ctx.fields()`: it subscribes the same way and it
            // CHECKS the declarations. Without this a schema with a misdeclared field would stay
            // silent until something else happened to resolve it — a saved view to seed, or the
            // user opening the add-filter menu — so the page that shows the bug on load would be
            // the one page that said nothing.
            resolveFields();
            void ctx.source();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    _barEl = document.createElement('div');
                    _barEl.className = 'pdx-filter-builder';
                    ctx.el.appendChild(_barEl);
                    rebuildChips();
                });
            }
        });

        return {};
    },
    render: () => html``,
});
