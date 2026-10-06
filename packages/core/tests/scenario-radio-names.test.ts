// No two scenarios on one generated certification page share a radio name.
//
// Every scenario of a tier is a <section> of the same document, so radios with the same `name` in
// two scenarios are one native group, hidden sections included. Three scenarios sharing name="plan"
// leave the last one checked and the other two with nothing checked: their Dimension 5 baselines
// show it, and a radio-group keyboard contract's Tab lands on "Free" instead of the selected "Pro".
//
// It lives in core/tests for the same reason as certification-gate: a check on the repository, and
// core's suite is the one `pnpm test` runs. `generate.ts` refuses the same thing when certify runs.

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { radioNames, sharedRadioNames } from '../../responsive/tests/tooling/radio-names';

const MANIFESTS = join(__dirname, '..', '..', 'responsive', 'tests', 'manifests');

interface ManifestLike {
    name: string;
    tier: string;
    scenarios: { id: string; html: string }[];
}

async function manifestsByTier(): Promise<Map<string, ManifestLike[]>> {
    const byTier = new Map<string, ManifestLike[]>();
    const files = readdirSync(MANIFESTS).filter((f) => f.endsWith('.manifest.ts'));
    for (const f of files) {
        const mod = await import(pathToFileURL(join(MANIFESTS, f)).href);
        const m: ManifestLike = mod.default ?? mod[Object.keys(mod).find((k) => k !== 'default')!];
        const list = byTier.get(m.tier) ?? [];
        list.push(m);
        byTier.set(m.tier, list);
    }
    return byTier;
}

describe('radioNames', () => {
    it('reads the name from a group, a standalone pdx-radio and a native radio input', () => {
        const html = `
            <pdx-radio-group name="a"><pdx-radio value="x"></pdx-radio></pdx-radio-group>
            <pdx-radio name="b" value="y"></pdx-radio>
            <input type="radio" name="c" value="z">`;
        expect(radioNames(html).sort()).toEqual(['a', 'b', 'c']);
    });

    it('ignores names that do not make a radio group', () => {
        // The control: a checker that reported every `name` would pass the test above.
        const html = `<input type="checkbox" name="a"><input name="b"><pdx-checkbox-group name="c"></pdx-checkbox-group>`;
        expect(radioNames(html)).toEqual([]);
    });
});

describe('sharedRadioNames', () => {
    it('reports a name declared by two scenarios of the same page', () => {
        const shared = sharedRadioNames([
            { id: 'one', html: '<pdx-radio-group name="plan"></pdx-radio-group>' },
            { id: 'two', html: '<pdx-radio name="plan" value="pro" checked></pdx-radio>' },
        ]);
        expect(shared).toEqual([{ name: 'plan', scenarios: ['one', 'two'] }]);
    });

    it('does not report a name repeated inside one scenario — that is the group', () => {
        const shared = sharedRadioNames([
            { id: 'one', html: '<pdx-radio name="plan" value="a"></pdx-radio><pdx-radio name="plan" value="b"></pdx-radio>' },
            { id: 'two', html: '<pdx-radio name="other" value="c"></pdx-radio>' },
        ]);
        expect(shared).toEqual([]);
    });
});

describe('the certification manifests', () => {
    // Importing the 102 manifests is real work — Vite transforms each one: 1.2s alone, past the 5s
    // test default under the full parallel run (captured: `Test timed out in 5000ms`). It is paid
    // once, in a budgeted hook, as design-tokens.test.ts does for its scan.
    let byTier: Map<string, ManifestLike[]>;
    beforeAll(async () => {
        byTier = await manifestsByTier();
    }, 30_000);

    it('share no radio name between scenarios of the same tier page', () => {
        expect(byTier.size).toBeGreaterThan(0);
        const collisions: string[] = [];
        for (const [tier, manifests] of byTier) {
            for (const s of sharedRadioNames(manifests.flatMap((m) => m.scenarios))) {
                collisions.push(`tier ${tier}: name="${s.name}" in ${s.scenarios.join(', ')}`);
            }
        }
        expect(collisions).toEqual([]);
    });
});
