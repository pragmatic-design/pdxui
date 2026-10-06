// A CSS custom property used without a fallback and declared nowhere is a rule that silently does
// not apply. `var(--x)` with no declaration resolves to `unset`: no error, no console line, no
// failing test — the declaration is simply dropped and the element renders without it.
//
// Without a lint, "0 phantom tokens" is a measurement, not a property: removing them once does not
// stop the next one from coming back. This check is what keeps the zero.
//
// The rule is narrow on purpose. A use WITH a fallback — `var(--pdx-density-factor, 1)` — is a knob:
// something outside the stylesheet (a theme, a component's inline style, the app) may set it, and
// the fallback is what makes it safe. Only a use with no fallback and no declaration is a defect.
//
// Run: node packages/design/scripts/lint-tokens.mjs   (wired into the root `lint` script)

import { readdirSync, readFileSync, statSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { join, relative, sep } from 'path';

/** Lazy: under a bundler `import.meta.url` is not a file: URL, and callers there pass a root. */
function defaultSrc() {
    return fileURLToPath(new URL('../src', import.meta.url));
}

/** Every .css file under a directory, recursively. */
export function cssFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...cssFiles(p));
        else if (name.endsWith('.css')) out.push(p);
    }
    return out.sort();
}

/** Drop /* … *​/ comments so a commented-out token is neither a declaration nor a use. */
function stripComments(css) {
    // Blanked, not removed: every character except newlines becomes a space, so offsets and line
    // numbers still point at the real file. Deleting them reported color-picker.css:223 for a token
    // that lives on line 243.
    return css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
}

/**
 * Scan CSS text for `--pdx-*` declarations and `var(--pdx-*)` uses.
 *
 * A declaration is a custom property at a declaration position — after `{`, `;` or the start of the
 * text. That excludes `var(--a, --b)`, where `--b` is a value and declares nothing.
 *
 * @returns {{ declared: Set<string>, usedNoFallback: Map<string, number> }} uses map to a line number
 */
export function scanCss(text) {
    const css = stripComments(text);
    const declared = new Set();
    const usedNoFallback = new Map();

    for (const m of css.matchAll(/(?:^|[;{}])\s*(--pdx-[A-Za-z0-9_-]+)\s*:/g)) {
        declared.add(m[1]);
    }

    for (const m of css.matchAll(/var\(\s*(--pdx-[A-Za-z0-9_-]+)\s*([,)])/g)) {
        if (m[2] === ',') continue; // has a fallback → a knob, legitimately set from outside
        if (!usedNoFallback.has(m[1])) {
            usedNoFallback.set(m[1], css.slice(0, m.index).split('\n').length);
        }
    }

    return { declared, usedNoFallback };
}

/**
 * @returns {{ files: number, declared: number, phantoms: {token: string, file: string, line: number}[] }}
 */
export function lintTokens(root = defaultSrc()) {
    const files = cssFiles(root);
    const declared = new Set();
    const uses = [];

    for (const file of files) {
        const { declared: d, usedNoFallback } = scanCss(readFileSync(file, 'utf-8'));
        for (const t of d) declared.add(t);
        for (const [token, line] of usedNoFallback) {
            uses.push({ token, file: relative(root, file).split(sep).join('/'), line });
        }
    }

    // Declarations are collected across the WHOLE design system first: a token declared in
    // tokens.css and used in a component file is not a phantom.
    const phantoms = uses.filter(u => !declared.has(u.token));
    return { files: files.length, declared: declared.size, phantoms };
}

