// pdx-avatar without a name is decorative; a clickable pdx-avatar-group works from the keyboard, and
// its "+N" says what it counts.
//
// - An avatar with no `alt` is decorative — aria-hidden, no role — the choice an image with no text
//   alternative gets: a <span role="img"> with no name, showing "?", fails axe's role-img-alt.
// - A clickable group's avatars and its "+N" are buttons, and Enter or Space fires what a click
//   fires: without a tabindex and a role, clicks work and the keyboard reaches nothing.
// - The "+N" says what it counts: "{count} more" (a component string).

import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/avatar/pdx-avatar';
import '../../src/avatar-group/pdx-avatar-group';

const PEOPLE = [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Alan Turing' }, { name: 'Edsger Dijkstra' }];

async function avatar(alt?: string): Promise<HTMLElement> {
    const el = document.createElement('pdx-avatar');
    if (alt !== undefined) el.setAttribute('alt', alt);
    document.body.appendChild(el);
    await tick(20);
    return el.firstElementChild as HTMLElement;
}

async function group(clickable: boolean): Promise<HTMLElement & { items: unknown[] }> {
    const el = document.createElement('pdx-avatar-group') as HTMLElement & { items: unknown[] };
    el.setAttribute('max', '3');
    if (clickable) el.setAttribute('clickable', '');
    document.body.appendChild(el);
    await tick();
    el.items = PEOPLE;
    await tick(30);
    return el;
}

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('pdx-avatar name', () => {
    beforeEach(cleanup);

    it('with alt: role="img" named by it', async () => {
        const span = await avatar('Ada Lovelace');
        expect(span.getAttribute('role')).toBe('img');
        expect(span.getAttribute('aria-label')).toBe('Ada Lovelace');
        expect(span.hasAttribute('aria-hidden')).toBe(false);
    });

    it('without alt: decorative — hidden, no role, no empty name', async () => {
        const span = await avatar();
        expect(span.getAttribute('aria-hidden')).toBe('true');
        expect(span.hasAttribute('role'), 'an unnamed role="img"').toBe(false);
        expect(span.hasAttribute('aria-label')).toBe(false);
    });
});

describe('pdx-avatar-group', () => {
    beforeEach(cleanup);

    it('clickable: each avatar is a focusable button named by its person', async () => {
        const el = await group(true);
        const avatars = [...el.querySelectorAll('pdx-avatar.pdx-avatar-group-item')];
        expect(avatars).toHaveLength(3);
        for (const [i, a] of avatars.entries()) {
            expect(a.getAttribute('role')).toBe('button');
            expect(a.getAttribute('tabindex')).toBe('0');
            expect(a.getAttribute('aria-label')).toBe(PEOPLE[i].name);
        }
    });

    it('clickable: Enter and Space on an avatar fire pdx-click, as a click does', async () => {
        const el = await group(true);
        const got: unknown[] = [];
        el.addEventListener('pdx-click', (e) => got.push((e as CustomEvent).detail.index));
        const [, second, third] = el.querySelectorAll('pdx-avatar.pdx-avatar-group-item');
        key(second, 'Enter');
        key(third, ' ');
        expect(got).toEqual([1, 2]);
    });

    it('clickable: the "+N" is a focusable button named "1 more", and Enter fires pdx-overflow-click', async () => {
        const el = await group(true);
        const more = el.querySelector('.pdx-avatar-group-overflow') as HTMLElement;
        expect(more.getAttribute('role')).toBe('button');
        expect(more.getAttribute('tabindex')).toBe('0');
        expect(more.getAttribute('aria-label')).toBe('1 more');
        const got: unknown[] = [];
        el.addEventListener('pdx-overflow-click', (e) => got.push((e as CustomEvent).detail.count));
        key(more, 'Enter');
        expect(got).toEqual([1]);
    });

    it('not clickable: no tab stops, and the "+N" is an image named "1 more"', async () => {
        const el = await group(false);
        expect(el.querySelectorAll('[tabindex]')).toHaveLength(0);
        const more = el.querySelector('.pdx-avatar-group-overflow') as HTMLElement;
        expect(more.getAttribute('role')).toBe('img');
        expect(more.getAttribute('aria-label')).toBe('1 more');
    });
});
