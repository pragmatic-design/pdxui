// pdx-tree-select's open tree, drawn as the TypeScript version drew it: flat `treeitem` rows,
// indented by depth, with a toggle, a checkbox when multiple, and the label or the parent's snippet.
// Beside the component, which holds the state and passes what the rows need in a TreeView; the rows
// drawn are collected in `rows`, which the keyboard walks.

import type { TreeSelectNode } from './tree-select-types';

/** A row the tree shows, in order, as of its last render. */
export type VisibleRow = {
    node: TreeSelectNode; depth: number; parent: TreeSelectNode | null;
    row: HTMLElement; expandable: boolean; expanded: boolean;
};

/** What the rows read from the component and call back into. */
export type TreeView = {
    rows: VisibleRow[];
    expanded: Set<string>;
    selected: Set<string>;
    multi: boolean;
    /** The search query, lowercased; '' for none. */
    search: string;
    loading: Set<string>;
    rowId: (value: string) => string;
    childrenOf: (node: TreeSelectNode) => TreeSelectNode[] | undefined;
    canExpand: (node: TreeSelectNode) => boolean;
    /** The parent's `node` snippet, when it set one. */
    nodeSnippet: ((node: TreeSelectNode, level: number, expanded: boolean) => Node | undefined) | undefined;
    onToggle: (node: TreeSelectNode) => void;
    /** A click on a row: the component highlights it and selects it. */
    onRowClick: (node: TreeSelectNode) => void;
};

function matchesSearch(node: TreeSelectNode, q: string): boolean {
    if (node.label.toLowerCase().includes(q)) return true;
    if (node.children) return node.children.some(c => matchesSearch(c, q));
    return false;
}

export function renderNodes(
    container: HTMLElement, nodes: TreeSelectNode[], depth: number, parent: TreeSelectNode | null, v: TreeView,
): void {
    const shown = v.search ? nodes.filter(n => matchesSearch(n, v.search)) : nodes;
    shown.forEach((node, index) => {
        const kids = v.childrenOf(node);
        const hasChildren = !!kids && kids.length > 0;
        // A node whose branch has not been fetched yet still gets a toggle: that toggle is
        // the only way to ask for it.
        const expandable = hasChildren || v.canExpand(node);
        // A boolean: `search && hasChildren` is '' with no query, which would write
        // aria-expanded="" on every branch.
        const isExpanded = v.expanded.has(node.value) || (!!v.search && hasChildren);
        const isSelected = v.selected.has(node.value);

        const row = document.createElement('div');
        row.className = 'pdx-tree-node' + (isSelected ? ' selected' : '') + (node.disabled ? ' disabled' : '');
        row.style.paddingLeft = `${8 + depth * 20}px`;
        row.id = v.rowId(node.value);
        row.setAttribute('role', 'treeitem');
        row.setAttribute('data-part', 'node');
        row.setAttribute('aria-selected', String(isSelected));
        // The rows are flat siblings, indented by padding: level, set size and position say
        // what the indentation shows.
        row.setAttribute('aria-level', String(depth + 1));
        row.setAttribute('aria-setsize', String(shown.length));
        row.setAttribute('aria-posinset', String(index + 1));
        if (node.disabled) row.setAttribute('aria-disabled', 'true');
        if (expandable) row.setAttribute('aria-expanded', String(isExpanded));
        // One state, two readers: `aria-busy` for assistive technology, the toggle's `loading`
        // class for everyone else. aria-busy alone renders nothing, and the row would not say
        // the branch is coming.
        // The spinner itself is the design package's (tree-select.css).
        const isLoading = v.loading.has(node.value);
        if (isLoading) row.setAttribute('aria-busy', 'true');

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'pdx-tree-toggle' + (isExpanded ? ' expanded' : '') + (expandable ? '' : ' leaf')
            + (isLoading ? ' loading' : '');
        toggle.textContent = '›';
        toggle.setAttribute('data-part', 'toggle');
        toggle.setAttribute('tabindex', '-1');
        if (expandable) {
            toggle.addEventListener('click', (e) => { e.stopPropagation(); v.onToggle(node); });
        }
        row.appendChild(toggle);

        if (v.multi) {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = isSelected;
            cb.disabled = !!node.disabled;
            cb.setAttribute('tabindex', '-1');
            cb.addEventListener('click', (e) => e.stopPropagation());
            row.appendChild(cb);
        }

        const content = v.nodeSnippet?.(node, depth, isExpanded);
        if (content) {
            row.appendChild(content);
        } else {
            const label = document.createElement('span');
            label.className = 'pdx-tree-node-label';
            label.textContent = node.label;
            row.appendChild(label);
        }

        row.addEventListener('click', () => v.onRowClick(node));
        container.appendChild(row);
        v.rows.push({ node, depth, parent, row, expandable, expanded: isExpanded });

        if (hasChildren && isExpanded) {
            renderNodes(container, kids!, depth + 1, node, v);
        }
    });
}
