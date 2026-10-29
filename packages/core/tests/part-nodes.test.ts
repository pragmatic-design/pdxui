// A node a template part places must not carry a mark of its own. Only a host whose late-slot
// watcher is armed needs to tell its template's nodes from foreign ones, and only for the nodes
// placed directly on it: a list's rows in a <tbody> are read by nobody. A symbol property on every
// row cost select1k 0.3 ms, 1.30 → 1.65, under a 4x CPU throttle, measured on one runner against
// the WeakSet it replaced (#734); a WeakSet of every placed node grows the heap instead (#243).

import { describe, it, expect, beforeEach } from 'vitest';
import { html } from '../src/renderer/template';
import { repeat } from '../src/renderer/list';
import { signal } from '../src/reactivity/signal';

beforeEach(() => { document.body.innerHTML = ''; });

/** The own keys a row has that a plain element of its tag, also in the document, does not. */
function extraKeys(node: Element): string[] {
    const plain = document.createElement(node.localName);
    document.body.appendChild(plain);
    const base = new Set(Reflect.ownKeys(plain));
    plain.remove();
    return Reflect.ownKeys(node).filter((k) => !base.has(k)).map(String);
}

describe('part nodes', () => {
    it('a list row placed where no late-slot watcher looks carries no mark', () => {
        const items = signal([1, 2, 3]);
        const tbody = document.createElement('tbody');
        document.body.appendChild(tbody);
        tbody.appendChild(repeat(() => items(), (i) => i, (i) => html`<tr><td>${i}</td></tr>`));

        const rows = [...tbody.querySelectorAll('tr')];
        expect(rows).toHaveLength(3);
        for (const row of rows) expect(extraKeys(row), 'own keys a part added to the row').toEqual([]);

        items.set([1, 2, 3, 4]);                    // a row placed by the list's update, not its mount
        const added = tbody.querySelectorAll('tr')[3];
        expect(extraKeys(added), 'own keys a part added to the appended row').toEqual([]);
    });
});
