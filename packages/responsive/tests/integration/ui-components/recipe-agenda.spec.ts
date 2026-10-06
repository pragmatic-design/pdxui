// The day-agenda recipe keeps a 15-minute appointment readable, measured in a real layout.
//
// A 15-minute block 32px tall with three stacked lines under `overflow: hidden` cuts the patient's
// name, and a check on innerText still passes while nobody can read it. The recipe's claim — a short block
// shows one line and that line fits — is a claim about layout, and happy-dom has no layout: its
// scrollHeight and clientHeight are both 0, and 0 <= 0 passes for any CSS. So it is measured here.
//
// The recipe's CSS is read out of recipes.md and injected as it is written; the markup is the shape its
// template renders, with the same class names, and the first test holds the template to that shape.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES = readFileSync(
    join(HERE, '../../../../../marketplace/plugins/pdxui/skills/pdxui/references/recipes.md'),
    'utf-8',
).replace(/\r\n/g, '\n');

function agendaRecipe(): string {
    const start = RECIPES.search(/^## Day agenda per resource/m);
    if (start === -1) throw new Error('recipes.md has no "Day agenda per resource" recipe');
    const rest = RECIPES.slice(start + 3);
    const end = rest.search(/^## /m);
    return end === -1 ? rest : rest.slice(0, end);
}

const recipeCss = (): string => {
    const css = agendaRecipe().match(/<style scoped>\n([\s\S]*?)<\/style>/)?.[1];
    if (!css) throw new Error('the agenda recipe has no <style scoped> block');
    return css;
};

/**
 * `overflowsSlot`: how far the block's bottom passes the bottom of the grid cell its duration gives it.
 * A block whose height is not fixed does not clip when the slot is too short: it grows past the slot
 * and covers the next appointment, and its own scrollHeight still equals its clientHeight. Both are
 * the same defect — the text needs more room than the time allows — so both are measured.
 */
interface Measure {
    height: number; scrollHeight: number; clientHeight: number; label: string | null; lines: number; overflowsSlot: number;
    /**
     * The text's own box. Measured, the clip moves there when the slot is too short: the block keeps
     * its height and the line — a flex item with `overflow: hidden`, so allowed to shrink — is 4px
     * tall and cuts its own text, while the block's scrollHeight still equals its clientHeight.
     */
    lineHeight: number; lineScrollHeight: number; lineClientHeight: number; lineCssHeight: number;
}

/** Build the agenda the recipe's template renders: two resources, a 15-minute and a 60-minute visit. */
async function renderAgenda(page: Page, css: string): Promise<{ short: Measure; long: Measure }> {
    await openPage(page, '/gotchas.html');
    await page.addStyleTag({ content: css });
    return page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML = `
          <div class="agenda" style="--agenda-cols: 2">
            <div class="agenda-corner"></div>
            <div class="agenda-res" style="grid-column: 2">Dr. Rossi</div>
            <div class="agenda-res" style="grid-column: 3">Dr. Bianchi</div>
            <div class="agenda-time" style="grid-row: 2 / span 12">08:00</div>
            <div class="agenda-cell" style="grid-column: 2; grid-row: 2 / span 3">
              <button type="button" class="agenda-appt agenda-short" data-test="short"
                aria-label="08:00, 15 min: Fido (dog), booster vaccine">
                <span class="agenda-line">08:00 · Fido</span>
              </button>
            </div>
            <div class="agenda-cell" style="grid-column: 3; grid-row: 5 / span 12">
              <button type="button" class="agenda-appt" data-test="long"
                aria-label="08:15, 60 min: Birba (cat), post-op check">
                <span class="agenda-line">08:15 · Birba</span>
                <span class="agenda-line agenda-more">cat — post-op check</span>
              </button>
            </div>
          </div>`;
        document.body.appendChild(host);
        const read = (sel: string) => {
            const el = document.querySelector<HTMLElement>(sel)!;
            const line = el.querySelector<HTMLElement>('.agenda-line')!;
            const cell = el.closest<HTMLElement>('.agenda-cell')!;
            return {
                overflowsSlot: el.getBoundingClientRect().bottom - cell.getBoundingClientRect().bottom,
                height: el.getBoundingClientRect().height,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                lineHeight: line.getBoundingClientRect().height,
                lineScrollHeight: line.scrollHeight,
                lineClientHeight: line.clientHeight,
                lineCssHeight: parseFloat(getComputedStyle(line).lineHeight),
                label: el.getAttribute('aria-label'),
                lines: el.querySelectorAll('.agenda-line').length,
            };
        };
        return { short: read('[data-test="short"]'), long: read('[data-test="long"]') };
    });
}

