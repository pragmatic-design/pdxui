// CD-D1 across files: two routes of one app that load the same endpoint, where one route
// contains the other — a parent and its own section fetching the same list, two requests and two
// copies that can disagree. `pdx check` runs it over the whole app.
//
// An endpoint is a `fetch` URL as written (a template literal keeps its text, each `${…}` blanked)
// or the transport handed to `createDataSource` / `resource`. Only routes are compared: a component
// that is not a route and owns its rows — a picker over its own data source — is the allowed case.

import ts from 'typescript';
import { parseSFC } from '../parser/sfc';
import { parseableScript } from './validate-design';
import type { ValidationWarning } from './validate';

const SOURCE_FACTORIES = new Set(['createDataSource', 'resource']);

interface Load { endpoint: string; line: number }

/** One endpoint loaded by two routes where one contains the other. */
export interface SharedLoading {
    endpoint: string;
    locations: { file: string; route: string; line: number }[];
}

/** The URL of a fetch as written: `/api/x?id=${id}` → `/api/x?id=${}`. */
function urlOf(e: ts.Expression): string | null {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) return e.head.text + e.templateSpans.map(s => '${}' + s.literal.text).join('');
    return null;
}

/** A fetch whose options name a method other than GET writes; it does not load. */
function isRead(call: ts.CallExpression): boolean {
    const opts = call.arguments[1];
    if (!opts || !ts.isObjectLiteralExpression(opts)) return true;
    const method = opts.properties.find(p => p.name && ts.isIdentifier(p.name) && p.name.text === 'method');
    return !method || !ts.isPropertyAssignment(method) || !ts.isStringLiteralLike(method.initializer)
        || method.initializer.text.toUpperCase() === 'GET';
}

function loadsOf(source: string): { route: string | null; loads: Load[] } {
    const script = parseSFC(source).script;
    if (!script) return { route: null, loads: [] };
    // Match: the route a file declares. Groups: [1]=the path
    const route = script.content.match(/^[ \t]*@page\s+['"]([^'"]+)['"]/m)?.[1] ?? null;
    const sf = parseableScript(script.content);
    const loads: Load[] = [];
    const visit = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
            const line = source.slice(0, script.start + n.getStart(sf)).split('\n').length;
            const url = n.expression.text === 'fetch' && n.arguments[0] ? urlOf(n.arguments[0]) : null;
            if (url && isRead(n)) loads.push({ endpoint: url, line });
            const opts = n.arguments[0];
            if (SOURCE_FACTORIES.has(n.expression.text) && opts && ts.isObjectLiteralExpression(opts)) {
                const t = opts.properties.find(p => p.name && ts.isIdentifier(p.name) && p.name.text === 'transport');
                const value = t && ts.isPropertyAssignment(t) ? t.initializer : t && ts.isShorthandPropertyAssignment(t) ? t.name : undefined;
                if (value && ts.isIdentifier(value)) loads.push({ endpoint: `transport ${value.text}`, line });
            }
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return { route, loads };
}

/** Segments with the parameters' names blanked: `/employees/:id` and `/employees/:who` are one route. */
const segments = (route: string): string[] => route.split('/').filter(Boolean).map(s => (s.startsWith(':') ? ':' : s));

/** True when `outer` is a proper prefix of `inner`, segment by segment. */
function contains(outer: string, inner: string): boolean {
    const [o, i] = [segments(outer), segments(inner)];
    return o.length < i.length && o.every((s, k) => s === i[k]);
}

/** The endpoints two nested routes both load (CD-D1). */
export function findSharedLoading(files: { file: string; source: string }[]): SharedLoading[] {
    const routes = files.map(f => ({ file: f.file, ...loadsOf(f.source) })).filter(r => r.route !== null && r.loads.length > 0);
    const found = new Map<string, SharedLoading>();
    for (const outer of routes) {
        for (const inner of routes) {
            if (!contains(outer.route!, inner.route!)) continue;
            for (const a of outer.loads) {
                const b = inner.loads.find(l => l.endpoint === a.endpoint);
                if (!b) continue;
                const entry = found.get(a.endpoint) ?? { endpoint: a.endpoint, locations: [] };
                for (const [r, l] of [[outer, a], [inner, b]] as const) {
                    if (!entry.locations.some(x => x.file === r.file && x.line === l.line)) entry.locations.push({ file: r.file, route: r.route!, line: l.line });
                }
                found.set(a.endpoint, entry);
            }
        }
    }
    return [...found.values()];
}

/** The PDX_SHARED_LOADING warning for one place a shared endpoint is loaded. */
export function sharedLoadingWarning(s: SharedLoading, at: { file: string; line: number }): ValidationWarning {
    const places = s.locations.map(l => `${l.file}:${l.line} (${l.route})`).join(', ');
    return {
        code: 'PDX_SHARED_LOADING',
        severity: 'warn',
        message: `'${s.endpoint}' is loaded by a route and by a route inside it (CD-D1, a heuristic): ${places} — `
            + `two requests, and two copies that can disagree.`,
        hint: `Load it once, at the outer route, and hand it down (a prop, or an owner the route provides). A picker over its own rows is the allowed case.`,
        line: at.line,
    };
}
