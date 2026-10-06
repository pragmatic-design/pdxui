// pdx-tree — the tree as a VIEW: a folder pane, a category hierarchy, a navigable knowledge base.
//
// `pdx-tree-select` is an
// INPUT — it opens a dropdown, is bound to a value, and closes when you pick — and `pdx-cascader`
// chooses a path through columns. Neither is the thing that stays on the page and that you
// navigate, where selecting is a consequence rather than the purpose.
//
// A competitor matrix decided this API: four of five libraries ship the view as a first-class
// component, and the W3C `tree` pattern is not something a list composes into.
//
// Three decisions worth knowing before reading the code:
//
//   - **the fields are the application's.** `idField`/`labelField`/`childrenField`, like
//     `pdx-data-grid` and `pdx-field-list`, so a tree renders the objects an app already has
//     rather than a shape it has to convert to;
//   - **lazy branches use the shape the library already has** — `loadChildren(node) =>
//     Promise<Node[]>`, the same as `pdx-tree-select` and `pdx-cascader`, rather than a second
//     shape for the same thing;
//   - **`aria-level`, `aria-setsize` and `aria-posinset` are always written**, not only when the
//     DOM is partial. The pattern requires them exactly in the two cases this component is for
//     (lazy branches, and virtualization later), and they cost nothing in the others.

import { component, html, onDestroy } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
// This component's styles travel with it, so an app ships the CSS of what it renders.
import '@pdxui/design/components/tree';

/** What a node needs to be, under whatever names the application gave those fields. */
export interface TreeNode {
    [key: string]: unknown;
    /** Marks a node as a branch before its children are known — for `loadChildren`. */
    isBranch?: boolean;
}

type CheckState = 'true' | 'false' | 'mixed';

/**
 * A hierarchy the user navigates.
 *
 * @fires pdx-select - `{ selected: string[] }` — the ids selected, after the change.
 * @fires pdx-expand - `{ id, expanded }` — one branch opened or closed.
 * @fires pdx-check - `{ checked: string[] }` — the ids fully checked (a mixed parent is not one).
 * @fires pdx-load-error - `{ id, error }` — `loadChildren` rejected; the branch stays askable.
 * @slot node - Scoped — renders one node's label. Receives `{ node, level, expanded }`.
 */
