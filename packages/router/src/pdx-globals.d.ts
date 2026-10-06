// Ambient augmentations for router-internal globals, the Navigation API,
// the View Transitions API, and the PDX element protocol. These let the router
// access compiler-injected globals and core element internals without `any`.

export {};

declare global {
    /** Minimal shape of the Navigation API `navigate` event the router intercepts. */
    interface PdxNavigateEvent {
        canIntercept: boolean;
        hashChange: boolean;
        cancelable: boolean;
        navigationType: 'push' | 'replace' | 'reload' | 'traverse';
        userInitiated: boolean;
        formData: FormData | null;
        downloadRequest: string | null;
        destination: { url: string };
        intercept(opts: { handler: () => void }): void;
        preventDefault(): void;
    }

    /** Minimal shape of the Navigation API used by the router. */
    interface PdxNavigation {
        addEventListener(type: 'navigate', cb: (e: PdxNavigateEvent) => void): void;
        removeEventListener(type: 'navigate', cb: (e: PdxNavigateEvent) => void): void;
        navigate(url: string, opts?: { state?: unknown }): void;
    }

    // Compiler-injected route tables (cast to local shapes at each use site).
    // eslint-disable-next-line no-var
    var __pdx_routes: unknown;
    // eslint-disable-next-line no-var
    // eslint-disable-next-line no-var
    var __pdx_redirects: unknown;
    // eslint-disable-next-line no-var
    var __pdx_error_pages: unknown;
    /** Opt-in path to redirect to when a route guard denies access (default: show 403). */
    // eslint-disable-next-line no-var
    /**
     * Where a denied guard sends the visitor: a path, or a function of the permission that was
     * refused which answers one — or null for "show the refusal here".
     */
    var __pdx_guard_redirect: string | ((permission: string) => string | null | undefined) | undefined;

    interface Window {
        navigation?: PdxNavigation;
    }

    interface Document {
        startViewTransition?(cb: () => void): { finished: Promise<void> };
    }

    interface CSSStyleDeclaration {
        viewTransitionName: string;
    }

    interface HTMLElement {
        /** Set by the router/core to skip teardown while frozen (keep-alive). */
        _keepAlive?: boolean;
        /** @page beforeLeave guards registered on the page element. */
        _beforeLeaveCallbacks?: (() => boolean | 'destroy' | Promise<boolean>)[];
        /** Per-instance active element for named outlets. */
        _namedElement?: HTMLElement | null;
    }
}
