// The sortable's ghost keeps the item's look off its ancestors.
//
// A component's scoped CSS is a descendant selector, `[data-pdx-…] .card`, and the ghost is cloned
// onto <body>: without its computed style inline it is the card's text with no box. The pixels are
// measured in `packages/showcase/tests/board-ghost.spec.ts`; this holds the copy itself.
import { describe, it, expect, afterEach } from 'vitest';
import { inlineComputedStyle } from '../src/component/sortable';

afterEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

function scopedCard(): HTMLElement {
    const style = document.createElement('style');
    style.textContent = '[data-scope] .card { padding-top: 7px; } [data-scope] .card .title { font-weight: 700; }';
    document.head.appendChild(style);
    const scope = document.createElement('div');
    scope.setAttribute('data-scope', '');
    scope.innerHTML = '<div class="card"><span class="title">T-2000</span></div>';
    document.body.appendChild(scope);
    return scope.querySelector('.card') as HTMLElement;
}

describe('inlineComputedStyle', () => {
    it('a clone on <body> keeps what the scoped rules gave the original, on it and its children', () => {
        const card = scopedCard();
        const ghost = card.cloneNode(true) as HTMLElement;
        inlineComputedStyle(card, ghost);
        document.body.appendChild(ghost);

        expect(getComputedStyle(ghost).paddingTop).toBe('7px');
        expect(getComputedStyle(ghost.querySelector('.title')!).fontWeight).toBe('700');
    });

    it('control — without the copy, the same clone on <body> loses them', () => {
        const card = scopedCard();
        const ghost = card.cloneNode(true) as HTMLElement;
        document.body.appendChild(ghost);

        expect(getComputedStyle(ghost).paddingTop).not.toBe('7px');
    });
});
