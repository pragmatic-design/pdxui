// pdx-relation-picker — pick one or more existing rows for an N-N relation (and optionally create a new one).
// Wraps pdx-data-grid (multiple selection) + a footer: "Add selected" emits the chosen rows; "Create new"
// requests on-the-fly creation. Promoted from the profiler's hand-built multi-pick drawer (UI-15g, the
// reusable half). The master-detail orchestration around it stays app-descriptor-driven.
//
// Usage:
//   <pdx-relation-picker :source="${ds}" :columns="${cols}" create-label="New PCC"></pdx-relation-picker>
//   el.addEventListener('pdx-pick',   e => link(e.detail.items));   // [{...row}, ...]
//   el.addEventListener('pdx-create', () => openCreateForm());

import { component, html } from '@pdxui/core';
import { uiString, format } from '../shared/i18n';
import '../data-grid/pdx-data-grid';
import '../button/pdx-button';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/relation-picker';

/**
 * Picks one or more existing rows for a many-to-many relation from a grid, and can ask for a new
 * one to be created.
 */
component('pdx-relation-picker', {
    props: {
        /** The DataSource of the rows to pick from, handed to the grid the picker renders. */
        source: { type: Object, default: null },
        columns: { type: Array, default: () => [] },
        createLabel: { type: String, default: '' },
        /** The add button's text. Empty: the relation-picker.add component string. */
        addLabel: { type: String, default: '' },
        idField: { type: String, default: 'id' },
        /**
         * Let the user narrow the list — the one thing a picker exists for.
         *
         * It turns on the grid's FILTER ROW: a field under each column header, debounced, which
         * calls `source.setFilter()`. So the narrowing happens where the rows come from and a
         * picker over ten thousand customers works the same as one over fourteen.
         *
         * ⚠️ Not the grid's toolbar, which is what this issue first proposed: measured, the
         * toolbar is a reload button, filter chips and "+ Add Filter" — a filter builder, not a
         * search. Whether the picker should also carry a search field of its OWN, above the grid
         * and across every column, is a design decision and is still open.
         */
        searchable: { type: Boolean, default: false },
    },
    setup(ctx) {
        let built = false;
        let selected: Record<string, unknown>[] = [];
        let _createBtn: HTMLElement | null = null;
        let _addBtn: HTMLElement | null = null;

        ctx.track(() => {
            const source = ctx.source();
            const columns = ctx.columns();
            const createLabel = ctx.createLabel() as string;
            const addLabel = (ctx.addLabel() as string) || uiString('relation-picker', 'add');
            const idField = ctx.idField() as string;
            const searchable = ctx.searchable() as boolean;
            if (!source) return;
            // label and idField update after the build too: ignoring changes after the
            // first build would be a prop-reactivity violation.
            if (built) { requestAnimationFrame(() => syncAll(source, columns, createLabel, addLabel, idField, searchable)); return; }
            built = true;
            requestAnimationFrame(() => build(source, columns, createLabel, addLabel, idField, searchable));
        });

        function build(source: unknown, columns: unknown, createLabel: string, addLabel: string,
            idField: string, searchable: boolean): void {
            ctx.el.innerHTML = '';
            ctx.el.classList.add('pdx-relation-picker');

            const grid = document.createElement('pdx-data-grid') as HTMLElement & { source: unknown; columns: unknown };
            grid.setAttribute('selection', 'multiple');
            grid.setAttribute('hover', '');
            grid.setAttribute('id-field', idField);
            if (searchable) grid.setAttribute('filterable', '');
            grid.className = 'pdx-relation-picker-grid';
            grid.source = source;
            grid.columns = columns;
            // The grid announces ids — `{ selected, count }` — not rows. Reading `detail.items` would keep
            // `selected` empty for good: no count, and pdx-pick could never fire.
            grid.addEventListener('pdx-selection-change', (e: Event) => {
                const ids = ((e as CustomEvent).detail?.selected ?? []) as unknown[];
                const rows = (grid as unknown as { grid?: { source: { getById(id: unknown): unknown } } }).grid?.source;
                selected = ids.map(id => rows?.getById(id)).filter(Boolean) as Record<string, unknown>[];
                updateCount();
            });
            ctx.el.appendChild(grid);

            const foot = document.createElement('div'); foot.className = 'pdx-relation-picker-foot';
            const count = document.createElement('span'); count.className = 'pdx-relation-picker-count';
            foot.appendChild(count);

            // Labels through pdx-button's `label` prop. `textContent` on a connected pdx-button
            // replaces its rendered <button> with bare text: no role, no tab stop.
            if (createLabel) {
                const createBtn = document.createElement('pdx-button');
                createBtn.setAttribute('variant', 'ghost'); createBtn.setAttribute('size', 'sm');
                createBtn.setAttribute('label', createLabel);
                createBtn.addEventListener('click', () => ctx.emit('pdx-create'));
                foot.appendChild(createBtn);
                _createBtn = createBtn;
            }

            const addBtn = document.createElement('pdx-button');
            addBtn.setAttribute('variant', 'primary'); addBtn.setAttribute('size', 'sm');
            addBtn.setAttribute('label', addLabel);
            addBtn.addEventListener('click', () => { if (selected.length) ctx.emit('pdx-pick', { items: selected }); });
            foot.appendChild(addBtn);
            _addBtn = addBtn;

            ctx.el.appendChild(foot);

            function updateCount(): void {
                count.textContent = selected.length ? format(uiString('relation-picker', 'selected'), { n: selected.length }) : '';
                // Nothing to add: the button says so instead of doing nothing when pressed.
                addBtn.toggleAttribute('disabled', selected.length === 0);
            }
            updateCount();
        }

        function syncGrid(source: unknown, columns: unknown): void {
            const grid = ctx.el.querySelector('pdx-data-grid') as (HTMLElement & { source: unknown; columns: unknown }) | null;
            if (grid) { grid.source = source; grid.columns = columns; }
        }

        /** Full post-build sync: data + label + idField + searchable. */
        function syncAll(source: unknown, columns: unknown, createLabel: string, addLabel: string,
            idField: string, searchable: boolean): void {
            syncGrid(source, columns);
            const grid = ctx.el.querySelector('pdx-data-grid');
            if (grid) {
                grid.setAttribute('id-field', idField);
                // Toggled, not set once: a picker that becomes searchable after its first build
                // would otherwise be the same prop-reactivity violation as the labels.
                grid.toggleAttribute('filterable', searchable);
            }
            if (_createBtn) _createBtn.setAttribute('label', createLabel);
            if (_addBtn) _addBtn.setAttribute('label', addLabel);
        }

        return {};
    },
    render: () => html``,
});
