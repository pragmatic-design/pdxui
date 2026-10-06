// The composition skill exists, is reachable, and every rule in it is checkable.
//
// An app can pass its acceptance and still not read as a product: a history of thousands of records
// as cards, a header with one control, a menu entry that 404s, a vehicle card hand-written while
// pdx-card sits unused. None of it is a component misused — `pdxui` answers "which component",
// `pdxui-theme` answers "which colour", and this skill answers "what is this screen".
//
// Reachability is the first thing asserted: a page nothing points at is a page nobody opens.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS = join(__dirname, '../../../marketplace/plugins/pdxui/skills');
const SCREENS = join(SKILLS, 'pdxui-screens/SKILL.md');
const ROOT = join(SKILLS, 'pdxui/SKILL.md');

describe('pdxui-screens', () => {
    it('is a skill, not a reference page buried under another skill', () => {
        expect(existsSync(SCREENS), 'pdxui-screens/SKILL.md is missing').toBe(true);
    });

    it('says in its own frontmatter when to open it', () => {
        const head = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n').split('---')[1] ?? '';
        expect(head).toMatch(/^name:\s*pdxui-screens/m);
        expect(head).toMatch(/^description:/m);
        // In the description, not `when_to_use`: that field reaches Claude Code only.
        expect(head.match(/^description:.*$/m)?.[0], 'the description says when to open it').toMatch(/\bUse when\b/);
    });

    it('is named by the root skill, in the flow and in the description', () => {
        const root = readFileSync(ROOT, 'utf-8').replace(/\r\n/g, '\n');
        const frontmatter = root.split('---')[1] ?? '';
        expect(frontmatter, 'an agent picks what to open from the description').toContain('pdxui-screens');
        const body = root.slice(root.indexOf('## How to work'));
        expect(body, 'and it has to appear in the steps, before markup').toContain('pdxui-screens');
    });

    it('covers the six defects the lab runs produced', () => {
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        for (const topic of [
            'pdx-data-grid',   // a large collection is a grid, not cards
            'pdx-card',        // what you never build by hand
            'pdx-page-header',
            'pdx-empty-state',
            'role="row"',      // the check for the grid rule
            'pdx-primary',     // one primary action
        ]) {
            expect(text, `${topic} is not covered`).toContain(topic);
        }
    });

    it('covers the two rules lab round 5 needed', () => {
        // Five blocks of one form behind a pdx-segmented (a radiogroup), and an operator switcher whose
        // only effect on the list was its own label — "changing user does nothing".
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        expect(text, 'parts of one object are tabs with a container').toContain('variant="card"');
        expect(text, 'the check names the role that gives it away').toContain('role="radiogroup"');
        expect(text, 'a control whose change shows nothing').toMatch(/outside the control/i);
    });

    it('covers the frame of a route, which lab round 6 got wrong twice', () => {
        // The app capped every route at max-width 1400px, left-aligned — 288px of the main area empty
        // at 1920px beside the lists and the agenda. And its user switcher sat before the header's
        // utility icons, naming nobody.
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        const sections = text.split(/^(?=## )/m);
        const width = sections.find(s => /^## \d+\. The route body fills the main area/.test(s));
        const identity = sections.find(s => /^## \d+\. The signed-in user is the last thing in the header/.test(s));
        expect(width, 'no rule on the width of a route body').toBeDefined();
        expect(identity, 'no rule on where the signed-in user goes').toBeDefined();
        expect(width, 'a reading column is capped inside the route, by the layout primitive').toContain('pdx-container max=');
        expect(width, 'the check measures the main area at the width the defect showed').toMatch(/1920/);
        expect(identity, 'the check asks for the user by name in the accessible name').toMatch(/accessible name/i);
    });

    it('requires the unsaved-work guard on create screens too', () => {
        // An app that guards its editor by hand leaves every creation form without one; the
        // declaration is the documented way, for creating and editing.
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        const rule = text.split(/^(?=## )/m).find(s => /^## \d+\. Every screen that creates or edits a record guards unsaved work/.test(s));
        expect(rule, 'no rule on guarding unsaved work').toBeDefined();
        expect(rule, 'the rule names the declaration').toContain('warnUnsaved');
        expect(rule, 'the check clicks a sidebar link with a field typed into').toMatch(/sidebar link/);
    });

    it('gives every rule a check, because a rule without one is an opinion', () => {
        // ⚠️ Not `>= rules - 1`, which does NOT go red when a check is removed: 7 rules and 6
        // checks satisfy it. Not the two totals compared either: rule 6 has two checks, so an eighth
        // rule added without one still makes 8 and 8 (measured). A total can be paid by a neighbour.
        // Each rule's own section has to carry its check.
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        const sections = text.split(/^(?=## )/m).filter(s => /^## \d+\./.test(s));
        expect(sections.length, 'the page has numbered rules').toBeGreaterThanOrEqual(6);
        const unchecked = sections
            .filter(s => !/^> \*\*Check:\*\*/m.test(s))
            .map(s => s.split('\n')[0]);
        expect(unchecked, 'rules without a check').toEqual([]);
    });

    it('hands the commission a list it can paste into an acceptance, one item per rule', () => {
        const text = readFileSync(SCREENS, 'utf-8').replace(/\r\n/g, '\n');
        expect(text).toMatch(/acceptance list this produces/i);
        const rules = (text.match(/^## \d+\./gm) ?? []).length;
        const list = text.slice(text.search(/^## The acceptance list this produces/m)).split(/^---$/m)[0];
        const items = (list.match(/^\d+\. /gm) ?? []).length;
        expect(items, `${rules} rules but ${items} acceptance items`).toBeGreaterThanOrEqual(rules);
    });
});
