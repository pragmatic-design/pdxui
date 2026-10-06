// Shared URL sanitiser — the policies for every href/src/to across @pdxui/* so a value coming
// from data can never become an executable URL (javascript:/data:/vbscript:/…). Two policies, by
// what the URL is used for: a link (sanitizeUrl) and media an element loads (sanitizeMediaUrl).

import { DEV } from '../utils/env';

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

/**
 * Return the URL if it is safe to use as a navigation/link target, or null if it must be rejected.
 * Safe = relative URLs, fragments and queries (no scheme), or an explicit scheme in the allow-list
 * (http/https/mailto/tel/ftp). Anything else — a dangerous/unknown scheme, or control chars used to
 * smuggle one (`java&#9;script:`) — returns null so the caller can drop it (`?? '#'`, skip nav, …).
 */
export function sanitizeUrl(raw: unknown): string | null {
    const url = String(raw ?? '').trim();
    if (!url) return null;
    if (/[\x00-\x1F\x7F]/.test(url)) return null;
    // Protocol-relative (`//evil.com`) and backslash-smuggled (`\\evil.com`, `/\evil.com`) URLs
    // have no scheme but the browser navigates cross-origin → open redirect / token exfiltration.
    // Reject any leading run of 2+ slash/backslash. Backslashes are normalised to `/` by browsers,
    // so a single mixed pair like `/\` is just as dangerous as `//`.
    if (/^[/\\]{2}/.test(url.replace(/\\/g, '/'))) return null;
    const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme && !SAFE_SCHEMES.has(scheme[1].toLowerCase())) return null;
    return url;
}

// Match: a raster image as a data: URL — `data:image/png;base64,…`, `data:image/webp,…`.
// svg+xml is deliberately absent: opened as a document, an SVG runs its script.
const MEDIA_DATA = /^data:image\/(?:png|jpeg|gif|webp|avif)[;,]/i;

/**
 * The policy for a URL an element LOADS as media (`<img src>`, `<video poster>`), not one it
 * navigates to. It accepts what {@link sanitizeUrl} accepts, plus a local object URL (`blob:`,
 * from `URL.createObjectURL(file)`: the preview of a file the user just picked) and a raster
 * `data:image/*`. Links keep `sanitizeUrl`, which still rejects both.
 */
export function sanitizeMediaUrl(raw: unknown): string | null {
    const safe = sanitizeUrl(raw);
    if (safe !== null) return safe;
    const url = String(raw ?? '').trim();
    if (/[\x00-\x1F\x7F]/.test(url)) return null;
    if (/^blob:/i.test(url) || MEDIA_DATA.test(url)) return url;
    return null;
}

/** Elements whose `src` loads media, rather than a document (iframe, embed) or a script. */
const MEDIA_SRC_TAGS = new Set(['img', 'source', 'video', 'audio']);

/**
 * A custom element (its name has a hyphen) whose `src` is a prop it owns: pdx-avatar and pdx-image
 * hand it to an <img> of their own, and the element that finally loads the URL decides again. With
 * the link policy here, `<pdx-image :src=${previewUrl}>` would never receive the preview.
 */
function isCustomElementName(el: Element): boolean {
    return el.localName.includes('-');
}

/** Elements and attributes already warned about, so a reactive binding warns once, not per value. */
const warned = new WeakMap<Element, Set<string>>();

/**
 * Sanitise a URL bound to `attr` on `el` with the policy of what the URL is used for: media for
 * `poster`, and for `src` on img/source/video/audio or on a custom element; the link policy for
 * everything else, a custom element's `href` included. In dev a dropped value is reported once per
 * element and attribute, with its scheme: an empty `src` and nothing in the console would leave a
 * dropped URL unnoticed.
 */
export function sanitizeBoundUrl(el: Element, attr: string, raw: unknown): string | null {
    const name = attr.toLowerCase();
    const media = name === 'poster'
        || (name === 'src' && (MEDIA_SRC_TAGS.has(el.localName) || isCustomElementName(el)));
    const safe = media ? sanitizeMediaUrl(raw) : sanitizeUrl(raw);
    if (safe === null && DEV) warnDropped(el, name, String(raw ?? '').trim(), media);
    return safe;
}

function warnDropped(el: Element, attr: string, url: string, media: boolean): void {
    if (!url) return; // an empty binding clears the attribute; nothing was dropped
    const seen = warned.get(el) ?? new Set<string>();
    if (seen.has(attr)) return;
    seen.add(attr);
    warned.set(el, seen);
    // Name what was refused: the scheme (with the media type for data:), or why there is none.
    const scheme = url.match(/^data:[^;,]*/i)?.[0] ?? url.match(/^[a-z][a-z0-9+.-]*:/i)?.[0];
    const what = scheme ? `the ${scheme} scheme`
        : /[\x00-\x1F\x7F]/.test(url) ? 'a control character'
            : 'a protocol-relative URL';
    const allowed = media
        ? 'media accepts http(s), relative URLs, blob: and data:image/{png,jpeg,gif,webp,avif}'
        : 'a link accepts http(s), mailto:, tel:, ftp: and relative URLs';
    // Guarded here as well as at the call site: a guard eight lines away is one a reader does not
    // see, and `diagnostics-behind-dev.test.ts` reads this file the way a reader does.
    if (DEV) console.warn(`[pdx] <${el.localName}> ${attr}: dropped a bound URL with ${what} — ${allowed}.`);
}
