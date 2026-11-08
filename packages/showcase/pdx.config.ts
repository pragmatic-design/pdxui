/**
 * The showcase's `pdx` config: only what static generation needs (#160). Every other setting is the
 * convention's.
 *
 * `ssg.routes`: a page for every route with parameters too, for the first record of each — the one
 * the suites open. `ssg.setup` opens the session the private pages are generated with (`src/ssg.ts`).
 */
export default {
    ssg: {
        routes: [
            '/assets/1', '/customers/1', '/services/1', '/sites/1',
            '/employees/1', '/employees/1/personal', '/employees/1/contracts', '/employees/1/documents', '/employees/1/sites',
            '/tickets/1', '/tickets/1/billing', '/tickets/1/interventions/2',
        ],
        setup: './src/ssg.ts',
    },
};
