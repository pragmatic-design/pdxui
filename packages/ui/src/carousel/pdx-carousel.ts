// pdx-carousel — Carousel/slider for images, cards, or any content.
// Supports: slide/fade animation, autoplay, touch/pointer swipe,
// multiple slides per view, dot indicators, keyboard navigation.
// Slot: "slide" — custom slide template (priority: slot > renderSlide > default)

import { component, html, generatedId, slot, snippetOrSlot, model, event, signal, untracked } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { sanitizeHTML } from '../shared/sanitize';
import { uiString, uiAttr} from '../shared/i18n';
import { format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/carousel';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else
// The icons it draws whatever its data, on the page with it rather than loaded a frame late (#47).
import { defineIcons } from '../icon/icon-map';
import iconChevronLeft from '../icon/pragmatic/chevron-left';
import iconChevronRight from '../icon/pragmatic/chevron-right';
import iconPlay from '../icon/pragmatic/play';
import iconPause from '../icon/pragmatic/pause';
defineIcons({ 'chevron-left': iconChevronLeft, 'chevron-right': iconChevronRight, play: iconPlay, pause: iconPause });

export interface CarouselItem {
    src?: string;
    alt?: string;
    content?: string;
    caption?: string;
}

/**
 * A carousel for images, cards or any content, with slide or fade animation, autoplay and touch swipe.
 *
 * @slot slide - Renders one slide: a snippet `slide(slide, index, active)`, or the scoped slot, which receives `{ slide, index, isActive }`.
 *
 * @csspart root - The carousel region (`role="region"`), which clips the slides and takes the focus.
 * @csspart track - The strip the slides sit in, moved to bring a slide on show.
 * @csspart slide - A slide; the one on show is `aria-current="true"`.
 * @csspart control - A button over the slides: the previous and next arrows, the rotation stop/start.
 * @csspart dots - The tablist of dots under the slides.
 * @csspart dot - A dot; the one of the slide on show is `aria-selected="true"`.
 *
 * @cssstate fade - `animation="fade"`: the slides cross-fade in place instead of sliding.
 *
 * @alphaevent pdx-change
 * @alphadetail index $event.detail.value
 */
component('pdx-carousel', {
    // The slide on show (#290). `next()`, `prev()`, `goTo()`, the arrows, the keys, the dots, a swipe
    // and autoplay write it, and the write dispatches `index-change` `{ value }`, which `::index`
    // follows; a parent's write moves the slide.
    models: {
        /** The slide on show, 0-based. */
        index: model<number>(0, { type: Number }),
    },
    events: {
        /** Autoplay started: on mount with `autoplay`, from `play()`, the rotation control, or the pointer leaving. */
        'pdx-autoplay-start': event<void>(),
        /** Autoplay stopped: from `pause()`, the rotation control, keyboard focus moving in, or the pointer over it. */
        'pdx-autoplay-stop': event<void>(),
    },
    // On the host as a custom state (#132): carousel.css draws the cross-fade from it.
    states: ['fade'],
    parts: ['root', 'track', 'slide', 'control', 'dots', 'dot'],
    props: {
        items: { type: Array, default: null },
        renderSlide: { type: Object, default: null },
        autoplay: { type: Boolean, default: false },
        interval: { type: Number, default: 5000 },
        loop: { type: Boolean, default: true },
        showArrows: { type: Boolean, default: true },
        showDots: { type: Boolean, default: true },
        slidesPerView: { type: Number, default: 1 },
        gap: { type: Number, default: 0 },
        swipeable: { type: Boolean, default: true },
        pauseOnHover: { type: Boolean, default: true },
        animation: { type: String, default: 'slide' },
        /** The region's accessible name. Empty: the component string `carousel.label` ("Carousel"). */
        label: { type: String, default: '' },
    },
    // A parent's `@snippet` sets these, positional arguments; the alpha scoped slot stays (#596).
    // The slide a snippet receives is the app's, an element of `items` (#651): the editor infers `T`.
    generics: { T: { from: 'items' } },
    slots: {
        slide: slot<(slide: T, index: number, active: boolean) => Node>(),
    },
    setup(ctx) {
        let built = false;
        const uid = generatedId('pdx-carousel');
        let prevBtn: HTMLButtonElement | null = null;
        let nextBtn: HTMLButtonElement | null = null;
        let rotationBtn: HTMLButtonElement | null = null;
        /** Rotation stopped by the user — the control, or keyboard focus moving in. Hover only pauses. */
        let stopped = false;
        let pointerOnRotation = false;
        let rootEl: HTMLElement | null = null;
        let trackEl: HTMLElement | null = null;
        let _abortCtrl: AbortController | null = null;
        let dotsEl: HTMLElement | null = null;
        let currentIndex = 0;
        let isPlaying = false;
        /** Whether autoplay runs, and its beat: one tick per interval, each a step forward. */
        const playing = signal(false);
        const tick = signal(0);

        // Infinite loop via DOM reordering (no clones)
        let useVirtualLoop = false;
        let isTransitioning = false;
        let pendingDirection = 0; // +1 next, -1 prev, 0 none

        // Pointer/swipe state
        let pointerStartX = 0;
        let pointerCurrentX = 0;
        let isDragging = false;

        // Slot function — read lazily (_projectSlots runs after setup)
        function getSlideSlot(): SlotFunction | undefined {
            return snippetOrSlot(ctx, 'slide', (s) => [s.slide, s.index, s.isActive]);
        }

        function getItems(): CarouselItem[] {
            return (ctx.items() as CarouselItem[]) || [];
        }

        function getSlideCount(): number {
            const items = getItems();
            if (items.length === 0) return 0;
            if (useVirtualLoop) return items.length;
            const perView = Math.max(1, ctx.slidesPerView() as number);
            return Math.max(0, items.length - perView + 1);
        }

        /**
         * A slide transition still in flight. One interrupted — the page frozen, the carousel moved —
         * never delivers its `transitionend`: what is running is asked of the track itself, and a
         * transition that ended unseen is settled here, or the carousel would wait for it forever.
         */
        function transitionRunning(): boolean {
            if (!isTransitioning) return false;
            // Without the Web Animations API there is no asking: trust the flag, as before.
            if (!trackEl || typeof trackEl.getAnimations !== 'function') return true;
            if (trackEl.getAnimations().length > 0) return true;
            onTrackTransitionEnd();
            return false;
        }

        function goTo(index: number): void {
            const items = getItems();
            if (items.length === 0 || transitionRunning()) return;

            if (!useVirtualLoop) {
                const max = getSlideCount() - 1;
                if (max < 0) return;
                const shouldLoop = ctx.loop() as boolean;
                if (shouldLoop) {
                    if (index < 0) index = max;
                    else if (index > max) index = 0;
                } else {
                    index = Math.max(0, Math.min(index, max));
                }
                if (index === currentIndex) return;
                currentIndex = index;
                updateTrackPosition();
                updateDots();
                updateArrows();
                // The model's write announces `index-change`; nothing when a parent's write brought it here.
                ctx.index.set(currentIndex);
                return;
            }

            // Virtual loop: one step either way animates and then reorders the DOM; a jump further
            // (a dot, a parent's write) turns the strip at once, so the slide asked for is the one on show.
            const n = items.length;
            const target = ((index % n) + n) % n;
            if (target === currentIndex) return;
            const forward = (target - currentIndex + n) % n;
            currentIndex = target;

            if (forward !== 1 && forward !== n - 1) {
                const slide = trackEl?.querySelector(`#${CSS.escape(`${uid}-slide-${target}`)}`);
                if (trackEl && slide) {
                    trackEl.style.transition = 'none';
                    while (trackEl.firstElementChild !== slide) reorderSlides(1);
                    setTrackOffset(0);
                    void trackEl.offsetHeight;
                    trackEl.style.transition = '';
                }
            } else if (forward === 1) {
                // NEXT: animate transform to -slideWidth, then reorder
                isTransitioning = true;
                pendingDirection = 1;
                setTrackOffset(1);
            } else {
                // PREV: prepend last slide, instant offset, then animate to 0
                isTransitioning = true;
                pendingDirection = -1;
                reorderSlides(-1);
                if (trackEl) {
                    trackEl.style.transition = 'none';
                    setTrackOffset(1);
                    void trackEl.offsetHeight;
                    trackEl.style.transition = '';
                }
                setTrackOffset(0);
            }

            markCurrent();
            updateDots();
            ctx.index.set(currentIndex);
        }

        function next(): void { goTo(currentIndex + 1); }
        function prev(): void { goTo(currentIndex - 1); }

        /** Set track transform to N slide-widths offset.
         *  Each step = (100% + gap) / perView — accounts for flex gap correctly. */
        function setTrackOffset(steps: number): void {
            if (!trackEl) return;
            const perView = Math.max(1, ctx.slidesPerView() as number);
            const gapPx = ctx.gap() as number;
            if (steps === 0) {
                trackEl.style.transform = 'translateX(0)';
                return;
            }
            trackEl.style.transform = `translateX(calc(-${steps} * (100% + ${gapPx}px) / ${perView}))`;
        }

        /** Move first slide to end (+1) or last slide to start (-1) */
        function reorderSlides(direction: number): void {
            if (!trackEl) return;
            if (direction > 0) {
                const first = trackEl.firstElementChild;
                if (first) trackEl.appendChild(first);
            } else {
                const last = trackEl.lastElementChild;
                if (last) trackEl.insertBefore(last, trackEl.firstElementChild);
            }
        }

        /** After transition completes, reorder DOM and reset position.
         *  All mutations MUST be synchronous — no rAF — to avoid intermediate paint frames. */
        function onTrackTransitionEnd(): void {
            if (!useVirtualLoop || !trackEl || pendingDirection === 0) return;
            if (pendingDirection > 0) {
                // Disable transition, reorder DOM, reset position — all synchronous
                trackEl.style.transition = 'none';
                reorderSlides(1);
                setTrackOffset(0);
                void trackEl.offsetHeight; // force reflow: browser processes DOM + transform together
                trackEl.style.transition = '';
            }
            // For prev, DOM was already reordered before animation
            pendingDirection = 0;
            isTransitioning = false;
        }

        function play(): void {
            if (isPlaying) return;
            const intervalMs = ctx.interval.peek() as number;
            if (intervalMs <= 0) return;
            isPlaying = true;
            playing.set(true);
            ctx.emit('pdx-autoplay-start');
        }

        function pause(): void {
            if (!isPlaying) return;
            isPlaying = false;
            playing.set(false);
            ctx.emit('pdx-autoplay-stop');
        }

        // Autoplay's beat is an effect of this component (#290; lifecycle.md: no work while frozen). Each
        // run waits one interval and then ticks; the tick runs it again, which takes the step and waits
        // for the next one. On a frozen page the scope parks the effect (#269): the tick due then moves
        // nothing and starts no wait, and the page coming back runs the effect once — the step, then
        // the beat again. No timer of its own to pause, so none to forget.
        let stepsTaken = 0;
        ctx.track(() => {
            const due = tick();
            if (!playing()) { stepsTaken = due; return; }
            if (due !== stepsTaken) {
                stepsTaken = due;
                untracked(next);
            }
            const id = setTimeout(() => tick.set((n) => n + 1), ctx.interval.peek() as number);
            return () => clearTimeout(id);
        });

        /** The slide on show is `aria-current`, which carousel.css selects for the fade: no class (#290). */
        function markCurrent(): void {
            if (!trackEl) return;
            const current = `${uid}-slide-${currentIndex}`;
            for (const slide of trackEl.querySelectorAll('.pdx-carousel-slide')) {
                if (slide.id === current) slide.setAttribute('aria-current', 'true');
                else slide.removeAttribute('aria-current');
            }
        }

        function updateTrackPosition(): void {
            if (!trackEl) return;
            markCurrent();
            const anim = ctx.animation() as string;
            if (anim === 'fade') return;
            if (useVirtualLoop) {
                setTrackOffset(0); // virtual loop: always at position 0, DOM reorders
                return;
            }
            setTrackOffset(currentIndex);
        }

        function updateDots(): void {
            if (!dotsEl) return;
            const dots = dotsEl.querySelectorAll<HTMLElement>('.pdx-carousel-dot');
            dots.forEach((dot, i) => {
                // The selected dot is its aria-selected, which carousel.css selects: no class (#290).
                dot.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
                // Roving tabindex: the selected tab is the tablist's one tab stop.
                dot.tabIndex = i === currentIndex ? 0 : -1;
            });
        }

        /** Without loop, an arrow that cannot move is disabled, rather than enabled and doing nothing. */
        function updateArrows(): void {
            if (!prevBtn || !nextBtn) return;
            const bounded = !(ctx.loop() as boolean);
            prevBtn.disabled = bounded && currentIndex <= 0;
            nextBtn.disabled = bounded && currentIndex >= getSlideCount() - 1;
        }

        /**
         * Autoplay stops for good from the rotation control, or when keyboard focus moves into the
         * carousel (APG carousel), and restarts only from the control. Stopped on hover only,
         * keyboard and touch users could not stop content that moves by itself (WCAG 2.2.2).
         */
        function stopRotation(): void {
            stopped = true;
            pause();
            updateRotation();
        }

        function startRotation(): void {
            stopped = false;
            play();
            updateRotation();
        }

        function updateRotation(): void {
            if (!rotationBtn) return;
            uiAttr(rotationBtn, 'aria-label', () => uiString('carousel', stopped ? 'startRotation' : 'stopRotation'));
            rotationBtn.innerHTML = `<pdx-icon name="${stopped ? 'play' : 'pause'}" size="20"></pdx-icon>`;
        }

        /** Arrow keys on a tab move the selection and the focus through the tablist. */
        function onDotKeydown(e: KeyboardEvent): void {
            const last = getSlideCount() - 1;
            const target = e.key === 'ArrowRight' ? (currentIndex >= last ? 0 : currentIndex + 1)
                : e.key === 'ArrowLeft' ? (currentIndex <= 0 ? last : currentIndex - 1)
                    : e.key === 'Home' ? 0
                        : e.key === 'End' ? last
                            : null;
            if (target === null) return;
            e.preventDefault();
            goTo(target);
            dotsEl?.querySelectorAll<HTMLElement>('.pdx-carousel-dot')[currentIndex]?.focus();
        }

        function buildSlideElement(item: CarouselItem, index: number): HTMLElement {
            const slideEl = document.createElement('div');
            slideEl.className = 'pdx-carousel-slide';
            slideEl.setAttribute('data-part', 'slide');
            slideEl.setAttribute('role', 'group');
            slideEl.setAttribute('aria-roledescription', 'slide');
            slideEl.id = `${uid}-slide-${index}`;
            uiAttr(slideEl, 'aria-label', () => format(uiString('carousel', 'slide'), { n: index + 1, total: getItems().length }));

            const isActive = index === currentIndex;

            // Priority: slot > renderSlide callback > default
            const slideSlot = getSlideSlot();
            if (slideSlot) {
                const content = slideSlot({ slide: item, index, isActive });
                slideEl.appendChild(content instanceof DocumentFragment ? content : content);
            } else {
                const renderFn = ctx.renderSlide() as ((item: CarouselItem, index: number) => HTMLElement | string) | null;
                if (renderFn) {
                    const result = renderFn(item, index);
                    if (typeof result === 'string') {
                        slideEl.innerHTML = sanitizeHTML(result);
                    } else if (result instanceof HTMLElement) {
                        slideEl.appendChild(result);
                    }
                } else if (item.src) {
                    const img = document.createElement('img');
                    img.src = item.src;
                    img.alt = item.alt || '';
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'cover';
                    img.draggable = false;
                    slideEl.appendChild(img);
                    if (item.caption) {
                        const cap = document.createElement('div');
                        cap.className = 'pdx-carousel-caption';
                        cap.textContent = item.caption;
                        slideEl.appendChild(cap);
                    }
                } else if (item.content) {
                    slideEl.innerHTML = sanitizeHTML(item.content);
                }
            }

            return slideEl;
        }

        function buildCarousel(): void {
            if (!rootEl) return;
            // Abort previous listeners to prevent accumulation on rebuild
            if (_abortCtrl) _abortCtrl.abort();
            _abortCtrl = new AbortController();
            const sig = { signal: _abortCtrl.signal };
            rootEl.innerHTML = '';
            const items = getItems();
            const anim = ctx.animation() as string;
            const perView = Math.max(1, ctx.slidesPerView() as number);
            const gapPx = ctx.gap() as number;

            // The slide on show is the model's, kept across a rebuild while it still exists.
            currentIndex = Math.max(0, Math.min(Math.trunc(Number(ctx.index.peek()) || 0), Math.max(0, items.length - 1)));

            rootEl.className = 'pdx-carousel-root';
            rootEl.setAttribute('data-part', 'root');
            ctx.state('fade', anim === 'fade');
            rootEl.setAttribute('role', 'region');
            rootEl.setAttribute('aria-roledescription', 'carousel');
            // A region without a name is not a landmark.
            uiAttr(rootEl, 'aria-label', () => (ctx.label() as string) || uiString('carousel', 'label'));

            // The rotation control comes first, so it is the first stop inside the carousel.
            rotationBtn = null;
            if (ctx.autoplay() && items.length > 1) {
                rotationBtn = document.createElement('button');
                rotationBtn.type = 'button';
                rotationBtn.className = 'pdx-carousel-arrow pdx-carousel-rotation';
                rotationBtn.setAttribute('data-part', 'control');
                rotationBtn.addEventListener('pointerdown', () => { pointerOnRotation = true; }, sig);
                rotationBtn.addEventListener('click', () => {
                    pointerOnRotation = false;
                    if (stopped) startRotation(); else stopRotation();
                }, sig);
                rootEl.appendChild(rotationBtn);
                updateRotation();
                // Keyboard focus moving in stops the rotation; a pointer on the control is the
                // control's own click, which toggles it.
                rootEl.addEventListener('focusin', (e) => {
                    if (e.target === rotationBtn && pointerOnRotation) return;
                    if (!stopped) stopRotation();
                }, sig);
            }

            // Track
            trackEl = document.createElement('div');
            trackEl.className = 'pdx-carousel-track';
            trackEl.setAttribute('data-part', 'track');
            if (anim === 'slide') {
                trackEl.style.gap = gapPx > 0 ? `${gapPx}px` : '';
            }

            const shouldLoop = ctx.loop() as boolean;
            useVirtualLoop = shouldLoop && anim === 'slide' && items.length > 1;
            // Without the virtual loop the last position shows the last `slidesPerView` slides.
            if (!useVirtualLoop) currentIndex = Math.min(currentIndex, Math.max(0, getSlideCount() - 1));

            function applySlideWidth(el: HTMLElement): void {
                if (gapPx > 0) {
                    const totalGap = gapPx * (perView - 1);
                    el.style.width = `calc((100% - ${totalGap}px) / ${perView})`;
                } else {
                    el.style.width = `${100 / perView}%`;
                }
                el.style.flexShrink = '0';
            }

            for (let i = 0; i < items.length; i++) {
                const slideEl = buildSlideElement(items[i], i);
                if (anim === 'slide') applySlideWidth(slideEl);
                trackEl.appendChild(slideEl);
            }

            if (useVirtualLoop) {
                trackEl.addEventListener('transitionend', onTrackTransitionEnd, sig);
                // The virtual loop shows the strip's first slide: turn it to the one on show.
                for (let i = 0; i < currentIndex; i++) reorderSlides(1);
            }
            isTransitioning = false;
            pendingDirection = 0;

            rootEl.appendChild(trackEl);

            // Arrows
            prevBtn = nextBtn = null;
            if (ctx.showArrows() && items.length > 1) {
                prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.className = 'pdx-carousel-arrow pdx-carousel-arrow-prev';
                prevBtn.setAttribute('data-part', 'control');
                uiAttr(prevBtn, 'aria-label', () => uiString('carousel', 'previous'));
                prevBtn.innerHTML = '<pdx-icon name="chevron-left" size="20"></pdx-icon>';
                prevBtn.addEventListener('click', () => prev(), sig);
                rootEl.appendChild(prevBtn);

                nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'pdx-carousel-arrow pdx-carousel-arrow-next';
                nextBtn.setAttribute('data-part', 'control');
                uiAttr(nextBtn, 'aria-label', () => uiString('carousel', 'next'));
                nextBtn.innerHTML = '<pdx-icon name="chevron-right" size="20"></pdx-icon>';
                nextBtn.addEventListener('click', () => next(), sig);
                rootEl.appendChild(nextBtn);
                updateArrows();
            }

            // Dots
            if (ctx.showDots() && items.length > 1) {
                dotsEl = document.createElement('div');
                dotsEl.className = 'pdx-carousel-dots';
                dotsEl.setAttribute('data-part', 'dots');
                dotsEl.setAttribute('role', 'tablist');
                const slideCount = getSlideCount();
                for (let i = 0; i < slideCount; i++) {
                    const dot = document.createElement('button');
                    dot.type = 'button';
                    dot.className = 'pdx-carousel-dot';
                    dot.setAttribute('data-part', 'dot');
                    dot.setAttribute('role', 'tab');
                    uiAttr(dot, 'aria-label', () => format(uiString('carousel', 'goToSlide'), { n: i + 1 }));
                    dot.setAttribute('aria-selected', i === currentIndex ? 'true' : 'false');
                    dot.setAttribute('aria-controls', `${uid}-slide-${i}`);
                    dot.tabIndex = i === currentIndex ? 0 : -1;
                    const idx = i;
                    dot.addEventListener('click', () => goTo(idx), sig);
                    dot.addEventListener('keydown', onDotKeydown, sig);
                    dotsEl.appendChild(dot);
                }
                rootEl.appendChild(dotsEl);
            } else {
                dotsEl = null;
            }

            // Swipe support
            if (ctx.swipeable() && items.length > 1) {
                rootEl.addEventListener('pointerdown', onPointerDown, sig);
            }

            // Keyboard
            rootEl.tabIndex = 0;
            rootEl.addEventListener('keydown', onKeydown, sig);

            // Hover pause — a pause only: leaving resumes, unless the rotation was stopped.
            if (ctx.pauseOnHover() && ctx.autoplay()) {
                rootEl.addEventListener('mouseenter', () => pause(), sig);
                rootEl.addEventListener('mouseleave', () => { if (ctx.autoplay() && !stopped) play(); }, sig);
            }

            updateTrackPosition();
            // A model past the new slides was brought back: say so, as any write of the component's.
            if (currentIndex !== ctx.index.peek()) ctx.index.set(currentIndex);
            if (ctx.autoplay() && !stopped) play();
        }

        function onPointerDown(e: PointerEvent): void {
            // Don't capture pointer on arrows/dots — let their click handlers fire
            const target = e.target as HTMLElement;
            if (target.closest('.pdx-carousel-arrow') || target.closest('.pdx-carousel-dot')) return;

            isDragging = true;
            pointerStartX = e.clientX;
            pointerCurrentX = e.clientX;
            if (rootEl) rootEl.setPointerCapture(e.pointerId);

            const onMove = (ev: PointerEvent) => {
                if (!isDragging) return;
                pointerCurrentX = ev.clientX;
            };
            const onUp = (ev: PointerEvent) => {
                if (!isDragging) return;
                isDragging = false;
                const delta = pointerCurrentX - pointerStartX;
                const threshold = 50;
                if (Math.abs(delta) > threshold) {
                    if (delta < 0) next();
                    else prev();
                }
                if (rootEl) rootEl.releasePointerCapture(ev.pointerId);
                rootEl?.removeEventListener('pointermove', onMove);
                rootEl?.removeEventListener('pointerup', onUp);
            };
            rootEl?.addEventListener('pointermove', onMove);
            rootEl?.addEventListener('pointerup', onUp);
        }

        function onKeydown(e: KeyboardEvent): void {
            // A tab handles its own arrows; handled here too, one key would move two slides.
            if ((e.target as HTMLElement).closest('.pdx-carousel-dot')) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        }

        // The library's navigation verbs (#289, #290); the slide on show is the model `index`.
        ctx.expose({
            next,
            prev,
            /** Go to a slide by index — wrapped around when `loop` is set, clamped otherwise. Ignored while a transition is running. */
            goTo,
            /** Start autoplay. Does nothing when `interval` is 0 or less. */
            play,
            /** Stop autoplay, leaving the slide where it is. */
            pause,
        });

        // A parent's write moves the slide. The carousel's own write is the slide already on show, a
        // no-op here; one it could not take (a transition still running) is put back to the slide shown.
        ctx.track(() => {
            const wanted = ctx.index() as number;
            if (!rootEl || !trackEl || wanted === currentIndex) return;
            untracked(() => {
                goTo(wanted);
                if (currentIndex !== wanted) ctx.index.set(currentIndex);
            });
        });

        ctx.track(() => {
            void ctx.items();
            void ctx.animation();
            void ctx.slidesPerView();
            void ctx.gap();
            void ctx.showArrows();
            void ctx.showDots();
            void ctx.autoplay();
            void ctx.interval();
            void ctx.loop();
            void ctx.swipeable();
            void ctx.pauseOnHover();
            void ctx.renderSlide();
            void ctx.label();

            if (!built) {
                built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    rootEl = document.createElement('div');
                    ctx.el.appendChild(rootEl);
                    buildCarousel();
                });
                return;
            }
            pause();
            requestAnimationFrame(() => buildCarousel());
        });

        // Cleanup on disconnect: stop autoplay and abort all listeners
        ctx.track(() => {
            return () => {
                pause();
                if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
            };
        });

        return {};
    },
    render: () => html``,
});

/** The slide a snippet receives, the app's (#651): the editor infers it from `:items`. */
type T = unknown;
