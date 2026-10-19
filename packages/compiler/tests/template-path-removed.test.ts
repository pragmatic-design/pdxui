// The template path is gone from new-mode compilation (#238): nothing selects it, not even
// compile()'s internal option, and the code generator does not carry the switch. What remains of the
// template generator is what legacy mode and a scoped slot's body still call (#364).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../src/plugin';
import { builds } from './static-markup-of';

const SRC = '<template><p :title="t">{{ t }}</p></template>\n<script>\nlet t = $signal(\'x\');\n</script>\n';

describe('the template path is removed from new-mode compilation', () => {
    it('no compile option selects it any more', () => {
        // Passed through an untyped object: the option is no longer part of compile()'s type.
        const options: Record<string, unknown> = { production: true, inlineBindings: false };
        const { code } = compile(SRC, 'removed.pdx', [], undefined, options);
        expect(code, 'inlineBindings: false still reached the template path').not.toMatch(/\bhtml`/);
        expect(builds(code, 'p')).toBe(true);
    });

    it('the code generator does not carry the switch', () => {
        const dir = join(__dirname, '..', 'src', 'compiler');
        const naming = readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .filter((f) => readFileSync(join(dir, f), 'utf8').includes('inlineBindings'));
        expect(naming, 'code-generator files that still name inlineBindings').toEqual([]);
    });
});
