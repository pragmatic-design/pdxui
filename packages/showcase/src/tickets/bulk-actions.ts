// The tickets bulk bar's actions, and what each key does, for `pages/tickets.pdx`.
//
// The bar BECOMES its picker rather than opening one, and that is a decision worth
// stating: a menu hung off a bar button would need `pdx-dropdown-menu` inside `pdx-bulk-actions`,
// which every consumer of the bar would then carry — and on a 390px phone a dropdown over a bar at the
// foot of the screen is the worst place to put a list. The choices ARE actions, so they are actions,
// and the bar's keyboard, its ARIA and its wrapping are the ones it already had. So this is data and
// a dispatch table, not a component.
/**
 * One action of `pdx-bulk-actions`, the fields this bar uses. Written here: a showcase `.ts` does not
 * resolve `@pdxui/ui` types without a build (see the note on `answer.ts`).
 */
export interface BulkAction {
    key: string;
    label: string;
    icon?: string;
    tone?: string;
    disabled?: boolean;
    disabledReason?: string;
}

/** Which picker the bar is showing, or null for its actions. */
export type Picking = 'status' | 'assign' | null;

interface Option { value: string; label: string }

/** The bar's words, in the page's language: `$t` is the page's. */
export interface BulkLabels {
    back: string;
    close: string;
    delete: string;
    export: string;
    exportDenied: string;
    status: string;
    assign: string;
}

/** The actions the bar shows: its own, or the choices of the picker it has become. */
export function bulkActionSet(picking: Picking, options: {
    statusOptions: Option[];
    assigneeOptions: Option[];
    canExport: boolean;
    labels: BulkLabels;
}): BulkAction[] {
    const { statusOptions, assigneeOptions, canExport, labels } = options;
    const back = { key: 'back', label: labels.back, icon: 'arrow-left' };
    if (picking === 'status') return [back, ...statusOptions.map(o => ({ key: 'status:' + o.value, label: o.label, icon: 'check' }))];
    if (picking === 'assign') return [back, ...assigneeOptions.map(o => ({ key: 'assign:' + o.value, label: o.label, icon: 'user' }))];
    return [
        { key: 'close', label: labels.close, icon: 'check' },
        { key: 'delete', label: labels.delete, icon: 'trash', tone: 'danger' },
        // Offered and refused rather than withheld: an action that merely vanishes is
        // indistinguishable from one nobody wrote.
        { key: 'export', label: labels.export, icon: 'download', disabled: !canExport, disabledReason: labels.exportDenied },
        // The two a line-of-business list is actually used for.
        { key: 'status', label: labels.status, icon: 'tag' },
        { key: 'assign', label: labels.assign, icon: 'user' },
    ];
}

/** What the page does for each key. */
export interface BulkHandlers {
    delete(): unknown;
    close(): unknown;
    /** The bar becomes a picker, or goes back to its actions (`null`). */
    pick(kind: Picking): unknown;
    status(value: string): unknown;
    assign(value: string): unknown;
}

/** Run the handler a bar key names: `status:*`, `assign:*`, `close`, `delete`, and the pickers. */
export function dispatchBulk(key: string, on: BulkHandlers): unknown {
    if (key === 'delete') return on.delete();
    if (key === 'close') return on.close();
    if (key === 'status' || key === 'assign') return on.pick(key);
    if (key === 'back') return on.pick(null);
    if (key.startsWith('status:')) return on.status(key.slice('status:'.length));
    if (key.startsWith('assign:')) return on.assign(key.slice('assign:'.length));
    return undefined;
}
