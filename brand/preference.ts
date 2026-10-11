// The visitor's light/dark scheme and theme, shared by pdxui.com and themebuilder.pdxui.com.
//
// localStorage is per origin, so the two hosts could not see each other's choice. A cookie on the
// parent domain can: `Domain=pdxui.com` reaches every subdomain. Anywhere else — localhost, a
// preview host — the cookie is host-only, which is the most a host can share with itself, and
// nothing breaks. Next to brand.css because both surfaces import it from here, as they do the
// lockup; it depends on nothing.

export interface VisitorPreference {
    scheme?: 'light' | 'dark';
    theme?: string;
}

export const PREFERENCE_COOKIE = 'pdx-pref';

/** A year: the choice should outlive a session, and a cookie needs an end. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The registrable domain the cookie is shared under, or null for a host-only cookie. */
const SHARED_DOMAIN = 'pdxui.com';

/** `pdxui.com` for that host and its subdomains; null anywhere else. */
export function cookieDomainFor(hostname: string): string | null {
    return hostname === SHARED_DOMAIN || hostname.endsWith(`.${SHARED_DOMAIN}`) ? SHARED_DOMAIN : null;
}

/** Only what this module writes is read back: a scheme it knows, a theme name that is a name. */
function sanitize(raw: unknown): VisitorPreference {
    const out: VisitorPreference = {};
    if (!raw || typeof raw !== 'object') return out;
    const { scheme, theme } = raw as Record<string, unknown>;
    if (scheme === 'light' || scheme === 'dark') out.scheme = scheme;
    if (typeof theme === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(theme)) out.theme = theme;
    return out;
}

/** The preference in a `document.cookie` string; `{}` when there is none or it does not read. */
export function readPreference(cookies: string = typeof document === 'undefined' ? '' : document.cookie): VisitorPreference {
    for (const part of cookies.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0 || part.slice(0, eq).trim() !== PREFERENCE_COOKIE) continue;
        try {
            return sanitize(JSON.parse(decodeURIComponent(part.slice(eq + 1).trim())));
        } catch {
            // A value this module did not write: no preference, as if there were no cookie.
            return {};
        }
    }
    return {};
}

/**
 * The `Set-Cookie`-style string `document.cookie` takes for `pref`: domain-wide on pdxui.com,
 * host-only elsewhere; `Secure` where the page is served over HTTPS.
 */
export function preferenceCookie(pref: VisitorPreference, where: { hostname: string; secure: boolean }): string {
    const domain = cookieDomainFor(where.hostname);
    return `${PREFERENCE_COOKIE}=${encodeURIComponent(JSON.stringify(sanitize(pref)))}`
        + `; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`
        + (domain ? `; Domain=${domain}` : '')
        + (where.secure ? '; Secure' : '');
}

/** Merge `change` into the stored preference and write it back. A no-op outside a browser. */
export function writePreference(change: VisitorPreference): void {
    if (typeof document === 'undefined') return;
    const next = { ...readPreference(), ...sanitize(change) };
    document.cookie = preferenceCookie(next, { hostname: location.hostname, secure: location.protocol === 'https:' });
}
