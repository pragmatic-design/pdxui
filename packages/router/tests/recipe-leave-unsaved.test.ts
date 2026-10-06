// "Do not leave with unsaved work": the recipe exists, and what it teaches works on the real router.
//
// Without a recipe, an app that needs a navigation hook finds `onBeforeNavigate` only by reading
// `router/dist/index.d.ts`. A refusal leaves the address bar where it was, so the recipe teaches the
// hook as designed rather than a replaceState workaround.
//
// Two halves. The page must name the pieces: onBeforeNavigate, a pdx-alert-dialog that answers the
// promise, beforeunload for closing the tab, and that the hook is asked for Back too. And the pattern
// it shows, the hook answering from the unsaved state through a dialog, has to hold on the router: a
// refused link and a refused Back both stay put, and saving lets the same navigation through.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouter, destroyRouter, navigate, currentPath, onBeforeNavigate } from '../src/runtime';

const RECIPES = readFileSync(
    join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md'),
    'utf-8',
).replace(/\r\n/g, '\n');

function recipe(): string {
    const start = RECIPES.search(/^## Do not leave with unsaved work/m);
    expect(start, 'recipes.md has no "Do not leave with unsaved work" recipe').toBeGreaterThan(-1);
    const rest = RECIPES.slice(start + 3);
    const end = rest.search(/^## /m);
    return end === -1 ? rest : rest.slice(0, end);
}

describe('the recipe', () => {
    it('leads with the declaration, warnUnsaved, and keeps the hook for guards that are not about a form', () => {
        // A hand-written onBeforeNavigate ends up on the one form its author thinks of — the
        // editor — and not on the creation forms. The declaration is the documented way, for
        // creating and editing.
        const text = recipe();
        const firstExample = text.match(/^```html\n([\s\S]*?)^```/m)?.[1] ?? '';
        expect(firstExample, 'the first example is the declaration').toContain('warnUnsaved: true');
        expect(firstExample, 'not the hand-written hook').not.toContain('onBeforeNavigate');
        expect(text, 'the @form spelling').toContain('{ warnUnsaved }');
        expect(text, 'saving from @pdx-submit says so').toContain('form.reset(saved)');
        expect(text, 'the dialog\'s strings are the app\'s').toContain('form.unsavedTitle');
        expect(text.includes('onBeforeNavigate'), 'onBeforeNavigate, for a guard that is not a form').toBe(true);
        expect(text.includes('beforeunload'), 'beforeunload, for the tab being closed').toBe(true);
    });

    it('pdxui-language names warnUnsaved among the @form options', () => {
        const pdx = readFileSync(
            join(__dirname, '../../../marketplace/plugins/pdxui/skills/pdxui-language/SKILL.md'),
            'utf-8',
        ).replace(/\r\n/g, '\n');
        expect(pdx).toMatch(/@form[^\n]*\{ warnUnsaved \}/);
    });

    it('says the hook is asked for Back too, so it answers from the unsaved state', () => {
        expect(/\bBack\b/.test(recipe()), 'no word about Back').toBe(true);
    });

    it('says what the address bar shows while the dialog is open, as runtime-navigation-api-refusal measures', () => {
        // A link keeps the address until the answer; Back has already moved it and a refusal puts it
        // back. "Answers before the address changes" is true of a link and navigate(), not of Back.
        const text = recipe().replace(/\s+/g, ' ');
        expect(text, 'the link half').toMatch(/link waits for the answer with the address unchanged/);
        expect(text, 'the Back half').toMatch(/Back and Forward have already moved it[^.]*"Stay" puts it back/);
    });
});

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 20));

/** The browser's Back, as happy-dom can do it: the URL moves, then popstate is answered. */
function back(path: string): void {
    history.replaceState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
}

describe('the pattern it teaches, on the router', () => {
    // The recipe's page, reduced to what the router sees: a dirty flag, and a dialog that answers.
    let dirty = false;
    let userSays: 'leave' | 'stay' = 'stay';
    let asked = 0;
    const dialog = Object.assign(new EventTarget(), {
        show(): void {
            asked++;
            queueMicrotask(() => dialog.dispatchEvent(new Event(userSays === 'leave' ? 'pdx-confirm' : 'pdx-cancel')));
        },
    });
    function askToLeave(): Promise<boolean> {
        return new Promise(resolve => {
            const answer = (value: boolean): void => {
                dialog.removeEventListener('pdx-confirm', leave);
                dialog.removeEventListener('pdx-cancel', stay);
                resolve(value);
            };
            const leave = (): void => answer(true);
            const stay = (): void => answer(false);
            dialog.addEventListener('pdx-confirm', leave);
            dialog.addEventListener('pdx-cancel', stay);
            dialog.show();
        });
    }
    let stopAsking: () => void = () => {};

    beforeEach(async () => {
        history.replaceState(null, '', '/list');
        createRouter([
            { path: '/list', component: () => document.createElement('div') },
            { path: '/edit', component: () => document.createElement('div') },
        ]);
        navigate('/edit');
        await settle();
        dirty = false; userSays = 'stay'; asked = 0;
        stopAsking = onBeforeNavigate(() => (dirty ? askToLeave() : true));
    });
    afterEach(() => { stopAsking(); destroyRouter(); });

    it('a link with unsaved work asks, and "Stay" keeps the screen and the address', async () => {
        dirty = true;
        navigate('/list');
        await settle();
        expect(asked).toBe(1);
        expect(currentPath()).toBe('/edit');
        expect(location.pathname, 'the address bar did not move').toBe('/edit');
    });

    it('Back with unsaved work asks too, and "Stay" puts the address back', async () => {
        dirty = true;
        back('/list');
        await settle();
        expect(asked, 'Back was not asked about').toBe(1);
        expect(currentPath()).toBe('/edit');
        expect(location.pathname, 'the refused Back left the address on /list').toBe('/edit');
    });

    it('"Leave" lets it through', async () => {
        dirty = true;
        userSays = 'leave';
        navigate('/list');
        await settle();
        expect(currentPath()).toBe('/list');
    });

    it('control — with nothing unsaved it does not ask at all', async () => {
        navigate('/list');
        await settle();
        expect(asked, 'the dialog opened with nothing to lose').toBe(0);
        expect(currentPath()).toBe('/list');
    });
});
