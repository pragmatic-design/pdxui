// Pure utility functions for flattening/unflattening nested objects to dotted-path keys.
// Used by createForm() to support nested DTOs (e.g., { customer: { name: 'Jane' } }
// → form.fields['customer.name']).
//
// Design: arrays of objects are flattened per-item (items.0.product, items.1.qty).
// Arrays of primitives are NOT flattened — the value stays as the array itself.

// ─── flattenValues ─────────────────────────────────────────────────

function isPlainObject(val: unknown): val is Record<string, unknown> {
    return val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date);
}

// Prototype-pollution guard: dotted paths can come from server-driven form schemas
// or external values → never walk/write __proto__/constructor/prototype segments.
const UNSAFE_KEY = (k: string): boolean => k === '__proto__' || k === 'constructor' || k === 'prototype';

/**
 * Flatten a nested object into dotted-path keys.
 * `{ customer: { name: 'Jane' } }` → `{ 'customer.name': 'Jane' }`.
 * Arrays of objects flatten per-item: `items: [{ qty: 2 }]` → `{ 'items.0.qty': 2 }`.
 * Arrays of primitives stay as-is: `tags: ['a','b']` → `{ 'tags': ['a','b'] }`.
 */
export function flattenValues(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(val)) {
            Object.assign(result, flattenValues(val, path));
        } else if (Array.isArray(val) && val.length > 0 && isPlainObject(val[0])) {
            // Array of objects — flatten each item
            for (let i = 0; i < val.length; i++) {
                Object.assign(result, flattenValues(val[i] as Record<string, unknown>, `${path}.${i}`));
            }
        } else {
            result[path] = val;
        }
    }
    return result;
}

// ─── unflattenValues ───────────────────────────────────────────────

/**
 * Reconstruct a nested object from dotted-path keys.
 * `{ 'customer.name': 'Jane' }` → `{ customer: { name: 'Jane' } }`.
 * Numeric path segments create arrays: `{ 'items.0.qty': 2 }` → `{ items: [{ qty: 2 }] }`.
 */
export function unflattenValues(flat: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    // Sort keys so array indices are processed in order
    const keys = Object.keys(flat).sort();
    for (const path of keys) {
        setNestedValue(result, path, flat[path]);
    }
    return result;
}

// ─── Path helpers ──────────────────────────────────────────────────

/** Get a value from a nested object by dotted path. */
export function getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    if (parts.some(UNSAFE_KEY)) return undefined; // don't read across prototype keys
    let current: unknown = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        if (Array.isArray(current)) {
            const idx = Number(part);
            current = Number.isNaN(idx) ? undefined : current[idx];
        } else if (typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
        } else {
            return undefined;
        }
    }
    return current;
}

/** Set a value in a nested object by dotted path, creating intermediate objects/arrays as needed. */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    if (parts.some(UNSAFE_KEY)) return; // prototype-pollution guard
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextKey = parts[i + 1];
        const isNextIndex = /^\d+$/.test(nextKey);
        if (current[key] === undefined || current[key] === null) {
            current[key] = isNextIndex ? [] : {};
        }
        current = current[key] as Record<string, unknown>;
    }
    const lastKey = parts[parts.length - 1];
    current[lastKey] = value;
}

/**
 * Get all dotted-path keys that start with a given prefix.
 * Used by field-list to find all fields belonging to an array item.
 */
export function getFieldsByPrefix(fields: Record<string, unknown>, prefix: string): string[] {
    const prefixDot = prefix + '.';
    return Object.keys(fields).filter(k => k.startsWith(prefixDot));
}
