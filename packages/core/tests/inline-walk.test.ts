// A block's walk binds the same nodes on markup it did not clone (#109).
//
// The inline render path builds a block's static markup once and clones it, and reaches the nodes the
// render binds through a walk the compiler emits as a function of its own. Handed a copy of the markup
// built by hand — what an adoption of server-rendered markup would hand it — the walk must return the
// same nodes, or adopting markup would bind the wrong ones.

import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler/src/plugin';

const SRC = `<template><section class="a"><h2>Title</h2><p>{{ msg }} <b>!</b></p><button @click="n++">+</button></section></template>
<script>
let msg = $signal('hi');
let n = $signal(0);
</script>
`;

describe('the walk binds the same nodes on markup it did not clone', () => {
    it('handed a hand-built copy of the block, it returns the same dynamic nodes', () => {
        const { code } = compile(SRC, 'walk.pdx', [], undefined, { production: true });
        // Match: the block's walk, a module-level arrow ending in the array it returns. Groups: [1]=it
        const walkSrc = /const __walk\d+=(\(r\)=>\{[\s\S]*?return \[[^\]]*\];\});/.exec(code);
        expect(walkSrc, `no walk function in:\n${code}`).not.toBeNull();
        const walk = new Function(`return ${walkSrc![1]}`)() as (r: Node) => Node[];

        // The same markup, built by hand — not a copy of the module's template.
        const f = document.createDocumentFragment();
        const section = document.createElement('section'); section.className = 'a'; f.appendChild(section);
        const h2 = document.createElement('h2'); h2.textContent = 'Title'; section.appendChild(h2);
        const p = document.createElement('p'); section.appendChild(p);
        const anchor = document.createTextNode(''); p.appendChild(anchor);
        p.appendChild(document.createTextNode(' '));
        const b = document.createElement('b'); b.textContent = '!'; p.appendChild(b);
        const button = document.createElement('button'); button.textContent = '+'; section.appendChild(button);

        const nodes = walk(f);
        expect(nodes).toHaveLength(2);
        expect(nodes).toContain(anchor);   // where {{ msg }} goes
        expect(nodes).toContain(button);   // the element with @click
    });
});
