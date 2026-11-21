// Password-manager (LastPass/1Password/Dashlane/…) overlay icons are noise on most fields (search,
// quantities, codes). pdx-input suppresses them by default and opts in only when the field declares a
// credential intent through the standard `autocomplete` token (or type=password), which keeps the
// opt-in standards-aligned: `autocomplete="username"` re-enables managers. Moved out of pdx-input.ts
// with the component (#1210): a .pdx script holds the component's own declarations.

const PM_AUTOCOMPLETE_TOKENS = new Set([
    'username', 'email', 'current-password', 'new-password', 'one-time-code',
]);

/** Whether a field of this `type` and `autocomplete` token is one a password manager may fill. */
export function allowsPasswordManager(type: string, autocomplete: string): boolean {
    return type === 'password' || PM_AUTOCOMPLETE_TOKENS.has(autocomplete.trim());
}
