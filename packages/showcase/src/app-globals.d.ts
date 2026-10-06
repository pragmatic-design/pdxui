/**
 * The globals this app deliberately hangs on `globalThis`, declared once.
 *
 * Each one exists so a Playwright test can read a fact the DOM does not show: how many times the
 * ticket page has MOUNTED (a nested route that re-renders its parent is invisible on screen), and
 * the payload the mock backend last received (a write the page performed optimistically looks the
 * same whether or not it reached the server).
 *
 * One declaration, so the data modules, the pages and the specs read them the same way — without
 * it `tsc` reports *"type 'typeof globalThis' has no index signature"*. The types come from where
 * the payloads are defined rather than being restated here.
 */
import type { MovePayload } from './data/board';
import type { IntakeSubmission } from './data/intake';

declare global {
    /** How many times `ticket.pdx` has been constructed. On the global so it outlives the page. */
    // eslint-disable-next-line no-var
    var __pdxTicketMounts: number | undefined;
    /** The last move the board's mock accepted, or null when it has been reset. */
    // eslint-disable-next-line no-var
    var __pdxLastMove: MovePayload | null | undefined;
    /** The last intake the mock accepted, or null when it has been reset. */
    // eslint-disable-next-line no-var
    var __pdxLastIntake: IntakeSubmission | null | undefined;
    /**
     * What the customer picker last ASKED the transport for.
     *
     * A filtered request and a client-side slice of an already-downloaded page look identical on
     * screen; this is how a test tells them apart.
     */
    // eslint-disable-next-line no-var
    var __pdxLastCustomerRequest: {
        filter: { field: string; value: string }[];
        page: number;
        returned: number;
        total: number;
    } | undefined;

    interface Window {
        /**
         * What the employee's site picker last asked the site source for, for the same
         * reason as the customer picker's. A `Window` property rather than a `var`: it needs no
         * lint exception.
         */
        __pdxLastSiteRequest?: {
            filter: { field: string; value: string }[];
            page: number;
            total: number;
        };
        /**
         * What the asset picker last asked for: by the customer's id or by a piece of
         * its name, which the rows on screen cannot tell apart when the name matches either way.
         */
        __pdxLastAssetRequest?: {
            filter: { field: string; value: string }[];
            total: number;
        };
    }
}

export {};
