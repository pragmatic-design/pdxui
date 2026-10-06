// What the manifest calls a method has to be callable.
//
// `ctx.expose({ … })` puts names on the element, and `custom-elements.json` publishes each as a
// `method` or, for a getter, as a readonly `field`. The distinction exists because a reader who
// trusts it writes the call: `get isOpen()` listed as a method makes `el.isOpen()` throw
// "is not a function".
//
// The same holds one step along. `pdx-scroll-area` exposes `scrollArea` as an OBJECT of five
// helpers — `scrollTo`, `scrollBy`, `scrollIntoView`, `getViewport`, `recalculate` — and a manifest
// that called it a method would make `el.scrollArea()` throw while the five names the caller actually
// needs appear nowhere. The question is not "does this property have a name" but "is its value
// callable".
//
// This reads the sources itself rather than reusing the generator's scan, so it is a cross-check and
// not a restatement: a property of `ctx.expose({ … })` whose value is an object literal must not be
// published as a method.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import ts from 'typescript';

const UI = join(__dirname, '..', '..');

interface Member { kind: string; name: string; readonly?: boolean; type?: { text: string } }
interface Declaration { tagName?: string; members?: Member[] }
const manifest = JSON.parse(readFileSync(join(UI, 'custom-elements.json'), 'utf-8')) as {
    modules: { declarations?: Declaration[] }[];
};

const memberOf = (tag: string, name: string): Member | undefined => manifest.modules
    .flatMap(m => m.declarations ?? [])
    .find(d => d.tagName === tag)
    ?.members?.find(x => x.name === name);

/** Every `tag.name` whose exposed value is an OBJECT LITERAL — never callable, whatever its name. */
function exposedObjectLiterals(): string[] {
    const found: string[] = [];
    for (const file of globSync(join(UI, 'src', '**', 'pdx-*.ts').replace(/\\/g, '/'))) {
        const text = readFileSync(file, 'utf-8');
        const tag = text.match(/component\('([a-z-]+)'/)?.[1];
        if (!tag) continue;
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node): void => {
            if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
                && node.expression.name.text === 'expose'
                && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
                for (const prop of node.arguments[0].properties) {
                    if (!ts.isPropertyAssignment(prop)) continue;
                    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
                    const key = ts.isIdentifier(prop.name) ? prop.name.text : null;
                    if (key) found.push(`${tag}.${key}`);
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
        }
    return found.sort();
}

describe('the manifest publishes a callable as a method, and nothing else', () => {
    const objects = exposedObjectLiterals();

    it('found the components and at least one exposed object — the check is not vacuous', () => {
        expect(objects.length, 'no exposed object literal found at all').toBeGreaterThan(0);
        expect(objects, 'the reported case is not where it was').toContain('pdx-scroll-area.scrollArea');
    });

    it('an exposed object literal is NOT published as a method', () => {
        const asMethod = objects.filter(entry => {
            const [tag, name] = entry.split('.');
            return memberOf(tag, name)?.kind === 'method';
        });
        expect(asMethod, 'these are objects, and calling them throws "is not a function"').toEqual([]);
    });

    it('it is published as a readonly field instead, the way a getter is', () => {
        const member = memberOf('pdx-scroll-area', 'scrollArea');
        expect(member?.kind).toBe('field');
        expect(member?.readonly).toBe(true);
    });

    it('and its keys are published, because they are the API a caller needs', () => {
        // `el.scrollArea.scrollTo({top: 0})` is the shape. Publishing only the name leaves a reader
        // with a member they cannot use, and the five helpers nowhere in the catalogue.
        const text = memberOf('pdx-scroll-area', 'scrollArea')?.type?.text ?? '';
        for (const key of ['scrollTo', 'scrollBy', 'scrollIntoView', 'getViewport', 'recalculate']) {
            expect(text, `the published type does not name ${key}`).toContain(key);
        }
    });

    it('a real method is still a method', () => {
        // The guard against fixing this by calling everything a field.
        expect(memberOf('pdx-wizard', 'goTo')?.kind).toBe('method');
        expect(memberOf('pdx-data-grid', 'addRow')?.kind).toBe('method');
        // A computed IS callable — `el.source()` works — so it stays a method.
        expect(memberOf('pdx-data-source', 'source')?.kind).toBe('method');
    });
});
