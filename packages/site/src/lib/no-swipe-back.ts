// Blocks the browser's horizontal "back/forward" gesture (a two-finger touchpad
// swipe), which Chrome/Edge deliver as `wheel` events with a deltaX and then turn
// into navigation — even on pages with no horizontal scroll, where
// `overscroll-behavior-x: none` alone is sometimes not enough.
//
// Cancels ONLY mostly-horizontal wheels while the pointer is NOT over an element
// that really scrolls horizontally, so legitimate scrolling (code blocks, wide
// tables) and vertical scrolling stay intact.

function canScrollX(start: EventTarget | null): boolean {
  let el = start instanceof Element ? start : null;
  while (el && el !== document.documentElement) {
    if (el.scrollWidth > el.clientWidth) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

// Cancels the synthetic "click" the browser fires at the END of a text-selection
// drag: if the pointer was dragged (past a threshold, button held), that click is
// not intended and must not follow a link. Real clicks (mousedown≈mouseup, no
// drag) pass untouched.
export function installDragClickGuard(): void {
  let downX = 0;
  let downY = 0;
  let pressed = false;
  let dragged = false;
  const THRESHOLD = 8; // px

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downX = e.clientX; downY = e.clientY; pressed = true; dragged = false;
  }, true);

  window.addEventListener('pointermove', (e) => {
    if (pressed && Math.hypot(e.clientX - downX, e.clientY - downY) > THRESHOLD) dragged = true;
  }, true);

  window.addEventListener('pointerup', () => { pressed = false; }, true);

  // Capture phase: runs BEFORE the links' @click handlers → stops them upstream.
  window.addEventListener('click', (e) => {
    if (dragged) { e.preventDefault(); e.stopPropagation(); }
    dragged = false;
  }, true);

  // Version marker: type `window.__pdxGuards` in the console to confirm that this
  // build (the one with the guards) is really the one loaded.
  (window as unknown as { __pdxGuards?: unknown }).__pdxGuards = { dragClick: true, noSwipeBack: true, build: 'guards-v6' };

  // ── No back/forward gesture during a selection ───────────────────
  // A fast text selection triggers the browser's history gesture (Navigation type
  // 'traverse'), which overscroll-behavior/overflow do not suppress. It is
  // intercepted and cancelled ONLY when it comes right after a drag (≤200ms), so
  // the real "Back" button — never preceded by a drag — stays intact.
  let lastDragAt = -1e9;
  window.addEventListener('pointerup', () => { if (dragged) lastDragAt = performance.now(); }, true);
  const sinceDrag = () => performance.now() - lastDragAt;

  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  if (nav) {
    // Registered BEFORE the router: when it cancels here it also stops the
    // propagation, so the router's listener does not call intercept() on an
    // event already cancelled (which would be an InvalidStateError).
    nav.addEventListener('navigate', (e: Event) => {
      const ev = e as Event & { navigationType?: string; cancelable?: boolean };
      if (ev.navigationType === 'traverse' && ev.cancelable && sinceDrag() <= 200) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    });
  }
}

export function installNoSwipeBack(): void {
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      // Mostly-horizontal gestures only (the back/forward swipe is one).
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // A real horizontal scroller under the pointer: let it scroll.
      if (canScrollX(e.target)) return;
      e.preventDefault();
    },
    { passive: false },
  );
}
