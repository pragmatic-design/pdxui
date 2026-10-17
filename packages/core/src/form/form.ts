// Reactive form primitive — signal-per-field, dirty/touched tracking,
// validation engine, form state machine, Form-Associated Custom Element support.
//
// Performance:
//   - Signal-per-field: editing one field never triggers updates in others
//   - Validation runs only for changed fields (not entire form)
//   - Computed form.valid is lazy (only evaluated when read)
//   - Batch updates on reset/setValues
//
// Security:
//   - handleSubmit prevents double-submit: a second submit returns the running one's promise
//   - Async validation: a per-field debounce with a stale guard on the current value

import { DEV } from '../utils/env';
import { signal, computed, batch } from '../reactivity/signal';
import type { Signal, ReadonlySignal, Dispose } from '../utils/types';
import type { Validator, AsyncValidator, StandardSchema } from './validators';
import { validateSchema, isRequiredValidator } from './validators';
import { createFieldArray } from './field-array';
import type { FieldArray } from './field-array';
import { flattenValues, unflattenValues, getNestedValue, setNestedValue } from './form-path';
import { resolveValidationMessage } from './validation-i18n';
import { createFormCoordinator } from './form-coordinator';
import type { FormCoordinator } from './form-coordinator';
import type { FormBridge } from '../data/data-source';
import { guardUnsavedWork } from './confirm-leave';

// ─── Types ─────────────────────────────────────────────────────────

export type FormState = 'idle' | 'validating' | 'submitting' | 'success' | 'error';

export interface FormField<T = unknown> {
    /** Current value (signal — read/write). */
    readonly value: Signal<T>;
    /** Current validation error (undefined = valid). */
    readonly error: ReadonlySignal<string | undefined>;
    /** Current warning (non-blocking, undefined = no warning). */
    readonly warning: ReadonlySignal<string | undefined>;
    /** Whether the user has blurred this field. */
    readonly touched: ReadonlySignal<boolean>;
    /** Whether the value differs from the initial value. */
    readonly dirty: ReadonlySignal<boolean>;
    /**
     * Whether the field must be filled in: its validators include `required()`.
     *
     * Read when asked, so the validators a field list adds to a row later count too. What a control
     * reads to mark itself `aria-required` and its label with the required marker. Always `false` for
     * a form validated by a Standard Schema (`schema`): a schema does not say, generically, which
     * fields it requires.
     */
    readonly required: boolean;
    /** Update the value (triggers validation if configured). */
    onChange(value: T): void;
    /** Mark as touched (triggers blur validation). */
    onBlur(): void;
    /** Reset to initial value, clear error/touched/dirty. */
    reset(): void;
}

export type SaveMode = 'onSubmit' | 'onChange' | 'onBlur' | 'immediate';

export interface FieldSaveConfig {
    /** Override save mode for this field. */
    saveMode?: SaveMode;
    /** Override save debounce for this field (ms). */
    saveDebounce?: number;
}

/**
 * Whether `createForm` enters a value to make fields of its keys: an object, not an array or a Date
 * (`isPlainObject` in ./form-path). Tuple-wrapped so an optional object, `{…} | undefined`, is not
 * split: its field starts undefined, and a leaf is what the runtime makes of it.
 */
type IsFieldGroup<V> = [V] extends [readonly unknown[]] ? false
    : [V] extends [Date | ((...args: never[]) => unknown)] ? false
    : [V] extends [object] ? true : false;

/**
 * The dotted path of each nested field, as `createForm` flattens the values into fields:
 * `{ customer: { name: string } }` → `'customer.name'`. An array is a field array (`form.array()`),
 * not a group of fields, so it is not entered.
 */
type NestedFieldPath<T> = {
    [K in keyof T & string]: T[K] extends readonly unknown[] ? never
        : IsFieldGroup<T[K]> extends true ? `${K}.${keyof T[K] & string}` | `${K}.${NestedFieldPath<T[K]>}` : never;
}[keyof T & string];

/**
 * The name of each field `createForm` makes from `T`: a leaf by its key, a nested object's leaves
 * by their dotted path, and each row of an array of objects by its index (`lines.${number}.qty`).
 * The array itself is a field as well: it is one while it is empty. This is what `fields`,
 * `errors` and `warnings` are keyed by.
 */
export type FormFieldName<T, Pre extends string = ''> = {
    [K in keyof T & string]-?: [T[K]] extends [readonly (infer U)[]]
        ? `${Pre}${K}` | (IsFieldGroup<U> extends true ? FormFieldName<U, `${Pre}${K}.${number}.`> : never)
        : IsFieldGroup<T[K]> extends true ? FormFieldName<T[K], `${Pre}${K}.`>
        : `${Pre}${K}`;
}[keyof T & string];

/** The value of the field named `P`: a dotted path, whose segment after an array is a row index. */
type FieldValue<T, P extends string> = P extends keyof T ? T[P]
    : P extends `${infer H}.${infer R}`
        ? (H extends keyof T ? FieldValue<T[H], R> : T extends readonly (infer U)[] ? FieldValue<U, R> : never)
        : never;

/**
 * What `setValues` and `reset` take: any subset of the values, at any depth. Both flatten it and
 * set only the fields it names, so `{ customer: { name } }` leaves `customer.email` as it was.
 */
export type FormValuesPatch<T> = { [K in keyof T]?: IsFieldGroup<T[K]> extends true ? FormValuesPatch<T[K]> : T[K] };

/** A form's fields, keyed as `createForm` flattens the values (`'customer.name'`, `'lines.0.qty'`). */
export type FormFields<T> = { [P in FormFieldName<T>]: FormField<FieldValue<T, P>> };

/** The value at a dotted path of `T`. */
type PathValue<T, P extends string> = P extends `${infer H}.${infer R}`
    ? (H extends keyof T ? PathValue<T[H], R> : never)
    : (P extends keyof T ? T[P] : never);

