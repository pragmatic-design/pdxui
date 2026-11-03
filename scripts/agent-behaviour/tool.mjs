#!/usr/bin/env node
// The one command the agent may run: `node scripts/agent-behaviour/tool.mjs <verb> [args]`.
//
// It is what keeps the two modes apart. In `description` mode the agent reads the page only through
// `__PDX_DEVTOOLS__` (map, shell, page, outline); in `snapshot` mode only through agent-browser's
// full accessibility snapshot. Both act the same way, on a selector or a snapshot ref. Every answer
// is counted, so the run can say how many characters each mode sent to the agent.
//
// run.mjs sets the environment: PDX_AB_SESSION, PDX_AB_MODE, PDX_AB_BASE and PDX_AB_LOG.

import { appendFileSync } from 'node:fs';
import { browser, evaluate } from './browser.mjs';

const { PDX_AB_SESSION: session, PDX_AB_MODE: mode, PDX_AB_BASE: base, PDX_AB_LOG: log } = process.env;

const ACT = {
    open: '<path>       go to a path of the app, e.g. /customers',
    click: '<selector>   click an element (a CSS selector, or an @ref from a snapshot)',
    fill: '<selector> <text>   clear a field and type into it',
    press: '<key>        press a key: Enter, Escape, Tab, ArrowDown…',
    url: '             the current URL',
    wait: '<ms>         wait, at most 3000 ms',
};
const READ = mode === 'snapshot'
    ? { snapshot: '             the full accessibility tree of the page, with an @ref on each element' }
    : {
        map: '             the app\'s routes: pattern, params and their types, title, guard, access',
        shell: '             the outline of what every page shares: the navigation, the top bar',
        page: '             the page card: route, title, lists, forms, live messages, actions, links',
        outline: '[maxItems]   the outline of the page\'s content, a CSS selector on each control',
        delta: '             what changed since the last page, outline or delta: card keys, outline lines',
        actions: '             the @actions of the page: component, name, enabled, pending, error, schema',
        run: '<component> <name> [json]   call an @action as its control would, wait for it to settle',
        sources: '             the page\'s async sources and route loaders: state, pending, error, size',
        forms: '             the page\'s forms: valid, dirty, submitting, each field\'s value and error',
    };

function usage() {
    const verbs = { ...READ, ...ACT };
    return `usage: node scripts/agent-behaviour/tool.mjs <verb> [args]\n${Object.entries(verbs).map(([v, d]) => `  ${v} ${d}`).join('\n')}`;
}

/** The answer to one verb, as text. */
function answer(verb, args) {
    switch (verb) {
        // Stringified in the page: what comes back is the JSON text itself.
        case 'map': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.map())');
        case 'page': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.page())');
        case 'shell': return evaluate(session, '__PDX_DEVTOOLS__.shell()');
        case 'outline': {
            const max = Number(args[0]);
            return evaluate(session, `__PDX_DEVTOOLS__.outline(${Number.isFinite(max) && max > 0 ? `{ maxItems: ${max} }` : ''})`);
        }
        case 'delta': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.delta())');
        case 'actions': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.actions())');
        case 'sources': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.sources())');
        case 'forms': return evaluate(session, 'JSON.stringify(__PDX_DEVTOOLS__.forms())');
        case 'run': {
            // The input is JSON as the agent wrote it; parsed here, so a typo is the agent's error, not the page's.
            const raw = args.slice(2).join(' ');
            const input = raw ? JSON.parse(raw) : undefined;
            const call = `__PDX_DEVTOOLS__.run(${JSON.stringify(String(args[0]))}, ${JSON.stringify(String(args[1]))}, ${JSON.stringify(input) ?? 'undefined'})`;
            return evaluate(session, `${call}.then((r) => JSON.stringify(r), (e) => JSON.stringify({ rejected: e.message }))`);
        }
        case 'snapshot': return browser(session, 'snapshot');
        case 'open': {
            const path = String(args[0] ?? '/');
            if (/^[a-z]+:/i.test(path)) throw new Error('open takes a path of the app, like /customers, not a URL or a file path');
            return browser(session, 'open', `${base}/${path.replace(/^\/+/, '')}`);
        }
        // Scrolled into view first: the showcase scrolls an element of its shell, not the window, and
        // agent-browser's click lands on the element's coordinates without scrolling that element —
        // off screen, on nothing, and it still answers "Done".
        case 'click':
            browser(session, 'scrollintoview', String(args[0]));
            return browser(session, 'click', String(args[0]));
        case 'fill':
            browser(session, 'scrollintoview', String(args[0]));
            return browser(session, 'fill', String(args[0]), args.slice(1).join(' '));
        case 'press': return browser(session, 'press', String(args[0]));
        case 'url': return browser(session, 'get', 'url');
        case 'wait': return browser(session, 'wait', String(Math.min(3000, Math.max(0, Number(args[0]) || 0))));
        default: throw new Error(`unknown verb "${verb}" in ${mode} mode\n${usage()}`);
    }
}

const [verb, ...args] = process.argv.slice(2);
let out;
let failed = false;
if (!session || !mode || !base || !log) {
    out = 'tool.mjs runs under run.mjs, which sets PDX_AB_SESSION, PDX_AB_MODE, PDX_AB_BASE and PDX_AB_LOG';
    failed = true;
} else if (!verb || !(verb in READ || verb in ACT)) {
    out = verb ? `"${verb}" is not available in ${mode} mode\n${usage()}` : usage();
    failed = true;
} else {
    try {
        out = String(answer(verb, args)).trim();
    } catch (err) {
        out = err instanceof Error ? err.message : String(err);
        failed = true;
    }
}
if (log) appendFileSync(log, `${JSON.stringify({ verb: verb ?? null, chars: out.length, failed })}\n`);
process.stdout.write(`${out}\n`);
process.exitCode = failed ? 1 : 0;
