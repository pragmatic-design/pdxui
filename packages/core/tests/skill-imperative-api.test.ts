// The area skills publish what a ref reaches.
//
// `wizard.goNext()`, `grid.startEdit(id, field)` and `editor.getJSON()` are in
// `custom-elements.json`, on the site and in `llms.txt`; a catalogue that renders only props, events,
// slots, shapes and roles leaves them out of the skill an agent reads first.
//
// This asserts the catalogue carries it, for a component whose imperative API is the point of using
// it, and that the section is not an empty heading on a component that exposes nothing.

import { describe, it, expect } from 'vitest';
import { AREAS, areaText } from './skill-pages';

/** The area text that documents a tag, from its `### <tag>` heading on (its page). */
function pageFor(tag: string): string {
    for (const area of AREAS) {
        const text = areaText(area);
        if (text.includes(`### \`<${tag}>\``)) return text.slice(text.indexOf(`### \`<${tag}>\``));
    }
    throw new Error(`no area skill documents ${tag}`);
}

/** Just the section of that page, up to the next component. */
const sectionFor = (tag: string): string => {
    const rest = pageFor(tag);
    const next = rest.indexOf('\n### ', 10);
    return next === -1 ? rest : rest.slice(0, next);
};

describe('the area skills publish the imperative API', () => {
    it('a wizard says how to drive it', () => {
        // The whole point of pdx-wizard from JS: you cannot step it with an attribute.
        const section = sectionFor('pdx-wizard');
        expect(section, 'the wizard section names no method at all').toMatch(/goNext/);
        expect(section).toMatch(/goTo/);
    });

    it('a method that takes arguments shows them', () => {
        // A name alone leaves the reader guessing: `startEdit(rowId, field)` edits a cell, and
        // `startEdit(rowId)` the whole row — the difference is the argument. The `?` comes from
        // the declaration too, so which argument may be left out is on the page as well.
        expect(sectionFor('pdx-data-grid')).toMatch(/startEdit\(rowId, field\?\)/);
        // And a shorthand resolves to the function declared in the setup: `goTo` is
        // `function goTo(targetIndex: number)`, so the name alone would have been a dead end.
        expect(sectionFor('pdx-wizard')).toMatch(/goTo\(targetIndex\)/);
    });

    it('the descriptions written for that surface reach the page too', () => {
        // The sentence is what makes a method usable without reading the source.
        expect(sectionFor('pdx-wizard')).toMatch(/does not advance, validate or close/);
    });

    it('an exposed object is published with its shape, not as a call', () => {
        // `el.scrollArea()` throws; `el.scrollArea.scrollTo(…)` is the API.
        const section = sectionFor('pdx-scroll-area');
        expect(section).toMatch(/scrollArea/);
        expect(section).toMatch(/scrollTo/);
    });

    it('a component that exposes nothing gets no empty heading', () => {
        // pdx-badge is a presentational element: no expose, so no section.
        expect(sectionFor('pdx-badge')).not.toMatch(/API \(via ref\)/);
    });
});
