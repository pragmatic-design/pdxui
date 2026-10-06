// Every event that carries a detail says what is in it.
//
// "`pdx-change` — Fired when the value changes." does not say what the event carries, and a payload
// is easy to guess wrong: pdx-tag-input puts the list in `detail.tags`, not `detail.value`.
//
// The manifest records each event's detail. For an object literal (the vast majority of the emits
// that pass a detail) the generator reads the keys straight from the call, so
// nothing is typed twice and nothing can drift. For anything else, a value or a call, the component
// declares it: `@fires name {Type} - description`. This is the guard, in the shape of
// no-dead-props.test.ts: an emit with a detail that the manifest cannot describe is red.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import ts from 'typescript';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { MANIFEST_PATH } from '../../scripts/gen-manifest.mjs';

const SRC = join(__dirname, '..', '..', 'src');

interface CemEvent { name: string; detail?: string }
interface CemDecl { tagName: string; events?: CemEvent[] }
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as { modules: { path: string; declarations: CemDecl[] }[] };

function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) sourceFiles(p, acc);
        else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) acc.push(p);
    }
    return acc;
}

/** Tags declared by `component('tag', …)` in a file. */
function tagsIn(text: string): string[] {
    return [...text.matchAll(/^component\('([\w-]+)'/gm)].map(m => m[1]);
}

/** The tag of the top-level `component('tag', …)` statement that contains `node`, if any. */
function enclosingComponent(node: ts.Node): string | undefined {
    let n: ts.Node | undefined = node;
    while (n && !ts.isSourceFile(n.parent)) n = n.parent;
    if (n && ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)
        && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === 'component') {
        const first = n.expression.arguments[0];
        if (first && ts.isStringLiteralLike(first)) return first.text;
    }
    return undefined;
}

/**
 * Every public `.emit('name', detail)` (no `__` prefix) in a file, with the component it belongs to:
 * the component() statement around it, or — outside any, in a helper — every component of the file.
 */
function emitsWithDetail(file: string, text: string): { name: string; tag?: string }[] {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const found: { name: string; tag?: string }[] = [];
    const visit = (n: ts.Node): void => {
        // `emit('x', undefined, { bubbles: false })` carries no detail: the undefined only holds the
        // place of the options argument.
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'emit'
            && n.arguments.length >= 2 && !(ts.isIdentifier(n.arguments[1]) && n.arguments[1].text === 'undefined')
            && ts.isStringLiteralLike(n.arguments[0]) && !n.arguments[0].text.startsWith('__')) {
            found.push({ name: n.arguments[0].text, tag: enclosingComponent(n) });
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return found;
}

/** The tags an emit belongs to: its own component() statement, its file's, or its directory's. */
function ownersOf(file: string, tag: string | undefined, all: Map<string, string>): string[] {
    if (tag) return [tag];
    const own = tagsIn(all.get(file)!);
    if (own.length) return own;
    return [...all].filter(([f]) => dirname(f) === dirname(file)).flatMap(([, t]) => tagsIn(t));
}

const files = new Map(sourceFiles(SRC).map(f => [f, readFileSync(f, 'utf-8')] as const));
const eventsByTag = new Map(manifest.modules.flatMap(m => m.declarations).map(d => [d.tagName, d.events ?? []]));

describe('an event with a detail says what is in it', () => {
    const checks: string[] = [];
    const undocumented: string[] = [];
    for (const [file, text] of files) {
        for (const { name, tag: inside } of emitsWithDetail(file, text)) {
            for (const tag of ownersOf(file, inside, files)) {
                checks.push(`${tag} ${name}`);
                const ev = eventsByTag.get(tag)?.find(e => e.name === name);
                if (!ev?.detail) undocumented.push(`${tag} ${name}  (${relative(SRC, file).replace(/\\/g, '/')})`);
            }
        }
    }

    it('found the emits to check', () => {
        // The control: a scan that finds nothing makes the next assertion pass by default.
        expect(checks.length).toBeGreaterThan(150);
    });

    it('has a detail in the manifest for every one of them', () => {
        expect([...new Set(undocumented)]).toEqual([]);
    });

    it('says pdx-tag-input carries its list in detail.tags — the payload the lab guessed wrong', () => {
        const change = eventsByTag.get('pdx-tag-input')?.find(e => e.name === 'pdx-change');
        expect(change?.detail).toMatch(/\btags\b/);
    });
});
