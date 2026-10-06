// A component moved by app code holds its content once.
//
// The library's own movers (useScrollbar, pdx-scroll-area, pdx-app-layout) use moveMounted. A move
// done by an application — a sortable list, a portal, a container that wraps its content — is a
// plain appendChild: a disconnect and a connect. If the disconnect destroys the component and the
// connect mounts it again, it takes its first render for light-DOM children and projects it into the
// new <slot>: pdx-toggle would hold a button inside a button. And a component that builds in a
// requestAnimationFrame must not build into the element after the setup that scheduled the frame is
// destroyed. Two timings: moved before its frames ran, and moved once built.
//
// Every component in the manifest, not a hand-kept list: the library has more than a hundred, any
// of which can build into its element from a frame. A component added tomorrow is measured tomorrow.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type Move = { tag: string; when: string; still: number; moved: number };

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, '../../../../ui/custom-elements.json'), 'utf8')) as {
    modules: { declarations?: { tagName?: string }[] }[];
};
const ALL_TAGS = manifest.modules.map(m => m.declarations?.[0]?.tagName).filter((t): t is string => !!t);

/**
 * Components whose DOM count measures nothing here, each with its reason. A bare tag of these
 * renders no element of its own, so the count is 0 in place and 0 after the move, whatever happens.
 */
const EXCLUDED: Record<string, string> = {
    'pdx-relation-picker': 'renders no element until it has a source',
};

const TAGS = ALL_TAGS.filter(t => !(t in EXCLUDED));

/** Components that render nothing bare, measured with the least configuration that builds them. */
const PROPS: Record<string, Record<string, unknown>> = {
    'pdx-menu': { items: [{ key: 'new', label: 'New' }, { key: 'open', label: 'Open' }] },
    'pdx-json-editor': { schema: { label: 'Pet', fields: [{ k: 'name', label: 'Name' }] } },
};

async function open(page: Page): Promise<void> {
    await openPage(page, '/gotchas.html?case=plain-move');
}

test('the manifest lists the components to move, less the named exclusions', () => {
    expect(ALL_TAGS.length, 'the manifest documents no components').toBeGreaterThan(100);
    for (const tag of [...Object.keys(EXCLUDED), ...Object.keys(PROPS)]) {
        expect(ALL_TAGS, `${tag} is named here but not in the manifest`).toContain(tag);
    }
    expect(TAGS.length).toBe(ALL_TAGS.length - Object.keys(EXCLUDED).length);
});

for (const when of ['before', 'after'] as const) {
    test.describe(`a component moved by app code, ${when} its first frame`, () => {
        for (const tag of TAGS) {
            test(`${tag} has the same DOM as one left in place`, async ({ page }) => {
                await open(page);
                const r = await page.evaluate(([t, w, p]) =>
                    (window as unknown as { __gotcha: { plainMove(t: string, w: string, p: Record<string, unknown>): Promise<Move> } })
                        .__gotcha.plainMove(t, w, p),
                [tag, when, PROPS[tag] ?? {}] as const);
                expect(r.still, `${tag} did not mount in place: the case measures nothing`).toBeGreaterThan(0);
                expect(r.moved, `${tag} holds ${r.moved} elements after the move and ${r.still} in place`).toBe(r.still);
            });
        }
    });
}
