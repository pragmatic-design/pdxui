// Settings › Permissions and Users, against the server that owns them.
//
// Every write goes to `/api/admin/*` and the server answers with the whole access state, or refuses
// with its own words (a role still held by someone; nobody left who can change permissions). The
// answer replaces `roles` in `grants.ts`, which is what makes a change reach the session at once.
import { signal } from '@pdxui/core';
import { api } from '../api';
import { roles } from './grants';
import type { Role } from './roles-seed';

export interface AccessAccount {
    username: string;
    name: string;
    email: string;
    roles: string[];
}

export interface AccessView {
    permissions: string[];
    roles: Role[];
    accounts: AccessAccount[];
}

/** The last access state the server answered with; null until the first answer. */
export const access = signal<AccessView | null>(null);
/** The server's last refusal, in its own words; empty when the last write went through. */
export const refusal = signal('');

function take(view: AccessView): AccessView {
    access.set(view);
    roles.set(view.roles);
    refusal.set('');
    return view;
}

/** The server's words for a refused write, or the error's own. */
function reason(err: unknown): string {
    const e = err as { data?: { error?: string }; message?: string };
    return String(e?.data?.error ?? e?.message ?? err);
}

/**
 * Read the access state. A failure leaves the seed in place and says why in `refusal`: the session
 * keeps the permissions it started with rather than losing them all.
 */
export async function loadAccess(): Promise<AccessView | null> {
    try {
        return take(await api.get<AccessView>('/admin/access'));
    } catch (err) {
        refusal.set(reason(err));
        return null;
    }
}

/** Replace the roles. Refused, the state is re-read, so the screen shows what the server kept. */
export async function saveRoles(next: Role[]): Promise<boolean> {
    try {
        take(await api.put<AccessView>('/admin/roles', { roles: next }));
        return true;
    } catch (err) {
        const why = reason(err);
        await loadAccess();
        refusal.set(why);
        return false;
    }
}

/** Give an account these roles. They are signed into its NEXT token: its next sign-in. */
export async function saveAccountRoles(username: string, next: string[]): Promise<boolean> {
    try {
        take(await api.put<AccessView>(`/admin/accounts/${encodeURIComponent(username)}`, { roles: next }));
        return true;
    } catch (err) {
        const why = reason(err);
        await loadAccess();
        refusal.set(why);
        return false;
    }
}
