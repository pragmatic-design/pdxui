// A component adds its own classes to its host; it never replaces the host's className. Assigning
// `el.className = …` on the host wipes every class the author put on the element, and a selector or
// style hung on it silently stops matching. A component uses classList on its own classes.

import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/checkbox/pdx-checkbox';
import '../../src/checkbox-group/pdx-checkbox-group';
import '../../src/radio-group/pdx-radio-group';
import '../../src/input-group/pdx-input-group';
import '../../src/button-group/pdx-button-group';
import '../../src/statistic/pdx-statistic';

async function frames(n = 3): Promise<void> {
    for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(r));
}

/** [tag, its own class once mounted, an attribute change that re-runs its class logic] */
const CASES: Array<[string, string, [string, string]]> = [
    ['pdx-checkbox-group', 'pdx-choice-group', ['orientation', 'horizontal']],
    ['pdx-radio-group', 'pdx-choice-group', ['orientation', 'horizontal']],
    ['pdx-input-group', 'pdx-input-group', ['size', 'sm']],
    ['pdx-button-group', 'pdx-btn-group', ['size', 'sm']],
    ['pdx-statistic', 'pdx-statistic-root', ['size', 'lg']],
];

beforeEach(() => { document.body.innerHTML = ''; });

describe('components keep the classes the author put on their host', () => {
    for (const [tag, own, [attr, value]] of CASES) {
        it(`${tag}`, async () => {
            const el = document.createElement(tag);
            el.className = 'author-x';
            document.body.appendChild(el);
            await frames();
            expect(el.classList.contains(own), `${tag} did not add ${own}`).toBe(true);
            expect(el.classList.contains('author-x'), `${tag} wiped the author's class on mount`).toBe(true);
            el.setAttribute(attr, value);
            await frames();
            expect(el.classList.contains('author-x'), `${tag} wiped the author's class on ${attr} change`).toBe(true);
        });
    }
});
