// Which dictionary a route needs.
//
// One eager English file would put every screen's copy in the first download — the intake
// wizard's, the import screen's, the account page's — for a visitor who has opened a dashboard. The
// rule: «eager is the FIRST SCREEN's strings, in the active locale. Everything else is a chunk.»
//
// This module has no imports on purpose. It is the map, it is read by `src/i18n.ts` at runtime and
// by `tests/i18n-routes.spec.ts` at build time, and a test that had to boot the app to read it
// would not be the guard this needs to be.

/**
 * The sections in the first download: the SHELL's own, and the LANDING route's.
 *
 * Not «the strings we felt like keeping»: the shell is on screen before any route is, and `/` is
 * what a visitor lands on, so both would flash their keys if they were fetched.
 */
export const EAGER = ['app', 'dashboard'] as const;

/**
 * A route, and the sections its page reads.
 *
 * FIRST MATCH WINS, so the specific paths come before the ones that would also match them:
 * `/customers/import` before `/customers/:id`, and `/tickets/:id/billing` before `/tickets/:id`.
 * Written the other way round, the import screen would be handed the customer detail's strings and
 * none of its own — which renders as keys, silently.
 *
 * `tests/i18n-routes.spec.ts` reads every page's `$t('<section>.…')` and fails naming any section a
 * page uses and its route does not declare, so this map cannot quietly fall behind the app.
 */
export const ROUTE_SECTIONS: { pattern: RegExp; sections: string[] }[] = [
    { pattern: /^\/login\/?$/, sections: ['login'] },
    // The create modal picks the ticket's asset with the assets' words.
    { pattern: /^\/tickets\/?$/, sections: ['assets', 'tickets'] },
    { pattern: /^\/tickets\/[^/]+\/billing\/?$/, sections: ['billing'] },
    { pattern: /^\/tickets\/[^/]+\/interventions\/[^/]+\/?$/, sections: ['intervention'] },
    { pattern: /^\/tickets\/[^/]+\/?$/, sections: ['attachments', 'ticket'] },
    { pattern: /^\/board\/?$/, sections: ['board'] },
    { pattern: /^\/customers\/import\/?$/, sections: ['customers', 'import'] },
    { pattern: /^\/customers(\/[^/]+)?\/?$/, sections: ['customers'] },
    // The documents upload through the ticket's panel, whose strings are `attachments`.
    { pattern: /^\/employees\/[^/]+\/documents\/?$/, sections: ['attachments', 'employees'] },
    { pattern: /^\/employees(\/[^/]+(\/(personal|contracts|sites))?)?\/?$/, sections: ['employees'] },
    { pattern: /^\/intake\/?$/, sections: ['assets', 'intake'] },
    { pattern: /^\/sites(\/[^/]+)?\/?$/, sections: ['sites'] },
    { pattern: /^\/assets(\/[^/]+)?\/?$/, sections: ['assets'] },
    // The new service's «Covers» names the asset kinds in the assets' words.
    { pattern: /^\/services(\/[^/]+)?\/?$/, sections: ['assets', 'services'] },
    { pattern: /^\/contracts\/?$/, sections: ['contracts'] },
    { pattern: /^\/account\/?$/, sections: ['account'] },
    // Settings reads the sections whose values it lists: the lookups are the tickets' and the
    // customers' own labels, the users and the roles are named as the account page names them.
    { pattern: /^\/settings\/lookups\/?$/, sections: ['customers', 'tickets'] },
    { pattern: /^\/settings\/(users|permissions)\/?$/, sections: ['account'] },
    { pattern: /^\/settings(\/[^/]+)?\/?$/, sections: ['settings'] },
];

/**
 * The sections a path needs beyond the eager ones — THE WHOLE CHAIN, not just the leaf.
 *
 * `/tickets/1/interventions/2` renders three screens inside each other: the list, the ticket, the
 * intervention. A first-match lookup returns only the intervention's section, and the ticket
 * underneath it renders `ticket.title` — `master-detail.spec.ts` and `production-build.spec.ts`
 * both fail on it. So each ancestor path is looked up too and the answer is the union.
 *
 * Empty for a path no route matches: a 404 renders the ROUTER's own copy, which is the library's
 * registry and not this dictionary at all.
 */
export function sectionsFor(path: string): string[] {
    const clean = path.split('?')[0].split('#')[0];
    const parts = clean.split('/').filter(Boolean);
    const out = new Set<string>();
    // From the leaf up: `/tickets/1/interventions/2`, `/tickets/1/interventions`, `/tickets/1`,
    // `/tickets`, `/`. A level that matches no route simply adds nothing.
    for (let i = parts.length; i >= 0; i--) {
        const sub = '/' + parts.slice(0, i).join('/');
        const hit = ROUTE_SECTIONS.find((r) => r.pattern.test(sub));
        if (hit) for (const name of hit.sections) out.add(name);
    }
    return [...out].sort();
}
