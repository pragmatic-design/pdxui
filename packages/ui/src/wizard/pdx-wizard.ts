// pdx-wizard — Multi-step wizard with stepper header, panel visibility, back/next nav.
// Compound: discovers [data-wizard-step] children. Auto-generates stepper + footer.
// Supports: linear/free navigation, vertical/horizontal, validation guard, i18n.

import { component, html, signal, focusGroup, registerComponentStrings, generatedId, model, event } from '@pdxui/core';
import { watchStepLabels, refreshStepMeta, applyStepLabels, stepName, type StepMeta } from './wizard-step-labels';
import type { Dispose } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/wizard';
// The stepper this component BUILDS (.pdx-stepper, .pdx-step, the connectors) is painted from
// pagination.css — wizard.css says so in its second line and then does not import it, so without
// this the header renders as a block on a page that does not load the whole library.
import '@pdxui/design/components/pagination';

// ─── i18n defaults ───────────────────────────────────────
registerComponentStrings('wizard', {
    back: 'Back',
    next: 'Next',
    complete: 'Complete',
    stepOf: 'Step {current} of {total}',
});

/**
 * A multi-step wizard with a stepper header, back/next navigation in linear or free mode, and a
 * validation guard before moving on.
 *
 * @csspart root - The stepper, the `role="tablist"` element (`.pdx-stepper`).
 * @csspart step - A step's button in the stepper; the current one is `aria-current="step"`.
 * @csspart connector - The line between two steps of a horizontal stepper.
 * @csspart panel - A step's panel, an element with `data-wizard-step`.
 * @csspart nav - The footer with Back, the position and Next.
 * @csspart back - The Back button.
 * @csspart next - The Next button, Complete on the last step.
 * @csspart indicator - The "Step 2 of 4" text of the footer.
 * @cssstate ready - Its steps are found and its stepper is drawn.
 * @cssstate disabled - `disabled` is set: no step can be reached.
 * @cssstate vertical - `orientation="vertical"`: the stepper beside the panels.
 *
 * @alphaevent pdx-change
 * @alphadetail value $event.detail.value
 */