component('pdx-tree', {
    props: {
        /** The roots. Children are read from `childrenField`. */
        nodes: { type: Array, default: () => [] },
        /** The field that identifies a node. */
        idField: { type: String, default: 'id' },
        /** The field rendered as the node's text, when there is no `node` slot. */
        labelField: { type: String, default: 'label' },
        /** The field holding a node's children. */
        childrenField: { type: String, default: 'children' },
        /** 'none' | 'single' | 'multiple'. */
        selectionMode: { type: String, default: 'none', enum: ['none', 'single', 'multiple'] },
        /** Show a checkbox per node, tri-state over a branch's subtree. */
        checkable: { type: Boolean, default: false },
        /** Open every branch on first render. */
        defaultExpandAll: { type: Boolean, default: false },
        /** Fetch a branch's children the first time it opens. */
        loadChildren: { type: Function, default: null },
        /** Accessible name for the tree. */
        label: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
    },
    setup(ctx) {
        let rootEl: HTMLElement | null = null;
        let built = false;

        const expanded = new Set<string>();
        const selected = new Set<string>();
        const checked = new Set<string>();
        const loading = new Set<string>();
        const loaded = new Map<string, TreeNode[]>();
        let typeahead = '';
        let typeaheadTimer: ReturnType<typeof setTimeout> | null = null;

        const idOf = (n: TreeNode) => String(n[ctx.idField() as string] ?? '');
        const labelOf = (n: TreeNode) => String(n[ctx.labelField() as string] ?? '');

        /** A node's children: the ones it carries, or the ones a `loadChildren` brought. */
        function childrenOf(node: TreeNode): TreeNode[] | undefined {
            const own = node[ctx.childrenField() as string] as TreeNode[] | undefined;
            if (Array.isArray(own)) return own;
            return loaded.get(idOf(node));
        }

        /** A branch is anything that has children, or that says it will have them. */
        function isBranch(node: TreeNode): boolean {
            const kids = childrenOf(node);
            return (Array.isArray(kids) && kids.length > 0) || node.isBranch === true;
        }

        function eachDescendant(node: TreeNode, fn: (n: TreeNode) => void): void {
            for (const child of childrenOf(node) ?? []) {
                fn(child);
                eachDescendant(child, fn);
            }
        }

        /**
         * A branch's check state, computed from its subtree rather than stored.
         *
         * Storing it is how a parent ends up saying `true` while one of its children is not
         * checked — the state has one source, and it is the leaves.
         */
        function checkStateOf(node: TreeNode): CheckState {
            if (!isBranch(node)) return checked.has(idOf(node)) ? 'true' : 'false';
            let total = 0;
            let on = 0;
            eachDescendant(node, (n) => { total++; if (checked.has(idOf(n))) on++; });
            if (total === 0) return checked.has(idOf(node)) ? 'true' : 'false';
            if (on === 0) return 'false';
            return on === total ? 'true' : 'mixed';
        }

        function setChecked(node: TreeNode, on: boolean): void {
            const apply = (n: TreeNode) => { if (on) checked.add(idOf(n)); else checked.delete(idOf(n)); };
            apply(node);
            eachDescendant(node, apply);
            // `checked` holds the LEAVES and the fully-checked branches; a mixed branch is not in
            // it, which is what the event has to say.
            ctx.emit('pdx-check', { checked: [...checked].filter(id => {
                const n = findNode(id);
                return !n || !isBranch(n) || checkStateOf(n) === 'true';
            }) });
            rebuild();
        }

        function findNode(id: string, list = ctx.nodes() as TreeNode[]): TreeNode | null {
            for (const n of list) {
                if (idOf(n) === id) return n;
                const found = findNode(id, childrenOf(n) ?? []);
                if (found) return found;
            }
            return null;
        }

        // ─── Expanding ──────────────────────────────────────────

        async function toggle(node: TreeNode): Promise<void> {
            const id = idOf(node);
            if (expanded.has(id)) {
                expanded.delete(id);
                ctx.emit('pdx-expand', { id, expanded: false });
                rebuild();
                return;
            }

            const loader = ctx.loadChildren() as ((n: TreeNode) => Promise<TreeNode[]>) | null;
            const needsLoad = loader && !loaded.has(id) && !Array.isArray(node[ctx.childrenField() as string]);
            if (needsLoad) {
                if (loading.has(id)) return;
                loading.add(id);
                rebuild();
                try {
                    loaded.set(id, await loader(node));
                } catch (error) {
                    // The branch stays askable: one that swallowed its failure is one nobody can
                    // retry, and the app never hears about it either.
                    loading.delete(id);
                    ctx.emit('pdx-load-error', { id, error });
                    rebuild();
                    return;
                }
                loading.delete(id);
            }

            expanded.add(id);
            ctx.emit('pdx-expand', { id, expanded: true });
            rebuild();
        }

        // ─── Selecting ──────────────────────────────────────────

        function select(node: TreeNode): void {
            const mode = ctx.selectionMode() as string;
            if (mode === 'none') return;
            const id = idOf(node);
            if (mode === 'single') {
                selected.clear();
                selected.add(id);
            } else if (selected.has(id)) {
                selected.delete(id);
            } else {
                selected.add(id);
            }
            ctx.emit('pdx-select', { selected: [...selected] });
            rebuild();
        }

        // ─── Rendering ──────────────────────────────────────────

        function getNodeSlot(): SlotFunction | undefined {
            return (ctx as unknown as { __slots?: Record<string, SlotFunction> }).__slots?.['node'];
        }

        function buildRow(node: TreeNode, level: number, position: number, setSize: number): HTMLElement {
            const id = idOf(node);
            const branch = isBranch(node);
            const mode = ctx.selectionMode() as string;

            const row = document.createElement('div');
            row.className = 'pdx-tree-item';
            row.setAttribute('role', 'treeitem');
            row.dataset.nodeId = id;
            row.tabIndex = -1;
            // Required when the DOM is not the whole tree — which is the lazy case, and will be
            // the virtualized one. Written always: they cost nothing when the DOM is complete.
            row.setAttribute('aria-level', String(level));
            row.setAttribute('aria-posinset', String(position));
            row.setAttribute('aria-setsize', String(setSize));
            // A LEAF omits aria-expanded. Setting it to false says "closed branch", which is a
            // different thing and reads as a tree of empty folders.
            if (branch) row.setAttribute('aria-expanded', String(expanded.has(id)));
            // aria-selected OR aria-checked, never both: two answers to one question.
            if (ctx.checkable()) row.setAttribute('aria-checked', checkStateOf(node));
            else if (mode !== 'none') row.setAttribute('aria-selected', String(selected.has(id)));
            row.style.setProperty('--pdx-tree-level', String(level));

            const twisty = document.createElement('span');
            twisty.className = 'pdx-tree-twisty';
            twisty.setAttribute('aria-hidden', 'true');
            twisty.textContent = branch ? (loading.has(id) ? '⋯' : (expanded.has(id) ? '▾' : '▸')) : '';
            row.appendChild(twisty);

            if (ctx.checkable()) {
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.className = 'pdx-tree-check';
                const state = checkStateOf(node);
                box.checked = state === 'true';
                box.indeterminate = state === 'mixed';
                // The checkbox is decoration for assistive technology: the row already carries
                // `aria-checked`, and two announcements of one state is one too many.
                box.tabIndex = -1;
                box.setAttribute('aria-hidden', 'true');
                box.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setChecked(node, state !== 'true');
                });
                row.appendChild(box);
            }

            const label = document.createElement('span');
            label.className = 'pdx-tree-label';
            const slot = getNodeSlot();
            if (slot) label.appendChild(slot({ node, level, expanded: expanded.has(id) }));
            else label.textContent = labelOf(node);
            row.appendChild(label);

            row.addEventListener('click', () => {
                if (ctx.disabled()) return;
                if (branch) void toggle(node);
                select(node);
            });

            return row;
        }

        function rebuild(): void {
            if (!rootEl) return;
            rootEl.innerHTML = '';
            const mode = ctx.selectionMode() as string;
            rootEl.setAttribute('role', 'tree');
            if (mode === 'multiple') rootEl.setAttribute('aria-multiselectable', 'true');
            else rootEl.removeAttribute('aria-multiselectable');
            const name = ctx.label() as string;
            if (name) rootEl.setAttribute('aria-label', name);

            const render = (list: TreeNode[], level: number, into: HTMLElement) => {
                list.forEach((node, i) => {
                    into.appendChild(buildRow(node, level, i + 1, list.length));
                    if (expanded.has(idOf(node))) {
                        const kids = childrenOf(node) ?? [];
                        if (kids.length === 0) return;
                        const group = document.createElement('div');
                        group.className = 'pdx-tree-group';
                        group.setAttribute('role', 'group');
                        render(kids, level + 1, group);
                        into.appendChild(group);
                    }
                });
            };
            render(ctx.nodes() as TreeNode[], 1, rootEl);

            // One tab stop for the tree, wherever the focus was: 500 nodes must not be 500 stops.
            const rows = Array.from(rootEl.querySelectorAll<HTMLElement>('[role="treeitem"]'));
            if (rows.length > 0 && !rows.some(r => r.tabIndex === 0)) rows[0].tabIndex = 0;
        }

        // ─── Keyboard ───────────────────────────────────────────

        function rowsOnScreen(): HTMLElement[] {
            return rootEl ? Array.from(rootEl.querySelectorAll<HTMLElement>('[role="treeitem"]')) : [];
        }

        function focusRow(row: HTMLElement | undefined): void {
            if (!row) return;
            for (const r of rowsOnScreen()) r.tabIndex = -1;
            row.tabIndex = 0;
            row.focus();
        }

        function nodeOfRow(row: HTMLElement): TreeNode | null {
            return findNode(row.dataset.nodeId ?? '');
        }

        function onKeyDown(e: KeyboardEvent): void {
            const row = (e.target as HTMLElement)?.closest?.('[role="treeitem"]') as HTMLElement | null;
            if (!row || !rootEl?.contains(row)) return;
            const rows = rowsOnScreen();
            const index = rows.indexOf(row);
            const node = nodeOfRow(row);
            if (!node) return;
            const branch = isBranch(node);
            const isOpen = expanded.has(idOf(node));

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    focusRow(rows[index + 1]);
                    return;
                case 'ArrowUp':
                    e.preventDefault();
                    focusRow(rows[index - 1]);
                    return;
                case 'ArrowRight':
                    e.preventDefault();
                    // Closed branch: open it. Open branch: walk into it. Leaf: nothing.
                    if (branch && !isOpen) void toggle(node);
                    else if (branch && isOpen) focusRow(rows[index + 1]);
                    return;
                case 'ArrowLeft': {
                    e.preventDefault();
                    if (branch && isOpen) { void toggle(node); return; }
                    // Otherwise go to the parent — the nearest row above at a shallower level.
                    const level = Number(row.getAttribute('aria-level') ?? '1');
                    for (let i = index - 1; i >= 0; i--) {
                        if (Number(rows[i].getAttribute('aria-level') ?? '1') < level) { focusRow(rows[i]); return; }
                    }
                    return;
                }
                case 'Home':
                    e.preventDefault();
                    focusRow(rows[0]);
                    return;
                case 'End':
                    e.preventDefault();
                    focusRow(rows[rows.length - 1]);
                    return;
                case '*': {
                    // Expand every sibling at this depth — the one shortcut nobody discovers and
                    // everybody wants once they know it.
                    e.preventDefault();
                    const level = row.getAttribute('aria-level');
                    for (const sibling of rows) {
                        if (sibling.getAttribute('aria-level') !== level) continue;
                        const n = nodeOfRow(sibling);
                        if (n && isBranch(n) && !expanded.has(idOf(n))) void toggle(n);
                    }
                    return;
                }
                case 'Enter':
                    e.preventDefault();
                    select(node);
                    requestAnimationFrame(() => focusRow(rowsOnScreen()[index]));
                    return;
                case ' ':
                    e.preventDefault();
                    if (ctx.checkable()) setChecked(node, checkStateOf(node) !== 'true');
                    else select(node);
                    requestAnimationFrame(() => focusRow(rowsOnScreen()[index]));
                    return;
                default:
                    break;
            }

            // Type-ahead: a single printable character moves to the next node starting with it.
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                typeahead += e.key.toLowerCase();
                if (typeaheadTimer) clearTimeout(typeaheadTimer);
                typeaheadTimer = setTimeout(() => { typeahead = ''; }, 600);
                const match = rows.find((r, i) =>
                    i !== index && (r.querySelector('.pdx-tree-label')?.textContent ?? '')
                        .trim().toLowerCase().startsWith(typeahead));
                if (match) { e.preventDefault(); focusRow(match); }
            }
        }

        // ─── Build ──────────────────────────────────────────────

        ctx.track(() => {
            const nodes = ctx.nodes() as TreeNode[];
            void ctx.selectionMode();
            void ctx.checkable();
            void ctx.label();

            requestAnimationFrame(() => {
                rootEl = ctx.el.querySelector('.pdx-tree');
                if (!rootEl) return;
                if (!built) {
                    built = true;
                    if (ctx.defaultExpandAll()) {
                        const openAll = (list: TreeNode[]) => {
                            for (const n of list) {
                                if (isBranch(n)) expanded.add(idOf(n));
                                openAll(childrenOf(n) ?? []);
                            }
                        };
                        openAll(nodes);
                    }
                    // The roving tabindex is this component's own, not `useRovingTabindex`: a
                    // tree's Down is not a list's Down — it walks what is EXPANDED, which is a
                    // different set from "the children of this element" and changes on every
                    // toggle. `focusRow` is the one place that moves the single tab stop.
                    rootEl.addEventListener('keydown', onKeyDown);
                }
                rebuild();
            });
        });

        onDestroy(() => {
            rootEl?.removeEventListener('keydown', onKeyDown);
            if (typeaheadTimer) clearTimeout(typeaheadTimer);
        });

        return {};
    },
    // The root the setup fills. Everything below it is built imperatively: a tree's rows are
    // siblings inside their `role="group"`, and the ARIA a row carries depends on where it sits in
    // the whole — which is a thing to compute once per rebuild, not per binding.
    render: () => html`<div class="pdx-tree"></div>`,
});
