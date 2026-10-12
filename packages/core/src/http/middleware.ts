// Built-in HTTP middleware — composable, tree-shakeable.
// Each middleware is independent and optional.

import type { HttpMiddleware, HttpRequest } from './types';
import { HttpError } from './types';

// ���── Auth Middleware ──────��────────────────────────────────────────
// Security: token getter is lazy-evaluated per-request (never cached).
// Token value is never included in error messages or logs.

export interface AuthMiddlewareOptions {
    /** Returns the auth token. Called per-request — return null to skip auth. */
    getToken: () => string | null | Promise<string | null>;
    /** Header name (default: 'Authorization'). */
    header?: string;
    /** Token prefix (default: 'Bearer '). Set to '' for raw token. */
    prefix?: string;
    /** Skip auth for requests with meta.skipAuth = true. */
    respectSkipAuth?: boolean;
}

/**
 * Attaches a credential header to every request, asking for the token per request rather than
 * holding one.
 *
 * `getToken` is called on each request and may be async, which is what lets a token refresh happen
 * transparently: return the fresh token and the request carries it. Returning `null` sends the
 * request unauthenticated rather than failing it. Requests marked `meta.skipAuth` are skipped, so a
 * login or token-refresh call does not send the credential it is trying to obtain.
 *
 * The token is never cached here and never appears in an error or a log — {@link logMiddleware}
 * redacts the header by name.
 */
export function authMiddleware(options: AuthMiddlewareOptions): HttpMiddleware {
    const header = options.header ?? 'Authorization';
    const prefix = options.prefix ?? 'Bearer ';
    const respectSkip = options.respectSkipAuth ?? true;

    return async (request, next) => {
        if (respectSkip && request.meta.skipAuth) return next(request);

        const token = await options.getToken();
        if (!token) return next(request);

        return next({
            ...request,
            headers: { ...request.headers, [header]: prefix + token },
        });
    };
}

// ─── Retry Middleware ──────────────────────────────────────────────
// Only retries on 5xx and network errors. Never retries 4xx (client errors).
// Exponential backoff with jitter to prevent thundering herd.

export interface RetryMiddlewareOptions {
    /** Max retry attempts (default: 3). */
    maxRetries?: number;
    /** Base delay in ms (default: 300). */
    baseDelay?: number;
    /** Max delay cap in ms (default: 10_000). */
    maxDelay?: number;
    /** Retry on these HTTP statuses. Default: 500-599 + 408 (timeout) + 429 (rate limit). */
    retryStatuses?: number[];
    /**
     * Only retry the methods that only read (GET, HEAD, OPTIONS). Default: true. A write that should
     * be retried asks for it on its own request (`retry: 2`) instead of turning this off for all.
     */
    idempotentOnly?: boolean;
}

/**
 * The methods retried without being asked: the ones that only read (beta spec, E6). PUT and DELETE
 * are idempotent by the HTTP spec, not by every server's implementation — one that applied the write
 * and then failed would apply it again.
 */
const RETRIED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Whether retrying could fix this failure: a network error, a 5xx, 408 or 429. Not a 4xx (the request
 * itself is wrong), not a cancellation or a timeout, not an offline request (already queued).
 * One classifier for the HTTP client's retry and a read source's (`resource()`'s `retry`).
 */
export function isRetryableError(err: unknown, retryStatuses: ReadonlySet<number> = DEFAULT_RETRY_STATUSES): boolean {
    // By NAME, not class: fetch rejects with a DOMException, and the client converts it to its own
    // `AbortError` (which extends Error) before any middleware sees it — an `instanceof DOMException`
    // test never fired, and a request killed by its own deadline was replayed until retries ran out.
    // A timeout is the client's own error (#255) and is not retried either (beta spec, E6).
    // An OfflineError for a sharper reason than "it would not help": the retry sits OUTSIDE the
    // caller's middleware, so every attempt re-enters `offlineMiddleware` — which QUEUES the request
    // before throwing. One offline PUT would be queued four times and sent four times on reconnect.
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'HttpTimeoutError' || err.name === 'OfflineError')) return false;
    if (err instanceof HttpError) return retryStatuses.has(err.status);
    return true;
}

