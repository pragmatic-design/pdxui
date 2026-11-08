// The pilot's components, mounted 100 at a time (#685; packages/ui/PILOT.md, «Measurements»).
//
// One page, two builds: `vite.config.ts` builds it with the library's TypeScript components, and
// `vite.pilot.config.ts` with the pilot's redirect, which puts the `.pdx` rewrites in their place
// (packages/ui/pilot/plugin.ts). The imports are the same in both; what they resolve to is not.
//
// `window.__mount(kind, n)` mounts n of `kind` into a fresh container, waits until each one has drawn
// what it is measured by, and returns the milliseconds; it removes the container after. The filter
// popover is not a tag: it is 100 contents built through `buildFilterPopoverContent`, as the pilot
// measured it. The controls a condition is edited with are defined before any mount, so that no lazy
// load is timed; and so is `pdx-button`, which the TypeScript popover creates without importing — the
// grid that holds it defines it — while the `.pdx` one imports it: without it here, the TypeScript
// side's buttons would stay unknown elements that draw nothing.
import '../../../../ui/src/button/pdx-button';
import '../../../../ui/src/switch-toggle/pdx-switch';
import '../../../../ui/src/select/pdx-select';
import '../../../../ui/src/input/pdx-input';
import '../../../../ui/src/number-input/pdx-number-input';
import '../../../../ui/src/date-picker/pdx-date-picker';
import { buildFilterPopoverContent, type FilterConditionState, type FilterFieldInfo } from '../../../../ui/src/shared/filter-popover';

type Kind = 'switch' | 'select' | 'values' | 'conditions';

const OPTIONS = Array.from({ length: 10 }, (_, i) => ({ label: `Option ${i + 1}`, value: `o${i + 1}` }));
const STATUS: FilterFieldInfo = {
    field: 'status', label: 'Status', type: 'string',
    options: ['Open', 'Pending', 'Closed', 'Archived', 'Draft'].map((s) => ({ label: s, value: s.toLowerCase() })),
};
const NAME: FilterFieldInfo = { field: 'name', label: 'Name', type: 'string' };
const TWO: FilterConditionState = { op1: 'contains', val1: 'a', logic: 'and', op2: 'startswith', val2: 'b' };
const NONE = { onApply() {}, onClear() {}, onClose() {} };

/** Append one of `kind` to `host`. */
function add(kind: Kind, host: HTMLElement): void {
    if (kind === 'switch') {
        const el = document.createElement('pdx-switch');
        el.setAttribute('label', 'Notifications');
        host.appendChild(el);
    } else if (kind === 'select') {
        const el = document.createElement('pdx-select') as HTMLElement & { options: unknown; value: unknown };
        el.options = OPTIONS;
        el.value = 'o3';
        el.setAttribute('label', 'Choice');
        host.appendChild(el);
    } else {
        const box = document.createElement('div');
        box.className = 'pdx-dg-filter-popover';
        host.appendChild(box);
        if (kind === 'values') buildFilterPopoverContent(box, STATUS, { op1: 'in', val1: '', logic: 'and', op2: 'eq', val2: '' }, NONE);
        else buildFilterPopoverContent(box, NAME, TWO, NONE);
    }
}

/** Each popover's Clear and Apply, drawn: the `<button>` inside each `<pdx-button>`. */
const buttons = (h: HTMLElement, n: number) => h.querySelectorAll('.pdx-dg-fp-actions pdx-button button').length === n * 2;

/**
 * What each instance has drawn when it counts as mounted: the same in both builds, since the pilot's
 * rewrites pass the TypeScript components' tests unchanged. A value list is drawn when its select-all
 * and its options are; a condition when its operator's select and its value's input are, two of each
 * for two conditions; a popover when its two buttons are too.
 */
const READY: Record<Kind, (host: HTMLElement, n: number) => boolean> = {
    switch: (h, n) => h.querySelectorAll('pdx-switch input[role="switch"]').length === n,
    select: (h, n) => h.querySelectorAll('pdx-select [role="combobox"]').length === n,
    values: (h, n) => h.querySelectorAll('.pdx-dg-filter-popover input[type="checkbox"]').length === n * (STATUS.options!.length + 1)
        && buttons(h, n),
    conditions: (h, n) => h.querySelectorAll('.pdx-dg-filter-popover pdx-select [role="combobox"]').length === n * 2
        && h.querySelectorAll('.pdx-dg-filter-popover pdx-input input').length >= n * 2
        && buttons(h, n),
};

/** A turn of the event loop that is not clamped as a nested timeout is: a message to ourselves. */
const channel = new MessageChannel();
const turn = () => new Promise<void>((resolve) => { channel.port1.onmessage = () => resolve(); channel.port2.postMessage(null); });

/**
 * Mount n of `kind`, and return the milliseconds until each has drawn. How many turns of the event
 * loop that took is left in `window.__turns`: 0 is a mount drawn in the same task.
 */
async function mount(kind: Kind, n: number): Promise<number> {
    const host = document.createElement('div');
    document.getElementById('host')!.appendChild(host);
    const start = performance.now();
    for (let i = 0; i < n; i++) add(kind, host);
    let turns = 0;
    for (; !READY[kind](host, n); turns++) {
        if (turns > 10_000) throw new Error(`${kind}: ${n} instances never drew what they are measured by`);
        await turn();
    }
    const ms = performance.now() - start;
    host.remove();
    Object.assign(window, { __turns: turns });
    return ms;
}

Object.assign(window, { __mount: mount, __ready: true });
