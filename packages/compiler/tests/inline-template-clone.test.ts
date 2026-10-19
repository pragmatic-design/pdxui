// The inline path clones a block's static DOM instead of building it node by node (#109).
//
// Each block — the component's root, an @if branch, an @for row, a @switch case … — builds its static
// DOM ONCE, in a module-level builder called on first use (importing the module stays DOM-free, #93),
// and every render clones it. The dynamic nodes are reached by a walk computed at compile time and
// emitted as a function of its own, from the block's root to its dynamic nodes: the render calls it on
// the clone, and a future adoption of server markup can call it on nodes it did not create. That the
// walk binds the same nodes on markup it did not clone is measured with a DOM, in core's
// `inline-walk.test.ts`; this file reads the module.
//
// The builder is handed to core's `staticBlock` (renderer/dom.ts), which builds the markup in a
// <template>'s content — a document with no custom-element registry — and copies it with
// `document.importNode`, not `cloneNode`: importNode brings the copy into the page with its
// components upgraded. Its own test is core's `static-block.test.ts`.

import { describe, it, expect } from 'vitest';
import { compile } from '../src/plugin';
import { builds } from './static-markup-of';

const ROW = `<template>
  <table><tbody>
    @for (rows as r; track r.id) {
      <tr><td class="col-md-1">{{ r.id }}</td><td class="col-md-4"><a @click="pick(r.id)">{{ r.label }}</a></td><td class="col-md-1"><span class="glyphicon" aria-hidden="true"></span></td></tr>
    }
  </tbody></table>
</template>
<script>
let rows = $signal([]);
function pick(id) {}
</script>
`;

const render = (code: string) => code.slice(code.indexOf('render:'));
const hoisted = (code: string) => code.slice(0, code.indexOf("component('"));

describe('a block clones its static DOM', () => {
    it('a row\'s static markup is built once, outside the render, and cloned in it', () => {
        const { code } = compile(ROW, 'rows.pdx', [], undefined, { production: true });
        // The render creates no static element: every <td>, the <span> and their classes are cloned.
        expect(render(code), 'the render still builds static elements one by one').not.toMatch(/createElement\('(td|span|tr)'\)/);
        expect(render(code)).not.toContain('"col-md-1"');
        expect(render(code)).toMatch(/const __frag=__blk\d+\(\);/);
        // The builder lives at module level, handed to core's staticBlock, and holds the static markup:
        // as HTML, since a row is table content the parser keeps (#435), or as DOM calls.
        expect(hoisted(code)).toMatch(/const __blk\d+=staticBlock\(/);
        expect(builds(hoisted(code), 'td')).toBe(true);
        expect(hoisted(code)).toContain('col-md-1');
    });

    it('a dynamic block is put in place of a marker the static markup holds', () => {
        const { code } = compile(ROW, 'rows.pdx', [], undefined, { production: true });
        // The @for is not appended after the markup is built: it replaces its marker, in place.
        expect(render(code)).toMatch(/__m\d+\.replaceWith\(__cf\d+\);/);
        expect(render(code)).not.toContain('.appendChild(');
    });

    it('importing the module builds no DOM: the builder runs on first use', () => {
        const { code } = compile(ROW, 'rows.pdx', [], undefined, { production: true });
        // Every module-level statement is a declaration; no builder is called outside a function.
        const top = hoisted(code).split('\n').filter((l) => l.trim() && !l.startsWith('import '));
        // staticBlock only wraps the builder; core runs it on the first render, not at import.
        for (const line of top) expect(line, `a module-level statement that is not a declaration: ${line}`).toMatch(/^const __(blk\d+=staticBlock\(|walk\d+=)/);
    });

    it('a block\'s walk is a function of its own, from the root node to its dynamic nodes', () => {
        const { code } = compile(ROW, 'rows.pdx', [], undefined, { production: true });
        expect(hoisted(code)).toMatch(/const __walk\d+=\(r\)=>\{/);
        expect(render(code)).toMatch(/=__walk\d+\(__frag\);/);
    });
});

