# Deploying the builder

Hand-authored deployment files. `scripts/prepare-static.mjs` copies everything in this
directory to the root of `public/`, which Vite then copies verbatim into `dist/` — so the
built site carries them. They live here rather than in `public/` because that directory is
wiped and regenerated on every build.

`CNAME` — the domain, for a host that reads it (GitHub Pages). Harmless elsewhere.

There is deliberately **no `web.config`**. The site needs one because it is an SPA with
history routing: an F5 on `/components/pdx-button` must fall back to `index.html`. The
builder is not. Its entire state lives in the query string of one document, and its other
pages (`/scenarios/tier-*.html`, `/preview/composition.html`) are real files. A fallback here
would be actively harmful: it is exactly what hid a missing `catalog.json` behind a 200
during development. A 404 should stay a 404.
