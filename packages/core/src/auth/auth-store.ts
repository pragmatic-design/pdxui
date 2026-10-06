// auth-store.ts — flow-agnostic token/session store for SPA auth (UI-15b, the safely-reusable half).
// It owns token persistence, the reactive user (decoded from the JWT), expiry, and an auth-aware fetch.
// It does NOT prescribe a login flow: the app performs OIDC (Authorization Code + PKCE, recommended) or any
// other flow and calls `setTokens()`. This avoids baking a specific (and, for ROPC, non-production) flow
// into the framework while removing the boilerplate every app re-implements.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

export interface AuthTokens {
    access: string;
    refresh?: string | null;
}

export interface AuthStore<TUser> {
    /** Reactive current user (null when signed out), decoded from the access token. */
    readonly user: ReadonlySignal<TUser | null>;
    /** Reactive flag: a non-expired access token is present. */
    readonly isAuthenticated: ReadonlySignal<boolean>;
    /** Current access token (null if none). */
    getToken(): string | null;
    /** Store tokens (persists if configured) and refresh the user signal. */
    setTokens(tokens: AuthTokens): void;
    /** Clear tokens + user (sign out). */
    clear(): void;
    /** True if there is no token or it is past its `exp`. */
    isExpired(): boolean;
    /** fetch() wrapper that attaches `Authorization: Bearer <token>` when present. */
    authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface AuthStoreOptions<TUser> {
    /** localStorage key for token persistence. Omit to keep tokens in memory only. */
    storageKey?: string;
    /** Map decoded JWT claims → your user shape. Default: returns the raw claims. */
    decodeUser?: (claims: Record<string, unknown>) => TUser;
    /** Extra origins (beyond the same origin) authFetch may send the
     *  Bearer to. Default: same-origin only — an attacker-influenced URL towards a third
     *  origin must never receive the token. */
    allowedOrigins?: string[];
}

function decodeJwt(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        // atob returns latin1: UTF-8 claims (accented names) have to be re-decoded
        // byte by byte, otherwise they arrive garbled.
        const binary = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const json = new TextDecoder('utf-8').decode(bytes);
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/** A relative or same-origin URL → trusted; an absolute origin only when it is in the allowlist. */
function isTrustedUrl(url: string, allowedOrigins: Set<string>): boolean {
    // Relative (no scheme, protocol-relative) → same-origin
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !url.startsWith('//')) return true;
    try {
        const u = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
        if (typeof location !== 'undefined' && u.origin === location.origin) return true;
        return allowedOrigins.has(u.origin);
    } catch {
        return false;
    }
}

/**
 * Session state: the access and refresh tokens, the decoded user, and reactive `isAuthenticated`.
 *
 * Tokens are attached only to trusted origins — same-origin, plus whatever `allowedOrigins` names.
 * That check is the point of the store: a bearer token appended to a URL that came from data is how
 * a credential leaves for someone else's server, and a store that attaches it to anything is one
 * redirect away from doing that.
 *
 * `storageKey` persists across reloads, which trades the XSS exposure of anything in localStorage
 * for not asking the user to log in on every refresh; omit it to keep the session in memory only.
 * `decodeUser` turns claims into your own user type.
 */
export function createAuthStore<TUser = Record<string, unknown>>(
    options?: AuthStoreOptions<TUser>
): AuthStore<TUser> {
    const storageKey = options?.storageKey;
    const decode = options?.decodeUser ?? ((c) => c as unknown as TUser);
    const allowedOrigins = new Set(options?.allowedOrigins ?? []);

    let access: string | null = null;
    let refresh: string | null = null;
    // An expiry tick: isAuthenticated is a computed and with no time
    // dependency it would never flip to false when the token expires. A timer armed
    // on `exp` bumps the tick and forces the re-evaluation.
    const _expiryTick = signal(0);
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    function armExpiryTimer(): void {
        if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
        if (!access) return;
        const claims = decodeJwt(access) as { exp?: number } | null;
        if (!claims?.exp) return;
        const delay = claims.exp * 1000 - Date.now();
        if (delay <= 0) return; // already expired: expired() sees it straight away
        expiryTimer = setTimeout(() => { _expiryTick.set(v => v + 1); }, delay + 50);
    }

    // Restore from storage (if configured + available).
    if (storageKey && typeof localStorage !== 'undefined') {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as AuthTokens | null;
            if (saved?.access) { access = saved.access; refresh = saved.refresh ?? null; }
        } catch { /* ignore corrupt storage */ }
    }

    const _user = signal<TUser | null>(access ? userFrom(access) : null);
    if (access) queueMicrotask(armExpiryTimer);

    function userFrom(token: string): TUser | null {
        const claims = decodeJwt(token);
        return claims ? decode(claims) : null;
    }

    function expired(token: string | null): boolean {
        if (!token) return true;
        const claims = decodeJwt(token) as { exp?: number } | null;
        if (!claims?.exp) return false; // no exp claim → treat as non-expiring
        return Date.now() >= claims.exp * 1000;
    }

    function persist(): void {
        if (!storageKey || typeof localStorage === 'undefined') return;
        if (access) localStorage.setItem(storageKey, JSON.stringify({ access, refresh }));
        else localStorage.removeItem(storageKey);
    }

    return {
        user: computed(() => _user()),
        isAuthenticated: computed(() => {
            _expiryTick(); // a dependency on time: re-evaluates at expiry
            return _user() !== null && !expired(access);
        }),
        getToken: () => access,
        setTokens(tokens) {
            access = tokens.access;
            refresh = tokens.refresh ?? null;
            _user.set(userFrom(access));
            armExpiryTimer();
            persist();
        },
        clear() {
            access = null; refresh = null;
            if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
            _user.set(null);
            persist();
        },
        isExpired: () => expired(access),
        authFetch(input, init) {
            const headers = new Headers(init?.headers);
            // The Bearer only goes to the same origin or to an origin in the
            // allowlist: without the check, an attacker-influenced absolute URL
            // would exfiltrate the token (the same policy as resolveUrl in http/client).
            if (access && isTrustedUrl(String(input instanceof Request ? input.url : input), allowedOrigins)) {
                headers.set('Authorization', `Bearer ${access}`);
            }
            return fetch(input, { ...init, headers });
        },
    };
}
