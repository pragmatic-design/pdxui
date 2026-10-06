// Permission-aware rendering.
// Integrates with backend Pragmatic.Authorization permission strings.

import { signal, computed } from '../reactivity/signal';
import { when } from '../renderer/helpers';
import type { ReadonlySignal } from '../utils/types';

type PermissionChecker = (permission: string) => boolean;

// Module-level state — version signal triggers reactive re-evaluation
let checker: PermissionChecker = () => false;
const _version = signal(0);

/**
 * Set the global permission checker. Call at app initialization.
 * Accepts a checker function OR a string array of granted permissions.
 * Re-evaluates all permission-gated UI reactively.
 *
 * Usage:
 *   setPermissions(['users.view', 'tasks.manage']);
 *   setPermissions((perm) => currentUser.permissions.includes(perm));
 */
export function setPermissions(newChecker: PermissionChecker | string[]): void {
    if (Array.isArray(newChecker)) {
        const perms = new Set(newChecker);
        checker = (p) => perms.has(p);
    } else {
        checker = newChecker;
    }
    _version.set(v => v + 1);
}

/**
 * Check if a permission is granted. Returns a reactive ReadonlySignal.
 *
 * Usage:
 *   const canDelete = hasPermission('booking.delete');
 *   effect(() => { if (canDelete()) enableButton(); });
 */
export function hasPermission(permission: string): ReadonlySignal<boolean> {
    return computed(() => {
        _version(); // track changes
        return checker(permission);
    });
}

/**
 * Permission-gated rendering. Shows thenFn only if permission is granted.
 *
 * Usage:
 *   ${requirePermission('booking.delete', () => html`<button>Delete</button>`)}
 *   ${requirePermission('admin', () => html`<nav>Admin</nav>`, () => html`<span>No access</span>`)}
 */
export function requirePermission(
    permission: string,
    thenFn: () => Node | DocumentFragment,
    elseFn?: (() => Node | DocumentFragment | null) | null
): DocumentFragment {
    return when(
        () => {
            _version();
            return checker(permission);
        },
        thenFn,
        elseFn
    );
}