export interface FormConfig<T extends Record<string, unknown>> {
    /** Initial field values. */
    initialValues: T;
    /**
     * Per-field sync validators. Key = field name: a top-level one, or a nested field by its dotted
     * path (`'customer.name'`), which is the name `createForm` gives it.
     */
    validators?: { [K in keyof T]?: Validator<T[K]>[] } & { [P in NestedFieldPath<T>]?: Validator<PathValue<T, P>>[] };
    /** Per-field async validators. Key = field name, a nested one by its dotted path, as above. */
    asyncValidators?: { [K in keyof T]?: AsyncValidator<T[K]> } & { [P in NestedFieldPath<T>]?: AsyncValidator<PathValue<T, P>> };
    /** Async validation debounce in ms (default: 300). */
    asyncDebounceMs?: number;
    /** External schema (Standard Schema v1 — Zod/Valibot/ArkType). */
    schema?: StandardSchema<T>;
    /**
     * A rule that reads EVERY value and returns messages by field — the cross-field validator.
     *
     * A `Validator` takes one value, so a rule about two fields needs this home. Without it, a page
     * computes "the end precedes the start" as a `$derived`, renders it as its own paragraph and
     * cancels the step — a message that does not mark the fields invalid and that `valid()` never
     * knows about.
     *
     * It runs on the SAME schedule as the field validators — whenever a field validates, and in
     * `validate()` — so the message appears and clears as the user types, not only at submit.
     *
     * A field's own validator wins while it is failing: a field-level error is about the value in
     * front of the user and is the more actionable of the two, and a cross-field rule is about a
     * pair that are each individually fine. A message keyed to no field still lands in `errors`
     * and still makes the form invalid, so a typo in the key cannot read as a rule that passed.
     *
     * @example
     * createForm({
     *     initialValues: { start: '', end: '' },
     *     validate: (v) => (v.end && v.start && v.end < v.start ? { end: 'Ends before it starts' } : {}),
     * })
     */
    validate?: (values: T) => Partial<Record<keyof T, string>> | Record<string, string> | void;
    /** Validation mode: when to validate fields (default: 'onBlur'). */
    validateOn?: 'onChange' | 'onBlur' | 'onSubmit';
    /** Save mode: when the form auto-saves (default: 'onSubmit'). */
    saveMode?: SaveMode;
    /** Debounce for onChange/immediate save modes (ms, default: 500). */
    saveDebounce?: number;
    /** Per-field save mode overrides. */
    fieldConfig?: { [K in keyof T]?: FieldSaveConfig };
    /** Warning-only validators (non-blocking, yellow hints). */
    warnings?: { [K in keyof T]?: Validator<T[K]>[] };
    /** Field used as the record's unique id — resolves the id for DataSource binding. */
    idField?: string;
    /** Form name — identifies this form to a parent coordinator (nested-form coordination). */
    name?: string;
    /** DataSource to bind this form to — form edits flow to the source as a record patch. */
    source?: FormDataSource;
    /** Parent form for nested form coordination. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous parent form (value type erased)
    parent?: Form<any>;
    /**
     * Ask before the page is left with unsaved work: an in-app confirm (strings `form.unsaved*`)
     * on navigation, the browser's own prompt on close and reload. Needs a component setup to
     * attach to. `@form f: { … } { warnUnsaved }` compiles to this — the options are the block after
     * the fields.
     */
    warnUnsaved?: boolean;
}

/**
 * Minimal DataSource surface a form binds to. Structural — a full `DataSource<T>`
 * satisfies it — so form.ts avoids a hard runtime dependency on the data layer.
 */
export interface FormDataSource {
    bindForm(bridge: FormBridge, id?: unknown): Dispose;
}

/** Symbol-keyed lazy FormCoordinator attached to a parent form for nested-form coordination. */
export const FORM_COORDINATOR = Symbol('pragmatic:form-coordinator');

/** Get (or lazily create + attach) the FormCoordinator on a parent form. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous parent form (value type erased)
export function getCoordinator(parentForm: Form<any>): FormCoordinator {
    const holder = parentForm as { [FORM_COORDINATOR]?: FormCoordinator };
    if (!holder[FORM_COORDINATOR]) {
        holder[FORM_COORDINATOR] = createFormCoordinator();
    }
    return holder[FORM_COORDINATOR]!;
}

/** Fallback name sequence for child forms registered without an explicit name. */
let _anonFormSeq = 0;

export interface Form<T extends Record<string, unknown>> {
    /** Individual field accessors, keyed by the flattened name: `fields['customer.name']`. */
    readonly fields: FormFields<T>;
    /** Whether all fields pass validation. */
    readonly valid: ReadonlySignal<boolean>;
    /** Whether any field has been modified. */
    readonly dirty: ReadonlySignal<boolean>;
    /** Whether any field has been touched. */
    readonly touched: ReadonlySignal<boolean>;
    /** Whether form is currently submitting. */
    readonly submitting: ReadonlySignal<boolean>;
    /** Whether form was submitted at least once. */
    readonly submitted: ReadonlySignal<boolean>;
    /** All current errors keyed by field name. */
    readonly errors: ReadonlySignal<Partial<Record<FormFieldName<T>, string>>>;
    /** All current warnings keyed by field name (non-blocking). */
    readonly warnings: ReadonlySignal<Partial<Record<FormFieldName<T>, string>>>;
    /** Configured save mode. */
    readonly saveMode: SaveMode;
    /** Configured validation mode. */
    readonly validateOn: 'onChange' | 'onBlur' | 'onSubmit';
    /** Form lifecycle state. */
    readonly state: ReadonlySignal<FormState>;
    /** Submission error (if state = 'error'). */
    readonly submitError: ReadonlySignal<unknown | undefined>;
    /**
     * The server's messages that name no field of the form, joined by a newline: from a submit
     * rejected with RFC 9457 field errors (`{ errors: { path: [message] } }`), whose other messages
     * land on their fields' `error()`. Cleared when a submit starts.
     */
    readonly formError: ReadonlySignal<string | undefined>;

