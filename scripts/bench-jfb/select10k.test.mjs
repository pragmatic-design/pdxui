// node --test scripts/bench-jfb/select10k.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepQuery } from './select10k.mjs';

/**
 * A node of a fake document: `matches` is the selector it answers to, `children` what
 * querySelectorAll('*') lists below it, and `shadow` an open shadow root, itself a node.
 */
function node({ matches = null, children = [], shadow = null } = {}) {
    const self = {
        matches,
        shadowRoot: shadow,
        querySelector(selector) {
            for (const child of this.querySelectorAll('*')) if (child.matches === selector) return child;
            return null;
        },
        // Light DOM only, as the platform's querySelectorAll: it does not enter a shadow root.
        querySelectorAll() {
            return children.flatMap((c) => [c, ...c.querySelectorAll('*')]);
        },
    };
    return self;
}

test('finds an element in the light DOM, as document.querySelector does', () => {
    const button = node({ matches: '#runlots' });
    assert.equal(deepQuery(node({ children: [button] }), '#runlots'), button);
});

test('finds an element inside an open shadow root, where lit renders the benchmark app (#1206)', () => {
    const button = node({ matches: '#runlots' });
    const host = node({ matches: 'main-element', shadow: node({ children: [button] }) });
    const doc = node({ children: [host] });
    assert.equal(doc.querySelector('#runlots'), null, 'the control: the light DOM does not have it');
    assert.equal(deepQuery(doc, '#runlots'), button);
});

test('finds it in a shadow root nested inside another', () => {
    const button = node({ matches: '#runlots' });
    const inner = node({ shadow: node({ children: [button] }) });
    const outer = node({ shadow: node({ children: [inner] }) });
    assert.equal(deepQuery(node({ children: [outer] }), '#runlots'), button);
});

test('returns null when nothing matches anywhere', () => {
    const host = node({ shadow: node({ children: [node({ matches: '#run' })] }) });
    assert.equal(deepQuery(node({ children: [host] }), '#runlots'), null);
});
