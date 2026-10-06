// pdx-bottom-sheet's handle and its release gesture.
//
// - The release velocity is measured over the last 100 ms, not as the step between the last
//   pointermove and the pointerup: those arrive at the same position, so that step is about 0 and a
//   fast swipe would never dismiss.
// - A slow drag below half of the smallest detent closes the sheet instead of snapping back to it.
// - The handle is a slider, with a role, a tab stop and a name: otherwise the detents are pointer-only.
//
// happy-dom's window is 768 px tall, so the default detents [0.4, 0.85] rest at 307 px and 653 px.
import { describe, it, expect, afterEach } from 'vitest';
import { tick } from './helpers';
import '../../src/bottom-sheet/pdx-bottom-sheet';

type Sheet = HTMLElement & { open: boolean };

async function mountOpen(attrs = ''): Promise<Sheet> {
    const el = document.createElement('div');
    el.innerHTML = `<pdx-bottom-sheet open ${attrs}><p>Body</p></pdx-bottom-sheet>`;
    document.body.appendChild(el);
    await tick(100);
    return el.querySelector('pdx-bottom-sheet') as Sheet;
}

const handleOf = (el: Sheet) => el.querySelector('.pdx-bottom-sheet-handle') as HTMLElement;
const panelOf = (el: Sheet) => el.querySelector('.pdx-bottom-sheet') as HTMLElement;

/** A pointer event at `clientY`, stamped `t` ms: the component reads the event's time, not the clock's. */
function pointer(type: string, clientY: number, t: number): PointerEvent {
    const e = new PointerEvent(type, { clientY, bubbles: true });
    Object.defineProperty(e, 'timeStamp', { value: t });
    return e;
}

/**
 * Drags the handle through `moves` ([clientY, ms] pairs, starting at y=500, t=1000) and lifts at
 * `releaseAt` ms, at the last position.
 */
function drag(el: Sheet, moves: [number, number][], releaseAt: number): void {
    handleOf(el).dispatchEvent(pointer('pointerdown', 500, 1000));
    for (const [y, t] of moves) document.dispatchEvent(pointer('pointermove', y, 1000 + t));
    document.dispatchEvent(pointer('pointerup', moves[moves.length - 1][0], 1000 + releaseAt));
}

function closed(el: Sheet): { value: boolean } {
    const state = { value: false };
    el.addEventListener('pdx-close', () => { state.value = true; });
    return state;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('pdx-bottom-sheet release gesture', () => {
    it('dismisses on a fast swipe down, released where the last move left it', async () => {
        const el = await mountOpen();
        const didClose = closed(el);
        // 120 px down in 60 ms: 2000 px/s, to 187 px (0.24 of the screen, above half the smallest detent).
        drag(el, [[540, 20], [580, 40], [620, 60]], 60);
        await tick(350);
        expect(didClose.value).toBe(true);
    });

    it('reads the events\' time, not the handler\'s: a fast swipe handled late still dismisses', async () => {
        const el = await mountOpen();
        const didClose = closed(el);
        // The input happened in 60 ms, the page handled it 150 ms apart (a busy main thread).
        handleOf(el).dispatchEvent(pointer('pointerdown', 500, 1000));
        for (const [y, t] of [[540, 20], [580, 40], [620, 60]]) {
            await tick(150);
            document.dispatchEvent(pointer('pointermove', y, 1000 + t));
        }
        await tick(150);
        document.dispatchEvent(pointer('pointerup', 620, 1060));
        await tick(350);
        expect(didClose.value).toBe(true);
    });

    it('snaps back to the smallest detent when the same drag rests before lifting', async () => {
        const el = await mountOpen();
        const didClose = closed(el);
        // The same 120 px, then the finger rests 240 ms: no movement inside the window → a slow release.
        drag(el, [[540, 20], [580, 40], [620, 60]], 300);
        await tick(350);
        expect(didClose.value).toBe(false);
        expect(parseFloat(panelOf(el).style.height)).toBeCloseTo(0.4 * window.innerHeight, 1);
    });

    it('closes on a slow release below half the smallest detent', async () => {
        const el = await mountOpen();
        const didClose = closed(el);
        // Down to 47 px (0.06 of the screen), then a rest.
        drag(el, [[600, 100], [700, 200], [760, 300]], 600);
        await tick(350);
        expect(didClose.value).toBe(true);
    });

    it('does not close from a slow drag when close-on-swipe-down is off', async () => {
        const el = await mountOpen();
        (el as Sheet & { closeOnSwipeDown: boolean }).closeOnSwipeDown = false;
        const didClose = closed(el);
        drag(el, [[600, 100], [700, 200], [760, 300]], 600);
        await tick(350);
        expect(didClose.value).toBe(false);
    });
});

describe('pdx-bottom-sheet handle', () => {
    it('is a named slider over the detents, in the tab order', async () => {
        const handle = handleOf(await mountOpen());
        expect(handle.getAttribute('role')).toBe('slider');
        expect(handle.tabIndex).toBe(0);
        expect(handle.getAttribute('aria-label')).toBe('Sheet height');
        expect(handle.getAttribute('aria-valuemin')).toBe('0');
        expect(handle.getAttribute('aria-valuemax')).toBe('1');
        expect(handle.getAttribute('aria-valuenow')).toBe('0');
        expect(handle.getAttribute('aria-valuetext')).toBe('40% of the screen');
    });

    it('moves between detents with the arrow keys, Home and End', async () => {
        const el = await mountOpen('detents="[0.25, 0.5, 0.9]"');
        const handle = handleOf(el);
        const changes: number[] = [];
        el.addEventListener('pdx-detent-change', (e) => changes.push((e as CustomEvent).detail.index));
        const press = async (key: string) => {
            handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await tick(20);
        };

        await press('ArrowUp');
        expect(handle.getAttribute('aria-valuenow')).toBe('1');
        expect(handle.getAttribute('aria-valuetext')).toBe('50% of the screen');
        expect(parseFloat(panelOf(el).style.height)).toBeCloseTo(0.5 * window.innerHeight, 1);

        await press('End');
        expect(handle.getAttribute('aria-valuenow')).toBe('2');
        await press('ArrowUp');
        expect(handle.getAttribute('aria-valuenow')).toBe('2');
        await press('Home');
        expect(handle.getAttribute('aria-valuenow')).toBe('0');
        await press('ArrowDown');
        expect(handle.getAttribute('aria-valuenow')).toBe('0');
        expect(changes).toEqual([1, 2, 2, 0, 0]);
    });

    it('leaves other keys to the page', async () => {
        const handle = handleOf(await mountOpen());
        const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
        handle.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(false);
        expect(handle.getAttribute('aria-valuenow')).toBe('0');
    });
});