    /**
     * Wrap a submit handler with validation + state management. The handler returns the submit's
     * promise; a second call while one runs submits nothing and returns the running one's.
     */
    handleSubmit(fn: (values: T) => Promise<void> | void): (e: Event) => Promise<void>;
    /**
     * Reset all fields to the snapshot: the initial values, or the last values passed here.
     *
     * `newValues` is MERGED into the snapshot, not substituted for it: a field it does not mention
     * keeps the value an earlier `reset(values)` gave it. So `reset({})` does not empty a form that
     * was loaded with an entity, and loading a second entity keeps the fields the first one had and
     * the second lacks. To start from the defaults again, create a new form.
     */
    reset(newValues?: FormValuesPatch<T>): void;
    /** Set multiple field values at once. */
    setValues(values: FormValuesPatch<T>): void;
    /** Run validation on all fields, return true if valid. */
    validate(): Promise<boolean>;

    /**
     * Access a field array (for array-typed fields). A key whose value is `unknown`, as in a form
     * typed by a record, may hold one: its rows are `unknown`, not `never`. That is also what keeps
     * a typed form assignable to `Form<Record<string, unknown>>`, which is compared member by member.
     */
    array<K extends keyof T>(name: K): FieldArray<T[K] extends (infer U)[] ? U : unknown extends T[K] ? unknown : never>;
    /** Dotted path into a nested array ('order.items'), which `array()` resolves the same way. */
    array<U = unknown>(name: string): FieldArray<U>;

    /** Get current values snapshot (non-reactive). */
    getValues(): T;

    /**
     * Set callback for per-field save (used by DataSource integration). Return the save's promise and
     * the form keeps one save per field in flight: a save asked for meanwhile waits, and starts with
     * the field's newest value when the one in flight settles.
     */
    onFieldSave(callback: (fieldName: string, value: unknown) => void | Promise<unknown>): void;

    /** Dispose all effects and cleanup. */
    dispose(): void;
}

// ─── Internal API for dynamic field management (used by pdx-field-list) ────

/** Symbol-keyed internal API — not part of the public Form interface. */
export const FORM_INTERNALS = Symbol('pragmatic:form-internals');

export interface FormInternals {
    /** Create a new field signal at the given dotted path, with optional validators. */
    addField(path: string, initialValue: unknown, validators?: Validator<unknown>[]): void;
    /** Remove all field signals matching a prefix (e.g., 'items.2'). */
    removeFields(prefix: string): void;
    /** Rename field signals from one prefix to another (e.g., re-index after remove). */
    renameFields(oldPrefix: string, newPrefix: string): void;
    /** Get all current field paths. */
    getFieldPaths(): string[];
    /** Signal that bumps when field structure changes (for reactive re-rendering). */
    readonly fieldVersion: () => number;
}

// ─── createForm() ──────────────────────────────────────────────────

/**
 * A form as reactive state: values, errors, touched flags, validity and submission, from an initial
 * object and a set of validators.
 *
 * Nested initial values are FLATTENED into dotted paths — `{ customer: { name } }` becomes
 * `'customer.name'` — so a field addresses itself the same way however deep it sits, and validators
 * are declared against one flat key space. The types follow it: `fields`, `errors` and `warnings` are
 * keyed by those names (a row's by its index, `'lines.0.qty'`), each field typed by the value it holds.
 *
 * `validateOn` decides when errors appear: `onBlur` by default, because validating while someone is
 * still typing shows them an error for a value they have not finished writing. Async validators are
 * debounced (300ms) for the same reason.
 *
 * In a `.pdx` file `@form user: { … }` (or `@form user: UserSchema`) compiles to this, and
 * `<pdx-form :form>` shares it with the fields below it — which is what `provideForm`/`useForm` are
 * for.
 */
