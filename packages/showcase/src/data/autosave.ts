// A form that saves itself, field by field.
//
// The form is the page: no Save, each field written after the pause the form gives it
// (`save: onChange`), and what is still pending written on the way out. The queue, the save state
// and the flush live here, not in the page — a whole concern with state and no markup (CD-L1). The page
// keeps what is the entity's own: what a change writes besides the field (`extra`), and what
// follows it (`after`).
//
// The record pages — asset, service, site — use the same queue, and the load before it. They leave
// without asking, which is `saveChanged`; the employee asks, which is `flush`.
import { signal, computed } from '@pdxui/core';
import type { Form, ReadonlySignal } from '@pdxui/core';

type Values = Record<string, unknown>;

/**
 * `R` is the record the page keeps — `Asset`, `Service`, `Employee` — so `read` and `write` take the
 * store's own functions as they are typed. The composable reads it field by field, by name.
 */
export interface AutosaveOptions<R extends object = Values> {
    form: Form<Values>;
    /** Every field the form edits: what leaving compares. */
    fields: string[];
    /** The record as the store holds it now, or undefined when there is none. */
    read(): R | undefined;
    /** Write the whole record, patched. A rejection is a failed save: the state says so. */
    write(record: R): Promise<unknown>;
    /** What a change of `name` writes besides itself — the entity's own rule. Empty by default. */
    extra?(name: string, value: unknown): Values;
    /** What follows a written change, once the store has it. */
    after?(name: string, value: unknown): void;
    /** The form's value as the store keeps it — a number field hands over what its control holds. */
    value?(name: string, raw: unknown): unknown;
}

export type SaveState = 'saving' | 'refused' | 'saved' | '';

export interface Autosave {
    /** Saving…, a value refused (by the rules or the store), saved, or nothing yet. */
    state: ReadonlySignal<SaveState>;
    /** When the last write landed, or null. */
    savedAt: ReadonlySignal<Date | null>;
    /**
     * The record into the form, when the page opens on it — never after a save, or it would
     * overwrite what is being typed. A list is copied: the form's edits are not the store's.
     */
    load(): void;
    /** Queue one field's write. Never rejects: a failure is the state's to say. */
    saveField(name: string): Promise<void>;
    /**
     * On the way out, without asking: every changed field the rules accept is written, and a refused
     * one stays refused — the record keeps what it had (the record details' shape).
     */
    saveChanged(): Promise<void>;
    /**
     * On the way out: every changed field is written, and true comes back. When a changed value is
     * one the rules refuse, nothing is written and false comes back — the page asks.
     */
    flush(): Promise<boolean>;
}

/** Whether the form's value is the one the record holds. A list compares by its items. */
function same(stored: unknown, value: unknown): boolean {
    return Array.isArray(stored) ? JSON.stringify(stored) === JSON.stringify(value) : (stored ?? '') === (value ?? '');
}

export function createAutosave<R extends object = Values>(options: AutosaveOptions<R>): Autosave {
    const { form } = options;
    /** The record by field name: the form's fields are the record's own. */
    const byName = (record: R): Values => record as Values;
    const stored = (name: string, raw: unknown): unknown => options.value ? options.value(name, raw) : raw;
    const inflight = signal(0);
    const savedAt = signal<Date | null>(null);
    const failed = signal(false);

    /** A value the rules refused, on a field the user has been at: «Not saved» while there is one. */
    const refused = computed(() => Object.keys(form.errors()).some(name => form.fields[name]?.touched()));
    const state = computed<SaveState>(() =>
        inflight() > 0 ? 'saving' : (refused() || failed()) ? 'refused' : savedAt() ? 'saved' : '');

    /**
     * One write at a time, in the order they were asked: each reads the record as the one before it
     * left it. Two in flight would each carry the other's field as it was before, and the second
     * would undo the first.
     */
    let queue: Promise<void> = Promise.resolve();
    function saveField(name: string): Promise<void> {
        queue = queue.then(() => writeField(name));
        return queue;
    }

    /** One field to the store, if the rules accept it and it changed. */
    async function writeField(name: string): Promise<void> {
        const field = form.fields[name];
        // Touched, so a refusal shows on the field now rather than at the next blur.
        field.onBlur();
        if (field.error()) return;
        const current = options.read();
        const value = stored(name, form.getValues()[name]);
        if (!current || same(byName(current)[name], value)) return;

        const patch = { [name]: value, ...(options.extra?.(name, value) ?? {}) };
        inflight.set(n => n + 1);
        try {
            // The record with its own fields replaced: the same shape it was read in.
            await options.write({ ...current, ...patch } as R);
            failed.set(false);
            savedAt.set(new Date());
        } catch {
            // Not swallowed: the state reads `failed`, and the bar says «Not saved».
            failed.set(true);
        } finally {
            inflight.set(n => n - 1);
        }
        options.after?.(name, value);
    }

    form.onFieldSave(name => { void saveField(name); });

    function load(): void {
        const read = options.read();
        if (!read) return;
        const record = byName(read);
        const values: Values = {};
        for (const name of options.fields) {
            const v = record[name];
            values[name] = Array.isArray(v) ? [...v] : v;
        }
        form.reset(values);
    }

    /** The fields whose value in the form is not the one the record holds. */
    function changedFields(read: R): string[] {
        const record = byName(read);
        const values = form.getValues();
        return options.fields.filter(name => !same(record[name], stored(name, values[name])));
    }

    async function flush(): Promise<boolean> {
        const record = options.read();
        if (!record) return true;
        const changed = changedFields(record);
        for (const name of changed) form.fields[name].onBlur();
        if (changed.some(name => form.fields[name].error())) return false;
        for (const name of changed) await saveField(name);
        return true;
    }

    async function saveChanged(): Promise<void> {
        const record = options.read();
        if (!record) return;
        for (const name of changedFields(record)) await saveField(name);
    }

    return { state, savedAt, load, saveField, saveChanged, flush };
}
