// pdx-image — Rich image component with lazy loading, fallback, zoom, lightbox,
// and authenticated image loading via fetch + objectURL.

import { component, html, onDestroy, focusTrap } from '@pdxui/core';
import type { Dispose } from '@pdxui/core';
import { uiString, format, uiAttr} from '../shared/i18n';
// This component's styles travel with it, so an app ships the CSS of what it renders
// and no more.
import '@pdxui/design/components/image';
/** `pdx-icon` the first time an image fails and its fallback icon shows: a use that draws none never pays for the icon set. */
function loadIcon(): void {
    if (!customElements.get('pdx-icon')) void import('../icon/pdx-icon');
}

/**
 * An image with lazy loading, a fallback and zoom into a lightbox, that can also load from a source
 * behind authentication.
 */
component('pdx-image', {
    props: {
        /** Image URL */
        src: { type: String, default: '' },
        /** Alt text for accessibility */
        alt: { type: String, default: '' },
        /** CSS width */
        width: { type: String, default: 'auto' },
        /** CSS height */
        height: { type: String, default: 'auto' },
        /** object-fit: cover | contain | fill | none | scale-down */
        fit: { type: String, default: 'cover' },
        /** Enable IntersectionObserver lazy loading */
        lazy: { type: Boolean, default: true },
        /** Fallback image URL on error */
        fallback: { type: String, default: '' },
        /** Icon name shown on error (pragmatic-icons) */
        fallbackIcon: { type: String, default: 'image-off' },
        /** Placeholder style: blur | skeleton | none */
        placeholder: { type: String, default: 'skeleton' },
        /** Aspect ratio e.g. '16/9', '1/1' */
        ratio: { type: String, default: '' },
        /** Circular border-radius */
        rounded: { type: Boolean, default: false },
        /** Custom border-radius value */
        radius: { type: String, default: '' },
        /** Click to zoom (scale toggle) */
        zoomable: { type: Boolean, default: false },
        /** Click opens fullscreen lightbox overlay */
        lightbox: { type: Boolean, default: false },
        /** Caption text below image */
        caption: { type: String, default: '' },
        /** URL requiring authentication (fetched via fetch + objectURL) */
        authSrc: { type: String, default: '' },
        /** Function returning HTTP headers for auth requests */
        authProvider: { type: Object, default: null },
        /** Custom fetch function: (url: string) => Promise<Blob> */
        fetchFn: { type: Object, default: null },
    },
    setup(ctx) {
        let _built = false;
        let _imgEl: HTMLImageElement | null = null;
        let _wrapperEl: HTMLDivElement | null = null;
        let _observer: IntersectionObserver | null = null;
        let _objectUrl: string | null = null;
        let _zoomed = false;
        let _loaded = false;
        let _errored = false;

        function revokeObjectUrl(): void {
            if (_objectUrl) {
                URL.revokeObjectURL(_objectUrl);
                _objectUrl = null;
            }
        }

        function showFallback(): void {
            if (!_wrapperEl) return;
            _errored = true;

            // Remove skeleton if present
            const skeleton = _wrapperEl.querySelector('.pdx-img-skeleton');
            if (skeleton) skeleton.remove();

            // Remove existing img
            if (_imgEl) {
                _imgEl.style.display = 'none';
            }

            const fallbackSrc = ctx.fallback() as string;
            if (fallbackSrc) {
                // Use fallback image URL
                const fbImg = document.createElement('img');
                fbImg.className = 'pdx-img pdx-img-loaded';
                fbImg.src = fallbackSrc;
                fbImg.alt = ctx.alt() as string;
                fbImg.style.objectFit = ctx.fit() as string;
                _wrapperEl.appendChild(fbImg);
                return;
            }

            // Show fallback icon
            const fbDiv = document.createElement('div');
            fbDiv.className = 'pdx-img-fallback';
            loadIcon();
            const iconEl = document.createElement('pdx-icon');
            iconEl.setAttribute('name', ctx.fallbackIcon() as string);
            iconEl.setAttribute('size', '32');
            fbDiv.appendChild(iconEl);
            _wrapperEl.appendChild(fbDiv);
        }

        function onImageLoad(): void {
            if (!_imgEl) return;
            _loaded = true;
            _imgEl.classList.remove('pdx-img-loading');
            _imgEl.classList.add('pdx-img-loaded');

            // Remove skeleton
            const skeleton = _wrapperEl?.querySelector('.pdx-img-skeleton');
            if (skeleton) skeleton.remove();

            ctx.emit('pdx-load', {});
        }

        function onImageError(): void {
            showFallback();
            ctx.emit('pdx-error', {});
        }

        function loadAuthImage(url: string): void {
            const fetchFnProp = ctx.fetchFn() as ((u: string) => Promise<Blob>) | null;
            const authProviderProp = ctx.authProvider() as (() => Record<string, string>) | null;

            const doFetch = fetchFnProp
                ? fetchFnProp(url)
                : fetch(url, { headers: authProviderProp ? authProviderProp() : {} }).then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.blob();
                });

            doFetch.then(blob => {
                revokeObjectUrl();
                _objectUrl = URL.createObjectURL(blob);
                if (_imgEl) {
                    _imgEl.src = _objectUrl;
                    // onload handler will do the rest
                }
            }).catch(() => {
                showFallback();
                ctx.emit('pdx-error', {});
            });
        }

        function loadImage(): void {
            const authSrc = ctx.authSrc() as string;
            const fetchFnProp = ctx.fetchFn();
            const src = ctx.src() as string;

            if (fetchFnProp || authSrc) {
                loadAuthImage(authSrc || src);
            } else if (src && _imgEl) {
                _imgEl.src = src;
            }
        }

        function setupLazy(): void {
            _observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadImage();
                    _observer?.disconnect();
                    _observer = null;
                }
            }, { rootMargin: '200px' });
            _observer.observe(ctx.el);
        }

        function toggleZoom(): void {
            if (!_imgEl || !_loaded) return;
            _zoomed = !_zoomed;
            if (_zoomed) {
                _imgEl.classList.add('pdx-img-zoomed');
                _imgEl.classList.remove('pdx-img-zoomable');
            } else {
                _imgEl.classList.remove('pdx-img-zoomed');
                _imgEl.classList.add('pdx-img-zoomable');
            }
            _wrapperEl?.setAttribute('aria-pressed', String(_zoomed));
            ctx.emit('pdx-zoom', { zoomed: _zoomed });
        }

        /** What the image is called in its trigger's and dialog's names: the alt, else "image". */
        const imageName = (): string => (ctx.alt() as string) || uiString('image', 'image');

        /**
         * The zoom/lightbox trigger is the wrapper, made a button: an <img> with tabindex -1 and a
         * click handler on the wrapper would leave nothing to focus and nothing for Enter to do.
         * A role, not a <button> element, so the wrapper's layout is untouched.
         */
        function makeTrigger(wrapper: HTMLElement, lightbox: boolean): void {
            wrapper.setAttribute('role', 'button');
            wrapper.tabIndex = 0;
            uiAttr(wrapper, 'aria-label', () => format(uiString('image', lightbox ? 'view' : 'zoom'), { alt: imageName() }));
            if (!lightbox) wrapper.setAttribute('aria-pressed', 'false');
            wrapper.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                handleClick();
            });
        }

        // The lightbox's close, reachable from the destroy: as a local closure, unmounting with
        // the lightbox open would leave an overlay in the body and an orphan keydown on the
        // document.
        let _lightboxClose: (() => void) | null = null;
        ctx.track(() => () => { _lightboxClose?.(); _lightboxClose = null; });

        function openLightbox(): void {
            const imgSrc = _imgEl?.src || '';
            if (!imgSrc) return;

            // A modal dialog, with a role, a name and a close button: focus moves into it rather
            // than staying on the page behind it, and does not land on the page host after Escape.
            const captionText = ctx.caption() as string;
            const overlay = document.createElement('div');
            overlay.className = 'pdx-img-lightbox';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-label', captionText || imageName());

            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'pdx-img-lightbox-close';
            uiAttr(closeBtn, 'aria-label', () => uiString('image', 'close'));
            closeBtn.textContent = '×';
            overlay.appendChild(closeBtn);

            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = ctx.alt() as string;
            overlay.appendChild(img);

            if (captionText) {
                const cap = document.createElement('div');
                cap.className = 'pdx-img-lightbox-caption';
                cap.textContent = captionText;
                overlay.appendChild(cap);
            }

            const opener = _wrapperEl;
            let trapDispose: Dispose | null = null;

            function closeLightbox(): void {
                const focusWasInside = overlay.contains(document.activeElement);
                trapDispose?.(); trapDispose = null;
                overlay.remove();
                document.removeEventListener('keydown', onEsc);
                _lightboxClose = null;
                if (focusWasInside && opener?.isConnected) opener.focus();
            }

            function onEsc(e: KeyboardEvent): void {
                if (e.key === 'Escape') closeLightbox();
            }

            overlay.addEventListener('click', closeLightbox);
            document.addEventListener('keydown', onEsc);
            document.body.appendChild(overlay);
            // Focus goes in and stays: the same trap pdx-dialog uses. It returns focus itself only
            // when the opener is what had it; closeLightbox does that, from a pointer click too.
            trapDispose = focusTrap(overlay, { restoreFocus: false });
            closeBtn.focus();
            _lightboxClose = closeLightbox;
        }

        function handleClick(): void {
            const zoomable = ctx.zoomable() as boolean;
            const lightboxProp = ctx.lightbox() as boolean;

            if (lightboxProp) {
                openLightbox();
            } else if (zoomable) {
                toggleZoom();
            }
        }

        ctx.track(() => {
            // Read all signals to establish subscriptions
            const src = ctx.src() as string;
            void ctx.authSrc();
            const alt = ctx.alt() as string;
            const width = ctx.width() as string;
            const height = ctx.height() as string;
            const fit = ctx.fit() as string;
            const lazy = ctx.lazy() as boolean;
            const placeholder = ctx.placeholder() as string;
            const ratio = ctx.ratio() as string;
            const rounded = ctx.rounded() as boolean;
            const radiusProp = ctx.radius() as string;
            const zoomable = ctx.zoomable() as boolean;
            const lightboxProp = ctx.lightbox() as boolean;
            const captionText = ctx.caption() as string;
            void ctx.fallback();
            void ctx.fallbackIcon();
            void ctx.authProvider();
            void ctx.fetchFn();

            if (!_built) {
                _built = true;
                // ctx.frame: a setup a move destroyed does not build again.
                ctx.frame(() => {
                    const el = ctx.el;
                    el.classList.add('pdx-img-root');
                    el.style.width = width;
                    el.style.height = height === 'auto' && ratio ? 'auto' : height;

                    // Wrapper
                    _wrapperEl = document.createElement('div');
                    _wrapperEl.className = 'pdx-img-wrapper';
                    if (ratio) _wrapperEl.style.aspectRatio = ratio;
                    if (rounded) _wrapperEl.classList.add('pdx-img-rounded');
                    if (radiusProp) _wrapperEl.style.borderRadius = radiusProp;

                    // Skeleton placeholder
                    if (placeholder === 'skeleton') {
                        const skel = document.createElement('div');
                        skel.className = 'pdx-img-skeleton';
                        _wrapperEl.appendChild(skel);
                    }

                    // Image element
                    _imgEl = document.createElement('img');
                    _imgEl.className = 'pdx-img pdx-img-loading';
                    _imgEl.alt = alt;
                    _imgEl.style.objectFit = fit;
                    _imgEl.draggable = false;

                    if (zoomable && !lightboxProp) {
                        _imgEl.classList.add('pdx-img-zoomable');
                    }

                    _imgEl.addEventListener('load', onImageLoad);
                    _imgEl.addEventListener('error', onImageError);
                    _wrapperEl.appendChild(_imgEl);

                    // Click handler for zoom / lightbox
                    if (zoomable || lightboxProp) {
                        _wrapperEl.style.cursor = lightboxProp ? 'pointer' : 'zoom-in';
                        _wrapperEl.addEventListener('click', handleClick);
                        makeTrigger(_wrapperEl, lightboxProp);
                    }

                    el.appendChild(_wrapperEl);

                    // Caption
                    if (captionText) {
                        const capEl = document.createElement('div');
                        capEl.className = 'pdx-img-caption';
                        capEl.textContent = captionText;
                        el.appendChild(capEl);
                    }

                    // Load image (lazy or immediate)
                    if (lazy) {
                        setupLazy();
                    } else {
                        loadImage();
                    }
                });
                return;
            }

            // Update on prop changes
            requestAnimationFrame(() => {
                if (_imgEl) {
                    _imgEl.alt = alt;
                    _imgEl.style.objectFit = fit;
                }
                if (_wrapperEl) {
                    if (_wrapperEl.getAttribute('role') === 'button') {
                        uiAttr(_wrapperEl, 'aria-label', () => format(uiString('image', lightboxProp ? 'view' : 'zoom'), { alt: alt || uiString('image', 'image') }));
                    }
                    if (ratio) _wrapperEl.style.aspectRatio = ratio;
                    if (rounded) _wrapperEl.classList.add('pdx-img-rounded');
                    else _wrapperEl.classList.remove('pdx-img-rounded');
                    if (radiusProp) _wrapperEl.style.borderRadius = radiusProp;
                }
                const el = ctx.el;
                el.style.width = width;
                el.style.height = height === 'auto' && ratio ? 'auto' : height;

                // Update caption
                const capEl = el.querySelector('.pdx-img-caption');
                if (capEl) capEl.textContent = captionText;

                // Reload if src changed
                if (!_errored && src && _imgEl && _imgEl.src !== src && !_objectUrl) {
                    _loaded = false;
                    _imgEl.classList.remove('pdx-img-loaded');
                    _imgEl.classList.add('pdx-img-loading');
                    loadImage();
                }
            });
        });

        // Cleanup on destroy. core's onDestroy: `ctx.onDestroy` does not exist, and the optional call
        // on a cast would hide that the observer and the object URL are never released.
        onDestroy(() => {
            if (_observer) { _observer.disconnect(); _observer = null; }
            revokeObjectUrl();
        });

        return {};
    },
    render: () => html``,
});
