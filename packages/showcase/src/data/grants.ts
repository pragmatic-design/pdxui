// What each role may do, as the browser knows it.
//
// The server owns the roles (`mock-auth.ts`); this is its last answer, starting from the same seed so
// a session has its permissions before that answer arrives. A signal: `src/auth.ts` rebuilds the
// session's permissions from it, so a grant changed in Settings › Permissions reaches every screen
// at once, with no reload. No HTTP here — this module is in the entry chunk, and the client that
// talks to the server (`access.ts`) arrives with the first screen that asks.
import { $t, signal } from '@pdxui/core';
import { grantsOf, seedRoles, type Role } from './roles-seed';

/** The roles as the server last said them. */
export const roles = signal<Role[]>(seedRoles());

/** role → permissions, for the active roles. */
export const grants = (): Record<string, string[]> => grantsOf(roles());

/** The seed's names: while a seed role keeps its name, the dictionary names it in the reader's language. */
const SEED_NAMES = new Map(seedRoles().map((r) => [r.key, r.name]));

/** A role's name on screen, from its key: the dictionary's for an unrenamed seed role, else the one it was given. */
export function roleName(key: string): string {
    const name = roles().find((r) => r.key === key)?.name;
    if (SEED_NAMES.has(key) && (name === undefined || name === SEED_NAMES.get(key))) return $t(`account.roleNames.${key}`);
    return name ?? key;
}