test.describe('recipe: day agenda per resource', () => {
    test('the template renders the shape measured here', () => {
        const text = agendaRecipe();
        for (const cls of ['agenda-cell', 'agenda-appt', 'agenda-line', 'agenda-more']) {
            expect(text, `the template has no .${cls}`).toContain(cls);
        }
        expect(text, 'under 30 minutes the second line is not rendered').toContain('@if (a.minutes >= 30)');
        expect(text, 'the block carries the whole appointment in its accessible name').toContain(':aria-label="label(a)"');
        expect(text, 'placed by its start and duration').toMatch(/:style\.grid-row="row\(a\.start\) \+ ' \/ span ' \+ a\.minutes \/ 5"/);
    });

    test('a 15-minute appointment shows one line, and it fits', async ({ page }) => {
        const { short } = await renderAgenda(page, recipeCss());
        expect(short.lines, 'a short block stacks more than one line').toBe(1);
        expect(short.lineCssHeight, 'no line-height to compare with').toBeGreaterThan(0);
        expect(short.lineHeight, 'the line is shorter than one line of its text').toBeGreaterThanOrEqual(short.lineCssHeight - 0.5);
        expect(short.lineScrollHeight, 'the text is clipped inside its own line').toBeLessThanOrEqual(short.lineClientHeight);
        expect(short.scrollHeight, 'the content is clipped inside the block').toBeLessThanOrEqual(short.clientHeight);
        expect(short.overflowsSlot, 'the block grows past its 15 minutes and covers the next slot').toBeLessThanOrEqual(0.5);
        expect(short.label, 'the patient is not in the accessible name').toContain('Fido');
    });

    test('a 60-minute appointment shows both lines, and they fit', async ({ page }) => {
        const { long } = await renderAgenda(page, recipeCss());
        expect(long.lines).toBe(2);
        expect(long.lineHeight).toBeGreaterThanOrEqual(long.lineCssHeight - 0.5);
        expect(long.scrollHeight).toBeLessThanOrEqual(long.clientHeight);
        expect(long.overflowsSlot).toBeLessThanOrEqual(0.5);
    });

    test('control — the round-6 block, three lines in 32px under overflow:hidden, fails the same measure', async ({ page }) => {
        // Without this the fit assertion above could pass for any CSS, as it does in happy-dom.
        const round6 = `.agenda { display: grid; grid-template-columns: 4rem repeat(2, 10rem); grid-auto-rows: 32px; }
            .agenda-appt { height: 32px; overflow: hidden; display: flex; flex-direction: column; font: inherit; padding: 4px; }`;
        await openPage(page, '/gotchas.html');
        await page.addStyleTag({ content: round6 });
        const m = await page.evaluate(() => {
            const b = document.createElement('button');
            b.className = 'agenda-appt';
            b.innerHTML = '<span>08:00 Fido</span><span>dog</span><span>booster vaccine</span>';
            document.body.appendChild(b);
            return { scrollHeight: b.scrollHeight, clientHeight: b.clientHeight };
        });
        expect(m.scrollHeight, 'the round-6 block measured as fitting').toBeGreaterThan(m.clientHeight);
    });
});
