// HTTP client types — zero dependencies, browser-native fetch wrapper.

// ─── Request / Response ────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface HttpRequest {
    readonly method: HttpMethod;
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body?: unknown;
    readonly signal?: AbortSignal;
    /** Arbitrary metadata for middleware (e.g. { skipAuth: true, retryCount: 0 }). */
    readonly meta: Readonly<Record<string, unknown>>;
}

export interface HttpResponse<T = unknown> {
    readonly status: number;
    readonly statusText: string;
    readonly headers: Headers;
    readonly data: T;
    readonly ok: boolean;
    readonly url: string;
}

// ─── Middleware ─────────────────────────────────────────────────────

/** Middleware function — process request, optionally modify, call next. */
export type HttpMiddleware = (
    request: HttpRequest,
    next: HttpHandler,
) => Promise<HttpResponse>;

/** Terminal handler — executes the actual fetch. */
export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>;

// ─── Client Config ─────────────────────────────────────────────────

// Type-only: erased at compile time, so this does not create a runtime cycle with
// middleware.ts, which imports the request/response types from here.
import type { RetryMiddlewareOptions } from './middleware';

export interface HttpClientConfig {
    /** Base URL prepended to relative paths. Must not end with '/'. */
    baseUrl?: string;
    /** Static headers added to every request. */
    headers?: Record<string, string>;
    /** Dynamic headers — called per-request. Return value merged over static headers. */
    headersFn?: () => Record<string, string>;
    /** Middleware pipeline — executed in order (first = outermost). */
    middleware?: HttpMiddleware[];
    /**
     * Default request timeout in ms. Default: 30_000.
     * `0` disables it — a request with no deadline then pends until the server answers.
     */
    timeout?: number;
    /**
     * Retry idempotent requests (GET, HEAD, OPTIONS, PUT, DELETE) that fail with a retryable
     * status — 5xx, 408, 429. On by default; `false` disables it, an object tunes it.
     * A POST or PATCH is never retried: replaying a write is not safe.
     */
    retry?: boolean | RetryMiddlewareOptions;
    /** Called on every request (dev logging). */
    onRequest?: (request: HttpRequest) => void;
    /** Called on every response (dev logging). */
    onResponse?: (response: HttpResponse) => void;
    /** Called on error — can transform or rethrow. */
    onError?: (error: HttpError) => void;
}

// ─── Per-Request Options ───────────────────────────────────────────

export interface RequestOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
    meta?: Record<string, unknown>;
    /** Override response parsing: 'json' (default), 'text', 'blob', 'arrayBuffer', 'none'. */
    responseType?: ResponseType;
}

export type ResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer' | 'none';

// ─── Client Interface ──────────────────────────────────────────────

export interface HttpClient {
    get<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
    post<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
    put<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
    patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions): Promise<T>;
    delete<T = unknown>(url: string, options?: RequestOptions): Promise<T>;

    /** Low-level: full request/response access. */
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;

    /** Create a derived client with merged config. */
    extend(config: Partial<HttpClientConfig>): HttpClient;
}

// ─── Error ─────────────────────────────────────────────────────────

/**
 * The error every non-2xx response becomes.
 *
 * It carries the status, so calling code branches on `err.status === 404` rather than parsing a
 * message, and the parsed body, so a validation error from the server is available without a second
 * read of a stream that has already been consumed.
 *
 * Distinct from {@link AbortError} (the request never got an answer — timeout or cancellation) and
 * {@link OfflineError} (it was never sent). {@link retryMiddleware} tells them apart for exactly
 * this reason: a 503 is worth repeating, an abort is not.
 */
export class HttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    /** Response body if available (may be null for network errors). */
    readonly data: unknown;
    /** Response headers if available (undefined for network errors). Used e.g. to read Retry-After. */
    readonly headers?: Headers;

    constructor(status: number, statusText: string, url: string, data?: unknown, headers?: Headers) {
        // Security: never include response body or auth details in message
        super(`HTTP ${status} ${statusText}`);
        this.name = 'HttpError';
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.data = data;
        this.headers = headers;
    }
}

/** Error thrown when a request is aborted (timeout or manual). */
export class AbortError extends Error {
    constructor(_url: string) {
        super('Request aborted');
        this.name = 'AbortError';
    }
}

/** Error thrown when the device is offline and the request cannot be queued. */
export class OfflineError extends Error {
    /** The original request, for replay. */
    readonly request: HttpRequest;

    constructor(request: HttpRequest) {
        super('Device is offline');
        this.name = 'OfflineError';
        this.request = request;
    }
}
