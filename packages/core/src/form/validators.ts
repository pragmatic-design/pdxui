// Built-in validation rules — pure functions, tree-shakeable, zero deps.
// Each returns undefined (valid) or an error message string (invalid).
// When no custom message is provided, returns a ValidationMessage for i18n support.
// The message is resolved via setValidationLocale() or falls back to English.

import { validationMessage, VALIDATION_KEYS } from './validation-i18n';
import type { ValidationMessage } from './validation-i18n';

export type Validator<T = unknown> = (value: T) => string | ValidationMessage | undefined;
export type AsyncValidator<T = unknown> = (value: T) => Promise<string | ValidationMessage | undefined>;

// ─── String validators ─────────────────────────────────────────────

/**
 * Rejects a value the user has not supplied: `null`, `undefined`, a string that is only whitespace,
 * or an empty array.
 *
 * Note what it does NOT reject: `0` and `false` are values, and a required numeric or checkbox field
 * is satisfied by them. Pass `msg` to override the message; without it the text comes from the
 * active validation locale.
 */
export function required(msg?: string): Validator {
    return (value) => {
        if (value === null || value === undefined) return msg ?? validationMessage(VALIDATION_KEYS.required, 'This field is required');
        if (typeof value === 'string' && value.trim() === '') return msg ?? validationMessage(VALIDATION_KEYS.required, 'This field is required');
        if (Array.isArray(value) && value.length === 0) return msg ?? validationMessage(VALIDATION_KEYS.required, 'This field is required');
        return undefined;
    };
}

/**
 * Rejects a string shorter than `min` characters.
 *
 * Length in JavaScript code units, so an emoji or an accented character composed of two code points
 * counts as two. For a "must be filled in" rule use {@link required} — this one passes on a value
 * that is not a string at all.
 */
export function minLength(min: number, msg?: string): Validator<string> {
    return (value) =>
        typeof value === 'string' && value.length < min
            ? msg ?? validationMessage(VALIDATION_KEYS.minLength, `Minimum ${min} characters`, { min })
            : undefined;
}

/**
 * Rejects a string longer than `max` characters.
 *
 * Pair it with the input's own `maxlength` for the typing experience: this is what stops a pasted or
 * programmatic value, which the attribute does not.
 */
export function maxLength(max: number, msg?: string): Validator<string> {
    return (value) =>
        typeof value === 'string' && value.length > max
            ? msg ?? validationMessage(VALIDATION_KEYS.maxLength, `Maximum ${max} characters`, { max })
            : undefined;
}

// RFC 5322 simplified — covers 99.9% of real-world emails
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Rejects a string that is not shaped like an email address.
 *
 * Deliberately permissive — something@something.something — because the only real validation of an
 * address is sending to it, and a stricter regex rejects valid addresses more often than it catches
 * invalid ones. An EMPTY value passes: combine with {@link required} when the field is mandatory.
 */
export function email(msg?: string): Validator<string> {
    return (value) =>
        typeof value === 'string' && value && !EMAIL_RE.test(value)
            ? msg ?? validationMessage(VALIDATION_KEYS.email, 'Invalid email address')
            : undefined;
}

/**
 * Rejects a string that does not match `regex`.
 *
 * An empty value passes, as with the other string rules. Give it a `msg`: the default is
 * "Invalid format", which tells the user nothing about what the pattern wants.
 */
export function pattern(regex: RegExp, msg?: string): Validator<string> {
    return (value) =>
        typeof value === 'string' && value && !regex.test(value)
            ? msg ?? validationMessage(VALIDATION_KEYS.pattern, 'Invalid format')
            : undefined;
}

/**
 * Rejects a string the URL parser cannot parse.
 *
 * Uses the platform's own `new URL()`, so it requires a scheme: `example.com` fails,
 * `https://example.com` passes. Empty passes. If you want to accept a bare host, normalise before
 * validating rather than loosening this.
 */
export function url(msg?: string): Validator<string> {
    return (value) => {
        if (typeof value !== 'string' || !value) return undefined;
        try { new URL(value); return undefined; }
        catch { return msg ?? validationMessage(VALIDATION_KEYS.url, 'Invalid URL'); }
    };
}

// ─── Number validators ─────────────────────────────────────────────

/** Rejects a number below `minVal`. Inclusive: `minVal` itself is valid. */
export function min(minVal: number, msg?: string): Validator<number> {
    return (value) =>
        typeof value === 'number' && value < minVal
            ? msg ?? validationMessage(VALIDATION_KEYS.min, `Minimum value is ${minVal}`, { min: minVal })
            : undefined;
}

/** Rejects a number above `maxVal`. Inclusive: `maxVal` itself is valid. */
export function max(maxVal: number, msg?: string): Validator<number> {
    return (value) =>
        typeof value === 'number' && value > maxVal
            ? msg ?? validationMessage(VALIDATION_KEYS.max, `Maximum value is ${maxVal}`, { max: maxVal })
            : undefined;
}

/**
 * Rejects a number with a fractional part.
 *
 * A non-number passes, so an input that has not been coerced yet is not reported here — the field's
 * own type conversion runs first.
 */
export function integer(msg?: string): Validator<number> {
    return (value) =>
        typeof value === 'number' && !Number.isInteger(value)
            ? msg ?? validationMessage(VALIDATION_KEYS.integer, 'Must be a whole number')
            : undefined;
}

// ─── Standard Schema adapter ───────────────────────────────────────
// Supports any library implementing Standard Schema v1 (Zod, Valibot, ArkType).
// https://standardschema.dev

export interface StandardSchema<T = unknown> {
    '~standard': {
        version: 1;
        vendor: string;
        validate: (value: unknown) => StandardResult<T>;
    };
}

interface StandardResult<T> {
    value?: T;
    issues?: StandardIssue[];
}

interface StandardIssue {
    message: string;
    path?: (string | number | symbol)[];
}

/** Run a Standard Schema and return field-keyed errors. */
export function validateSchema<T>(
    schema: StandardSchema<T>,
    values: unknown,
): Record<string, string> {
    const result = schema['~standard'].validate(values);
    const errors: Record<string, string> = {};
    if (result.issues) {
        for (const issue of result.issues) {
            const path = issue.path?.map(String).join('.') ?? '_form';
            if (!errors[path]) errors[path] = issue.message;
        }
    }
    return errors;
}

/** Check if an object implements Standard Schema v1. */
export function isStandardSchema(obj: unknown): obj is StandardSchema {
    return obj != null && typeof obj === 'object' && '~standard' in obj;
}
