// The client's DOM and renderToString's markup, compared canonically (#160): attributes sorted, classes
// sorted, styles as the browser reads them, adjacent text merged, and the string's markers for
// hydration set aside — `<!--pdx-->` around a value, `<!--pdx-slot:…-->` around what a slot received.
// Shared by the parity suites of the string renderer.

import { expect } from 'vitest';
import { renderToString } from '../src/server/render-string';

/** A comment the server writes for hydration only, which the client's DOM does not have. */
export function isHydrationMarker(node: Node): boolean {
    if (node.nodeType !== 8) return false;
    const data = (node as Comment).data;
    return data === 'pdx' || data === '/pdx' || data === '/pdx-slot' || data.startsWith('pdx-slot:');
}

/** A node as a canonical string: what both renders must agree on. */
export function canonical(node: Node): string {
    if (node.nodeType === 3) return (node as Text).data;
    if (node.nodeType === 8) return isHydrationMarker(node) ? '' : `<!--${(node as Comment).data}-->`;
    if (node.nodeType !== 1) return '';
    const el = node as HTMLElement;
    const attrs = Array.from(el.attributes).map((a) => {
        if (a.name === 'class') return `class="${a.value.split(/\s+/).filter(Boolean).sort().join(' ')}"`;
        if (a.name === 'style') return `style="${el.style.cssText}"`;
        return `${a.name}="${a.value}"`;
    }).sort();
    return `<${el.localName}${attrs.length ? ' ' + attrs.join(' ') : ''}>${children(el)}</${el.localName}>`;
}

export function children(parent: Node): string {
    const box = parent.cloneNode(true);
    // Merge adjacent text after the markers are gone: the parser merged it in the string's DOM.
    box.childNodes.forEach(() => {});
    const strip = (n: Node): void => {
        for (const c of Array.from(n.childNodes)) {
            if (isHydrationMarker(c)) n.removeChild(c);
            else strip(c);
        }
    };
    strip(box);
    box.normalize();
    return Array.from(box.childNodes).map(canonical).join('');
}

/** The client's DOM and the string's, canonically. */
export function both(render: () => DocumentFragment): { client: string; server: string; markup: string } {
    const built = document.createElement('div');
    built.appendChild(render());
    // Read back through its own serialisation: happy-dom keeps getAttribute('class') and classList at
    // the pre-binding value on an element whose `:class` attribute was removed by name (it parses the
    // colon as a namespace prefix), while outerHTML holds what the DOM has — template-more.test.ts.
    const a = document.createElement('div');
    a.innerHTML = built.innerHTML;
    const markup = renderToString(render);
    const b = document.createElement('div');
    b.innerHTML = markup;
    return { client: children(a), server: children(b), markup };
}

export function parity(render: () => DocumentFragment): string {
    const { client, server, markup } = both(render);
    expect(server, `markup: ${markup}`).toBe(client);
    return markup;
}
