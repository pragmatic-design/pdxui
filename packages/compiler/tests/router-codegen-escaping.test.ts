// The route table escapes what it writes structurally (JSON.stringify), so a path with a quote or a
// backslash, or a param that is not a valid JS identifier, cannot break the emitted module — and
// arrives in the router exactly as the page declared it.
import { describe, it, expect } from 'vitest';
import { generateRouteTable } from '../src/route-table';

function evaluate(paths: string[]): { path: string }[] {
    const code = generateRouteTable(paths.map((path, i) => ({ path, file: `p${i}.pdx`, tag: `pdx-p${i}` })));
    return new Function(`${code.replace(/^export\s+/gm, '')}\nreturn routes;`)() as { path: string }[];
}

describe('generateRouteTable — escaping', () => {
    it('produces a valid module for a segment with a quote and a non-identifier param', () => {
        expect(evaluate(["/it's/:a-b"]).map(r => r.path)).toEqual(["/it's/:a-b"]);
    });

    it('escapes a backslash', () => {
        expect(evaluate(['/a\\b/:id']).map(r => r.path)).toEqual(['/a\\b/:id']);
    });

    it('keeps a closing script tag and a line separator inert', () => {
        // The two characters that end a JS string or an inline script where JSON alone does not.
        expect(evaluate(['/x</script>', '/y z']).map(r => r.path)).toEqual(['/x</script>', '/y z']);
    });
});
