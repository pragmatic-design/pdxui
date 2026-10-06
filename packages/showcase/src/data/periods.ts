// An employee's periods — the contracts, the site assignments — edited in the page and ended rather
// than deleted.
//
// Both sections share the same machinery: which period is being edited, which one is being ended and
// on what day, the write through the employee's record, and the way back after an end. What differs
// is the page's own — what a period's form holds, the rule an end must pass, and what the toast
// says — so the page passes those in.
import { computed, signal } from '@pdxui/core';
import type { ReadonlySignal, Signal } from '@pdxui/core';
import { employeeById, employeeTransport } from './employees';
import type { Assignment, Contract, Employee } from './employees';

type Period = Contract | Assignment;
type Key = 'contracts' | 'assignments';
type ItemOf<K extends Key> = Employee[K][number];

export interface PeriodListOptions<K extends Key> {
    /** Which of the employee's lists this is. */
    key: K;
    /** The employee, by the route's id. */
    employeeId(): number;
    /** The refusal of `last` as the last day of `item`, or '' when it is accepted. */
    endRefusal(item: ItemOf<K>, last: string): string;
    /** The period was ended: the page says so, and offers `undo`. */
    ended(item: ItemOf<K>, last: string, undo: () => Promise<void>): void;
}

export interface PeriodList<K extends Key> {
    /** The periods, as the record holds them now. */
    items: ReadonlySignal<ItemOf<K>[]>;
    /** The period being edited in the page, or null. */
    editing: Signal<ItemOf<K> | null>;
    /** The period whose end is being asked for, or null. */
    ending: Signal<ItemOf<K> | null>;
    /** The last day the end dialog holds. */
    endDate: Signal<string>;
    /** Why that day was refused, or ''. */
    endError: Signal<string>;
    /** Every write goes through the record: the periods are the employee's, not a table of their own. */
    save(next: ItemOf<K>[]): Promise<void>;
    /** The next id in this list. */
    nextId(): number;
    /** The edited period written back in its place, and the edit closed. */
    saveEdited(edited: ItemOf<K>): Promise<void>;
    /** The end dialog, on today. */
    askEnd(item: ItemOf<K>): void;
    /** The day checked, the period ended, and the page told — with the way back. */
    confirmEnd(): Promise<void>;
}

export function createPeriodList<K extends Key>(options: PeriodListOptions<K>): PeriodList<K> {
    const { key } = options;
    const record = computed(() => employeeById(options.employeeId()));
    const items = computed(() => (record()?.[key] ?? []) as ItemOf<K>[]);
    const editing = signal<ItemOf<K> | null>(null);
    const ending = signal<ItemOf<K> | null>(null);
    const endDate = signal('');
    const endError = signal('');

    async function save(next: ItemOf<K>[]): Promise<void> {
        const current = record();
        if (!current) return;
        await employeeTransport.update({ ...current, [key]: next });
    }

    function nextId(): number {
        return items().reduce((m, p: Period) => Math.max(m, p.id), 0) + 1;
    }

    async function saveEdited(edited: ItemOf<K>): Promise<void> {
        await save(items().map((p: Period) => p.id === edited.id ? edited : p) as ItemOf<K>[]);
        editing.set(null);
    }

    function askEnd(item: ItemOf<K>): void {
        endDate.set(new Date().toISOString().slice(0, 10));
        endError.set('');
        ending.set(item);
    }

    /** The period is open again, as it was — read from the record as it is now, not as it was ended. */
    async function reopen(periodId: number): Promise<void> {
        const current = employeeById(options.employeeId());
        if (!current) return;
        const list = current[key] as Period[];
        await employeeTransport.update({
            ...current,
            [key]: list.map(p => p.id === periodId ? { ...p, end: '' } : p),
        });
    }

    async function confirmEnd(): Promise<void> {
        const item = ending();
        if (!item) return;
        const refused = options.endRefusal(item, endDate());
        if (refused) {
            endError.set(refused);
            return;
        }
        const last = endDate();
        ending.set(null);
        await save(items().map((p: Period) => p.id === item.id ? { ...p, end: last } : p) as ItemOf<K>[]);
        options.ended(item, last, () => reopen(item.id));
    }

    return { items, editing, ending, endDate, endError, save, nextId, saveEdited, askEnd, confirmEnd };
}
