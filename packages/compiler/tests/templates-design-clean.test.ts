// The reference templates an agent is told to copy pass the design review, with no exemption. A
// template that writes colours as values is right in one theme and teaches an agent to be wrong in
// twelve.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { designHeuristics } from '../src/compiler/design-heuristics';
import { DIAGNOSTICS } from '../src/diagnostics/catalog';

const TEMPLATES = join(__dirname, '../../../templates');
const files = readdirSync(TEMPLATES).filter((f) => f.endsWith('.pdx')).sort();

describe('templates/ pass pdx check --design', () => {
    it('there are templates to check', () => {
        expect(files.length).toBeGreaterThanOrEqual(8);
    });

    for (const file of files) {
        it(file, () => {
            const source = readFileSync(join(TEMPLATES, file), 'utf8');
            expect(source, 'a template is copied: it carries no exemption').not.toMatch(/pdx-ignore/);
            // What `pdx check --design` runs on one file: the heuristics, and compile()'s findings —
            // its design category included (PDX_EFFECT_STATE).
            const findings = [...designHeuristics(source, file), ...compile(source, file).warnings]
                .map((w) => `${w.code}:${w.line ?? '?'} ${DIAGNOSTICS[w.code]?.category ?? 'defect'} — ${w.message}`);
            expect(findings).toEqual([]);
        });
    }
});
