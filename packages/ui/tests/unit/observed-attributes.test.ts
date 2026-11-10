// Every component's observed attributes, recorded (#872).
//
// A prop is observed when its runtime type is String, Number or Boolean, and is property-only when it
// is Array, Object or Function. Moving the library's props from the constructor form to `prop<T>()`
// must not move a prop across that line: `prop(null)` infers Object, so a String prop with a null
// default written without `{ type: String }` would silently stop reading its attribute. The record
// below is what the constructor form produced; a change to it is a change of behaviour.

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

function componentFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) componentFiles(p, acc);
        // A component written in .pdx too (#1008): moving one must not change what it observes.
        else if (/^pdx-.*\.(ts|pdx)$/.test(entry)) acc.push(p);
    }
    return acc;
}

const files = componentFiles(SRC).sort();

describe('observed attributes', () => {
    // Transforming and loading the whole library is the work this hook does: the default 10 s is
    // for a hook that waits on something, and this one is measured in tens of seconds under a gate.
    beforeAll(async () => {
        await Promise.all(files.map(file => import(file)));
    }, 120_000);

    it('loads the components', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('are the ones each component has always observed', () => {
        const record: Record<string, string[]> = {};
        for (const name of files) {
            const tag = (name.match(/(pdx-[\w-]+)\.(?:ts|pdx)$/) ?? [])[1];
            const ctor = tag ? customElements.get(tag) : undefined;
            if (!ctor) continue;
            const observed = (ctor as unknown as { observedAttributes?: string[] }).observedAttributes ?? [];
            record[tag!] = [...observed].sort();
        }
        expect(Object.keys(record).length).toBeGreaterThan(100);
        expect(record).toMatchSnapshot();
    });
});
