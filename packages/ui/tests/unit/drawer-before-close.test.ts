// A drawer asks before it closes itself, and a host that says no keeps it open.
//
// A `close()` that wrote its OWN `open` prop and then told the host would leave a host that declined
// — «you have unsaved changes», the thing a confirm exists for — with a component that had shut
// itself and a binding that could not put it back: the owner's value never changes, so the binding
// never writes again. The panel keeps `visibility: hidden` from losing `[data-open]`, which takes it
// out of the accessibility tree while `el.open` still reads true: the drawer's own `open` is true, its
// panel is in the document, not `aria-hidden`, not `inert` — and `getByRole('dialog')` finds nothing.
//
// The drawer does what `pdx-dialog` does: a cancelable `pdx-before-close`, fired either way,
// because «an app that wants "you have unsaved changes" needs to know the attempt happened».
import { describe, it, expect, beforeEach } from 'vitest';
import { cleanup, tick } from './helpers';
import '../../src/drawer/pdx-drawer';

type Drawer = HTMLElement & Record<string, any>;

async function open(): Promise<Drawer> {
    const el = document.createElement('pdx-drawer') as Drawer;
    el.label = 'Edit';
    el.open = true;
    document.body.appendChild(el);
    await tick(40);
    await tick(20);
    return el;
}

/** The panel the CSS opens and closes: `[data-open]` is what makes it visible. */
const panel = () => document.querySelector('.pdx-drawer') as HTMLElement | null;

beforeEach(cleanup);

describe('pdx-before-close', () => {
    it('fires before the drawer closes itself, and it is cancelable', async () => {
        const el = await open();
        const seen: Event[] = [];
        el.addEventListener('pdx-before-close', (e: Event) => seen.push(e));

        el.close();
        await tick(20);

        expect(seen, 'the drawer closed without asking').toHaveLength(1);
        expect(seen[0].cancelable, 'the question cannot be answered').toBe(true);
    });

    it('a host that prevents it keeps the drawer OPEN — the prop and the panel', async () => {
        const el = await open();
        el.addEventListener('pdx-before-close', (e: Event) => e.preventDefault());
        const closed: Event[] = [];
        el.addEventListener('pdx-close', (e: Event) => closed.push(e));

        el.close();
        await tick(20);

        expect(el.open, 'the drawer wrote its own open prop over the host\'s answer').toBe(true);
        expect(panel()!.hasAttribute('data-open'),
            'the panel lost the attribute the CSS opens it with, so it is invisible while `open` says true')
            .toBe(true);
        expect(closed, 'it announced a close that did not happen').toHaveLength(0);
    });

    it('and it closes normally when nobody objects', async () => {
        const el = await open();
        const closed: Event[] = [];
        el.addEventListener('pdx-close', (e: Event) => closed.push(e));

        el.close();
        await tick(20);

        expect(el.open).toBe(false);
        expect(panel()!.hasAttribute('data-open')).toBe(false);
        expect(closed, 'the host was never told it closed').toHaveLength(1);
    });

    it('Escape asks too', async () => {
        const el = await open();
        const seen: Event[] = [];
        el.addEventListener('pdx-before-close', (e: Event) => { seen.push(e); e.preventDefault(); });

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await tick(20);

        expect(seen, 'Escape closed the drawer without asking').toHaveLength(1);
        expect(el.open, 'Escape closed it over the host\'s objection').toBe(true);
    });

    it('control — closing it through the PROP asks nothing', async () => {
        // The host closing it IS the answer; asking would be asking the host to confirm its own
        // decision, and a host that prevented it would deadlock its own state.
        const el = await open();
        const seen: Event[] = [];
        el.addEventListener('pdx-before-close', (e: Event) => seen.push(e));

        el.open = false;
        await tick(20);

        expect(seen, 'the host set open=false and was asked whether it meant it').toHaveLength(0);
        expect(panel()!.hasAttribute('data-open')).toBe(false);
    });
});
