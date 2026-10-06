// Form context — provide/inject for sharing Form instances across the component tree.
// Uses the existing Context Protocol from component/context.ts.
//
// Parent <pdx-form> calls provideForm() to make its Form available.
// Children (<pdx-form-field>, custom inputs) call useForm() to access it.

import { provide, tryInject, inject } from '../component/context';
import { getCurrentScope } from '../component/lifecycle';
import { signal } from '../reactivity/signal';
import type { Form } from './form';
import type { FormCoordinator } from './form-coordinator';
import type { Signal } from '../utils/types';

// ─── Context Keys ─────────────────────────────────────────────

// These three are not exported.
//
// They are the token a provide/inject pair talks over, and BOTH SIDES of that pair are already
// public and documented — `provideForm`/`useForm`, `provideFormCoordinator`/`useFormCoordinator`,
// `provideFieldGroupPath`/`useFieldGroupPath`. A consumer holding `useForm()` never needs the key.
//
// Exporting them would not be neutral. Every exported symbol is a promise: it forbids a rename, it
// takes a line on the API page, and an agent reading that page finds three keys with no example and
// reads them as an invitation to wire the context by hand instead of calling the function written
// for it. `VALIDATION_KEYS` is exported — an app adding a locale needs the key names, so it has a
// reader.
const FORM_KEY = Symbol('pragmatic:form');

const FORM_COORDINATOR_KEY = Symbol('pragmatic:form-coordinator');

/** Carries the dotted path of the enclosing field group, so a control inside
 *  `<pdx-field-group name="address">` reports itself as `address.city` rather than `city`. */
const FIELD_GROUP_PATH_KEY = Symbol('pragmatic:field-group-path');

// ─── Form Context ─────────────────────────────────────────────

/**
 * Tell the lookups that read `version` that a value was provided on `element`.
 *
 * Once now, and — when the provider is providing from its own setup — once more at its mount. A
 * providing component takes its light-DOM children out to project them, so a consumer that re-runs
 * now walks up from a detached element and misses again (the re-run fires with the field outside
 * the document). Its mount comes after the slot projection.
 */
function announce(version: Signal<number>, element: HTMLElement | undefined): void {
    const bump = (): void => version.set(n => n + 1);
    bump();
    const scope = getCurrentScope();
    if (scope && scope.element === element) scope.registerMount(bump);
}

/** Bumped by every provideForm(), so a lookup that found no form can run again when one appears. */
const _formsProvided = signal(0);

/**
 * Provide a Form instance on a host element.
 * Descendants can access it via useForm() / tryUseForm().
 */
export function provideForm<T extends Record<string, unknown>>(
    form: Form<T>,
    element?: HTMLElement,
): void {
    provide(FORM_KEY, form, element);
    announce(_formsProvided, element);
}

/**
 * Inject the nearest Form from an ancestor.
 * Must be called during setup(). Throws if no form found.
 */
export function useForm<T extends Record<string, unknown>>(): Form<T> {
    const scope = getCurrentScope();
    if (!scope) throw new Error('useForm() must be called during component setup()');
    return inject<Form<T>>(FORM_KEY, scope.element);
}

/**
 * Try to inject the nearest Form. Returns undefined if none found.
 *
 * Without an argument it must be called during setup(), and answers for that moment.
 *
 * With `from`, it looks up from that element whenever it is called, in setup or not. When it finds
 * nothing, an effect that called it runs again as soon as a form is provided — so a component that
 * may be set up before its form reads it through `tryUseForm(ctx.el)` inside the code that uses it,
 * and keeps it once found.
 */
export function tryUseForm<T extends Record<string, unknown>>(from?: HTMLElement): Form<T> | undefined {
    // A child can set up before its <pdx-form>: happy-dom connects children before their parent, and
    // a browser does too when pdx-form's module loads after its fields'. A one-time lookup at setup
    // would then never find the form.
    if (from) {
        const found = tryInject<Form<T>>(FORM_KEY, from);
        if (!found) _formsProvided();
        return found;
    }
    const scope = getCurrentScope();
    if (!scope) return undefined;
    return tryInject<Form<T>>(FORM_KEY, scope.element);
}

// ─── Coordinator Context ──────────────────────────────────────

/**
 * Provide a FormCoordinator for nested form orchestration.
 */
export function provideFormCoordinator(
    coordinator: FormCoordinator,
    element?: HTMLElement,
): void {
    provide(FORM_COORDINATOR_KEY, coordinator, element);
    announce(_coordinatorsProvided, element);
}

/** Bumped by every provideFormCoordinator(); the same role as `_formsProvided`. */
const _coordinatorsProvided = signal(0);

/**
 * Try to inject the nearest FormCoordinator. Returns undefined if none.
 *
 * Without an argument it must be called during setup(). With `from`, it looks up from that element
 * whenever it is called, and an effect whose lookup found nothing runs again when a coordinator is
 * provided — the same contract as `tryUseForm(from)`.
 */
export function useFormCoordinator(from?: HTMLElement): FormCoordinator | undefined {
    if (from) {
        const found = tryInject<FormCoordinator>(FORM_COORDINATOR_KEY, from);
        if (!found) _coordinatorsProvided();
        return found;
    }
    const scope = getCurrentScope();
    if (!scope) return undefined;
    return tryInject<FormCoordinator>(FORM_COORDINATOR_KEY, scope.element);
}

// ─── Field Group Path Context ────────────────────────────────

/**
 * Provide a field group path prefix on a host element.
 * Children use useFieldGroupPath() to build their full dotted path.
 */
export function provideFieldGroupPath(path: string, element?: HTMLElement): void {
    provide(FIELD_GROUP_PATH_KEY, path, element);
    announce(_groupPathsProvided, element);
}

/** Bumped by every provideFieldGroupPath(). */
const _groupPathsProvided = signal(0);

/**
 * Get the current field group path prefix from the nearest ancestor.
 * Returns undefined if not inside a field-group.
 *
 * Without an argument it must be called during setup(). With `from`, it looks up from that element
 * whenever it is called, and an effect that called it runs again whenever a group path is provided
 * — found or not, because a path can change after it is found: an inner group set up before the
 * outer one provides `inner` first and `outer.inner` once the outer path appears. So do not keep it:
 * read it where it is used.
 */
export function useFieldGroupPath(from?: HTMLElement): string | undefined {
    if (from) {
        _groupPathsProvided();
        return tryInject<string>(FIELD_GROUP_PATH_KEY, from);
    }
    const scope = getCurrentScope();
    if (!scope) return undefined;
    return tryInject<string>(FIELD_GROUP_PATH_KEY, scope.element);
}
