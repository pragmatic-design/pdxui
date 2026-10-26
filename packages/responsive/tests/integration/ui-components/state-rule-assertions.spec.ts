// A certification state rule asserts every change it declares (#704). `StateRule.changes` accepted
// `transform`, `pointerEvents` and `borderColor`, and `assertState` read none of the three: a rule
// written with one of them passed whatever the element did. Each is measured here against a plain
// element: the right value passes, a wrong one fails.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';
import { assertState, freezeAnimations } from './contracts/assertions';
import type { StateRule } from './contracts/types';

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => {
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = `
            <style>
                #sr-lift { border: 2px solid rgb(9, 9, 9); }
                #sr-lift:hover { transform: translateY(-3px); border-color: rgb(1, 2, 3); }
                #sr-off { pointer-events: none; }
            </style>
            <button id="sr-lift">Lift</button>
            <button id="sr-off">Off</button>`;
        document.body.appendChild(f);
    });
    await freezeAnimations(page);
}

const hover = (changes: StateRule['changes']): StateRule => ({ description: 'hover', selector: '#sr-lift', trigger: 'hover', changes });
const still = (changes: StateRule['changes']): StateRule => ({ description: 'still', selector: '#sr-off', trigger: 'attribute', changes });

test.beforeEach(async ({ page }) => {
    await openPage(page, '/gotchas.html?case=state-rule-assertions');
    await mount(page);
});

test('transform: the right matrix passes, a wrong one fails', async ({ page }) => {
    await assertState(page, hover({ transform: { op: 'is', value: 'matrix(1, 0, 0, 1, 0, -3)' } }));
    await expect(assertState(page, hover({ transform: { op: 'is', value: 'matrix(9, 9, 9, 9, 9, 9)' } }))).rejects.toThrow(/transform/);
});

test('borderColor: every side is read; the right colour passes, a wrong one fails', async ({ page }) => {
    await assertState(page, hover({ borderColor: { op: 'is', value: 'rgb(1, 2, 3)' } }));
    await expect(assertState(page, hover({ borderColor: { op: 'is', value: 'rgb(4, 5, 6)' } }))).rejects.toThrow(/border/);
});

test('pointerEvents: the right value passes, a wrong one fails', async ({ page }) => {
    await assertState(page, still({ pointerEvents: { op: 'is', value: 'none' } }));
    await expect(assertState(page, still({ pointerEvents: { op: 'is', value: 'auto' } }))).rejects.toThrow(/pointerEvents/);
});
