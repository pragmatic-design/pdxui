// The component-design rules have a page on the site, and it carries the same rules.
//
// They are written in `docs/PDX-COMPONENT-DESIGN.md` and in the skill for agents. A human developer reads neither: they read the site's docs. The page is found through the docs nav,
// which the site builds from the glob of `content/docs` ordered by the front matter's `order`, so a
// page with a title and an order is in the nav. Whether its imports are real and its links resolve
// is already measured for every docs page by `site-content.test.ts`; what is guarded here is that
// the three copies are the same set of rules.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '../../..');
const PAGE = join(REPO, 'packages/site/content/docs/component-design.md');
const DOC = join(REPO, 'docs/PDX-COMPONENT-DESIGN.md');
const SKILL = join(REPO, 'marketplace/plugins/pdxui/skills/pdxui/references/component-design.md');

const read = (p: string): string => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n');
const ruleIds = (text: string): string[] => [...text.matchAll(/^###\s+(CD-[A-Z]\d+)\b/gm)].map((m) => m[1]).sort();

describe('the site has the component-design rules', () => {
    it('has the page', () => {
        expect(existsSync(PAGE), 'packages/site/content/docs/component-design.md does not exist').toBe(true);
    });

    it('is in the docs nav: a title, a description and an order in its front matter', () => {
        const front = read(PAGE).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
        expect(front, 'no front matter').not.toBe('');
        expect(front).toMatch(/^title:\s*\S/m);
        expect(front).toMatch(/^description:\s*\S/m);
        expect(front).toMatch(/^order:\s*\d/m);
    });

    it('carries every rule of the doc, and the same set as the skill', () => {
        const fromDoc = ruleIds(read(DOC));
        expect(fromDoc.length, 'the doc declares no CD-* rule: the id pattern is wrong').toBeGreaterThanOrEqual(18);
        expect(ruleIds(read(PAGE))).toEqual(fromDoc);
        expect(ruleIds(read(SKILL))).toEqual(fromDoc);
    });

    it('is linked from the pages it sits beside', () => {
        for (const neighbour of ['composables.md', 'provide-inject.md']) {
            expect(read(join(REPO, 'packages/site/content/docs', neighbour)), `${neighbour} does not link the page`)
                .toContain('/docs/component-design');
        }
    });
});