/**
 * How long to wait before retry number `attempt + 1`: exponential backoff with jitter,
 * `base * 2^attempt * (0.5..1.5)`, capped at `max`; a 429 or 503 with `Retry-After` waits what the
 * server asked for (capped too). The jitter is not decoration: without it every client that failed
 * together retries together, and the recovering server is hit by the spike that took it down.
 */
export function retryDelayMs(err: unknown, attempt: number, base = 300, max = 10_000): number {
    if (err instanceof HttpError && (err.status === 429 || err.status === 503)) {
        const retryAfter = parseRetryAfter(err);
        if (retryAfter !== null) return Math.min(retryAfter, max);
    }
    const exponential = base * Math.pow(2, attempt);
    const jitter = 0.5 + Math.random(); // [0.5, 1.5)
    return Math.min(exponential * jitter, max);
}

/**
 * Retries a failed request with exponential backoff and jitter.
 *
 * Retries only what retrying can fix: 5xx, 408 and 429, plus network errors. A 4xx is the server
 * saying the request itself is wrong, and repeating it changes nothing; a cancel or a timeout is not
 * retried either. A read source's own `retry` (`resource()`, `useQuery`) follows the same rule.
 *
 * By default it retries only the methods that READ (GET, HEAD, OPTIONS): a write that failed may well
 * have been applied — replaying a POST can charge a card twice, and a PUT or DELETE is idempotent only
 * if the server made it so. A request that should be retried says so itself, `retry: 2` in its
 * options; `retry: false` turns the retry off for one request (a read source does, owning its own).
 *
 * On by default in {@link createHttpClient}; pass `retry: false` there to turn it off.
 */
export function retryMiddleware(options: RetryMiddlewareOptions = {}): HttpMiddleware {
    const defaultRetries = options.maxRetries ?? 3;
    const baseDelay = options.baseDelay ?? 300;
    const maxDelay = options.maxDelay ?? 10_000;
    const retryStatuses = options.retryStatuses
        ? new Set(options.retryStatuses)
        : DEFAULT_RETRY_STATUSES;
    const idempotentOnly = options.idempotentOnly ?? true;

    return async (request, next) => {
        // The request's own say, `retry` in its options: a number asks for that many retries (a write
        // included), `false` for none.
        const asked = request.meta._retry as number | false | undefined;
        if (asked === false) return next(request);
        if (asked === undefined && idempotentOnly && !RETRIED_METHODS.has(request.method)) {
            return next(request);
        }
        const maxRetries = typeof asked === 'number' ? asked : defaultRetries;

        let lastError: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await next(request);
            } catch (err) {
                lastError = err;
                if (!isRetryableError(err, retryStatuses) || request.signal?.aborted) throw err;
                // Last attempt — don't delay, just throw
                if (attempt === maxRetries) break;
                await sleep(retryDelayMs(err, attempt, baseDelay, maxDelay));
            }
        }

        throw lastError;
    };
}

/** Parse the `Retry-After` response header into a delay in milliseconds.
 *  Supports both forms: delay-seconds (`120`) and an HTTP-date.
 *  Returns null if the header is absent/unparseable → caller falls back to backoff. */
