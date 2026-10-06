// The component-design rules reach the agent that writes PDX, and stay the same rules.
//
// The rules are written down in `docs/PDX-COMPONENT-DESIGN.md`. An agent does not
// read `docs/`: it reads the skill. So the rules live in the skill too, and two ways of losing them
// are guarded here:
//   · the skill drops a rule, or the doc gains one the skill never hears of → every CD-* id of the
//     doc must be a heading of the skill's page;
//   · nothing sends the agent there → the three places it reads before splitting a screen (the
//     pdxui workflow, `structure.md`, pdxui-language's "When the file gets long") link to it.
// And the page must not be confidently wrong: every name it imports from `@pdxui/core` is exported.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '../../..');
const SKILLS = join(REPO, 'marketplace/plugins/pdxui/skills');
const PAGE = join(SKILLS, 'pdxui/references/component-design.md');
const DOC = join(REPO, 'docs/PDX-COMPONENT-DESIGN.md');

const read = (p: string): string => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n');

/** The rule ids a file declares as headings: `### CD-B1 — …`. */
function ruleIds(text: string): string[] {
    return [...text.matchAll(/^###\s+(CD-[A-Z]\d+)\b/gm)].map((m) => m[1]);
}

/** The section of a markdown file under a heading, up to the next heading of the same or a higher level. */
function section(text: string, heading: RegExp): string {
    const start = text.search(heading);
    expect(start, `no heading matching ${heading}`).toBeGreaterThan(-1);
    const level = text.slice(start).match(/^#+/)?.[0].length ?? 2;
    const rest = text.slice(start + level);
    const end = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
    return end === -1 ? rest : rest.slice(0, end);
}

describe('the component-design rules are in the skill', () => {
    it('the skill has its component-design page', () => {
        expect(existsSync(PAGE), 'pdxui/references/component-design.md does not exist').toBe(true);
    });

    it('every rule of the doc is a rule of the skill, and the skill has no rule the doc lacks', () => {
        const fromDoc = ruleIds(read(DOC));
        // The control: a regex that matches nothing would make the comparison below pass on two empty lists.
        expect(fromDoc.length, 'the doc declares no CD-* rule: the id pattern is wrong').toBeGreaterThanOrEqual(18);
        const fromSkill = ruleIds(read(PAGE));
        expect(fromSkill.slice().sort()).toEqual(fromDoc.slice().sort());
    });

    it('the places an agent reads before splitting a screen send it there', () => {
        const skill = read(join(SKILLS, 'pdxui/SKILL.md'));
        const step2 = skill.search(/^2\. \*\*Decide what the screen IS\*\*/m);
        expect(step2, 'the pdxui workflow has no step 2').toBeGreaterThan(-1);
        const workflow = skill.slice(step2, skill.indexOf('\n3. ', step2));
        expect(workflow, 'the pdxui workflow does not name component-design.md').toContain('references/component-design.md');

        expect(read(join(SKILLS, 'pdxui/references/structure.md')), 'structure.md does not link the rules')
            .toContain('component-design.md');

        const long = section(read(join(SKILLS, 'pdxui-language/SKILL.md')), /^### When the file gets long/m);
        expect(long, '"When the file gets long" does not link the rules').toContain('component-design.md');
    });

    it('imports only what @pdxui/core exports', () => {
        const exported = read(join(__dirname, '../src/index.ts'));
        const page = read(PAGE);
        const imports = [...page.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@pdxui\/core'/g)]
            .flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
        for (const name of imports) {
            expect(exported, `the page imports ${name}, which @pdxui/core does not export`)
                .toMatch(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`));
        }
    });
});
