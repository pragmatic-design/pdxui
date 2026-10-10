// The i18n recipe names APIs that exist, and names the ones an app needs.
//
// `@pdxui/core` ships a full i18n system — `$t` with ICU plurals, `initI18n` with detection and
// persistence, a lazy loader, `Intl` formatters, RTL — plus three CLI commands. A recipe that names
// only the component registry documents half the system, and the wrong half for an app: an app that
// cannot find `initI18n` hard-codes its own strings into the markup.
//
// Two failure modes to guard, and they pull in opposite directions:
//   · the recipe stops naming the app-facing half → an app cannot find it;
//   · the recipe names something that does not exist → worse, because it is confidently wrong, as
//     `setLocaleStrings('it', {…})` is: a signature that does not exist.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RECIPES = join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md');
const CORE_INDEX = join(__dirname, '../src/index.ts');
const CLI_I18N = join(__dirname, '../../cli/src/commands/i18n.ts');

const recipe = readFileSync(RECIPES, 'utf-8').replace(/\r\n/g, '\n');
const exported = readFileSync(CORE_INDEX, 'utf-8');

describe('the i18n recipe covers what an app actually needs', () => {
    it('names the app-facing half, not only the component registry', () => {
        for (const api of ['$t(', 'initI18n', 'setLocale', 'createI18nLoader']) {
            expect(recipe, `the recipe never mentions ${api}`).toContain(api);
        }
    });

    it('keeps the component registry too, since the two are not alternatives', () => {
        expect(recipe).toContain('setLocaleStrings');
        expect(recipe, 'the distinction is the point').toMatch(/two layers|not alternatives/i);
    });

    it('names the tooling, which is the part usually missing elsewhere', () => {
        for (const cmd of ['pdx i18n extract', 'pdx i18n types', 'pdx i18n validate']) {
            expect(recipe, `${cmd} is not in the recipe`).toContain(cmd);
        }
    });

    it('keeps the correction about the signature that never existed', () => {
        expect(recipe).toMatch(/One argument, not two/);
    });
});

describe('every API the recipe names is exported', () => {
    // A recipe that names a function nobody can import is worse than one that names none.
    const NAMED = ['$t', '$n', '$d', '$r', 'initI18n', 'setLocale', 'loadTranslations',
        'createI18nLoader', 'setLocaleStrings', 'direction', 'isRTL', 'inlineStart', 'flipPlacement'];

    for (const api of NAMED) {
        it(`core exports ${api}`, () => {
            // ⚠️ No leading `\b` for the `$…` names: `$` is not a word character, so between a space
            // and a `$` there is no boundary and `\b\$t\b` never matches. The first version of this
            // test failed on all four dollar-prefixed exports, which are exported on line 395.
            const name = api.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = api.startsWith('$') ? `${name}\\b` : `\\b${name}\\b`;
            expect(exported, `${api} is in the recipe and not exported from core`)
                .toMatch(new RegExp(pattern));
        });
    }

    it('the three CLI subcommands exist', () => {
        const cli = readFileSync(CLI_I18N, 'utf-8');
        for (const name of ['extract', 'types', 'validate']) {
            expect(cli, `pdx i18n ${name} is documented and not implemented`)
                .toMatch(new RegExp(`name: '${name}'`));
        }
    });
});