component('pdx-wizard', {
    // The current step is a position the wizard changes itself (#289): a model, so Next, Back, a
    // step button or `goTo(n)` writes it and announces `value-change` { value }.
    models: {
        /** Current step (0-based index) */
        value: model<number>(0, { type: Number }),
    },
    events: {
        /** Before a move, cancellable: `preventDefault()` keeps the wizard where it is. */
        'pdx-before-change': event<{ value: number; previous: number }>(),
        /** Next on the last step, or `complete()`. */
        'pdx-complete': event<{ value: number }>(),
    },
    states: ['ready', 'disabled', 'vertical'],
    parts: ['root', 'step', 'connector', 'panel', 'nav', 'back', 'next', 'indicator'],
    // The axis pagination.css keys by (#632), reflected on the host and drawn on the stepper, the
    // root part, where `.pdx-stepper-sm` draws the same on a native stepper. The navigation buttons
    // take it too.
    variants: {
        /** The step numbers' size: md (the default) or sm. */
        size: { md: '.pdx-stepper-md', sm: '.pdx-stepper-sm' },
    },
    props: {
        /** Sequential navigation — can't skip ahead */
        linear: { type: Boolean, default: true },
        /** Stepper orientation */
        orientation: { type: String, default: 'horizontal' },
        /** Hide the auto-generated navigation footer */
        hideNav: { type: Boolean, default: false },
        /** Hide the stepper header */
        hideStepper: { type: Boolean, default: false },
        /** Disabled state — no interaction */
        disabled: { type: Boolean, default: false },
    },
    setup(ctx) {
        const _step = signal(0);
        const _highestVisited = signal(0);
        let _steps: StepMeta[] = [];
        let _stepperEl: HTMLElement | null = null;
        let _navEl: HTMLElement | null = null;
        let _focusDispose: Dispose | null = null;
        let _labelsDispose: Dispose | null = null;
        let _bound = false;
        let _liveEl: HTMLElement | null = null;
        /** The step the live region last spoke of (the initial one counts as spoken). */
        let _announcedStep = -1;
        // Generated ids carry a per-instance uid: as `pdx-wizard-panel-${i}` by index, two wizards
        // on one page would repeat them and the second one's step buttons would control the first
        // one's panels.
        const uid = generatedId('pdx-wizard');

        // ─── Step discovery ──────────────────────────────────
        /**
         * The direct child of `ctx.el` that contains `node` — `node` itself when it already is
         * one. What `insertBefore` needs as a reference, whatever depth the panel sits at.
         *
         * Null only if `node` is not inside the component at all, which `discoverSteps()` makes
         * impossible; the caller treats that as "append".
         */
        function childHolding(node: HTMLElement): HTMLElement | null {
            let cur: HTMLElement | null = node;
            while (cur && cur.parentElement !== ctx.el) cur = cur.parentElement;
            return cur;
        }

        function discoverSteps(): StepMeta[] {
            const panels = Array.from(ctx.el.querySelectorAll<HTMLElement>('[data-wizard-step]'));
            return panels.map((el, i) => ({
                index: i,
                label: el.getAttribute('data-label') || `Step ${i + 1}`,
                description: el.getAttribute('data-description') || '',
                icon: el.getAttribute('data-icon') || '',
                el,
            }));
        }

        // ─── Can navigate to step? ──────────────────────────
        function canGoTo(targetIndex: number): boolean {
            if (ctx.disabled()) return false;
            if (targetIndex < 0 || targetIndex >= _steps.length) return false;
            if (!(ctx.linear())) return true;
            // Linear: can go back freely, forward only to highest visited + 1
            return targetIndex <= _highestVisited.peek() + 1;
        }

        // ─── Navigate to step ────────────────────────────────
        function goTo(targetIndex: number): boolean {
            if (!canGoTo(targetIndex)) return false;
            const from = _step.peek();
            if (targetIndex === from) return false;

            // Before the move, cancellable: a listener that validates the step being left stops it.
            // Declared, so it does not bubble (#138).
            if (!ctx.emit('pdx-before-change', { value: targetIndex, previous: from }, { cancelable: true })) return false;

            _step.set(targetIndex);
            if (targetIndex > _highestVisited.peek()) {
                _highestVisited.set(targetIndex);
            }
            // The model, which announces the move. The value track sees its own write as the
            // current step, a no-op.
            ctx.value.set(targetIndex);
            return true;
        }

        function next(): boolean {
            return goTo(_step.peek() + 1);
        }

        function prev(): boolean {
            return goTo(_step.peek() - 1);
        }

        function complete(): void {
            ctx.emit('pdx-complete', { value: _step.peek() });
        }

        // ─── Build stepper header ────────────────────────────
        function buildStepper(): HTMLElement {
            const isVert = (ctx.orientation() as string) === 'vertical';

            const nav = document.createElement('nav');
            nav.className = 'pdx-stepper' + (isVert ? ' pdx-stepper-vertical' : '');
            nav.setAttribute('data-part', 'root');
            nav.setAttribute('role', 'tablist');
            uiAttr(nav, 'aria-label', () => uiString('wizard', 'steps'));
            nav.setAttribute('aria-orientation', isVert ? 'vertical' : 'horizontal');

            for (let i = 0; i < _steps.length; i++) {
                const s = _steps[i];
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pdx-step';
                btn.setAttribute('data-part', 'step');
                btn.setAttribute('role', 'tab');
                btn.setAttribute('data-step-btn', String(i));
                btn.setAttribute('aria-label', stepName(s));
                // A6: "2 of 4" in the accessibility tree. Chromium computes no position for these
                // tabs, so it is written.
                btn.setAttribute('aria-posinset', String(i + 1));
                btn.setAttribute('aria-setsize', String(_steps.length));

                // Click handler for step navigation
                const idx = i;
                btn.addEventListener('click', () => goTo(idx));

                // Number circle
                const num = document.createElement('span');
                num.className = 'pdx-step-number';
                btn.appendChild(num);

                // Label + description wrapper
                if (isVert) {
                    const content = document.createElement('span');
                    content.className = 'pdx-step-content';
                    const lbl = document.createElement('span');
                    lbl.className = 'pdx-step-label';
                    lbl.textContent = s.label;
                    content.appendChild(lbl);
                    if (s.description) {
                        const desc = document.createElement('span');
                        desc.className = 'pdx-step-desc';
                        desc.textContent = s.description;
                        content.appendChild(desc);
                    }
                    btn.appendChild(content);
                } else {
                    const lbl = document.createElement('span');
                    lbl.className = 'pdx-step-label';
                    lbl.textContent = s.label;
                    btn.appendChild(lbl);
                }

                nav.appendChild(btn);

                // Connector between steps (not after last, not in vertical — vertical uses ::before)
                if (!isVert && i < _steps.length - 1) {
                    const conn = document.createElement('span');
                    conn.className = 'pdx-step-connector';
                    conn.setAttribute('data-part', 'connector');
                    conn.setAttribute('data-connector', String(i));
                    nav.appendChild(conn);
                }
            }

            return nav;
        }

        // ─── Build nav footer ────────────────────────────────
        function buildNav(): HTMLElement {
            const nav = document.createElement('div');
            nav.className = 'pdx-wizard-nav';
            nav.setAttribute('data-part', 'nav');
            nav.setAttribute('role', 'navigation');
            uiAttr(nav, 'aria-label', () => uiString('wizard', 'navigation'));

            // Back is the secondary action, drawn as an app draws one (ghost), and both buttons are
            // the wizard's size: a pinned `sm` (34px) would sit beside a form whose own submit is a
            // default button (40px), and a dark-bordered outline Back would look like no other
            // secondary action. `navSize` sets the size on every update.
            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'pdx-ghost';
            backBtn.setAttribute('data-wizard-back', '');
            backBtn.setAttribute('data-part', 'back');
            backBtn.addEventListener('click', () => prev());

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'pdx-primary';
            nextBtn.setAttribute('data-wizard-next', '');
            nextBtn.setAttribute('data-part', 'next');
            nextBtn.addEventListener('click', () => {
                if (_step.peek() === _steps.length - 1) complete();
                else next();
            });

            const indicator = document.createElement('span');
            indicator.className = 'pdx-wizard-indicator pdx-txt-small pdx-ink-muted';
            indicator.setAttribute('data-wizard-indicator', '');
            indicator.setAttribute('data-part', 'indicator');

            nav.appendChild(backBtn);
            nav.appendChild(indicator);
            nav.appendChild(nextBtn);

            return nav;
        }

        // ─── Update stepper visual state ─────────────────────
        function updateStepper(current: number): void {
            if (!_stepperEl) return;
            void _highestVisited.peek();

            const buttons = _stepperEl.querySelectorAll<HTMLElement>('[data-step-btn]');
            buttons.forEach((btn, i) => {
                const isDone = i < current;
                const isActive = i === current;
                const isReachable = canGoTo(i);

                btn.setAttribute('data-status', isDone ? 'done' : isActive ? 'active' : '');
                btn.setAttribute('aria-selected', String(isActive));
                // Where the user is in the process, not only which tab is chosen.
                if (isActive) btn.setAttribute('aria-current', 'step');
                else btn.removeAttribute('aria-current');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
                (btn as HTMLButtonElement).disabled = !isReachable && !isDone && !isActive;

                if (isReachable || isDone) {
                    btn.setAttribute('role', 'tab');
                    btn.style.cursor = 'pointer';
                } else {
                    btn.style.cursor = 'default';
                }

                // Update number content
                const num = btn.querySelector('.pdx-step-number');
                if (num) {
                    const step = _steps[i];
                    if (isDone) num.textContent = step.icon || '✓';
                    else if (step.icon && isActive) num.textContent = step.icon;
                    else num.textContent = String(i + 1);
                }
            });

            // Update connectors
            const connectors = _stepperEl.querySelectorAll<HTMLElement>('[data-connector]');
            connectors.forEach((conn, i) => {
                if (i < current) conn.setAttribute('data-status', 'done');
                else conn.removeAttribute('data-status');
            });
        }

        // ─── Update panels visibility ────────────────────────
        function updatePanels(current: number): void {
            _steps.forEach((s, i) => {
                const isActive = i === current;
                s.el.style.display = isActive ? '' : 'none';
                s.el.setAttribute('role', 'tabpanel');
                s.el.setAttribute('data-part', 'panel');
                s.el.setAttribute('aria-hidden', String(!isActive));
                if (isActive) {
                    s.el.setAttribute('aria-labelledby', `${uid}-step-${i}`);
                }
            });
        }

        /** A navigation button at the wizard's size: small for a small wizard, the default otherwise. */
        function navSize(btn: HTMLButtonElement): void {
            if ((ctx.size() as string) === 'sm') btn.setAttribute('size', 'sm');
            else btn.removeAttribute('size');
        }

        // ─── Update nav footer ───────────────────────────────
        function updateNav(current: number): void {
            if (!_navEl) return;
            const isFirst = current === 0;
            const isLast = current === _steps.length - 1;

            const backBtn = _navEl.querySelector<HTMLButtonElement>('[data-wizard-back]');
            const nextBtn = _navEl.querySelector<HTMLButtonElement>('[data-wizard-next]');
            const indicator = _navEl.querySelector<HTMLElement>('[data-wizard-indicator]');

            if (backBtn) {
                navSize(backBtn);
                backBtn.textContent = uiString('wizard', 'back');
                backBtn.style.visibility = isFirst ? 'hidden' : 'visible';
                backBtn.disabled = isFirst;
            }

            if (nextBtn) {
                // The registered strings, read, so a locale's wizard.next reaches the button.
                nextBtn.textContent = uiString('wizard', isLast ? 'complete' : 'next');
                nextBtn.className = isLast
                    ? 'pdx-success'
                    : 'pdx-primary';
                navSize(nextBtn);
            }

            if (indicator) {
                indicator.textContent = format(uiString('wizard', 'stepOf'), { current: current + 1, total: _steps.length });
            }
        }

        // ─── Disabled ─────────────────────────────────────────
        ctx.track(() => {
            ctx.state('disabled', ctx.disabled() as boolean);
        });

        // ─── One-shot bind ────────────────────────────────────
        // Reads no prop synchronously, so it runs once and its cleanup runs only on destroy. Reading
        // `value` or `disabled` here would re-run it on each change: the cleanup would dispose the
        // keyboard focusGroup, and `_bound` would keep it from being made again — after a parent set
        // the step, the arrow keys would do nothing.
        ctx.track(() => {
            const el = ctx.el;

            if (!_bound) {
                _bound = true;

                requestAnimationFrame(() => {
                    const propValue = ctx.value() as number;
                    _steps = discoverSteps();
                    if (_steps.length === 0) return;

                    // States, not classes (#289): wizard.css lays the wizard out from them.
                    ctx.state('ready', true);
                    const isVert = (ctx.orientation() as string) === 'vertical';
                    ctx.state('vertical', isVert);

                    // Build and insert stepper (before step panels)
                    if (!ctx.hideStepper()) {
                        _stepperEl = buildStepper();
                        // Before the CHILD of `el` that holds the first panel, not before the
                        // panel itself. `discoverSteps()` searches with `querySelectorAll`, which
                        // is deep, so a panel one level down — inside a `<pdx-form>`, a layout
                        // wrapper, a `@for` — is discovered and then `insertBefore` throws
                        // NotFoundError, because its reference node has to be a child of `el`.
                        //
                        // The throw would land inside this requestAnimationFrame, so nothing would
                        // reach the console: the class is applied on the line above, nothing else
                        // would be, and the panels would render stacked with every field on screen
                        // at once. Nesting is the natural shape when the steps belong to two forms
                        // — a `<form>` inside a `<form>` is invalid HTML.
                        el.insertBefore(_stepperEl, childHolding(_steps[0].el));

                        // focusGroup for keyboard nav on stepper
                        _focusDispose = focusGroup(el, {
                            selector: '[data-step-btn]:not([disabled])',
                            orientation: isVert ? 'vertical' : 'horizontal',
                            wrap: false,
                            onSelect: (btnEl) => {
                                const idx = parseInt(btnEl.getAttribute('data-step-btn') || '0', 10);
                                goTo(idx);
                            },
                        });
                    }

                    // Build and append nav footer
                    if (!ctx.hideNav()) {
                        _navEl = buildNav();
                        el.appendChild(_navEl);
                    }

                    // Set ARIA IDs — a panel id the author wrote is kept (links and labels use it)
                    _steps.forEach((s, i) => {
                        if (!s.el.id) s.el.id = `${uid}-panel-${i}`;
                    });
                    if (_stepperEl) {
                        _stepperEl.querySelectorAll('[data-step-btn]').forEach((btn, i) => {
                            btn.id = `${uid}-step-${i}`;
                            if (_steps[i]) btn.setAttribute('aria-controls', _steps[i].el.id);
                        });
                    }

                    // "Step 2 of 3: Profile", said politely when the step changes, so a move is not
                    // silent. Empty at first — the initial step is not news.
                    _liveEl = document.createElement('span');
                    _liveEl.className = 'pdx-sr-only';
                    _liveEl.setAttribute('role', 'status');
                    _liveEl.setAttribute('aria-live', 'polite');
                    el.appendChild(_liveEl);

                    // A label bound by the application moves when its locale does, and an
                    // attribute written from outside is not a signal: the component has to notice
                    // the write.
                    _labelsDispose = watchStepLabels(el, () => {
                        if (!refreshStepMeta(_steps)) return;
                        if (_stepperEl) applyStepLabels(_stepperEl, _steps);
                        // The number circle carries `icon`, and the live region reads the label.
                        updateStepper(_step.peek());
                    });

                    // Initial state
                    const initial = Math.max(0, Math.min(propValue || 0, _steps.length - 1));
                    _announcedStep = initial;
                    _step.set(initial);
                    _highestVisited.set(initial);
                    updateStepper(initial);
                    updatePanels(initial);
                    updateNav(initial);
                });
            }

            return () => {
                if (_focusDispose) { _focusDispose(); _focusDispose = null; }
                if (_labelsDispose) { _labelsDispose(); _labelsDispose = null; }
            };
        });

        // React to step signal changes (internal navigation)
        ctx.track(() => {
            const current = _step();
            if (_bound && _steps.length > 0) {
                requestAnimationFrame(() => {
                    updateStepper(current);
                    updatePanels(current);
                    updateNav(current);
                    if (_liveEl && current !== _announcedStep && _steps[current]) {
                        _announcedStep = current;
                        _liveEl.textContent = format(uiString('wizard', 'stepAnnounce'),
                            { current: current + 1, total: _steps.length, label: _steps[current].label });
                    }
                });
            }
        });

        // React to external value prop changes
        ctx.track(() => {
            const v = ctx.value() as number;
            // A non-finite value is ignored, and it is not a theoretical guard: `Math.min(NaN, 3)`
            // is NaN, `Math.max(0, NaN)` is NaN, and `updatePanels(NaN)` matches no index — so
            // every panel would get `display: none` and the screen would go blank. A bound value
            // can arrive as NaN from an update unrelated to the wizard; whatever writes it, a
            // component must not blank itself over a bad number.
            if (!Number.isFinite(v)) return;
            if (_bound && _steps.length > 0 && v !== _step.peek()) {
                const clamped = Math.max(0, Math.min(v, _steps.length - 1));
                _step.set(clamped);
                if (clamped > _highestVisited.peek()) _highestVisited.set(clamped);
            }
        });

        // The navigation verbs of the library (#289): `next()`, `prev()`, `goTo(n)`. The current
        // step is the `value` model itself.
        ctx.expose({
            /** Go to a step by index. Returns false, and moves nothing, when the step is not reachable yet or a `pdx-before-change` listener cancels. */
            goTo,
            /** The next step, through the same guards as `goTo`; false at the last one. */
            next,
            /** The previous step, through the same guards as `goTo`; false at the first one. */
            prev,
            /** Emit `pdx-complete` for the step in view. It does not advance, validate or close anything. */
            complete,
        });

        return {};
    },
    render: () => html`<slot></slot>`,
});
