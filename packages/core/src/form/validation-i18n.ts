// Validation i18n — structured error messages with translation support.
//
// Validators can return either a plain string or a ValidationMessage.
// When a ValidationMessage is returned, the resolution cascade is:
//   1. Component `error` prop (inline override)
//   2. <pdx-form-field> `error` prop (wrapper override)
//   3. Form config message (per-field in FormConfig)
//   4. Validator custom message (e.g., required('Name is required'))
//   5. i18n locale resolver → fallback string
//
// The locale resolver is set globally via setValidationLocale().

export interface ValidationMessage {
    /** i18n key (e.g., 'validation.required', 'validation.minLength'). */
    key: string;
    /** Parameters for interpolation (e.g., { min: 3, field: 'Name' }). */
    params?: Record<string, unknown>;
    /** Fallback message if no locale resolver is set. */
    fallback: string;
}

export type ValidationResult = string | ValidationMessage | undefined;

// ─── Locale Resolver ──────────────────────────────────────────

type LocaleResolver = (key: string, params?: Record<string, unknown>) => string | undefined;

let _localeResolver: LocaleResolver | undefined;
// Simple version counter — incremented on locale change
let _localeVersion = 0;
// Callbacks registered by form-fields to re-render on locale change
const _localeListeners = new Set<() => void>();

/**
 * Set a global locale resolver for validation messages.
 * The resolver receives an i18n key and params, returns the translated string.
 * Return undefined to fall back to the message's fallback string.
 */
export function setValidationLocale(resolver: LocaleResolver): void {
    _localeResolver = resolver;
    _localeVersion++;
    // Notify all form-fields to re-resolve error messages
    for (const cb of _localeListeners) cb();
}

/** Register a callback to be notified when the validation locale changes. Returns unsubscribe. */
export function onLocaleChange(cb: () => void): () => void {
    _localeListeners.add(cb);
    return () => _localeListeners.delete(cb);
}

/**
 * Clear the locale resolver (for testing).
 */
export function clearValidationLocale(): void {
    _localeResolver = undefined;
}

// ─── Resolution ───────────────────────────────────────────────

/**
 * Resolve a ValidationResult to a display string.
 * Handles both plain strings and structured ValidationMessage objects.
 */
export function resolveValidationMessage(result: ValidationResult): string | undefined {
    if (result === undefined) return undefined;

    if (typeof result === 'string') {
        // Plain string — if a locale resolver exists, try it (key might be an i18n key)
        if (_localeResolver) {
            const translated = _localeResolver(result);
            if (translated) return translated;
        }
        return result;
    }

    // Structured message — try locale resolver first
    if (_localeResolver) {
        const translated = _localeResolver(result.key, result.params);
        if (translated) return translated;
    }

    // Fall back to the built-in fallback
    return result.fallback;
}

// ─── Helper: create structured message ────────────────────────

/**
 * Create a ValidationMessage with key, params, and fallback.
 * Use this in custom validators for i18n support.
 */
export function validationMessage(
    key: string,
    fallback: string,
    params?: Record<string, unknown>,
): ValidationMessage {
    return { key, params, fallback };
}

// ─── Built-in i18n keys ──────────────────────────────────────

/**
 * The translation keys the built-in validators emit, so an app can supply its own wording.
 *
 * A validator returns `{ key, params, fallback }` rather than a finished string: the key is looked
 * up in the active validation locale and the params fill it in (`minLength` passes `{ min }`), with
 * the English fallback used when no locale provides it. Register translations under these exact
 * names — they are the contract between a validator and a locale file.
 */
export const VALIDATION_KEYS = {
    required: 'validation.required',
    minLength: 'validation.minLength',
    maxLength: 'validation.maxLength',
    email: 'validation.email',
    pattern: 'validation.pattern',
    url: 'validation.url',
    min: 'validation.min',
    max: 'validation.max',
    integer: 'validation.integer',
} as const;
