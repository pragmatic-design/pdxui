// Forces a garbage collection one macrotask after every `observe()`, in every unit suite that runs
// on happy-dom.
//
// happy-dom 20.10.2 handed the observed node `callback: new WeakRef((record) => this.report(record))`
// and nothing else held that arrow function, so once the collector ran, `deref()` was undefined and
// every record was dropped in silence — no error, the callback simply never ran again. A test that
// asserts on something a component does in its MutationObserver callback therefore passed alone and
// failed at random inside `pnpm test`, under the GC pressure of six packages in parallel: a gate
// failure nobody could reproduce.
//
// From 20.14 the listener keeps the arrow in a field, and the observer survives a collection; core's
// `gc-detector.test.ts` asserts that it does. The detector stays because the defect was silent: if it
// comes back, the drop happens EVERY time instead of sometimes, and a test that depends on a delivery
// fails at once and always. What to do when it does — two ways:
//   · read the state synchronously, when the component can be driven without the observer;
//   · or measure it in Chromium, in a guard spec (see `responsive accordion-late-items.spec.ts`),
//     leaving a comment in the unit test that says where it went.
//
// `--expose-gc` comes from the package's vite config (`test.execArgv`; in Vitest 4 a `poolOptions`
// nesting reports itself as DEPRECATED and is then ignored). Without it
// there is no `gc()` to call, and this file says so rather than passing quietly: a detector that
// silently does nothing is worse than no detector.
import { setImmediate } from 'node:timers';

const gc = (globalThis as { gc?: () => void }).gc;
if (typeof gc !== 'function') {
    throw new Error(
        'the MutationObserver GC detector needs --expose-gc: add `execArgv: [\'--expose-gc\']` to the '
        + 'test block of this package\'s vite config',
    );
}

// A file that declares `@vitest-environment node` has no MutationObserver, and so nothing to detect
// (node-import.test.ts, which asserts that core imports where there is no DOM). Every happy-dom file
// has one, and `gc-detector.test.ts` asserts the wrapper is in place there.
if (typeof MutationObserver !== 'undefined') {
    const observe = MutationObserver.prototype.observe;
    const observeThenCollect = function (this: MutationObserver, ...args: Parameters<MutationObserver['observe']>): void {
        observe.apply(this, args);
        setImmediate(() => gc!());
    };
    /** Read by each package's `gc-detector.test.ts`: the wrapper is in place, not only the flag. */
    (observeThenCollect as unknown as { pdxGcDetector: boolean }).pdxGcDetector = true;
    MutationObserver.prototype.observe = observeThenCollect;
}
