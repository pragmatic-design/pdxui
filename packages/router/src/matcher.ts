// The route matcher — built ONCE from the route list, so a navigation does no parsing and, for every
// pattern made of whole segments, no regex.
//
// There is one of these, and every router runs it: a production build, the dev server and an app
// that calls `createRouter(routes)` by hand all hand their routes to `compileMatcher`. Before #108 a
// build ran a second router the compiler emitted as a string, and the two had to be kept in step by
// a parity table; now the build emits route DATA and this is the only code that reads it.
//
// The shape of the table:
//
//   · a static path is a key in a Map — `/about` is one lookup;
//   · a dynamic path is a list of segments, tried in declared order — a literal compares as a
//     string, a param takes one non-empty segment, a trailing `*` takes the rest;
//   · a constraint (`:id(number)`, `:id(uuid)`, `:code([A-Z]{3})`) is the one regex left, compiled
//     here, tested against the one segment it constrains.
//
// A pattern that is not made of whole segments — `/files/:name.:ext`, a `*` in the middle, a
// constraint with a `/` inside it — keeps the old whole-path regex. Nothing an app declares stops
// matching; it is just not the fast path.

/** What the matcher needs of a route. */
export interface MatchableRoute {
    path: string;
    /** Renders a `<pdx-router-outlet>`, so routes below its path nest inside it. */
    hasOutlet?: boolean;
    /** A redirect renders nothing, so it is never a level of a chain or a crumb. */
    redirect?: string;
}

export interface RouteMatch<R> {
    route: R;
    params: Record<string, string>;
}

export interface Matcher<R extends MatchableRoute> {
    /** The route a path resolves to, static first and then dynamic in declared order, or null. */
    match(path: string): RouteMatch<R> | null;
    /**
     * The route and every route it renders inside, outermost first, with the route last.
     *
     * A parent is a route whose path is a SEGMENT prefix AND that renders an outlet: `/owners` is a
     * prefix of `/owners/new` and they are siblings. `/` is nobody's parent — it is a prefix of
     * everything — and a redirect renders nothing.
     */
    chain(route: R): R[];
    /** Every route above this one BY PATH, outermost first — the breadcrumb's levels, not the render chain. */
    ancestors(route: R): R[];
}

type Segment =
    | { literal: string }
    | { param: string; test: RegExp | null };

type DynamicRoute<R> =
    | { route: R; segments: Segment[]; rest: boolean }
    | { route: R; regex: RegExp; paramNames: string[] };

/** Is `parent` a SEGMENT prefix of `child`? `/tickets/:id` is; `/tick` is not. */
export function isSegmentPrefix(parent: string, child: string): boolean {
    if (parent === child || parent === '/') return false;
    const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
    return child.startsWith(p + '/');
}

/** Decode a matched param (the write side encodes it); a malformed %-sequence is kept as written. */
export function safeDecodeParam(v: string): string {
    try { return decodeURIComponent(v); } catch { return v; }
}

/** `*` and `:name` are what make a path dynamic. */
function isDynamic(path: string): boolean {
    return path.includes(':') || path.includes('*');
}

/** Build the matcher for these routes. Called once per `createRouter`, never per navigation. */
export function compileMatcher<R extends MatchableRoute>(routes: readonly R[]): Matcher<R> {
    // First declaration wins, as the first route in the list did when routes were tried in order.
    const statics = new Map<string, R>();
    const dynamics: DynamicRoute<R>[] = [];
    for (const route of routes) {
        if (!isDynamic(route.path)) {
            if (!statics.has(route.path)) statics.set(route.path, route);
            continue;
        }
        dynamics.push(compileDynamic(route));
    }

    const chains = new Map<R, R[]>();
    const ancestors = new Map<R, R[]>();
    const byLength = (a: R, b: R) => a.path.length - b.path.length;
    for (const route of routes) {
        const above = routes.filter(c => !c.redirect && isSegmentPrefix(c.path, route.path)).sort(byLength);
        ancestors.set(route, above);
        chains.set(route, [...above.filter(c => c.hasOutlet), route]);
    }

    return {
        match(path) {
            // Matched WITHOUT a trailing slash, root excepted: '/about/' and '/about' are one route.
            // A trailing slash arrives from a pasted URL or a server that appends one, and the 404 it
            // would otherwise produce is not one anybody can act on.
            const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
            const hit = statics.get(p);
            if (hit) return { route: hit, params: {} };
            const segs = p.startsWith('/') ? (p === '/' ? [] : p.slice(1).split('/')) : null;
            for (const d of dynamics) {
                const params = 'regex' in d ? matchRegex(d, p) : segs && matchSegments(d, segs);
                if (params) return { route: d.route, params };
            }
            return null;
        },
        chain: route => chains.get(route) ?? [route],
        ancestors: route => ancestors.get(route) ?? [],
    };
}

function matchSegments(d:{ segments: Segment[]; rest: boolean }, segs: string[]): Record<string, string> | null {
    const n = d.segments.length;
    if (d.rest ? segs.length <= n : segs.length !== n) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
        const seg = d.segments[i];
        const s = segs[i];
        if ('literal' in seg) {
            if (s !== seg.literal) return null;
        } else {
            // A param takes one NON-EMPTY segment, and its constraint reads the segment as written.
            if (s === '' || (seg.test && !seg.test.test(s))) return null;
            params[seg.param] = safeDecodeParam(s);
        }
    }
    if (d.rest) {
        // Decoded AFTER the join: decoding each segment first would turn an encoded %2F into a
        // separator and change the shape of the value.
        const rest = segs.slice(n).join('/');
        if (rest === '') return null;
        params.$rest = safeDecodeParam(rest);
    }
    return params;
}

