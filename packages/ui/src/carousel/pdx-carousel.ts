// pdx-carousel — Carousel/slider for images, cards, or any content.
// Supports: slide/fade animation, autoplay, touch/pointer swipe,
// multiple slides per view, dot indicators, keyboard navigation.
// Slot: "slide" — custom slide template (priority: slot > renderSlide > default)

import { component, html } from '@pdxui/core';
import type { SlotFunction } from '@pdxui/core';
import { sanitizeHTML } from '../shared/sanitize';
import { uiString, uiAttr} from '../shared/i18n';
import { format } from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/carousel';
import '../icon/pdx-icon'; // rendered by this component, and registered by nobody else

export interface CarouselItem {
    src?: string;
    alt?: string;
    content?: string;
    caption?: string;
}

let _carouselCounter = 0;

/**
 * A carousel for images, cards or any content, with slide or fade animation, autoplay and touch swipe.
 *
 * @slot slide - Scoped — renders one slide. Receives `{ slide, index, isActive }`.
 */
component('pdx-carousel', {
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
    setup(ctx) {
        let built = false;
        const uid = `pdx-carousel-${++_carouselCounter}`;
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
        let autoplayTimer: ReturnType<typeof setInterval> | null = null;
        let isPlaying = false;

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
            return (ctx as any).__slots?.['slide'] as SlotFunction | undefined;
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

        function goTo(index: number): void {
            const items = getItems();
            if (items.length === 0 || isTransitioning) return;

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
                ctx.emit('pdx-change', { index: currentIndex, item: items[currentIndex] });
                return;
            }

            // Virtual loop: animate one step, then reorder DOM
            const n = items.length;
            const direction = index > currentIndex ? 1 : -1;
            currentIndex = ((index % n) + n) % n;

            if (direction > 0) {
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

            updateDots();
            ctx.emit('pdx-change', { index: currentIndex, item: items[currentIndex] });
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
            const intervalMs = ctx.interval() as number;
            if (intervalMs <= 0) return;
            isPlaying = true;
            autoplayTimer = setInterval(() => next(), intervalMs);
            ctx.emit('pdx-autoplay-start', {});
        }

        function pause(): void {
            if (!isPlaying) return;
            isPlaying = false;
            if (autoplayTimer !== null) {
                clearInterval(autoplayTimer);
                autoplayTimer = null;
            }
            ctx.emit('pdx-autoplay-stop', {});
        }

        function updateTrackPosition(): void {
            if (!trackEl) return;
            const anim = ctx.animation() as string;
            if (anim === 'fade') {
                const slides = trackEl.querySelectorAll('.pdx-carousel-slide');
                slides.forEach((slide, i) => {
                    slide.classList.toggle('pdx-carousel-slide-active', i === currentIndex);
                });
                return;
            }
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
                dot.classList.toggle('pdx-carousel-dot-active', i === currentIndex);
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

            rootEl.className = 'pdx-carousel-root';
            if (anim === 'fade') rootEl.classList.add('pdx-carousel-fade');
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
            if (anim === 'slide') {
                trackEl.style.gap = gapPx > 0 ? `${gapPx}px` : '';
            }

            const shouldLoop = ctx.loop() as boolean;
            useVirtualLoop = shouldLoop && anim === 'slide' && items.length > 1;

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
                if (anim === 'fade' && i === currentIndex) {
                    slideEl.classList.add('pdx-carousel-slide-active');
                }
                trackEl.appendChild(slideEl);
            }

            if (useVirtualLoop) {
                trackEl.addEventListener('transitionend', onTrackTransitionEnd, sig);
            }

            rootEl.appendChild(trackEl);

            // Arrows
            prevBtn = nextBtn = null;
            if (ctx.showArrows() && items.length > 1) {
                prevBtn = document.createElement('button');
                prevBtn.type = 'button';
                prevBtn.className = 'pdx-carousel-arrow pdx-carousel-arrow-prev';
                uiAttr(prevBtn, 'aria-label', () => uiString('carousel', 'previous'));
                prevBtn.innerHTML = '<pdx-icon name="chevron-left" size="20"></pdx-icon>';
                prevBtn.addEventListener('click', () => prev(), sig);
                rootEl.appendChild(prevBtn);

                nextBtn = document.createElement('button');
                nextBtn.type = 'button';
                nextBtn.className = 'pdx-carousel-arrow pdx-carousel-arrow-next';
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
                dotsEl.setAttribute('role', 'tablist');
                const slideCount = getSlideCount();
                for (let i = 0; i < slideCount; i++) {
                    const dot = document.createElement('button');
                    dot.type = 'button';
                    dot.className = 'pdx-carousel-dot';
                    if (i === currentIndex) dot.classList.add('pdx-carousel-dot-active');
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

        // Expose imperative API. `index` getter is safe (no prop named index/goto).
        ctx.expose({
            next,
            prev,
            /** Go to a slide by index — wrapped around when `loop` is set, clamped otherwise. Ignored while a transition is running. */
            goTo,
            /** Start autoplay. Does nothing when `interval` is 0 or less. */
            play,
            /** Stop autoplay, leaving the slide where it is. */
            pause,
            /** `goTo` under its all-lowercase spelling. */
            goto: (index: number) => goTo(index),
            get index() { return currentIndex; },
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
            currentIndex = 0;
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
