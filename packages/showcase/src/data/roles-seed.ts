// The roles and the permissions the showcase starts with.
//
// One module, read by both sides, as `users.ts` is: the mock identity server (`mock-auth.ts`) keeps
// the roles from here and owns them from then on — Settings › Permissions edits the server's copy —
// and the browser starts from the same table so a session has its permissions before the server's
// answer arrives. No imports: `mock-auth.ts` runs in Node.

/** Every permission the application checks, in the order Settings › Permissions lists them. */
export const PERMISSIONS = ['account.read', 'billing.read', 'billing.write', 'tickets.billing', 'settings.permissions'] as const;

export interface Role {
    /** Stable: what a token's `realm_access.roles` carries. */
    key: string;
    /** As an administrator named it. The seed's two are named by the dictionary instead. */
    name: string;
    /** An inactive role is offered to no one; the accounts that hold it are refused its deactivation first. */
    active: boolean;
    permissions: string[];
}

/** A fresh copy every call: the server owns and mutates its own. */
export function seedRoles(): Role[] {
    return [
        { key: 'admin', name: 'Administrator', active: true, permissions: ['account.read', 'billing.read', 'billing.write', 'settings.permissions'] },
        { key: 'technician', name: 'Technician', active: true, permissions: ['account.read'] },
    ];
}

/** role → permissions, the shape a session's permissions are read from. */
export function grantsOf(roles: readonly Role[]): Record<string, string[]> {
    return Object.fromEntries(roles.filter((r) => r.active).map((r) => [r.key, [...r.permissions]]));
}
