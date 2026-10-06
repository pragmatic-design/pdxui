// The skill does not tell an app to import the whole component library.
//
// A project example reading `import '@pdxui/ui'; // registers the pdx-* components you use` is
// wrong: the barrel registers ALL of them, and an app following that line ships one chunk of
// 908 KiB. Importing every component by hand, or accepting Vite's warning, is not the framework's
// answer either: the compiler already imports every pdx-* tag it finds in a .pdx template, one
// `@pdxui/ui/<name>` each (compiler/tests/ui-auto-import).
//
// Measured on such an app with the barrel removed: 908 → 504 KiB of JavaScript, the same 36
// components defined on its four routes, the same 432 strings on screen. A confident, false comment
// keeps an app from looking for the right path; this keeps it from coming back.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL = join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui-language/SKILL.md');
const skill = readFileSync(SKILL, 'utf-8').replace(/\r\n/g, '\n');

/** The "Putting a project together" section: where the app's own main.js is shown. */
const project = skill.slice(skill.indexOf('## Putting a project together'), skill.indexOf('## Things that will cost you an hour'));

describe('the skill on registering components', () => {
    it('found the section it is about', () => {
        expect(project.length, 'section not found — every assertion below would be vacuous').toBeGreaterThan(200);
        expect(project).toContain('// src/main.js');
    });

    it('no longer says the barrel registers "the components you use"', () => {
        expect(skill).not.toContain('registers the pdx-* components you use');
    });

    it('the example main.js does not import the whole library', () => {
        expect(project, 'the project example still imports the barrel').not.toMatch(/^import '@pdxui\/ui';/m);
    });

    it('says what the app imports by hand: nothing for template tags, one subpath for an imperative component', () => {
        expect(project).toMatch(/compiler imports/i);
        expect(project, 'the imperative case is not named').toContain("from '@pdxui/ui/toast'");
    });
});