function parseRetryAfter(error: HttpError): number | null {
    const raw = error.headers?.get('Retry-After');
    if (!raw) return null;

    // delay-seconds form
    const seconds = Number(raw.trim());
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    // HTTP-date form
    const dateMs = Date.parse(raw);
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

    return null;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Timeout Middleware ───────────────────────────────────────────
// Creates an AbortController per request with a timeout.
// Composes with user-provided signals.

/**
 * Gives requests a deadline by writing it into `meta._timeout`, which the client turns into an
 * AbortController.
 *
 * Prefer `createHttpClient({ timeout })`, which is the same deadline expressed where the reader
 * looks for it — this exists for the case where different middleware layers need different
 * deadlines. It does NOT override a request that already carries one.
 *
 * A request with no deadline never settles: `loading` stays true and no error is ever produced, so
 * the component shows its skeleton for as long as the tab is open. That is why the default client
 * sets 30s.
 */
export function timeoutMiddleware(ms: number): HttpMiddleware {
    return async (request, next) => {
        // Skip if request already has a timeout set via meta
        if (request.meta._timeout) return next(request);

        return next({
            ...request,
            meta: Object.freeze({ ...request.meta, _timeout: ms }),
        });
    };
}

// ─── Logging Middleware ───────────────────────────────────────────
// Dev-only request/response logging. Tree-shaken in production.

export interface LogMiddlewareOptions {
    /** Log request details (default: true). */
    request?: boolean;
    /** Log response details (default: true). */
    response?: boolean;
    /** Custom logger (default: console). */
    logger?: { log: (...args: unknown[]) => void };
    /** Filter: return false to skip logging this request. */
    filter?: (request: HttpRequest) => boolean;
}

// Any header whose NAME matches this is a credential — redact its value.
// Covers Authorization, Cookie/Set-Cookie, X-API-Key, X-XSRF-TOKEN/X-CSRF-Token,
// and anything containing api-key / token / secret.
const SENSITIVE_HEADER_RE = /(authorization|cookie|api-key|token|secret)/i;

/** Return a shallow copy of headers with sensitive values replaced by [REDACTED]. */
function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> {
    const safe: Record<string, string> = {};
    if (!headers) return safe;
    for (const [name, value] of Object.entries(headers)) {
        safe[name] = SENSITIVE_HEADER_RE.test(name) ? '[REDACTED]' : value;
    }
    return safe;
}

/**
 * Logs each request and its outcome with the elapsed time, for development.
 *
 * Header VALUES whose name looks like a credential — authorization, cookie, api-key, token, secret —
 * are replaced with `[REDACTED]`, so turning logging on cannot leak a bearer token into a console
 * someone screenshots. Errors are logged and re-thrown, never swallowed.
 *
 * Add it deliberately: it is not in the default chain, and a production build should not include it.
 */
export function logMiddleware(options: LogMiddlewareOptions = {}): HttpMiddleware {
    const logReq = options.request ?? true;
    const logRes = options.response ?? true;
    const logger = options.logger ?? console;
    const filter = options.filter;

    return async (request, next) => {
        if (filter && !filter(request)) return next(request);

        const start = performance.now();

        if (logReq) {
            // Security: never log credential-bearing header values (case-insensitive).
            logger.log(`[HTTP] ${request.method} ${request.url}`, redactHeaders(request.headers));
        }

        try {
            const response = await next(request);
            if (logRes) {
                const ms = (performance.now() - start).toFixed(1);
                logger.log(`[HTTP] ${response.status} ${request.method} ${request.url} (${ms}ms)`);
            }
            return response;
        } catch (err) {
            const ms = (performance.now() - start).toFixed(1);
            if (err instanceof HttpError) {
                logger.log(`[HTTP] ${err.status} ${request.method} ${request.url} (${ms}ms)`);
            } else {
                logger.log(`[HTTP] ERR ${request.method} ${request.url} (${ms}ms)`, err);
            }
            throw err;
        }
    };
}

// ─── CSRF Middleware ──────────────────────────────────────────────
// Adds CSRF token from cookie or meta tag for state-changing requests.

export interface CsrfMiddlewareOptions {
    /** Cookie name containing the CSRF token (default: 'XSRF-TOKEN'). */
    cookieName?: string;
    /** Header name to send the token (default: 'X-XSRF-TOKEN'). */
    headerName?: string;
}

/**
 * Copies the CSRF token from its cookie into a request header, for state-changing requests only.
 *
 * The cookie/header pair defaults to `XSRF-TOKEN` / `X-XSRF-TOKEN`, which is what most server
 * frameworks emit. GET, HEAD and OPTIONS are skipped because they are not supposed to change state;
 * a missing cookie sends the request unchanged rather than failing it, so a page loaded before the
 * session existed still works.
 *
 * This is the browser half of double-submit CSRF protection — it is worth nothing unless the server
 * actually compares the two.
 */
export function csrfMiddleware(options: CsrfMiddlewareOptions = {}): HttpMiddleware {
    const cookieName = options.cookieName ?? 'XSRF-TOKEN';
    const headerName = options.headerName ?? 'X-XSRF-TOKEN';
    const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

    return async (request, next) => {
        if (SAFE_METHODS.has(request.method)) return next(request);

        const token = getCookieValue(cookieName);
        if (!token) return next(request);

        return next({
            ...request,
            headers: { ...request.headers, [headerName]: token },
        });
    };
}

function getCookieValue(name: string): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
}
