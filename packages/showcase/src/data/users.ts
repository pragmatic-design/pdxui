// The accounts that can sign in to the showcase.
//
// One list, read by both sides: the mock identity server (`mock-auth.ts`) signs tokens for them,
// and Settings › Users lists them. No password is here: the server keeps those beside its own copy,
// and this module is in the browser's bundle.

export interface Account {
    username: string;
    name: string;
    /** A reserved domain: nobody's. */
    email: string;
    roles: string[];
}

/** The two roles. One role proves nothing about a permission layer, which is why there are two. */
export const ACCOUNTS: Account[] = [
    { username: 'admin', name: 'Ada Admin', email: 'ada@example.com', roles: ['admin'] },
    { username: 'tech', name: 'Tom Technician', email: 'tom@example.com', roles: ['technician'] },
];