/** Files under a directory, recursively, skipping build output and tooling state. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results', 'playwright-report']);
function walk(dir, out = [], skipped = []) {
    let entries;
    // ⚠️ These two catches are not silent, because a silent one hides this: a subtree the walk
    // cannot read for an instant — which happens while six packages write to packages/ in a
    // parallel test run — simply vanishes from the answer, and every token read only from inside it
    // is reported as read by nothing. The result is a red on a clean tree, once every few runs,
    // blamed on the runner. The failure is tolerated, because a walk must survive a directory being
    // rebuilt underneath it; it is not INVISIBLE.
    try { entries = readdirSync(dir); } catch (err) { skipped.push(`${dir}: ${err.code ?? err}`); return out; }
    for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        let st;
        try { st = statSync(p); } catch (err) { skipped.push(`${p}: ${err.code ?? err}`); continue; }
        if (st.isDirectory()) walk(p, out, skipped);
        else out.push(p);
    }
    return out;
}

/**
 * The reverse direction: tokens DECLARED here and read by nothing.
 *
 * "Read" means something consumes the value — `var(--x)` in any stylesheet or template, or a token
 * name quoted inside packages/core/src, which is the runtime that mirrors the behavior tokens into
 * HTML attributes through a name table (component/style.ts BEHAVIOR_TOKEN_MAP) and so reads them
 * with no `var()` anywhere.
 *
 * Everything else is NOT a read, and this is the distinction that makes the number mean something:
 * declaring the token, generating it (engine/generate.ts assigns --pdx-opacity-hover into a theme it
 * emits), listing it in the builder's editor catalogue, naming it in a test's expected-token array,
 * or documenting it. All of those name a token without anyone ever consuming its value.
 *
 * Reported as a RATCHET, never a hard failure: a design system legitimately ships tokens for its
 * consumers, so the count may not grow, but it is not required to be zero.
 */
export function unreadTokens(repoRoot) {
    // Every walk reports into one list: `unread` is only meaningful if the tree was fully read, and
    // a caller comparing two scans has no other way to know one of them was short.
    const skipped = [];

    const declRoot = join(repoRoot, 'packages', 'design', 'src');
    const declared = new Map();
    for (const f of walk(declRoot, [], skipped).filter(f => f.endsWith('.css'))) {
        const { declared: d } = scanCss(readFileSync(f, 'utf-8'));
        for (const t of d) if (!declared.has(t)) declared.set(t, relative(repoRoot, f).split(sep).join('/'));
    }

    const read = new Set();
    const sources = [
        ...walk(join(repoRoot, 'packages'), [], skipped),
        ...walk(join(repoRoot, 'templates'), [], skipped),
    ];
    for (const f of sources) {
        if (f.endsWith('.md')) continue;
        for (const m of readFileSync(f, 'utf-8').matchAll(/var\(\s*(--pdx-[A-Za-z0-9_-]+)/g)) read.add(m[1]);
    }
    for (const f of walk(join(repoRoot, 'packages', 'core', 'src'), [], skipped)) {
        for (const m of readFileSync(f, 'utf-8').matchAll(/['"`](--pdx-[A-Za-z0-9_-]+)['"`]/g)) read.add(m[1]);
    }

    const unread = [...declared.keys()].filter(t => !read.has(t)).sort();
    return { declared: declared.size, read: read.size, unread, where: declared, skipped };
}

/**
 * Token names a documentation page presents to the reader, with the line each is on.
 *
 * Prefixes are not tokens: `--pdx-table-header-*` and `--pdx-color-*` are prose standing for a
 * family, so a match ending in `-` or followed by `*` is skipped rather than reported as a name the
 * page promises.
 */
export function tokensNamedIn(text) {
    const named = new Map();
    text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/(--pdx-[A-Za-z0-9_-]+)/g)) {
            if (m[1].endsWith('-')) continue;
            if (line[m.index + m[1].length] === '*') continue;
            if (!named.has(m[1])) named.set(m[1], i + 1);
        }
    });
    return named;
}

function main() {
    const { files, declared, phantoms } = lintTokens();

    // The ratchet, reported and never failing here: its teeth are the ceiling asserted in
    // packages/core/tests/design-tokens.test.ts. Printed so the number is visible on every lint run
    // rather than only when a test breaks.
    const repoRoot = join(defaultSrc(), '..', '..', '..');
    const { unread } = unreadTokens(repoRoot);
    console.log(`[lint-tokens] ${unread.length} declared token(s) read by nothing (ratchet — the ceiling is asserted in core's design-tokens test).`);

    if (phantoms.length === 0) {
        console.log(`[lint-tokens] ${files} css files, ${declared} tokens declared, 0 used without a fallback and never declared.`);
        return;
    }
    console.error(`[lint-tokens] ${phantoms.length} phantom token(s) — used without a fallback and declared nowhere.`);
    console.error('The declaration containing each of these silently does not apply.\n');
    for (const p of phantoms) {
        console.error(`  ${p.token}\n    ${p.file}:${p.line}`);
    }
    console.error('\nFix: declare the token, or give the var() a fallback if it is meant to be set from outside.');
    process.exit(1);
}

// Only when run as a script — the unit test imports lintTokens() and must not exit the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
