// A route's `@guard` answered by core's permissions: the bridge the outlet installs when it starts the
// router, and the one the server asks when it prepares a route (#160) — the same answer in both.

import { hasPermission } from '@pdxui/core';

/** Whether the permission `name` is granted now; a check that throws denies, and says why. */
export function permissionGuard(name: string): boolean {
    try {
        return hasPermission(name)();
    } catch (err) {
        // Deny by default, but surface the cause — a silent false makes guard
        // denials impossible to diagnose.
        console.warn(`[pdx-router] Guard "${name}" check threw; denying access.`, err);
        return false;
    }
}