export function createForm<T extends Record<string, unknown>>(
    config: FormConfig<T>,
): Form<T> {
    const validateOn = config.validateOn ?? 'onBlur';
    const asyncDebounce = config.asyncDebounceMs ?? 300;

    // Flatten nested initialValues into dotted-path keys.
    // { customer: { name: 'Jane' } } → { 'customer.name': 'Jane' }
    // Flat objects pass through unchanged (backward compatible).
    const flatInitial = flattenValues(config.initialValues as Record<string, unknown>);
    const fieldNames: string[] = Object.keys(flatInitial);

    // Form-level state
    const _state = signal<FormState>('idle');
    const _submitted = signal(false);
    const _submitError = signal<unknown | undefined>(undefined);

    const saveMode = config.saveMode ?? 'onSubmit';
    const saveDebounce = config.saveDebounce ?? 500;

    // Per-field signals — keyed by dotted path (e.g., 'customer.name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous field map (per-field value types erased)
    const fieldMap = {} as Record<string, FormField<any>>;
    const fieldErrors: Record<string, Signal<string | undefined>> = {};
    const fieldWarnings: Record<string, Signal<string | undefined>> = {};
    const fieldTouched: Record<string, Signal<boolean>> = {};
    const fieldDirty: Record<string, Signal<boolean>> = {};
    const fieldValues: Record<string, Signal<unknown>> = {};
    // Per-field warning pass, kept reachable from validateAll(). The warning rules live in a
    // closure inside buildField, so without this handle only the interactive path could run them.
    const fieldRunWarnings: Record<string, (value: unknown) => void> = {};
    /** Each field's own validation path — what an edit runs — for a submit that a change interrupted. */
    const fieldValidate: Record<string, (value: unknown) => void> = {};
    // Keep flat snapshot for dirty tracking (dotted-path keys → initial values)
    const flatSnapshot: Record<string, unknown> = { ...flatInitial };

    // Dynamic validators — added via FORM_INTERNALS.addField() for field-list items
    const dynamicValidators: Record<string, Validator<unknown>[]> = {};

    /**
     * What `config.validate` last said, by field path. Kept apart from `fieldErrors` on purpose:
     * they have different owners and different lifetimes. A field's own error is recomputed when
     * that field validates; this whole record is recomputed whenever ANY field does, and writing
     * it into `fieldErrors` would mean the next `validateField` on an untouched field silently
     * wiped a message the rule still stands by.
     */
    const _crossErrors = signal<Record<string, string>>({});

    /**
     * Run the form-level rule and store what it says. Returns the messages, for the callers that
     * need to know whether the form is blocked.
     *
     * A recompute, not an accumulation: every call replaces the whole record, so correcting
     * either side of a pair lifts the message.
     */
    function runFormValidate(): Record<string, string> {
        if (!config.validate) return {};
        const produced = (config.validate(getValues()) ?? {}) as Record<string, unknown>;
        const next: Record<string, string> = {};
        for (const [path, message] of Object.entries(produced)) {
            if (typeof message === 'string' && message !== '') next[path] = message;
        }
        _crossErrors.set(next);
        return next;
    }

    /**
     * The message a field shows: its own validator's first, then the form-level rule's.
     *
     * One definition, three readers — the field's `error`, `errors` and `valid` — because a
     * precedence rule that lives in three places is a precedence rule that will disagree with
     * itself.
     */
    function effectiveError(name: string): string | undefined {
        return fieldErrors[name]?.() ?? _crossErrors()[name] ?? _serverErrors()[name];
    }

    /**
     * What the server said about each field when it refused the last submit (beta spec, F5): the
     * third source of a field's message, after its own validator's and the form-level rule's. A
     * field's message clears on its next edit; all of them, and `_formError`, when a submit starts.
     */
    const _serverErrors = signal<Record<string, string>>({});
    /** The server's messages that name no field of the form (an empty path, `$`, an unknown one). */
    const _formError = signal<string | undefined>(undefined);

    /**
     * Read a rejection as RFC 9457 problem details with an `errors` member — `{ errors: { path:
     * message | message[] } }`, as ASP.NET Core's validation problems and most servers send it —
     * from an `HttpError`'s parsed body or the rejection itself. Each path's first message goes to
     * the field it names, as written or ignoring case (`Email` → `email`, `Items[0].Name` →
     * `items.0.name`); the rest is joined into the form's error. Anything else changes nothing.
     */
    function applyServerErrors(err: unknown): void {
        const body = err && typeof err === 'object' && 'data' in err && (err as { data: unknown }).data
            && typeof (err as { data: unknown }).data === 'object' ? (err as { data: object }).data : err;
        const reported = body && typeof body === 'object' ? (body as { errors?: unknown }).errors : undefined;
        if (!reported || typeof reported !== 'object' || Array.isArray(reported)) return;
        const byLowerCase = new Map(Object.keys(fieldMap).map((name) => [name.toLowerCase(), name]));
        const onFields: Record<string, string> = {};
        const unmatched: string[] = [];
        for (const [rawPath, raw] of Object.entries(reported as Record<string, unknown>)) {
            const messages = (Array.isArray(raw) ? raw : [raw]).filter((m): m is string => typeof m === 'string' && m !== '');
            if (messages.length === 0) continue;
            // `items[0].name` → `items.0.name`: the form's dotted path.
            const path = rawPath.replace(/\[(\d+)\]/g, '.$1').replace(/^\$\.?/, '');
            const field = path === '' ? undefined : (fieldMap[path] ? path : byLowerCase.get(path.toLowerCase()));
            if (field) { if (!onFields[field]) onFields[field] = messages[0]; } else unmatched.push(...messages);
        }
        batch(() => {
            _serverErrors.set(onFields);
            _formError.set(unmatched.length > 0 ? unmatched.join('\n') : undefined);
        });
    }

    // Async validation timers
    const asyncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

    // Save debounce timers (for onChange/immediate save modes)
    const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    // The fields with a save in flight, and those with one waiting for it (beta spec, F7).
    const savesInFlight = new Set<string>();
    const savesWaiting = new Set<string>();

    // Build fields from flattened initial values
    function buildField(name: string, initial: unknown): void {
        const _value = signal<unknown>(initial);
        const _error = signal<string | undefined>(undefined);
        const _warning = signal<string | undefined>(undefined);
        const _touched = signal(false);
        const _dirty = signal(false);

        fieldValues[name] = _value;
        fieldErrors[name] = _error;
        fieldWarnings[name] = _warning;
        fieldTouched[name] = _touched;
        fieldDirty[name] = _dirty;

        /** Config validators (static), then dynamic validators (from addField) — looked up each time. */
        function validatorsOf(): Validator<unknown>[] | undefined {
            return (config.validators as Record<string, Validator<unknown>[]>)?.[name] ?? dynamicValidators[name];
        }

        function runSyncValidation(value: unknown): string | undefined {
            const validators = validatorsOf();
            if (validators) {
                for (const v of validators) {
                    const err = v(value);
                    if (err) return resolveValidationMessage(err);
                }
            }
            return undefined;
        }

        function runWarnings(value: unknown): void {
            const warningValidators = config.warnings?.[name];
            if (!warningValidators) { _warning.set(undefined); return; }
            for (const v of warningValidators) {
                const w = v(value as T[typeof name]);
                if (w) { _warning.set(resolveValidationMessage(w)); return; }
            }
            _warning.set(undefined);
        }

        fieldRunWarnings[name] = runWarnings;

        function scheduleAsyncValidation(value: unknown): void {
            const asyncValidator = config.asyncValidators?.[name];
            if (!asyncValidator) return;

            if (asyncTimers[name]) clearTimeout(asyncTimers[name]);

            asyncTimers[name] = setTimeout(async () => {
                const err = await asyncValidator(value as T[typeof name]);
                if (_value.peek() === value) {
                    _error.set(resolveValidationMessage(err));
                }
            }, asyncDebounce);
        }

        function validateField(value: unknown): void {
            const syncError = runSyncValidation(value);
            _error.set(syncError);
            if (!syncError) scheduleAsyncValidation(value);
            runWarnings(value);
            // The form-level rule reads every value, so any field validating is its cue. Here
            // and not in `onChange` alone: `onBlur` has to refresh it too, or a pair corrected
            // through a blur would keep a message that no longer applies.
            runFormValidate();
        }

        fieldValidate[name] = validateField;

        // Resolve per-field save mode (field override > form default)
        const fieldSaveMode = config.fieldConfig?.[name]?.saveMode ?? saveMode;
        const fieldSaveDebounce = config.fieldConfig?.[name]?.saveDebounce ?? saveDebounce;

        function scheduleSave(): void {
            if (fieldSaveMode === 'onSubmit') return; // handled by handleSubmit
            if (saveTimers[name]) clearTimeout(saveTimers[name]);
            // 'immediate': no debounce — fire on the next task, to batch
            saveTimers[name] = setTimeout(fireSave, fieldSaveMode === 'immediate' ? 0 : fieldSaveDebounce);
        }

        /**
         * One save of this field in flight, at most one waiting (beta spec, F7): two writes of one
         * field never run together, so the older can no longer land last. A save asked for while one
         * runs waits; when that one settles — answered or failed — the waiting one starts, with the
         * value the field holds THEN. A callback that returns nothing has nothing to wait for: each
         * save starts at once, as before.
         */
        function fireSave(): void {
            delete saveTimers[name];
            if (savesInFlight.has(name)) { savesWaiting.add(name); return; }
            const result = _onFieldSave?.(name, _value.peek());
            if (!result || typeof (result as Promise<unknown>).then !== 'function') return;
            savesInFlight.add(name);
            const settled = (): void => {
                savesInFlight.delete(name);
                if (savesWaiting.delete(name)) fireSave();
            };
            (result as Promise<unknown>).then(settled, settled);
        }

        const field: FormField<T[typeof name]> = {
            value: _value as Signal<T[typeof name]>,
            error: computed(() => effectiveError(name)) as ReadonlySignal<string | undefined>,
            warning: computed(() => _warning()) as ReadonlySignal<string | undefined>,
            touched: computed(() => _touched()) as ReadonlySignal<boolean>,
            dirty: computed(() => _dirty()) as ReadonlySignal<boolean>,
            get required(): boolean {
                return validatorsOf()?.some(isRequiredValidator) ?? false;
            },

            onChange(newValue: T[typeof name]): void {
                _value.set(newValue);
                // What the server said about the old value no longer holds for the new one.
                if (name in _serverErrors.peek()) {
                    const { [name]: _cleared, ...rest } = _serverErrors.peek();
                    _serverErrors.set(rest);
                }
                _dirty.set(!Object.is(newValue, flatSnapshot[name]));
                if (validateOn === 'onChange' || _touched.peek()) {
                    validateField(newValue);
                }
                if (fieldSaveMode === 'onChange' || fieldSaveMode === 'immediate') {
                    scheduleSave();
                }
            },

            onBlur(): void {
                _touched.set(true);
                if (validateOn === 'onBlur' || validateOn === 'onChange') {
                    validateField(_value.peek());
                }
                if (fieldSaveMode === 'onBlur') {
                    scheduleSave();
                }
            },

            reset(): void {
                batch(() => {
                    _value.set(flatSnapshot[name]);
                    _error.set(undefined);
                    _warning.set(undefined);
                    _touched.set(false);
                    _dirty.set(false);
                });
            },
        };

        fieldMap[name] = field;
    }

    // Initialize all fields from flattened initial values
    for (const name of fieldNames) {
        buildField(name, flatInitial[name]);
    }

    // Field arrays (lazy — created on first access)
    const fieldArrays = new Map<string, FieldArray<unknown>>();

    // Save callback — set by <pdx-form> or manually for DataSource integration
    let _onFieldSave: ((fieldName: string, value: unknown) => void | Promise<unknown>) | undefined;

    // External bindings (DataSource, parent coordinator) disposed on form.dispose()
    const _externalDisposers: Dispose[] = [];

    // Version signal — bumped when fields are added/removed dynamically
    const _fieldVersion = signal(0);

    // Field-array values as last saved (JSON), once a submit has succeeded. Until then an array is
    // compared to its initial value.
    const arrayBaseline = new Map<string, string>();

    // Computed form-level state (reads _fieldVersion to re-evaluate on dynamic field changes)
    const valid = computed(() => {
        _fieldVersion(); // subscribe to field structure changes
        for (const name of Object.keys(fieldErrors)) {
            if (fieldErrors[name]()) return false;
        }
        // The form-level rule's messages, including any keyed to no field: an unroutable message
        // that left `valid()` true would read exactly like a rule that passed. And the server's, on
        // its fields: a form the server just refused is not valid until they are edited.
        return Object.keys(_crossErrors()).length === 0 && Object.keys(_serverErrors()).length === 0;
    });

    const dirty = computed(() => {
        _fieldVersion();
        for (const name of Object.keys(fieldDirty)) {
            if (fieldDirty[name]()) return true;
        }
        // Field arrays live outside fieldDirty — an append/remove/reorder must also make the
        // form dirty. Reading items() subscribes; compare to the initial snapshot, or to
        // what the last successful submit saved.
        for (const [key, arr] of fieldArrays) {
            arr.items(); // subscribe to array mutations
            const baseline = arrayBaseline.get(key)
                ?? JSON.stringify((getNestedValue(config.initialValues, key) ?? []) as unknown[]);
            if (JSON.stringify(arr.getValues()) !== baseline) return true;
        }
        return false;
    });

    const touched = computed(() => {
        _fieldVersion();
        for (const name of Object.keys(fieldTouched)) {
            if (fieldTouched[name]()) return true;
        }
        return false;
    });

    const errors = computed(() => {
        _fieldVersion();
        // The server's messages, then the form-level rule's, then each field's own, each overwriting
        // the one before for the same field — the precedence `effectiveError` gives a single field.
        const result: Record<string, string> = { ..._serverErrors(), ..._crossErrors() };
        for (const name of Object.keys(fieldErrors)) {
            const err = fieldErrors[name]();
            if (err) result[name] = err;
        }
        return result;
    });

    const formWarnings = computed(() => {
        _fieldVersion();
        const result: Record<string, string> = {};
        for (const name of Object.keys(fieldWarnings)) {
            const w = fieldWarnings[name]();
            if (w) result[name] = w;
        }
        return result;
    });

    // Validate all fields (including schema validation)
    async function validateAll(): Promise<boolean> {
        _state.set('validating');
        const currentFields = Object.keys(fieldValues);
        // What this validation is about. The async rules answer for these values; a field that
        // moves on before they answer was not validated, and the submit must not send it.
        const validated = new Map(currentFields.map((name) => [name, fieldValues[name].peek()]));

        // Run schema validation if provided
        if (config.schema) {
            const values = getValues();
            const schemaErrors = validateSchema(config.schema, values);
            batch(() => {
                // Clear all field errors first
                for (const name of currentFields) fieldErrors[name].set(undefined);
                // Apply schema errors (dotted paths from schema match our field keys)
                for (const [path, msg] of Object.entries(schemaErrors)) {
                    if (fieldErrors[path]) fieldErrors[path].set(msg);
                }
            });
            const hasErrors = Object.keys(schemaErrors).length > 0;
            if (hasErrors) {
                _state.set('idle');
                return false;
            }
        }

        // Run per-field sync validators (config keys may be dotted paths).
        // The dynamicValidators registered through addField (field-list fields) are included:
        // without them, a dynamic required field would pass the submit if never touched.
        let hasError = false;
        batch(() => {
            for (const name of currentFields) {
                const value = fieldValues[name].peek();
                const validators = (config.validators as Record<string, Validator<unknown>[]>)?.[name] ?? dynamicValidators[name];
                let error: string | undefined;
                if (validators) {
                    for (const v of validators) {
                        const err = v(value);
                        if (err) { error = resolveValidationMessage(err); break; }
                    }
                }
                // Assigned every time, not only on failure. validate() is a RECOMPUTE: a field
                // that now passes has to lose the message it had. Setting only on failure left
                // the error under a corrected input whenever the value arrived without going
                // through onChange/onBlur — setValues(), a DataSource load, a direct signal
                // write — so validate() returned true while form.valid() stayed false.
                fieldErrors[name].set(error);
                if (error) hasError = true;
                // Same reason for warnings: they were computed by the field path only, so a form
                // filled programmatically and then validated produced no warning at all.
                fieldRunWarnings[name]?.(value);
            }
        });

        // The form-level rule, after the fields: it reads the values, not the errors, so the
        // order does not change what it says — but running it here rather than in the field loop
        // keeps it one call instead of one per field. `validateOn: 'onSubmit'` never calls the
        // field path at all, so without this the one gate that matters would not see the rule.
        const crossErrors = runFormValidate();
        if (hasError || Object.keys(crossErrors).length > 0) {
            _state.set('idle');
            return false;
        }

        // Run async validators — with a stale guard: if the value changes during
        // the await, the error that refers to the old value is not applied.
        const asyncPromises: Promise<void>[] = [];
        for (const name of currentFields) {
            const asyncValidator = (config.asyncValidators as Record<string, (v: unknown) => Promise<string | undefined>>)?.[name];
            if (!asyncValidator) continue;
            const valueAtStart = fieldValues[name].peek();
            asyncPromises.push(
                asyncValidator(valueAtStart).then((err: string | undefined) => {
                    // The stale-guard — an answer about a value the field has since left is never
                    // written. The answer is written even when it is "no error": otherwise an
                    // async rule that stops failing would leave its old message behind.
                    if (fieldValues[name] && fieldValues[name].peek() === valueAtStart) {
                        fieldErrors[name].set(err);
                        if (err) hasError = true;
                    }
                })
            );
        }

        if (asyncPromises.length > 0) await Promise.all(asyncPromises);

        // A value edited during the wait was validated by nothing: the answer about the old value
        // was (rightly) dropped above, and a dropped answer is not a pass. That stops this submit —
        // invalid, and the next one validates the new value (beta spec, data.md, F4). The changed
        // fields go through the path an edit takes, so the new value's own errors show now.
        const moved = currentFields.filter((name) => fieldValues[name] && !Object.is(fieldValues[name].peek(), validated.get(name)));
        if (moved.length > 0) {
            batch(() => {
                for (const name of moved) fieldValidate[name]?.(fieldValues[name].peek());
            });
            _state.set('idle');
            return false;
        }

        _state.set('idle');
        return !hasError;
    }

    /**
     * What a successful submit saved becomes the form's clean state: `dirty()` is false again, and
     * leaving a `warnUnsaved` form does not ask about work it has just saved. A field edited while the save was in flight stays dirty against the saved value.
     */
    function rebaseTo(saved: T): void {
        const flatSaved = flattenValues(saved as Record<string, unknown>);
        for (const name of Object.keys(fieldValues)) {
            // A name a field array owns is rebased as an array, below: its field signal still
            // holds the initial list, and comparing that to the saved one would read as an edit.
            if (!(name in flatSaved) || fieldArrays.has(name)) continue;
            flatSnapshot[name] = flatSaved[name];
            fieldDirty[name].set(!Object.is(fieldValues[name].peek(), flatSnapshot[name]));
        }
        for (const key of fieldArrays.keys()) {
            arrayBaseline.set(key, JSON.stringify(getNestedValue(saved, key) ?? []));
        }
        _fieldVersion.set(v => v + 1);
    }

    function getValues(): T {
        const flat: Record<string, unknown> = {};
        const names = Object.keys(fieldValues);
        for (const name of names) {
            // A leaf that ALSO has dotted children is a stale copy of them, and it is skipped.
            // `flattenValues` leaves an empty array as a leaf, so `{ lines: [] }` makes a `lines`
            // field; rows then arrive as `lines.0.*` and a copy of them gets written back into
            // that leaf, which nothing updates on removal. Unflattening both would put the removed
            // row back, and the payload would carry the surviving row twice. The per-field values are the state; the leaf is a mirror.
            if (names.some(other => other.startsWith(`${name}.`))) continue;
            flat[name] = fieldValues[name].peek();
        }
        const out = unflattenValues(flat) as Record<string, unknown>;
        // Merge field-array values back in. They live in a separate map (createFieldArray),
        // so without this bridge form.array('items').append(x) would never reach submit/getValues
        // and the edit would be silently lost.
        for (const [key, arr] of fieldArrays) {
            const fromArray = arr.getValues();
            // ...and an EMPTY one does not erase rows that exist. A repeating section has two
            // representations: `<pdx-field-list>` keeps its rows as dotted fields and mirrors
            // them onto the array field, while a FieldArray knows only what was appended through
            // it. Merely READING `form.array('lines')` — to show a count — creates an empty one,
            // and this line would then overwrite a filled-in row with `[]`: on screen, passing its
            // own `required`, and arriving at the server as nothing.
            // Read off what was just assembled, not off the leaf signal: with rows present the
            // leaf is the stale mirror skipped above, and this has to see the real ones.
            const fromFields = getNestedValue(out, key);
            if (fromArray.length === 0 && Array.isArray(fromFields) && fromFields.length > 0) continue;
            setNestedValue(out, key, fromArray);
        }
        return out as T;
    }

    /** The submit running now: what a second submit returns instead of submitting again (beta spec, F2). */
    let runningSubmit: Promise<void> | null = null;

    const form: Form<T> = {
        fields: fieldMap as Form<T>['fields'],
        valid: valid as ReadonlySignal<boolean>,
        dirty: dirty as ReadonlySignal<boolean>,
        touched: touched as ReadonlySignal<boolean>,
        submitting: computed(() => _state() === 'submitting') as ReadonlySignal<boolean>,
        submitted: computed(() => _submitted()) as ReadonlySignal<boolean>,
        errors: errors as Form<T>['errors'],
        warnings: formWarnings as Form<T>['warnings'],
        saveMode,
        validateOn,
        state: computed(() => _state()) as ReadonlySignal<FormState>,
        submitError: computed(() => _submitError()) as ReadonlySignal<unknown | undefined>,
        formError: computed(() => _formError()) as ReadonlySignal<string | undefined>,

        handleSubmit(fn: (values: T) => Promise<void> | void): (e: Event) => Promise<void> {
            return (e: Event) => {
                e.preventDefault();
                // A second submit while one runs is dropped, and WAITS for it (beta spec, F2): it
                // returns the running submit's promise, so code awaiting it — a test, a «saved»
                // toast — runs after the save, not before. Taken before the validation await, or two
                // concurrent submits would both start while validateAll() is pending.
                if (runningSubmit) return runningSubmit;
                runningSubmit = runSubmit().finally(() => { runningSubmit = null; });
                return runningSubmit;
            };

            async function runSubmit(): Promise<void> {
                // Touch all fields so errors show; and what the server said about the last submit
                // goes — this one is judged on its own values.
                batch(() => {
                    for (const name of Object.keys(fieldTouched)) fieldTouched[name].set(true);
                    _serverErrors.set({});
                    _formError.set(undefined);
                });

                const isValid = await validateAll();
                if (!isValid) return;

                _state.set('submitting');
                _submitError.set(undefined);

                try {
                    const submitted = getValues();
                    await fn(submitted);
                    batch(() => {
                        rebaseTo(submitted);
                        _state.set('success');
                        _submitted.set(true);
                    });
                } catch (err) {
                    batch(() => {
                        _state.set('error');
                        _submitError.set(err);
                        // The server's field errors on their fields (beta spec, F5).
                        applyServerErrors(err);
                    });
                }
            }
        },

        reset(newValues?: FormValuesPatch<T>): void {
            if (newValues) {
                const flatNew = flattenValues(newValues as Record<string, unknown>);
                Object.assign(flatSnapshot, flatNew);
            }
            batch(() => {
                for (const name of Object.keys(fieldValues)) {
                    if (flatSnapshot[name] !== undefined) {
                        fieldValues[name].set(flatSnapshot[name]);
                    }
                    fieldErrors[name].set(undefined);
                    fieldWarnings[name].set(undefined);
                    fieldTouched[name].set(false);
                    fieldDirty[name].set(false);
                }
                _state.set('idle');
                _submitted.set(false);
                _submitError.set(undefined);
            });
            // Reset field arrays
            for (const [, arr] of fieldArrays) arr.reset();
        },

        setValues(values: FormValuesPatch<T>): void {
            // Flatten nested values before applying to field signals
            const flat = flattenValues(values as Record<string, unknown>);
            batch(() => {
                for (const [key, val] of Object.entries(flat)) {
                    if (fieldValues[key]) {
                        fieldValues[key].set(val);
                        fieldDirty[key].set(!Object.is(val, flatSnapshot[key]));
                    }
                }
            });
        },

        async validate(): Promise<boolean> {
            // Touch all fields
            batch(() => {
                for (const name of Object.keys(fieldTouched)) fieldTouched[name].set(true);
            });
            return validateAll();
        },

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- erases K to satisfy the interface's per-K mapped return type
        array<K extends keyof T>(name: K): FieldArray<any> {
            const key = name as string;
            let arr = fieldArrays.get(key);
            if (!arr) {
                // Something else already manages these rows — a `<pdx-field-list>`, which keeps
                // them as dotted fields. `docs/forms.md` says the two do not compose and the
                // author picks one; this says so, because the cost of using both is a payload
                // that silently loses every row.
                if (DEV && Object.keys(fieldValues).some(n => n.startsWith(`${key}.`))) {
                    console.warn(
                        `[pdx-form] form.array('${key}') — but '${key}' already has rows registered as `
                        + `fields ('${key}.0.…'), which is how <pdx-field-list> keeps them. The two do not `
                        + 'compose: read the rows from the field instead, or drop the field-list.',
                    );
                }
                // Support dotted paths for nested arrays (e.g., 'order.items')
                const initial = (getNestedValue(config.initialValues, key) ?? []) as unknown[];
                arr = createFieldArray(initial);
                fieldArrays.set(key, arr);
                // Registering a new array changes the form's value/dirty surface — bump so the
                // aggregate computeds (dirty, …) re-run and subscribe to the array.
                _fieldVersion.set(v => v + 1);
            }
            return arr;
        },

        getValues,

        onFieldSave(callback: (fieldName: string, value: unknown) => void | Promise<unknown>): void {
            _onFieldSave = callback;
        },

        dispose(): void {
            for (const timer of Object.values(asyncTimers)) clearTimeout(timer);
            for (const timer of Object.values(saveTimers)) clearTimeout(timer);
            // A save waiting for the one in flight is dropped: nothing starts after dispose().
            savesWaiting.clear();
            for (const [, arr] of fieldArrays) arr.dispose();
            for (const d of _externalDisposers) d();
        },
    };

    // ─── DataSource binding (@form { source }) ──────────────────────
    // Form edits flow to the DataSource as a patch on the bound record.
    if (config.source) {
        const idField = config.idField ?? 'id';
        const id = (config.initialValues as Record<string, unknown>)[idField];
        const bridge: FormBridge = {
            getValues: () => getValues() as Record<string, unknown>,
            setValues: (values) => form.setValues(values as FormValuesPatch<T>),
            state: {
                dirty: dirty as ReadonlySignal<boolean>,
                // getValues() reads with .peek() (non-reactive) — so subscribe to the field
                // signals here, else this computed caches the initial values forever.
                values: computed(() => {
                    _fieldVersion(); // react to dynamic field add/remove
                    for (const k of Object.keys(fieldValues)) fieldValues[k]();
                    return getValues() as Record<string, unknown>;
                }) as ReadonlySignal<Record<string, unknown>>,
            },
        };
        // ASSUMPTION: no resolvable id → create-mode form; bindForm becomes an inert
        // subscription (its patch path is id-gated) rather than an error.
        _externalDisposers.push(config.source.bindForm(bridge, id));
    }

    // ─── Unsaved work (@form { warnUnsaved }) ─────────────────────────
    if (config.warnUnsaved) guardUnsavedWork(() => dirty());

    // ─── Nested-form coordination (@form { parent }) ────────────────
    // Register this form with the parent's coordinator; deregister on dispose.
    if (config.parent) {
        const coordinator = getCoordinator(config.parent);
        const childName = config.name ?? `form_${++_anonFormSeq}`;
        coordinator.register(childName, form);
        _externalDisposers.push(() => coordinator.unregister(childName));
    }

    // Attach internal API for dynamic field management (used by pdx-field-list)
    (form as { [FORM_INTERNALS]?: FormInternals })[FORM_INTERNALS] = {
        addField(path: string, initialValue: unknown, validators?: Validator<unknown>[]): void {
            // The validators are registered FIRST, and for an existing field too. The early return
            // below guards the VALUE — re-adding a field must not reset what the user typed — and a
            // row that came from `initialValues` already has its fields when pdx-field-list gets to
            // it. Returning before this would leave every initial row unvalidated.
            if (validators && validators.length > 0) {
                dynamicValidators[path] = validators;
            }
            if (fieldValues[path]) return; // already exists — keep its value
            buildField(path, initialValue);
            flatSnapshot[path] = initialValue;
            _fieldVersion.set(v => v + 1);
        },
        removeFields(prefix: string): void {
            const prefixDot = prefix + '.';
            for (const key of Object.keys(fieldValues)) {
                if (key === prefix || key.startsWith(prefixDot)) {
                    delete fieldValues[key];
                    delete fieldErrors[key];
                    delete fieldWarnings[key];
                    delete fieldTouched[key];
                    delete fieldDirty[key];
                    delete fieldMap[key];
                    delete flatSnapshot[key];
                    delete dynamicValidators[key];
                    delete fieldValidate[key];
                    // The pending timers of the removed field: without the clear, an armed
                    // saveTimer would save a phantom field after the removal.
                    if (asyncTimers[key]) { clearTimeout(asyncTimers[key]); delete asyncTimers[key]; }
                    if (saveTimers[key]) { clearTimeout(saveTimers[key]); delete saveTimers[key]; }
                }
            }
            _fieldVersion.set(v => v + 1);
        },
        renameFields(oldPrefix: string, newPrefix: string): void {
            const oldDot = oldPrefix + '.';
            const entries: [string, string][] = [];
            for (const key of Object.keys(fieldValues)) {
                if (key.startsWith(oldDot)) {
                    const suffix = key.slice(oldDot.length);
                    entries.push([key, `${newPrefix}.${suffix}`]);
                }
            }
            for (const [oldKey, newKey] of entries) {
                // The timers stay anchored to the old name: better to cancel them than
                // to let them fire with the wrong one.
                if (asyncTimers[oldKey]) { clearTimeout(asyncTimers[oldKey]); delete asyncTimers[oldKey]; }
                if (saveTimers[oldKey]) { clearTimeout(saveTimers[oldKey]); delete saveTimers[oldKey]; }
                fieldValues[newKey] = fieldValues[oldKey]; delete fieldValues[oldKey];
                fieldErrors[newKey] = fieldErrors[oldKey]; delete fieldErrors[oldKey];
                fieldWarnings[newKey] = fieldWarnings[oldKey]; delete fieldWarnings[oldKey];
                fieldTouched[newKey] = fieldTouched[oldKey]; delete fieldTouched[oldKey];
                fieldDirty[newKey] = fieldDirty[oldKey]; delete fieldDirty[oldKey];
                fieldMap[newKey] = fieldMap[oldKey]; delete fieldMap[oldKey];
                flatSnapshot[newKey] = flatSnapshot[oldKey]; delete flatSnapshot[oldKey];
            }
            _fieldVersion.set(v => v + 1);
        },
        getFieldPaths(): string[] {
            return Object.keys(fieldValues);
        },
        fieldVersion: () => _fieldVersion(),
    } satisfies FormInternals;

    return form;
}