function matchRegex(d:{ regex: RegExp; paramNames: string[] }, path: string): Record<string, string> | null {
    const m = d.regex.exec(path);
    if (!m) return null;
    const params: Record<string, string> = {};
    d.paramNames.forEach((name, i) => { params[name] = safeDecodeParam(m[i + 1]); });
    return params;
}

/** A dynamic pattern as segments, or — when it is not made of whole segments — as a regex. */
function compileDynamic<R extends MatchableRoute>(route: R): DynamicRoute<R> {
    const path = route.path;
    if (path.startsWith('/')) {
        const raw = splitSegments(path.slice(1));
        const segments: Segment[] = [];
        let rest = false;
        let whole = raw !== null;
        for (let i = 0; whole && i < raw!.length; i++) {
            const s = raw![i];
            if (s === '*' && i === raw!.length - 1) { rest = true; break; }
            const param = wholeParam(s);
            if (param) segments.push(param);
            else if (s.includes('*') || /:[A-Za-z0-9_]/.test(s)) whole = false;
            else segments.push({ literal: s });
        }
        if (whole) return { route, segments, rest };
    }
    return { route, ...pathToRegex(path) };
}

/** Split on `/` outside a constraint's parentheses; null when a constraint itself holds a `/`. */
function splitSegments(path: string): string[] | null {
    const out: string[] = [];
    let start = 0;
    let depth = 0;
    for (let i = 0; i < path.length; i++) {
        const ch = path[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === '/') {
            if (depth > 0) return null;
            out.push(path.slice(start, i));
            start = i + 1;
        }
    }
    out.push(path.slice(start));
    return out;
}

/** `:id`, `:id(number)`, `:id(uuid)`, `:code([A-Z]{3})` — a param that is the whole segment. */
function wholeParam(s: string): Segment | null {
    if (s[0] !== ':' || !isWordChar(s[1])) return null;
    let end = 1;
    while (end < s.length && isWordChar(s[end])) end++;
    const name = s.slice(1, end);
    let constraint = '';
    if (s[end] === '(') {
        // The constraint ends at the FIRST `)`, as the pattern scanner has always read it.
        const close = s.indexOf(')', end + 1);
        if (close > end + 1) {
            constraint = s.slice(end + 1, close);
            end = close + 1;
        }
    }
    if (end !== s.length) return null;
    // `string` is any one non-empty segment, which a param already is: no regex to run.
    const test = constraint && constraint !== 'string' ? new RegExp(`^(?:${constraintSource(constraint)})$`) : null;
    return { param: name, test };
}

/**
 * The four named constraints of the grammar (`docs/language/beta/routing.md`), or the developer's own
 * pattern. A name missing here is read as a pattern that matches only itself (#305).
 */
function constraintSource(constraint: string): string {
    return constraint === 'number' ? '[0-9]+'
        : constraint === 'uuid' ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
        : constraint === 'slug' ? '[a-z0-9]+(?:-[a-z0-9]+)*'
        : constraint === 'string' ? '[^/]+'
        : constraint;
}

/**
 * A level's params as its loader receives them (#505): coerced by the pattern's constraints, read
 * beside the constraint table above so the two cannot drift. `:id(number)` gives a number — its
 * value matched `[0-9]+`, so the conversion cannot fail — and every other constraint, and an
 * unconstrained param, keeps the string.
 */
export function coerceParams(pattern: string, params: Record<string, string>): Record<string, string | number> {
    const out: Record<string, string | number> = { ...params };
    // Match: `:name(constraint)`, the constraint ending at the first `)` as the scanner reads it.
    // Groups: [1]=the name [2]=the constraint
    for (const m of pattern.matchAll(/:([A-Za-z0-9_]+)\(([^)]*)\)/g)) {
        if (m[2] === 'number' && typeof params[m[1]] === 'string') out[m[1]] = Number(params[m[1]]);
    }
    return out;
}

/**
 * A pattern that is not made of whole segments, as one regex with named param extraction:
 *   /files/:name.:ext   → /^\/files\/([^/]+)\.([^/]+)$/
 *   /a/*\/b             → /^\/a\/(.+)\/b$/
 */
export function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
    // One left-to-right scan, not three regex passes (#67). The passes ran in polynomial time on a
    // pattern of repeated `:0((`, escaped the slashes and nothing else — so a `.` in `/feed.xml`
    // matched any character — named the wildcard before the params whatever their order, and
    // rewrote a `*` inside a param's own constraint.
    const paramNames: string[] = [];
    let source = '';
    let i = 0;
    while (i < path.length) {
        const ch = path[i];
        if (ch === '*') {
            paramNames.push('$rest');
            source += '(.+)';
            i++;
            continue;
        }
        if (ch === ':' && isWordChar(path[i + 1])) {
            let end = i + 1;
            while (end < path.length && isWordChar(path[end])) end++;
            const name = path.slice(i + 1, end);
            let constraint = '';
            if (path[end] === '(') {
                const close = path.indexOf(')', end + 1);
                if (close > end + 1) {
                    constraint = path.slice(end + 1, close);
                    end = close + 1;
                }
            }
            paramNames.push(name);
            source += constraint ? `(${constraintSource(constraint)})` : '([^/]+)';
            i = end;
            continue;
        }
        // Literal text matches itself: every regex metacharacter escaped, not only `/`.
        source += REGEX_SPECIAL.has(ch) ? `\\${ch}` : ch;
        i++;
    }
    return { regex: new RegExp(`^${source}$`), paramNames };
}

/** The characters a regex reads as syntax. */
const REGEX_SPECIAL = new Set(['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}', '/']);

/** `\w`, one character at a time: a letter, a digit or `_`. */
function isWordChar(ch: string | undefined): boolean {
    if (ch === undefined) return false;
    const c = ch.charCodeAt(0);
    return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}
