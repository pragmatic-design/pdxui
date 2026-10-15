/**
 * The showcase is built the way a production app is: through the inline render path (#44).
 *
 * Since #107 it is the one render path of a .pdx, in dev and in a build, and `pdx()` has no way to
 * select another. The showcase is the bench the production build is measured on: a suite that ran
 * the template path would certify a mode no application ships.
 *
 * Read off the built chunk, not the config: the config is what was asked, the chunk is what was
 * done. The intervention page's ticket marker is its own markup, in its own chunk
 * (`bundle-budget.spec.ts` holds that), so the chunk that carries it shows which path compiled it.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');
const MARKER = 'intervention-ticket';

test('the app\'s own pages are compiled through the inline render path', () => {
    const chunks = readdirSync(DIST).filter(f => f.endsWith('.js'))
        .filter(f => readFileSync(join(DIST, f), 'utf8').includes(MARKER));
    expect(chunks, 'no chunk carries the intervention page — this measures nothing').toHaveLength(1);
    const code = readFileSync(join(DIST, chunks[0]), 'utf8');

    // Both paths carry the page's markup as a string since #369, so the string alone says nothing:
    // what differs is where a binding goes. The template path writes it into the markup, `${…}`,
    // for an `html` tag to turn into a placeholder at runtime; the inline path writes an empty
    // anchor, `<!---->`, that the render's walk reaches and binds.
    const at = code.indexOf(`data-test="${MARKER}"`);
    expect(at, 'the marker is not in the page\'s markup').toBeGreaterThan(-1);
    const element = code.slice(at, code.indexOf('</span>', at));
    expect(element, 'the page binds inside a template literal: the build ran the template path')
        .not.toContain('${');
    expect(element, 'the page has no anchor for its binding: the build did not run the inline path')
        .toContain('<!---->');
});
