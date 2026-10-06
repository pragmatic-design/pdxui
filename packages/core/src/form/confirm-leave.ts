// Leaving with unsaved work — the question, and the guard that asks it.
//
// `@form f { warnUnsaved }` does not compile to `confirm('You have unsaved changes. Leave anyway?')`:
// that is the browser's modal, a sentence no app could translate, and a dialog that blocks every
// automated browser. The question goes through the page's dialog queue, which <pdx-overlay-outlet> draws, in strings an app overrides like any component's.

import { registerComponentStrings, getComponentString } from '../i18n/component-strings';
import { getDialogQueue } from '../component/dialog-queue';
import { getCurrentScope } from '../component/lifecycle';
import { DEV } from '../utils/env';

let stringsRegistered = false;

/** The English defaults, registered on first use: core declares this module free of load-time effects. */
function registerStrings(): void {
    if (stringsRegistered) return;
    stringsRegistered = true;
    registerComponentStrings('form', {
        unsavedTitle: 'Unsaved changes',
        unsavedMessage: 'You have unsaved changes. Leave anyway?',
        unsavedLeave: 'Leave',
        unsavedStay: 'Stay',
    });
}

const OUTLET = 'pdx-overlay-outlet';
let warnedNoOutlet = false;

/**
 * Something on the page draws the queue: the outlet the page has, or one mounted now. Mounting
 * needs the element registered — @pdxui/ui/overlay-outlet, which the compiler imports for a
 * file that uses warnUnsaved. Core cannot import it: ui depends on core.
 */
function dialogHost(): boolean {
    if (typeof document === 'undefined' || typeof customElements === 'undefined') return false;
    if (!customElements.get(OUTLET)) return false;
    if (!document.querySelector(OUTLET)) document.body.appendChild(document.createElement(OUTLET));
    return true;
}

/**
 * Ask whether to leave with unsaved work. Resolves `true` for Leave, `false` for Stay and for a
 * dialog dismissed with Escape.
 *
 * With nothing registered to draw the dialog it resolves `true` and warns once: a question nobody
 * can see would hold the navigation forever, and a page the user cannot leave is worse than one
 * that did not ask.
 */
export function confirmLeave(): Promise<boolean> {
    if (!dialogHost()) {
        if (DEV && !warnedNoOutlet) {
            warnedNoOutlet = true;
            console.warn(`[pdx] warnUnsaved: no <${OUTLET}> is registered to ask before leaving, so the page was left without asking. Import '@pdxui/ui/overlay-outlet' (the compiler does it for a .pdx file that uses warnUnsaved).`);
        }
        return Promise.resolve(true);
    }
    registerStrings();
    const text = (key: string): string => getComponentString('form', key)();
    return getDialogQueue().push({
        type: 'confirm',
        title: text('unsavedTitle'),
        message: text('unsavedMessage'),
        confirmLabel: text('unsavedLeave'),
        cancelLabel: text('unsavedStay'),
        variant: 'danger',
    }).then(answer => answer === true);
}

/**
 * The guard `createForm({ warnUnsaved: true })` installs on the component whose setup created it:
 * leaving the page asks while `unsaved()` is true, and so does closing or reloading the tab — there
 * the browser asks in its own words, which a page cannot change.
 */
export function guardUnsavedWork(unsaved: () => boolean): void {
    registerStrings();
    const scope = getCurrentScope();
    if (!scope) {
        if (DEV) {
            console.warn('[pdx] createForm({ warnUnsaved: true }) was called outside a component setup: there is no page to guard, so leaving it will not ask.');
        }
        return;
    }
    scope.registerBeforeLeave(() => !unsaved() || confirmLeave());

    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
        e.preventDefault();
        // Older Chromium asks only when returnValue is set, whatever its value.
        e.returnValue = '';
    };
    scope.track(() => {
        if (!unsaved()) return;
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    });
}
