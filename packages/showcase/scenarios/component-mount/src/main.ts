// Every component of @pdxui/ui, mounted 100 at a time in its default state, on a production build
// (#865). `tests/scenario-component-retention.spec.ts` holds each one to keeping no instance once it is
// removed, and `tools/perf/` times and profiles a row (`mount:pdx-select,100`).
//
// `window.__mount(tag, n)` appends n `<tag>`s, with no attribute and no content, to a fresh container,
// and returns the milliseconds of the SYNCHRONOUS mount: every connect and render, then the style and
// layout of what they drew, forced. It then waits until the container has stopped changing, so the
// next call starts on a still page, and removes the container.
//
// Why the synchronous part and not "until drawn". A component draws part of itself later than its
// connect — in a frame, after a task — and three other measures were tried and set aside (#865):
//   - the time until the last change, with "still" meaning three quiet turns: the turns pass in
//     microseconds, before the next frame, so a component drawn in a frame read 1.7 ms or 635 ms;
//   - the same with two quiet frames as well: stable, but ~50 components then read 13–16 ms, the
//     time until the next vsync, whatever they cost;
//   - the main thread's busy time until the last change: paint, composite and garbage collection land
//     in it at different moments, and two runs of the same build disagreed by up to 2.4× on a row.
// What a later frame draws is left out of the budget; how long until the last change is still kept, in
// `window.__drawnMs`, for whoever reads a slow row.
//
// `window.__calibrate(n)` is a fixed piece of DOM work timed the same way: a component's time divided
// by it, measured beside it, holds on a machine slower or faster than the one it was measured on. It
// was not steady while the heap was swollen by components that kept their removed instances (#881):
// run to run, the calibration slowed by up to 5×. Since they no longer do, it is what
// `tests/scenario-component-mount.spec.ts` holds each component to.
//
// The whole library is registered before any mount, so no lazy load is timed.
import '../../../../ui/src/index';

/** "Still": this many turns of the event loop AND this many animation frames without a change. */
const QUIET_TURNS = 3;
const QUIET_FRAMES = 2;

/** A turn of the event loop that is not clamped as a nested timeout is: a message to ourselves. */
const channel = new MessageChannel();
const turn = () => new Promise<void>((resolve) => { channel.port1.onmessage = () => resolve(); channel.port2.postMessage(null); });

/** Mount with `fill(host)`, return its synchronous milliseconds, and wait until the subtree is still. */
async function timed(fill: (host: HTMLElement) => void): Promise<number> {
    const host = document.createElement('div');
    document.getElementById('host')!.appendChild(host);
    let last = 0;
    let frames = 0;
    const observer = new MutationObserver(() => { last = performance.now(); frames = 0; });
    observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
    let counting = true;
    const countFrame = () => { if (!counting) return; frames++; requestAnimationFrame(countFrame); };
    const start = performance.now();
    fill(host);
    // The style and layout of what was drawn, now: otherwise they fall in whichever frame comes next.
    host.getBoundingClientRect();
    const sync = performance.now() - start;
    last = performance.now();
    requestAnimationFrame(countFrame);
    let turns = 0;
    for (let quiet = 0; quiet < QUIET_TURNS || frames < QUIET_FRAMES; turns++) {
        if (turns > 1_000_000) throw new Error('the subtree never stopped changing');
        const before = last;
        await turn();
        quiet = last === before ? quiet + 1 : 0;
    }
    counting = false;
    observer.disconnect();
    Object.assign(window, { __turns: turns, __drawnMs: last - start });
    host.remove();
    return sync;
}

/** Mount n `<tag>`s in their default state. */
function mount(tag: string, n: number): Promise<number> {
    if (!customElements.get(tag)) throw new Error(`${tag} is not registered`);
    return timed((host) => {
        for (let i = 0; i < n; i++) host.appendChild(document.createElement(tag));
    });
}

/** The rows of one calibration unit: enough work that a unit is well above the clock's 0.1 ms grain. */
const CALIBRATION_ROWS = 20;

/** n times: a wrapper of CALIBRATION_ROWS rows, each a label and a button with two attributes and a listener. */
function calibrate(n: number): Promise<number> {
    return timed((host) => {
        for (let i = 0; i < n; i++) {
            const box = document.createElement('div');
            box.className = 'box';
            for (let r = 0; r < CALIBRATION_ROWS; r++) {
                const row = document.createElement('div');
                const label = document.createElement('span');
                label.textContent = `Item ${i}.${r}`;
                const button = document.createElement('button');
                button.type = 'button';
                button.setAttribute('aria-label', `Remove item ${i}.${r}`);
                button.addEventListener('click', () => row.remove());
                row.append(label, button);
                box.appendChild(row);
            }
            host.appendChild(box);
        }
    });
}

Object.assign(window, { __mount: mount, __calibrate: calibrate, __ready: true });
