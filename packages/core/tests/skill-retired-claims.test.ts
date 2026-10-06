// A claim the framework has outgrown must not survive somewhere else in the skill.
//
// A claim retired on one page can stand on another, one page away: "never `:class` on a
// data-region", "el.__dataGrid.getSelectedIds()", "a signal set from a custom event does not update
// the template". Then the skill contradicts itself, and the half an agent reads first decides what
// it writes.
//
// So the retirements are asserted across the WHOLE plugin, not per page. Each entry is a string that
// must not appear, with what is true instead — the message is the fix, so whoever trips this does not
// have to go looking for the measurement.
//
// The exception is deliberate: `gotchas.md` keeps a closing "Retired" section that quotes the old
// claims on purpose, because the golden and profiler apps still contain those workarounds and both
// are pointed at as reference apps. Everything before that heading is live text and is checked.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS = join(__dirname, '..', '..', '..', 'marketplace', 'plugins', 'pdxui', 'skills');

/** Every markdown page of the plugin, with the retired-claims appendix of gotchas.md cut off. */
function pages(): { file: string; text: string }[] {
    const out: { file: string; text: string }[] = [];
    const walk = (dir: string): void => {
        for (const name of readdirSync(dir)) {
            const full = join(dir, name);
            if (statSync(full).isDirectory()) { walk(full); continue; }
            if (!name.endsWith('.md')) continue;
            let text = readFileSync(full, 'utf8');
            const retired = text.indexOf('## Retired');
            if (retired >= 0) text = text.slice(0, retired);
            out.push({ file: full.slice(SKILLS.length + 1).replace(/\\/g, '/'), text });
        }
    };
    walk(SKILLS);
    return out;
}

/** Each measured. Left column: what must not be claimed. Right: what is true. */
const RETIRED: [string, string][] = [
    // The USE, not the word: a page that says "there is no __dataGrid" is telling the truth, and a
    // guard that cannot tell the two apart gets deleted the first time it cries wolf.
    ['el.__dataGrid.',
        'there is no __dataGrid — ctx.expose() publishes flat on the host: el.getSelectedIds(), el.clearSelection()'],
    ['Never `:class` on a `data-region`',
        ':class merges with the class the layout adds; the class and the grid-area both survive'],
    ['does not update the template',
        'a signal set inside a custom-event handler DOES update the template, {{ }} and @if alike'],
    ['does NOT reflect the choice onto `.value`',
        'pdx-select reflects the selection onto el.value (reflectValue)'],
    ['does NOT render the rows',
        'a static createDataSource({data}) renders; resolveSource() builds a source from it'],
    ['does NOT open when you set `.open',
        'el.open = true opens the drawer, at the position asked for'],
    ["panel.style.transform = 'none'",
        'the open panel already rests at transform: none; clearing it by hand is not needed'],
    ['means RESTARTING the dev server',
        'the dev server picks up a new .pdx by itself, and announces it'],
    // ⚠️ The five below are the SAME retired claims in the wording a summary of them takes. The
    // guard matches literal sentences, so a paraphrase two files away would sail through — and the
    // summary would go on teaching the workarounds after the page retired them. A check on exact
    // strings only guards the exact string.
    ["custom-event signal sets don't re-render",
        'a signal set inside a custom-event handler DOES update the template'],
    ["doesn't open via `.open`",
        'el.open = true opens the drawer, at the position asked for'],
    ['must be reparented to `<body>`',
        'the drawer portals itself, and only when an ancestor actually traps fixed positioning'],
    ['value only on `pdx-change`/`__val`',
        'pdx-select reflects the selection onto el.value'],
    ["doesn't render** → use a `transport`",
        'a static createDataSource({data}) renders; a transport is for a real backend'],
];

describe('the skill does not keep a claim the framework has outgrown', () => {
    const all = pages();

    it('finds the skill pages', () => {
        // A wrong path would make every assertion below pass over an empty list.
        expect(all.length, 'no markdown found under the plugin').toBeGreaterThan(8);
        expect(all.some(p => p.file.endsWith('recipes.md')), 'recipes.md is missing').toBe(true);
        expect(all.some(p => p.file.endsWith('gotchas.md')), 'gotchas.md is missing').toBe(true);
    });

    it('cuts the retired appendix out of gotchas.md and keeps the live text', () => {
        // If this slicing were wrong the check would silently examine nothing of that page.
        const g = all.find(p => p.file.endsWith('gotchas.md'))!;
        expect(g.text, 'the live half of gotchas.md was cut away').toContain('## Template reactivity');
        expect(g.text, 'the retired appendix leaked into the checked text').not.toContain('## Retired');
    });

    for (const [claim, truth] of RETIRED) {
        it(`does not claim: ${claim}`, () => {
            const guilty = all.filter(p => p.text.includes(claim)).map(p => p.file);
            expect(guilty, `measured false on 2026-09-08 — ${truth}`).toEqual([]);
        });
    }
});
