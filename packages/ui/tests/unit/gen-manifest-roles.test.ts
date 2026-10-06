// The roles in custom-elements.json are the roles a component RENDERS: the skill catalog states them
// as what a test or a measuring script can target. A scanner that reads every quoted `role="x"` in
// the source publishes as rendered a `[role="heading"]` a component only looks for, and a role quoted
// in a comment: pdx-popover would "render" a heading, pdx-label and pdx-form-field a combobox,
// radiogroup and group.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { analyzeFile } from '../../scripts/gen-manifest.mjs';

const SOURCE = [
    "component('pdx-widget', {",
    '    setup(ctx) {',
    '        // A comment that quotes role="button" is not a rendered role.',
    '        /** Nor is role="note", in a JSDoc block. */',
    "        const heading = ctx.el.querySelector('h2, [role=\"heading\"]');",
    "        const trigger = ctx.el.closest(\"[role='combobox']\");",
    "        ctx.el.setAttribute('role', 'region');",
    '        return { heading, trigger };',
    '    },',
    // A URL in the template: `//` there is text, not a comment, and the role after it is rendered.
    '    render: () => html`<div role="dialog"><a href="https://example.com/a">x</a><span role="status"></span></div>`,',
    '});',
].join('\n');

const rolesOf = (source: string) => analyzeFile('src/widget/pdx-widget.ts', source, {})[0].declarations[0].roles ?? [];

describe('gen-manifest scanRoles reads rendered roles only', () => {
    it('a queried [role="x"] and a role in a comment are not rendered roles', () => {
        expect(rolesOf(SOURCE)).toEqual(['dialog', 'region', 'status']);
    });

    it('a role set from an expression is read by its values, not by the operands it compares', () => {
        const source = [
            "component('pdx-widget', {",
            '    setup(ctx) {',
            "        ctx.el.setAttribute('role', ctx.mode() === 'single' ? 'radiogroup' : 'group');",
            "        const item = ctx.el.querySelector(`[role=\"${'menuitem'}\"]`);",
            '        return { item };',
            '    },',
            "    render: (ctx) => html`<span :role=\"${() => (ctx.kind() || 'both') === 'none' ? null : 'spinbutton'}\"></span>`,",
            '});',
        ].join('\n');
        expect(rolesOf(source)).toEqual(['group', 'radiogroup', 'spinbutton']);
    });

    it('the committed manifest publishes none of the roles pdx-popover, pdx-label and pdx-form-field only query', () => {
        const manifest = JSON.parse(readFileSync(join(__dirname, '../../custom-elements.json'), 'utf-8'));
        const roles = (tag: string) => manifest.modules.flatMap((m: { declarations: { tagName?: string; roles?: string[] }[] }) =>
            m.declarations.filter(d => d.tagName === tag).flatMap(d => d.roles ?? []));
        expect(roles('pdx-popover')).not.toContain('heading');
        for (const tag of ['pdx-label', 'pdx-form-field']) {
            expect(roles(tag), tag).not.toContain('combobox');
            expect(roles(tag), tag).not.toContain('radiogroup');
        }
        expect(roles('pdx-toolbar')).toEqual(['toolbar']);
    });
});
