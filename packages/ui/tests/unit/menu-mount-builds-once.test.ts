// pdx-menu builds its menu ONCE when it mounts.
//
// Two tracks read `items` on the first run: the main one builds the menu and marks it bound, and the
// items track must not — finding it bound in the same turn — build it again from the same array,
// removing the first. Under load a second build lands after a reader has already opened the menu and
// moved the focus into it: the item goes with the first menu and the focus falls to <body>. A rebuild
// is for items that CHANGED.

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/menu/pdx-menu';

const items = () => [
    { key: 'open', label: 'Open' },
    { key: 'save', label: 'Save' },
];

/**
 * Count the `.pdx-menu` elements the host appends from now on — each is a build. Counted on the
 * instance's own `appendChild`, not with a MutationObserver: happy-dom holds an observer's callback
 * in a WeakRef, and after a GC it delivers nothing.
 */
function countBuilds(host: HTMLElement): () => number {
    let n = 0;
    const own = host.appendChild.bind(host);
    host.appendChild = <T extends Node>(node: T): T => {
        if (node.nodeType === 1 && (node as unknown as HTMLElement).classList.contains('pdx-menu')) n++;
        return own(node);
    };
    return () => n;
}

describe('pdx-menu mounting', () => {
    beforeEach(cleanup);

    it('builds the menu once when it mounts', async () => {
        const el = document.createElement('pdx-menu') as HTMLElement & { items: unknown };
        el.items = items();
        el.setAttribute('open', '');
        const builds = countBuilds(el);
        document.body.appendChild(el);
        await tick(80);
        expect(el.querySelectorAll('.pdx-menu').length, 'not exactly one menu').toBe(1);
        expect(builds(), 'the menu was built, then built again from the same items').toBe(1);
    });

    it('control — items that CHANGE still rebuild it', async () => {
        const el = document.createElement('pdx-menu') as HTMLElement & { items: unknown };
        el.items = items();
        el.setAttribute('open', '');
        document.body.appendChild(el);
        await tick(80);
        const builds = countBuilds(el);
        el.items = [...items(), { key: 'close', label: 'Close' }];
        await tick(80);
        expect(builds()).toBe(1);
        expect(el.querySelector('[data-menu-key="close"]')).not.toBeNull();
    });
});
